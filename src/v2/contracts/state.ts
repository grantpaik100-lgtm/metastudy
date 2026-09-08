import { z } from "zod";
import {
  ConfidenceSchema,
  TimestampSchema,
  UuidSchema,
  VersionSchema,
} from "./common.js";
import {
  OperationalModeSchema,
  ValidationAssessmentSchema,
  ValidationSnapshotSchema,
} from "./scientific-validation.js";

export const StateTypeIdSchema = z.enum([
  "conceptual_mastery",
  "procedural_mastery",
  "retrievability",
  "transferability",
  "help_need",
  "misconception",
  "state_confidence",
  "calibration",
  "intervention_response",
]);

export const StateGroupSchema = z.enum([
  "STUDENT × SKILL",
  "STUDENT × DOMAIN",
  "STUDENT × DOMAIN × INTERVENTION",
]);

const StateTargetBaseSchema = z.object({
  state_target_id: UuidSchema,
  learner_id: UuidSchema,
  domain_id: z.string().trim().min(1),
  scope_id: z.string().trim().min(1),
});

export const KnowledgeStateTargetSchema = StateTargetBaseSchema.extend({
  target_kind: z.literal("knowledge"),
  knowledge_level: z.enum(["concept", "skill"]),
  concept_id: z.string().trim().min(1).nullable(),
  concept_version: VersionSchema.nullable(),
  skill_id: z.string().trim().min(1).nullable(),
  skill_version: VersionSchema.nullable(),
})
  .strict()
  .superRefine((target, context) => {
    const conceptExact = target.concept_id !== null && target.concept_version !== null;
    const skillExact = target.skill_id !== null && target.skill_version !== null;
    const valid =
      target.knowledge_level === "concept"
        ? conceptExact && target.skill_id === null && target.skill_version === null
        : skillExact && target.concept_id === null && target.concept_version === null;
    if (!valid) {
      context.addIssue({
        code: "custom",
        message: "knowledge target must identify exactly its declared level",
      });
    }
  });

export const DomainStateTargetSchema = StateTargetBaseSchema.extend({
  target_kind: z.literal("domain"),
}).strict();

export const InterventionStateTargetSchema = StateTargetBaseSchema.extend({
  target_kind: z.literal("intervention"),
  intervention_type_id: z.string().trim().min(1),
  intervention_type_version: VersionSchema,
  scope_level: z.enum(["domain", "concept", "skill"]),
  concept_id: z.string().trim().min(1).nullable(),
  concept_version: VersionSchema.nullable(),
  skill_id: z.string().trim().min(1).nullable(),
  skill_version: VersionSchema.nullable(),
})
  .strict()
  .superRefine((target, context) => {
    const conceptExact = target.concept_id !== null && target.concept_version !== null;
    const skillExact = target.skill_id !== null && target.skill_version !== null;
    const valid =
      target.scope_level === "domain"
        ? target.concept_id === null &&
          target.concept_version === null &&
          target.skill_id === null &&
          target.skill_version === null
        : target.scope_level === "concept"
          ? conceptExact && target.skill_id === null && target.skill_version === null
          : skillExact && target.concept_id === null && target.concept_version === null;
    if (!valid) {
      context.addIssue({
        code: "custom",
        message: "intervention target must identify exactly its declared scope level",
      });
    }
  });

export const StateTargetSchema = z.discriminatedUnion("target_kind", [
  KnowledgeStateTargetSchema,
  DomainStateTargetSchema,
  InterventionStateTargetSchema,
]);

export const StateDefinitionSchema = z
  .object({
    state_type: StateTypeIdSchema,
    definition_version: VersionSchema,
    group: StateGroupSchema,
    ordinal: z.number().int().min(1).max(9),
    name_ko: z.string().trim().min(1),
    description: z.string().trim().min(1),
    value_role: z.enum(["learner_state", "estimate_metadata"]),
  })
  .strict();

export const StateEstimateStatusSchema = z.enum([
  "unknown",
  "estimated",
  "candidate",
  "not_applicable",
]);

export const UnknownStateReasonSchema = z.enum([
  "initial",
  "evidence_retracted",
  "inputs_unavailable_due_to_deletion",
  "recalculation_pending",
]);

export const StateEstimateSchema = z
  .object({
    state_estimate_id: UuidSchema,
    learner_id: UuidSchema,
    target: StateTargetSchema,
    state_type: StateTypeIdSchema,
    state_definition_version: VersionSchema,
    value: z.json().nullable(),
    status: StateEstimateStatusSchema,
    unknown_reason: UnknownStateReasonSchema.nullable(),
    scale_definition_id: z.string().trim().min(1).nullable(),
    scale_definition_version: VersionSchema.nullable(),
    estimate_confidence: ConfidenceSchema.nullable(),
    confidence_method_version: VersionSchema.nullable(),
    evidence_count: z.number().int().nonnegative(),
    observation_count: z.number().int().nonnegative(),
    effective_sample_size: z.number().nonnegative().nullable(),
    supporting_evidence_ids: z.array(UuidSchema),
    excluded_evidence_ids: z.array(UuidSchema),
    state_update_rule_id: z.string().trim().min(1).nullable(),
    state_update_rule_version: VersionSchema.nullable(),
    model_version: VersionSchema.nullable(),
    parameter_set_id: z.string().trim().min(1).nullable(),
    parameter_set_version: VersionSchema.nullable(),
    validation_snapshot_id: UuidSchema.nullable(),
    state_update_validation_assessment_id: UuidSchema.nullable(),
    operational_policy_version: VersionSchema.nullable(),
    operational_mode: OperationalModeSchema.nullable(),
    calculation_run_id: UuidSchema.nullable(),
    input_manifest_id: UuidSchema.nullable(),
    calculation_input_hash: z.string().trim().min(1).nullable(),
    channel: z.enum(["production", "shadow"]),
    as_of: TimestampSchema,
    computed_at: TimestampSchema,
    recorded_at: TimestampSchema,
    supersedes_state_estimate_id: UuidSchema.nullable(),
    limitations: z.array(z.string().trim().min(1)),
    sealed_at: TimestampSchema.nullable(),
  })
  .strict()
  .superRefine((estimate, context) => {
    if (estimate.status === "unknown" && estimate.value !== null) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "unknown State must have a null value",
      });
    }
    if ((estimate.status === "unknown") !== (estimate.unknown_reason !== null)) {
      context.addIssue({
        code: "custom",
        path: ["unknown_reason"],
        message: "only unknown State estimates require an explicit unknown reason",
      });
    }
    if (estimate.target.learner_id !== estimate.learner_id) {
      context.addIssue({
        code: "custom",
        path: ["target", "learner_id"],
        message: "State target must belong to the estimate learner",
      });
    }
    if (estimate.state_type === "state_confidence") {
      context.addIssue({
        code: "custom",
        path: ["state_type"],
        message: "state_confidence is estimate metadata, not an independent State estimate",
      });
    }

    const expectedTargetKind =
      estimate.state_type === "calibration"
        ? "domain"
        : estimate.state_type === "intervention_response"
          ? "intervention"
          : "knowledge";
    if (
      estimate.state_type !== "state_confidence" &&
      estimate.target.target_kind !== expectedTargetKind
    ) {
      context.addIssue({
        code: "custom",
        path: ["target", "target_kind"],
        message: `${estimate.state_type} requires a ${expectedTargetKind} target`,
      });
    }

    for (const [left, right, path] of [
      [estimate.scale_definition_id, estimate.scale_definition_version, "scale_definition_version"],
      [estimate.estimate_confidence, estimate.confidence_method_version, "confidence_method_version"],
      [estimate.state_update_rule_id, estimate.state_update_rule_version, "state_update_rule_version"],
      [estimate.parameter_set_id, estimate.parameter_set_version, "parameter_set_version"],
      [estimate.operational_policy_version, estimate.operational_mode, "operational_mode"],
    ] as const) {
      if ((left === null) !== (right === null)) {
        context.addIssue({
          code: "custom",
          path: [path],
          message: "identifier/value and version/method must be present together",
        });
      }
    }

    const replayRefs = [
      estimate.calculation_run_id,
      estimate.input_manifest_id,
      estimate.calculation_input_hash,
    ];
    if (replayRefs.some((value) => value === null) && replayRefs.some((value) => value !== null)) {
      context.addIssue({
        code: "custom",
        path: ["input_manifest_id"],
        message: "calculation run, manifest, and input hash must be present together",
      });
    }

    const supportingIds = new Set(estimate.supporting_evidence_ids);
    const excludedIds = new Set(estimate.excluded_evidence_ids);
    if (supportingIds.size !== estimate.supporting_evidence_ids.length) {
      context.addIssue({ code: "custom", path: ["supporting_evidence_ids"], message: "supporting Evidence IDs must be unique" });
    }
    if (excludedIds.size !== estimate.excluded_evidence_ids.length) {
      context.addIssue({ code: "custom", path: ["excluded_evidence_ids"], message: "excluded Evidence IDs must be unique" });
    }
    if ([...supportingIds].some((id) => excludedIds.has(id))) {
      context.addIssue({ code: "custom", path: ["excluded_evidence_ids"], message: "Evidence cannot be both used and excluded" });
    }
    if (estimate.evidence_count !== supportingIds.size) {
      context.addIssue({ code: "custom", path: ["evidence_count"], message: "evidence_count must equal the number of supporting Evidence IDs" });
    }
    if (estimate.observation_count > estimate.evidence_count) {
      context.addIssue({ code: "custom", path: ["observation_count"], message: "observation_count cannot exceed supporting Evidence count" });
    }
    if ((estimate.value !== null) !== (estimate.scale_definition_id !== null)) {
      context.addIssue({ code: "custom", path: ["scale_definition_id"], message: "a State value and its versioned scale definition must be present together" });
    }

    if (["estimated", "candidate"].includes(estimate.status)) {
      if (
        estimate.value === null ||
        estimate.evidence_count === 0 ||
        estimate.observation_count === 0 ||
        estimate.state_update_rule_id === null ||
        estimate.validation_snapshot_id === null ||
        estimate.state_update_validation_assessment_id === null ||
        replayRefs.some((value) => value === null)
      ) {
        context.addIssue({
          code: "custom",
          path: ["status"],
          message: "estimated and candidate States require value, Evidence, observations, rule, validation, and replay references",
        });
      }
    }

    if (
      estimate.status === "unknown" && estimate.unknown_reason === "initial" &&
      (estimate.evidence_count !== 0 ||
        estimate.observation_count !== 0 ||
        estimate.supporting_evidence_ids.length !== 0 ||
        estimate.excluded_evidence_ids.length !== 0 ||
        estimate.scale_definition_id !== null ||
        estimate.estimate_confidence !== null ||
        estimate.state_update_rule_id !== null ||
        estimate.model_version !== null ||
        estimate.parameter_set_id !== null ||
        estimate.parameter_set_version !== null ||
        estimate.validation_snapshot_id !== null ||
        estimate.state_update_validation_assessment_id !== null ||
        estimate.operational_policy_version !== null ||
        estimate.operational_mode !== null ||
        replayRefs.some((value) => value !== null) ||
        estimate.supersedes_state_estimate_id !== null ||
        estimate.limitations.length !== 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "an initial unknown State cannot claim evidence, rules, validation, or calculation",
      });
    }
    if (
      estimate.status === "unknown" &&
      estimate.unknown_reason !== "initial" &&
      (estimate.supersedes_state_estimate_id === null ||
        estimate.state_update_rule_id === null ||
        estimate.validation_snapshot_id === null ||
        estimate.state_update_validation_assessment_id === null ||
        replayRefs.some((value) => value === null) ||
        estimate.limitations.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["unknown_reason"],
        message: "a non-initial unknown must trace the prior estimate, recalculation, and limitation",
      });
    }
  });

export const StateEvaluationSchema = z
  .object({
    evaluation_id: UuidSchema,
    learner_id: UuidSchema,
    state_target_id: UuidSchema,
    state_type: StateTypeIdSchema,
    channel: z.enum(["production", "shadow"]),
    trigger_type: z.enum(["event", "correction", "rule_release", "replay_request"]),
    trigger_event_id: UuidSchema.nullable(),
    run_id: UuidSchema,
    processing_status: z.enum(["pending", "processing", "completed", "failed"]),
    decision: z.enum(["updated", "unchanged", "withheld", "disabled", "retracted"]).nullable(),
    reason_codes: z.array(z.string().trim().min(1)),
    reason_detail: z.string().trim().min(1).nullable(),
    input_evidence_ids: z.array(UuidSchema),
    used_evidence_ids: z.array(UuidSchema),
    excluded_evidence: z.array(
      z.object({ evidence_id: UuidSchema, reason_code: z.string().trim().min(1) }).strict(),
    ),
    before_estimate_id: UuidSchema.nullable(),
    after_estimate_id: UuidSchema.nullable(),
    candidate_estimate_id: UuidSchema.nullable(),
    changed_fields: z.array(
      z.enum(["value", "status", "confidence", "evidence", "version"]),
    ),
    rule_refs: z.array(
      z.object({ id: z.string().trim().min(1), version: VersionSchema }).strict(),
    ),
    validation_snapshot_id: UuidSchema.nullable(),
    policy_version: VersionSchema.nullable(),
    input_manifest_id: UuidSchema,
    started_at: TimestampSchema,
    completed_at: TimestampSchema.nullable(),
    request_id: UuidSchema,
  })
  .strict();

export const StateEstimateValidationContextSchema = z
  .object({
    estimate: StateEstimateSchema,
    state_update_assessment: ValidationAssessmentSchema,
    snapshot: ValidationSnapshotSchema,
  })
  .strict()
  .superRefine(({ estimate, state_update_assessment, snapshot }, context) => {
    const assessmentMatches =
      estimate.state_update_validation_assessment_id === state_update_assessment.assessment_id &&
      state_update_assessment.subject_kind === "state_update_rule" &&
      state_update_assessment.subject_id === estimate.state_update_rule_id &&
      state_update_assessment.subject_version === estimate.state_update_rule_version;
    const snapshotMatches =
      snapshot.validation_snapshot_id === estimate.validation_snapshot_id &&
      snapshot.sealed_at !== null &&
      snapshot.assessment_ids.includes(state_update_assessment.assessment_id);
    if (!assessmentMatches || !snapshotMatches) {
      context.addIssue({ code: "custom", message: "State validation must match its exact update rule and sealed snapshot" });
    }
  });

export type StateTarget = z.infer<typeof StateTargetSchema>;
export type StateEstimate = z.infer<typeof StateEstimateSchema>;
export type StateEvaluation = z.infer<typeof StateEvaluationSchema>;
export type StateEstimateValidationContext = z.infer<typeof StateEstimateValidationContextSchema>;
