import type {
  Evidence,
  LearnerStateEstimate,
  LearnerStateType,
  LearnerStateUpdate,
  LearningEvent,
  RecentLearningEvent,
} from "../domain/contracts.js";
import type { StudyMetaRepository } from "../repositories/study-meta-repository.js";

const MINIMUM_OBSERVATIONS = 3;
const MINIMUM_EFFECTIVE_SAMPLE_SIZE = 2;
const STRUCTURED_CONFIDENCE_THRESHOLD = 0.7;
const CAMERA_CONFIDENCE_THRESHOLD = 0.9;
const PROCEDURAL_MODEL_VERSION = "procedural-bkt-baseline-v1";
const HELP_MODEL_VERSION = "help-need-beta-baseline-v1";

interface Observation {
  eventId: string;
  value: boolean;
  confidence: number;
}

interface ExcludedEvidence {
  event_id: string;
  evidence_type: string;
  reason: string;
}

export interface LearnerStateUpdater {
  readonly enabled: boolean;
  process(event: LearningEvent): Promise<LearnerStateUpdate>;
}

export class NoOpLearnerStateUpdater implements LearnerStateUpdater {
  readonly enabled = false;

  async process(_event: LearningEvent): Promise<LearnerStateUpdate> {
    return {
      status: "disabled",
      updated_states: [],
      excluded_evidence: [],
      message: "Learner State automation is disabled for this service.",
    };
  }
}

export class EvidenceBasedLearnerStateUpdater implements LearnerStateUpdater {
  readonly enabled = true;

  constructor(private readonly repository: StudyMetaRepository) {}

  async process(event: LearningEvent): Promise<LearnerStateUpdate> {
    const recentEvents = await this.repository.listRecentEvents(
      event.student_id,
      event.domain,
      event.skill_id,
      100,
    );
    const orderedEvents = [...recentEvents].sort(
      (left, right) => Date.parse(left.occurred_at) - Date.parse(right.occurred_at),
    );
    const excluded: ExcludedEvidence[] = [];
    const mastery = collectProceduralObservations(orderedEvents, excluded);
    const help = collectHelpNeedObservations(orderedEvents, excluded);
    const updatedAt = event.created_at;
    const estimates = [
      buildProceduralEstimate(event, mastery, excluded, updatedAt),
      buildHelpNeedEstimate(event, help, excluded, updatedAt),
    ];
    const skillName =
      event.skill_name ??
      (typeof event.raw_event.skill_name === "string"
        ? event.raw_event.skill_name
        : humanizeSkillId(event.skill_id));

    await Promise.all(
      estimates.map((estimate) =>
        this.repository.saveLearnerStateEstimate(
          event.student_id,
          skillName,
          estimate,
        ),
      ),
    );

    const hasUpdate = estimates.some((estimate) => estimate.status === "verified");
    const hasWithheld = estimates.some((estimate) => estimate.status === "withheld");
    return {
      status: hasUpdate
        ? "updated"
        : hasWithheld
          ? "withheld"
          : "insufficient_evidence",
      updated_states: estimates,
      excluded_evidence: excluded,
      message: hasUpdate
        ? "Verified MVP states were recalculated from trusted Evidence. Unsupported and low-confidence signals were excluded."
        : hasWithheld
          ? "The raw event was preserved, but low-quality or contradictory Evidence was withheld from Learner State."
          : "The raw event was preserved. More trusted observations are required before Learner State is changed.",
    };
  }
}

function evidenceByType(
  event: RecentLearningEvent,
  types: string[],
): Evidence | undefined {
  return event.evidence.find((item) => types.includes(item.type));
}

function confidenceThreshold(event: RecentLearningEvent): number {
  return event.source === "camera"
    ? CAMERA_CONFIDENCE_THRESHOLD
    : STRUCTURED_CONFIDENCE_THRESHOLD;
}

function acceptBooleanEvidence(
  event: RecentLearningEvent,
  evidence: Evidence | undefined,
  excluded: ExcludedEvidence[],
  confidenceMultiplier = 1,
): Observation | null {
  if (!evidence) return null;
  if (evidence.missing_reason) {
    excluded.push({
      event_id: event.id,
      evidence_type: evidence.type,
      reason: `missing_reason:${evidence.missing_reason}`,
    });
    return null;
  }
  if (typeof evidence.value !== "boolean") {
    excluded.push({
      event_id: event.id,
      evidence_type: evidence.type,
      reason: "unsupported_value_type",
    });
    return null;
  }
  const confidence = evidence.extractor_confidence * confidenceMultiplier;
  if (confidence < confidenceThreshold(event)) {
    excluded.push({
      event_id: event.id,
      evidence_type: evidence.type,
      reason:
        event.source === "camera"
          ? "camera_confidence_below_0.90"
          : "extraction_confidence_below_0.70",
    });
    return null;
  }
  return { eventId: event.id, value: evidence.value, confidence };
}

function collectProceduralObservations(
  events: RecentLearningEvent[],
  excluded: ExcludedEvidence[],
): Observation[] {
  const observations: Observation[] = [];
  for (const event of events) {
    const independent = acceptBooleanEvidence(
      event,
      evidenceByType(event, ["independent_success"]),
      excluded,
    );
    if (independent) {
      observations.push(independent);
      continue;
    }

    const correct = acceptBooleanEvidence(
      event,
      evidenceByType(event, ["correct"]),
      excluded,
      0.75,
    );
    const hint = acceptBooleanEvidence(
      event,
      evidenceByType(event, ["hint_used", "hint_requested"]),
      excluded,
    );
    if (correct && hint) {
      observations.push({
        eventId: event.id,
        value: correct.value && !hint.value,
        confidence: Math.min(correct.confidence, hint.confidence),
      });
    } else if (correct) {
      observations.push(correct);
    }
  }
  return observations;
}

function collectHelpNeedObservations(
  events: RecentLearningEvent[],
  excluded: ExcludedEvidence[],
): Observation[] {
  const observations: Observation[] = [];
  for (const event of events) {
    const hint = acceptBooleanEvidence(
      event,
      evidenceByType(event, ["hint_used", "hint_requested"]),
      excluded,
    );
    if (hint) observations.push(hint);
  }
  return observations;
}

function estimateConfidence(observations: Observation[]): number {
  const effectiveSampleSize = observations.reduce(
    (total, observation) => total + observation.confidence,
    0,
  );
  const meanExtractionConfidence =
    effectiveSampleSize / Math.max(1, observations.length);
  const sufficiency = 1 - Math.exp(-effectiveSampleSize / 5);
  return clamp(meanExtractionConfidence * sufficiency);
}

function bktEstimate(observations: Observation[]): number {
  const learn = 0.15;
  const slip = 0.1;
  const guess = 0.2;
  let mastery = 0.2;
  for (const observation of observations) {
    const posterior = observation.value
      ? (mastery * (1 - slip)) /
        (mastery * (1 - slip) + (1 - mastery) * guess)
      : (mastery * slip) /
        (mastery * slip + (1 - mastery) * (1 - guess));
    const learned = posterior + (1 - posterior) * learn;
    mastery += observation.confidence * (learned - mastery);
  }
  return clamp(mastery);
}

function betaRateEstimate(observations: Observation[]): number {
  let help = 1;
  let noHelp = 1;
  for (const observation of observations) {
    if (observation.value) help += observation.confidence;
    else noHelp += observation.confidence;
  }
  return clamp(help / (help + noHelp));
}

function statusFor(
  stateType: LearnerStateType,
  observations: Observation[],
  excluded: ExcludedEvidence[],
): "verified" | "insufficient_evidence" | "withheld" {
  const effectiveSampleSize = observations.reduce(
    (total, observation) => total + observation.confidence,
    0,
  );
  if (
    observations.length >= MINIMUM_OBSERVATIONS &&
    effectiveSampleSize >= MINIMUM_EFFECTIVE_SAMPLE_SIZE
  ) {
    return "verified";
  }
  const relatedTypes =
    stateType === "procedural_mastery"
      ? new Set(["independent_success", "correct", "hint_used", "hint_requested"])
      : new Set(["hint_used", "hint_requested"]);
  return excluded.some((item) => relatedTypes.has(item.evidence_type))
    ? "withheld"
    : "insufficient_evidence";
}

function buildEstimate(
  event: LearningEvent,
  stateType: "procedural_mastery" | "help_need",
  observations: Observation[],
  excluded: ExcludedEvidence[],
  updatedAt: string,
  modelVersion: string,
  estimator: (observations: Observation[]) => number,
  limitation: string,
): LearnerStateEstimate {
  const status = statusFor(stateType, observations, excluded);
  const effectiveSampleSize = observations.reduce(
    (total, observation) => total + observation.confidence,
    0,
  );
  return {
    domain: event.domain,
    skill_id: event.skill_id,
    state_type: stateType,
    value: status === "verified" ? estimator(observations) : null,
    status,
    confidence: status === "verified" ? estimateConfidence(observations) : null,
    evidence_count: observations.length,
    effective_sample_size: effectiveSampleSize,
    last_updated: updatedAt,
    model_version: modelVersion,
    supporting_event_ids: [...new Set(observations.map((item) => item.eventId))],
    limitation,
  };
}

function buildProceduralEstimate(
  event: LearningEvent,
  observations: Observation[],
  excluded: ExcludedEvidence[],
  updatedAt: string,
): LearnerStateEstimate {
  return buildEstimate(
    event,
    "procedural_mastery",
    observations,
    excluded,
    updatedAt,
    PROCEDURAL_MODEL_VERSION,
    bktEstimate,
    "Exploratory BKT baseline for independent procedural success; it is not a fixed ability label or a causal learning-effect claim.",
  );
}

function buildHelpNeedEstimate(
  event: LearningEvent,
  observations: Observation[],
  excluded: ExcludedEvidence[],
  updatedAt: string,
): LearnerStateEstimate {
  return buildEstimate(
    event,
    "help_need",
    observations,
    excluded,
    updatedAt,
    HELP_MODEL_VERSION,
    betaRateEstimate,
    "Empirical-Bayes baseline over observed hint use; it estimates recent support need and does not diagnose a fixed learner trait.",
  );
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function humanizeSkillId(skillId: string): string {
  return skillId
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
