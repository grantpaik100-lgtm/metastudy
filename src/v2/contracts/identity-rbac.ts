import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";
import { StateTypeIdSchema } from "./state.js";

export const AccountRoleSchema = z.enum([
  "student",
  "admin",
  "validation_reviewer",
  "release_manager",
]);

export const RoleGrantSchema = z
  .object({
    auth_user_id: UuidSchema,
    role: AccountRoleSchema,
    granted_by: UuidSchema.nullable(),
    granted_at: TimestampSchema,
    reason: z.string().trim().min(1),
  })
  .strict();

export const RoleRevocationSchema = z
  .object({
    auth_user_id: UuidSchema,
    role: AccountRoleSchema,
    revoked_by: UuidSchema,
    revoked_at: TimestampSchema,
    reason: z.string().trim().min(1),
  })
  .strict();

export const AuthenticatedLearnerSchema = z
  .object({
    auth_user_id: UuidSchema,
    learner_id: UuidSchema,
    display_name: z.string().trim().min(1).nullable(),
    joined_at: TimestampSchema,
    archived_at: TimestampSchema.nullable(),
    active_roles: z.array(AccountRoleSchema),
  })
  .strict()
  .superRefine(({ active_roles }, context) => {
    if (new Set(active_roles).size !== active_roles.length) {
      context.addIssue({
        code: "custom",
        path: ["active_roles"],
        message: "active roles must be unique",
      });
    }
  });

export const AdminStudentSummarySchema = z
  .object({
    learner_id: UuidSchema,
    display_name: z.string().trim().min(1).nullable(),
    joined_at: TimestampSchema,
    is_archived: z.boolean(),
    last_learning_at: TimestampSchema.nullable(),
    current_state_count: z.number().int().nonnegative(),
    needs_review_state_count: z.number().int().nonnegative(),
  })
  .strict();

export const AdminStateTargetSchema = z
  .object({
    state_target_id: UuidSchema,
    target_kind: z.enum(["knowledge", "domain", "intervention"]),
    domain_id: z.string().trim().min(1),
    scope_id: z.string().trim().min(1),
    knowledge_level: z.enum(["concept", "skill"]).nullable(),
    concept_id: z.string().trim().min(1).nullable(),
    concept_version: z.string().trim().min(1).nullable(),
    skill_id: z.string().trim().min(1).nullable(),
    skill_version: z.string().trim().min(1).nullable(),
    intervention_type_id: z.string().trim().min(1).nullable(),
    intervention_type_version: z.string().trim().min(1).nullable(),
    intervention_scope_level: z.enum(["domain", "concept", "skill"]).nullable(),
  })
  .strict();

export const AdminEstimateSnapshotSchema = z
  .object({
    state_estimate_id: UuidSchema,
    status: z.enum(["unknown", "estimated", "candidate", "not_applicable"]),
    value: z.json().nullable(),
    estimate_confidence: z.number().min(0).max(1).nullable(),
    evidence_count: z.number().int().nonnegative(),
    observation_count: z.number().int().nonnegative(),
    as_of: TimestampSchema,
  })
  .strict();

export const StateEvaluationDecisionSchema = z.enum([
  "updated",
  "unchanged",
  "withheld",
  "disabled",
  "retracted",
]);

export const NonChangeCategorySchema = z.enum([
  "insufficient_evidence",
  "validation_policy",
  "calculation_held",
  "unclassified",
]);

export const AdminStateChangeLogSchema = z
  .object({
    evaluation_id: UuidSchema,
    learner_id: UuidSchema,
    state_target: AdminStateTargetSchema,
    state_type: StateTypeIdSchema,
    before_estimate: AdminEstimateSnapshotSchema.nullable(),
    after_estimate: AdminEstimateSnapshotSchema.nullable(),
    candidate_estimate: AdminEstimateSnapshotSchema.nullable(),
    decision: StateEvaluationDecisionSchema.nullable(),
    changed_fields: z.array(z.enum(["value", "status", "confidence", "evidence", "version"])),
    reason_codes: z.array(z.string().trim().min(1)),
    processing_status: z.enum(["pending", "processing", "completed", "failed"]),
    non_change_category: NonChangeCategorySchema.nullable(),
    validation_snapshot_id: UuidSchema.nullable(),
    calculation_run_id: UuidSchema,
    occurred_at: TimestampSchema,
  })
  .strict();

export const AdminCurrentStateSchema = z
  .object({
    learner_id: UuidSchema,
    state_target: AdminStateTargetSchema,
    state_type: StateTypeIdSchema,
    current_estimate: AdminEstimateSnapshotSchema,
    head_revision: z.number().int().nonnegative(),
    freshness: z.enum(["fresh", "stale", "pending"]),
    updated_at: TimestampSchema,
  })
  .strict();

const PageLimitSchema = z.number().int().min(1).max(100);

export const AdminStudentListFilterSchema = z
  .object({
    include_archived: z.boolean(),
    limit: PageLimitSchema,
    after: z
      .object({ joined_at: TimestampSchema, learner_id: UuidSchema })
      .strict()
      .nullable(),
  })
  .strict();

export const AdminStateLogFilterSchema = z
  .object({
    learner_id: UuidSchema.nullable(),
    state_type: StateTypeIdSchema.nullable(),
    decisions: z.array(StateEvaluationDecisionSchema).nullable(),
    limit: PageLimitSchema,
    before: z
      .object({ occurred_at: TimestampSchema, evaluation_id: UuidSchema })
      .strict()
      .nullable(),
  })
  .strict();

export const AdminCurrentStateFilterSchema = z
  .object({
    learner_id: UuidSchema,
    limit: PageLimitSchema,
    after: z
      .object({ state_type: StateTypeIdSchema, state_target_id: UuidSchema })
      .strict()
      .nullable(),
  })
  .strict();

export const AdminStudentPageSchema = z
  .object({
    items: z.array(AdminStudentSummarySchema),
    next_cursor: AdminStudentListFilterSchema.shape.after,
  })
  .strict();

export const AdminStateChangePageSchema = z
  .object({
    items: z.array(AdminStateChangeLogSchema),
    next_cursor: AdminStateLogFilterSchema.shape.before,
  })
  .strict();

export type AccountRole = z.infer<typeof AccountRoleSchema>;
export type RoleGrant = z.infer<typeof RoleGrantSchema>;
export type RoleRevocation = z.infer<typeof RoleRevocationSchema>;
export type AuthenticatedLearner = z.infer<typeof AuthenticatedLearnerSchema>;
export type AdminStudentSummary = z.infer<typeof AdminStudentSummarySchema>;
export type AdminStateTarget = z.infer<typeof AdminStateTargetSchema>;
export type AdminEstimateSnapshot = z.infer<typeof AdminEstimateSnapshotSchema>;
export type AdminStateChangeLog = z.infer<typeof AdminStateChangeLogSchema>;
export type AdminCurrentState = z.infer<typeof AdminCurrentStateSchema>;
export type AdminStudentListFilter = z.infer<typeof AdminStudentListFilterSchema>;
export type AdminStateLogFilter = z.infer<typeof AdminStateLogFilterSchema>;
export type AdminCurrentStateFilter = z.infer<typeof AdminCurrentStateFilterSchema>;
export type AdminStudentPage = z.infer<typeof AdminStudentPageSchema>;
export type AdminStateChangePage = z.infer<typeof AdminStateChangePageSchema>;
