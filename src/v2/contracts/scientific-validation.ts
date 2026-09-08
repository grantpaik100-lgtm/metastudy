import { z } from "zod";
import { TimestampSchema, UuidSchema, VersionSchema } from "./common.js";

export const ScientificValidationStatusSchema = z.enum([
  "not_assessed",
  "under_review",
  "supported_in_scope",
  "mixed",
  "unsupported_in_scope",
]);

export const OperationalModeSchema = z.enum([
  "research_only",
  "pilot",
  "production",
  "disabled",
]);

export const ValidationSubjectKindSchema = z.enum([
  "evidence_definition",
  "generation_rule",
  "state_update_rule",
]);

export const ValidationScopeSchema = z
  .object({
    population: z.string().trim().min(1).nullable(),
    domain: z.string().trim().min(1).nullable(),
    task_type: z.string().trim().min(1).nullable(),
    learning_environment: z.string().trim().min(1).nullable(),
  })
  .strict();

export const ValidationAssessmentSchema = z
  .object({
    assessment_id: UuidSchema,
    assessment_version: z.number().int().positive(),
    subject_kind: ValidationSubjectKindSchema,
    subject_id: z.string().trim().min(1),
    subject_version: VersionSchema,
    claim_id: z.string().trim().min(1),
    claim: z.string().trim().min(1),
    scope_id: z.string().trim().min(1),
    scope: ValidationScopeSchema,
    status: ScientificValidationStatusSchema,
    tested_components: z.array(
      z.enum([
        "definition_distinction",
        "extraction_accuracy",
        "state_mapping",
        "update_direction",
        "parameter_values",
        "decision_thresholds",
      ]),
    ),
    supporting_source_refs: z.array(UuidSchema),
    contradicting_source_refs: z.array(UuidSchema),
    study_refs: z.array(UuidSchema),
    limitations: z.array(z.string().trim().min(1)),
    reviewed_by: UuidSchema.nullable(),
    reviewed_at: TimestampSchema.nullable(),
    previous_assessment_id: UuidSchema.nullable(),
    change_reason: z.string().trim().min(1),
    created_at: TimestampSchema,
  })
  .strict()
  .superRefine((assessment, context) => {
    const scopeValues = Object.values(assessment.scope);
    const hasConcreteScope = scopeValues.every((value) => value !== null);
    const hasAnyScope = scopeValues.some((value) => value !== null);
    const hasSupportingBasis =
      assessment.supporting_source_refs.length > 0 || assessment.study_refs.length > 0;
    const hasContradictingBasis = assessment.contradicting_source_refs.length > 0;
    const addStatusIssue = (message: string): void => {
      context.addIssue({ code: "custom", path: ["status"], message });
    };

    if (assessment.status === "not_assessed") {
      if (assessment.reviewed_by !== null || assessment.reviewed_at !== null) {
        context.addIssue({
          code: "custom",
          message: "not_assessed cannot claim a completed review",
        });
      }
      if (
        hasAnyScope ||
        assessment.tested_components.length > 0 ||
        assessment.supporting_source_refs.length > 0 ||
        assessment.contradicting_source_refs.length > 0 ||
        assessment.study_refs.length > 0 ||
        assessment.previous_assessment_id !== null
      ) {
        addStatusIssue("not_assessed must remain an empty, unscoped initial assessment");
      }
    } else if (!assessment.reviewed_by || !assessment.reviewed_at) {
      context.addIssue({
        code: "custom",
        message: "assessed statuses require reviewer and review time",
      });
    }

    if (
      ["supported_in_scope", "mixed", "unsupported_in_scope"].includes(assessment.status) &&
      !hasConcreteScope
    ) {
      addStatusIssue("in-scope conclusions require population, domain, task type, and environment");
    }
    if (assessment.status === "supported_in_scope" && !hasSupportingBasis) {
      addStatusIssue("supported_in_scope requires a supporting source or study record");
    }
    if (assessment.status === "mixed" && (!hasSupportingBasis || !hasContradictingBasis)) {
      addStatusIssue("mixed requires both supporting and contradicting evidence");
    }
    if (assessment.status === "unsupported_in_scope" && !hasContradictingBasis) {
      addStatusIssue("unsupported_in_scope requires contradicting evidence");
    }
    if (
      assessment.status === "under_review" &&
      assessment.supporting_source_refs.length === 0 &&
      assessment.contradicting_source_refs.length === 0 &&
      assessment.study_refs.length === 0 &&
      assessment.limitations.length === 0
    ) {
      addStatusIssue("under_review requires a tracked source, study, or review limitation");
    }
  });

export const ValidationSnapshotSchema = z
  .object({
    validation_snapshot_id: UuidSchema,
    assessment_ids: z.array(UuidSchema).min(1),
    created_at: TimestampSchema,
    sealed_at: TimestampSchema.nullable(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (new Set(snapshot.assessment_ids).size !== snapshot.assessment_ids.length) {
      context.addIssue({ code: "custom", path: ["assessment_ids"], message: "snapshot assessment IDs must be unique" });
    }
  });

export const ValidationAssessmentLineageSchema = z
  .object({
    current: ValidationAssessmentSchema,
    previous: ValidationAssessmentSchema.nullable(),
  })
  .strict()
  .superRefine(({ current, previous }, context) => {
    if ((current.previous_assessment_id === null) !== (previous === null)) {
      context.addIssue({ code: "custom", path: ["previous"], message: "previous assessment reference and record must be present together" });
      return;
    }
    if (previous === null) return;
    if (
      current.previous_assessment_id !== previous.assessment_id ||
      current.subject_kind !== previous.subject_kind ||
      current.subject_id !== previous.subject_id ||
      current.subject_version !== previous.subject_version ||
      current.claim_id !== previous.claim_id ||
      current.scope_id !== previous.scope_id ||
      previous.assessment_version >= current.assessment_version
    ) {
      context.addIssue({ code: "custom", path: ["previous"], message: "previous assessment must be an earlier version of the same subject, claim, and scope" });
    }
  });

export const OperationAssignmentSchema = z
  .object({
    assignment_id: UuidSchema,
    subject_kind: ValidationSubjectKindSchema,
    subject_id: z.string().trim().min(1),
    subject_version: VersionSchema,
    mode: OperationalModeSchema,
    allowed_scope: ValidationScopeSchema,
    permitted_actions: z.array(
      z.enum(["record", "derive", "shadow", "update", "display", "recommend"]),
    ),
    policy_version: VersionSchema,
    approver: UuidSchema,
    reason: z.string().trim().min(1),
    valid_from: TimestampSchema,
    expires_at: TimestampSchema.nullable(),
    rollback_rule_ref: z.string().trim().min(1).nullable(),
  })
  .strict();

export type ValidationAssessment = z.infer<typeof ValidationAssessmentSchema>;
export type OperationAssignment = z.infer<typeof OperationAssignmentSchema>;
