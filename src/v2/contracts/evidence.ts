import { z } from "zod";
import {
  ConfidenceSchema,
  JsonObjectSchema,
  TimestampSchema,
  UuidSchema,
  V2_SCHEMA_VERSION,
  VersionSchema,
} from "./common.js";
import { KnowledgeTargetRefSchema } from "./knowledge.js";
import {
  OperationalModeSchema,
  ValidationAssessmentSchema,
  ValidationSnapshotSchema,
} from "./scientific-validation.js";

export const EvidenceCategorySchema = z.enum([
  "PERFORMANCE",
  "ASSISTANCE",
  "ERROR",
  "MEMORY / RETRIEVAL",
  "TRANSFER",
  "METACOGNITION",
  "PROCESS",
]);

export const EvidenceTypeIdSchema = z.enum([
  "correct",
  "incorrect",
  "partial_success",
  "independent_success",
  "hint_requested",
  "success_after_hint",
  "success_after_explanation",
  "first_error",
  "repeated_error",
  "misconception_candidate",
  "self_correction",
  "immediate_retrieval_success",
  "delayed_retrieval_success",
  "delayed_retrieval_failure",
  "relearning",
  "novel_application_success",
  "novel_application_failure",
  "confidence_report",
  "perceived_understanding",
  "perceived_difficulty",
  "error_awareness",
  "response_time",
  "stuck_duration",
  "attempt_count",
]);

export const EvidenceDefinitionSchema = z
  .object({
    evidence_type_id: EvidenceTypeIdSchema,
    definition_version: VersionSchema,
    category: EvidenceCategorySchema,
    ordinal: z.number().int().min(1).max(24),
    name_ko: z.string().trim().min(1),
    description: z.string().trim().min(1),
    inclusion_criteria: z.array(z.string().trim().min(1)),
    exclusion_criteria: z.array(z.string().trim().min(1)),
    value_schema_version: VersionSchema,
    scientific_validation: ValidationAssessmentSchema,
    operational_mode: OperationalModeSchema.nullable(),
    operation_assignment_id: UuidSchema.nullable(),
  })
  .strict()
  .superRefine((definition, context) => {
    if ((definition.operational_mode === null) !== (definition.operation_assignment_id === null)) {
      context.addIssue({
        code: "custom",
        path: ["operation_assignment_id"],
        message: "an operational mode must reference its approved assignment",
      });
    }
  });

export const GenerationRuleRefSchema = z
  .object({
    generation_rule_id: z.string().trim().min(1),
    generation_rule_version: VersionSchema,
  })
  .strict();

export const EvidenceInstanceSchema = z
  .object({
    schema_version: z.literal(V2_SCHEMA_VERSION),
    evidence_id: UuidSchema,
    learner_id: UuidSchema,
    evidence_type_id: EvidenceTypeIdSchema,
    definition_version: VersionSchema,
    generation_rule: GenerationRuleRefSchema,
    derivation_run_id: UuidSchema,
    event_id: UuidSchema,
    source_event_ids: z.array(UuidSchema).min(1),
    basis_refs: z.array(UuidSchema).min(1),
    targets: z.array(KnowledgeTargetRefSchema).min(1),
    value: z.json().nullable(),
    value_status: z.enum(["observed", "inferred", "unknown"]),
    value_schema_version: VersionSchema,
    detail: z.string().trim().min(1).nullable(),
    reason: z.string().trim().min(1).nullable(),
    qualifiers: JsonObjectSchema,
    observation_confidence: ConfidenceSchema.nullable(),
    confidence_method: VersionSchema.nullable(),
    support_condition: z.enum([
      "independent",
      "hint",
      "explanation",
      "answer_exposed",
      "unknown",
    ]),
    observation_group_id: UuidSchema,
    attempt_ids: z.array(UuidSchema),
    observed_at: TimestampSchema,
    generated_at: TimestampSchema,
    definition_validation_assessment_id: UuidSchema,
    generation_validation_assessment_id: UuidSchema,
    validation_snapshot_id: UuidSchema,
    provenance_status: z.enum([
      "source_reported",
      "server_captured",
      "human_reviewed",
    ]),
    supersedes_evidence_id: UuidSchema.nullable(),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (evidence.value_status === "unknown" && evidence.value !== null) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "unknown Evidence must have a null value",
      });
    }
    if (
      (evidence.observation_confidence === null) !==
      (evidence.confidence_method === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["confidence_method"],
        message: "observation confidence and its method must be present together",
      });
    }
  });

export const EvidenceReviewSchema = z
  .object({
    review_id: UuidSchema,
    learner_id: UuidSchema,
    evidence_id: UuidSchema,
    decision: z.enum(["disputed", "superseded", "invalidated", "confirmed"]),
    reason: z.string().trim().min(1),
    actor_id: UuidSchema,
    created_at: TimestampSchema,
    correction_event_id: UuidSchema.nullable(),
  })
  .strict();

export const EvidenceValidationContextSchema = z
  .object({
    evidence: EvidenceInstanceSchema,
    definition_assessment: ValidationAssessmentSchema,
    generation_assessment: ValidationAssessmentSchema,
    snapshot: ValidationSnapshotSchema,
  })
  .strict()
  .superRefine(({ evidence, definition_assessment, generation_assessment, snapshot }, context) => {
    const definitionMatches =
      evidence.definition_validation_assessment_id === definition_assessment.assessment_id &&
      definition_assessment.subject_kind === "evidence_definition" &&
      definition_assessment.subject_id === evidence.evidence_type_id &&
      definition_assessment.subject_version === evidence.definition_version;
    const generationMatches =
      evidence.generation_validation_assessment_id === generation_assessment.assessment_id &&
      generation_assessment.subject_kind === "generation_rule" &&
      generation_assessment.subject_id === evidence.generation_rule.generation_rule_id &&
      generation_assessment.subject_version === evidence.generation_rule.generation_rule_version;
    const snapshotMatches =
      snapshot.validation_snapshot_id === evidence.validation_snapshot_id &&
      snapshot.sealed_at !== null &&
      snapshot.assessment_ids.includes(definition_assessment.assessment_id) &&
      snapshot.assessment_ids.includes(generation_assessment.assessment_id);
    if (!definitionMatches || !generationMatches || !snapshotMatches) {
      context.addIssue({ code: "custom", message: "Evidence validation bindings must match its exact definition, rule, and sealed snapshot" });
    }
  });

export type EvidenceDefinition = z.infer<typeof EvidenceDefinitionSchema>;
export type EvidenceInstance = z.infer<typeof EvidenceInstanceSchema>;
export type EvidenceValidationContext = z.infer<typeof EvidenceValidationContextSchema>;
