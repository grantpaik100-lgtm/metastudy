import {
  RecordMyLearningEventInputSchema,
  RecordLearningEventInputSchema,
  RecordLearningEventOutputSchema,
  type RecordLearningEventOutput,
  type RecordLearningEventRawInput,
  type RecordMyLearningEventRawInput,
  type Evidence,
  type LearningEvent,
} from "../domain/contracts.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import type { StudyMetaRepository } from "../repositories/study-meta-repository.js";
import type { LearnerStateUpdater } from "./learner-state-updater.js";

export class LearningEventService {
  constructor(
    private readonly repository: StudyMetaRepository,
    private readonly learnerStateUpdater: LearnerStateUpdater,
  ) {}

  async record(rawInput: RecordLearningEventRawInput): Promise<RecordLearningEventOutput> {
    const parsedInput = RecordLearningEventInputSchema.parse(rawInput);
    const input = {
      ...parsedInput,
      evidence: normalizeIndependentSuccess(parsedInput.evidence),
    };

    if (input.idempotency_key) {
      const existing = await this.repository.findLearningEventByIdempotencyKey(
        input.student_id,
        input.idempotency_key,
      );
      if (existing) {
        if (!eventsEquivalent(existing, input)) {
          throw new ValidationError(
            "The idempotency_key was already used with different learning-event data",
          );
        }
        return duplicateOutput(existing);
      }
    }

    let event: LearningEvent;
    try {
      event = await this.repository.insertLearningEvent(input);
    } catch (error) {
      if (!input.idempotency_key) throw error;
      const concurrent = await this.repository.findLearningEventByIdempotencyKey(
        input.student_id,
        input.idempotency_key,
      );
      if (!concurrent || !eventsEquivalent(concurrent, input)) throw error;
      return duplicateOutput(concurrent);
    }
    let stateUpdate;
    try {
      stateUpdate = await this.learnerStateUpdater.process(event);
    } catch (error) {
      stateUpdate = {
        status: "withheld" as const,
        updated_states: [],
        excluded_evidence: [],
        message: `The event was recorded, but the state update was withheld: ${
          error instanceof Error ? error.message : "unknown updater error"
        }`,
      };
    }

    return RecordLearningEventOutputSchema.parse({
      success: true,
      event_id: event.id,
      recorded_at: event.created_at,
      duplicate: false,
      state_update: stateUpdate,
    });
  }

  async recordMy(
    rawInput: RecordMyLearningEventRawInput,
  ): Promise<RecordLearningEventOutput> {
    const input = RecordMyLearningEventInputSchema.parse(rawInput);
    const studentId = await this.repository.getCurrentStudentId();
    if (!studentId) {
      throw new NotFoundError(
        "No learner is linked to the authenticated StudyMeta account",
      );
    }
    return this.record({ ...input, student_id: studentId });
  }
}

function duplicateOutput(existing: LearningEvent): RecordLearningEventOutput {
  return RecordLearningEventOutputSchema.parse({
    success: true,
    event_id: existing.id,
    recorded_at: existing.created_at,
    duplicate: true,
    state_update: {
      status: "disabled",
      updated_states: [],
      excluded_evidence: [],
      message:
        "Idempotent replay: the existing event was returned and no second state update was applied.",
    },
  });
}

function eventsEquivalent(
  existing: LearningEvent,
  input: ReturnType<typeof RecordLearningEventInputSchema.parse>,
): boolean {
  return (
    existing.student_id === input.student_id &&
    existing.domain === input.domain &&
    existing.skill_id === input.skill_id &&
    (existing.skill_name ?? null) === (input.skill_name ?? null) &&
    existing.source === input.source &&
    (existing.source_provider ?? null) === (input.source_provider ?? null) &&
    (existing.problem_id ?? null) === (input.problem_id ?? null) &&
    existing.event_type === input.event_type &&
    (existing.started_at ?? null) === (input.started_at ?? null) &&
    (existing.ended_at ?? null) === (input.ended_at ?? null) &&
    (!input.occurred_at || existing.occurred_at === input.occurred_at) &&
    stableStringify(existing.raw_event) === stableStringify(input.raw_event) &&
    stableStringify(existing.evidence) === stableStringify(input.evidence)
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function evidenceByType(evidence: Evidence[], type: string): Evidence | undefined {
  return evidence.find((item) => item.type === type);
}

export function normalizeIndependentSuccess(evidence: Evidence[]): Evidence[] {
  const correct = evidenceByType(evidence, "correct");
  const hintUsed = evidenceByType(evidence, "hint_used");
  const retryCount = evidenceByType(evidence, "retry_count");
  const independentSuccess = evidenceByType(evidence, "independent_success");

  if (
    typeof correct?.value !== "boolean" ||
    typeof hintUsed?.value !== "boolean" ||
    typeof retryCount?.value !== "number"
  ) {
    return evidence;
  }

  const derivedValue =
    correct.value && hintUsed.value === false && retryCount.value === 0;
  const sourceConfidence = Math.min(
    correct.extractor_confidence,
    hintUsed.extractor_confidence,
    retryCount.extractor_confidence,
  );

  if (!independentSuccess) {
    return [
      ...evidence,
      {
        type: "independent_success",
        value: derivedValue,
        extractor_confidence: sourceConfidence,
        extractor: "studymeta_server",
        extractor_version: "independent-success-v1",
        definition_version: "studymeta-evidence-v1",
        missing_reason: null,
      },
    ];
  }

  return evidence.map((item) =>
    item.type === "independent_success"
      ? {
          ...item,
          value: derivedValue,
          extractor_confidence: Math.min(
            item.extractor_confidence,
            sourceConfidence,
          ),
        }
      : item,
  );
}
