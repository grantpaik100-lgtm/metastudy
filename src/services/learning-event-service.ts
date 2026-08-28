import {
  RecordLearningEventInputSchema,
  RecordLearningEventOutputSchema,
  type RecordLearningEventOutput,
  type RecordLearningEventRawInput,
  type Evidence,
} from "../domain/contracts.js";
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
    const event = await this.repository.insertLearningEvent(input);

    await this.learnerStateUpdater.process(event);

    return RecordLearningEventOutputSchema.parse({
      success: true,
      event_id: event.id,
      recorded_at: event.created_at,
    });
  }
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
