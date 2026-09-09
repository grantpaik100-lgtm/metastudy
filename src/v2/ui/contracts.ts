import { z } from "zod";
import { TimestampSchema, VersionSchema } from "../contracts/common.js";
import { StateTypeIdSchema } from "../contracts/state.js";
import { EvidenceTypeIdSchema } from "../contracts/evidence.js";
import { OperationalModeSchema, ScientificValidationStatusSchema } from "../contracts/scientific-validation.js";

/** UI-0 is a display boundary: it never derives a State meaning from a value. */
export const UiDataProvenanceSchema = z.discriminatedUnion("data_mode", [
  z.object({ data_mode: z.literal("authenticated_live"), source_label: z.literal("인증된 학습 데이터") }).strict(),
  z.object({ data_mode: z.literal("synthetic_ui_mock"), source_label: z.literal("가상 UI 예시 데이터") }).strict(),
]);

export const StudentStateTypeSchema = StateTypeIdSchema.exclude(["intervention_response", "state_confidence"]);
export const StudentCardStateTypeSchema = z.enum(["conceptual_mastery", "procedural_mastery", "help_need", "retrievability", "misconception"]);
export const AdminStateTypeSchema = StateTypeIdSchema.exclude(["state_confidence"]);
export const StudentDefaultCoreStateTupleSchema = z.tuple([
  z.literal("conceptual_mastery"), z.literal("procedural_mastery"), z.literal("help_need"),
]);
export const StateDisplayLevelSchema = z.enum(["unknown", "needs_attention", "forming", "stable", "not_applicable"]);
export const StateDisplayToneSchema = z.enum(["neutral", "attention", "progress", "support", "withheld"]);
export const StateDisplayDirectionSchema = z.enum(["increased", "decreased", "unchanged", "not_applicable"]);
export const StateResultOutcomeSchema = z.enum(["changed", "unchanged", "withheld", "pending"]);

const StateDisplayBaseSchema = z.object({
  display_label: z.string().trim().min(1), value: z.json().nullable(), status: z.enum(["unknown", "estimated", "candidate", "not_applicable"]), display_level: StateDisplayLevelSchema,
  display_text: z.string().trim().min(1), tone: StateDisplayToneSchema, direction: StateDisplayDirectionSchema,
  scale_definition_id: z.string().trim().min(1).nullable(), scale_definition_version: VersionSchema.nullable(), evaluated_at: TimestampSchema.nullable(), as_of: TimestampSchema,
  evidence_count: z.number().int().nonnegative(), observation_count: z.number().int().nonnegative(), result_outcome: StateResultOutcomeSchema, result_reason_label: z.string().trim().min(1),
  estimate_confidence: z.number().min(0).max(1).nullable(), estimate_confidence_label: z.string().trim().min(1).nullable(),
}).strict().superRefine((state, context) => {
  const pairedScale = state.scale_definition_id !== null && state.scale_definition_version !== null;
  if ((state.scale_definition_id === null) !== (state.scale_definition_version === null)) context.addIssue({ code: "custom", path: ["scale_definition_version"], message: "scale ID and version are paired" });
  if (["estimated", "candidate"].includes(state.status) && (state.value === null || !pairedScale)) context.addIssue({ code: "custom", path: ["value"], message: "estimated and candidate States require a value and exact scale" });
  if (state.status === "unknown" && (state.value !== null || pairedScale || state.display_level !== "unknown")) context.addIssue({ code: "custom", path: ["status"], message: "unknown is a null, unknown-level display" });
  if (state.status === "not_applicable" && (state.value !== null || pairedScale || state.display_level !== "not_applicable" || state.direction !== "not_applicable")) context.addIssue({ code: "custom", path: ["status"], message: "not applicable has no value or scale" });
  if (state.status === "candidate" && state.result_outcome === "changed") context.addIssue({ code: "custom", path: ["result_outcome"], message: "candidate is not a confirmed change" });
});

/** Detail view may include transferability/calibration, never intervention_response/state_confidence. */
export const StudentStateDetailDisplaySchema = StateDisplayBaseSchema.extend({ state_type: StudentStateTypeSchema });
/** Home and MCP card view is intentionally narrower than the student detail view. */
export const StudentCardDisplaySchema = StateDisplayBaseSchema.extend({ state_type: StudentCardStateTypeSchema });
export const StudentStateDisplaySchema = StudentStateDetailDisplaySchema;
export const AdminStateDisplaySchema = StateDisplayBaseSchema.extend({ state_type: AdminStateTypeSchema });

const requireDefaultCoreCards = (cards: readonly { state_type: string }[], context: z.RefinementCtx, path: PropertyKey[]): void => {
  const types = cards.map((card) => card.state_type);
  if (new Set(types).size !== types.length) context.addIssue({ code: "custom", path, message: "display State cards are unique" });
  for (const stateType of ["conceptual_mastery", "procedural_mastery", "help_need"]) if (!types.includes(stateType)) context.addIssue({ code: "custom", path, message: "three default core States are required" });
};

export const StudentStateProjectionSchema = z.object({
  provenance: UiDataProvenanceSchema, core_states: StudentDefaultCoreStateTupleSchema, cards: z.array(StudentCardDisplaySchema).min(3).max(5), scientific_validation: z.never().optional(),
}).strict().superRefine((projection, context) => requireDefaultCoreCards(projection.cards, context, ["cards"]));

export const LearnerContextDisplaySchema = z.object({
  provenance: UiDataProvenanceSchema, subject_label: z.string().trim().min(1), concept_label: z.string().trim().min(1), context_updated_at: TimestampSchema,
  states: z.array(StudentCardDisplaySchema).min(3).max(5), recommendation_label: z.string().trim().min(1),
  next_action: z.object({ action_id: z.string().trim().min(1), label: z.string().trim().min(1), availability: z.enum(["available", "unavailable"]), disabled: z.boolean() }).strict(),
}).strict().superRefine((context, issue) => {
  requireDefaultCoreCards(context.states, issue, ["states"]);
  if (context.next_action.availability === "unavailable" && !context.next_action.disabled) issue.addIssue({ code: "custom", path: ["next_action"], message: "unsupported actions are disabled" });
});

const AuditEventSchema = z.object({ event_id: z.string().trim().min(1), label: z.string().trim().min(1), occurred_at: TimestampSchema }).strict();
const AuditEvidenceSchema = z.object({ evidence_id: z.string().trim().min(1), label: z.string().trim().min(1), event_id: z.string().trim().min(1) }).strict();
const AuditStateResultSchema = z.object({ state_type: StudentStateTypeSchema, display_label: z.string().trim().min(1), outcome: StateResultOutcomeSchema, reason_label: z.string().trim().min(1), evidence_ids: z.array(z.string().trim().min(1)).min(1) }).strict();
export const SessionSummaryDisplaySchema = z.object({
  provenance: UiDataProvenanceSchema, session_id: z.string().trim().min(1), subject_label: z.string().trim().min(1), concept_label: z.string().trim().min(1), started_at: TimestampSchema, ended_at: TimestampSchema.nullable(), end_status: z.enum(["completed", "interrupted", "auto_closed"]),
  events: z.array(AuditEventSchema), evidence: z.array(AuditEvidenceSchema), state_results: z.array(AuditStateResultSchema), excerpts: z.array(z.string().trim().min(1).max(160)).max(2),
  next_actions: z.array(z.object({ label: z.string().trim().min(1), availability: z.enum(["available", "unavailable"]), disabled: z.boolean() }).strict()).max(1),
}).strict().superRefine((summary, context) => {
  const unique = (ids: string[], path: string): void => { if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: [path], message: "audit IDs are unique" }); };
  unique(summary.events.map((event) => event.event_id), "events"); unique(summary.evidence.map((evidence) => evidence.evidence_id), "evidence");
  const eventIds = new Set(summary.events.map((event) => event.event_id)); const evidenceIds = new Set(summary.evidence.map((evidence) => evidence.evidence_id));
  for (const evidence of summary.evidence) if (!eventIds.has(evidence.event_id)) context.addIssue({ code: "custom", path: ["evidence"], message: "Evidence must reference a session Event" });
  for (const result of summary.state_results) { unique(result.evidence_ids, "state_results"); for (const evidenceId of result.evidence_ids) if (!evidenceIds.has(evidenceId)) context.addIssue({ code: "custom", path: ["state_results"], message: "State result must reference session Evidence" }); }
  for (const action of summary.next_actions) if (action.availability === "unavailable" && !action.disabled) context.addIssue({ code: "custom", path: ["next_actions"], message: "unsupported actions are disabled" });
});

export const CorrectionRequestDisplaySchema = z.object({ provenance: UiDataProvenanceSchema, request_id: z.string().trim().min(1), status: z.enum(["received", "under_review", "evidence_retained", "evidence_corrected", "evidence_invalidated", "recalculation_pending", "recalculation_completed", "no_change"]), reason_label: z.string().trim().min(1), requested_at: TimestampSchema, direct_new_state_value: z.never().optional() }).strict();

/** Admin projections may display intervention_response, but never state_confidence or a write path. */
export const AdminStateLogEntrySchema = z.object({ occurred_at: TimestampSchema, state: AdminStateDisplaySchema }).strict();
export const AdminStudentSummarySchema = z.object({ provenance: UiDataProvenanceSchema, learner_ref: z.string().trim().min(1), display_name: z.string().trim().min(1), last_active_at: TimestampSchema.nullable(), current_states: z.array(AdminStateDisplaySchema), state_log: z.array(AdminStateLogEntrySchema) }).strict();

export const ValidationLayerSchema = z.enum(["A", "B", "C"]);
export const ValidationSubjectKindSchema = z.enum(["evidence_definition", "generation_rule", "state_update_rule"]);
const ValidationScopeDisplaySchema = z.object({ population: z.string().trim().min(1).nullable(), domain: z.string().trim().min(1).nullable(), task_type: z.string().trim().min(1).nullable(), learning_environment: z.string().trim().min(1).nullable() }).strict();
const OperationAssignmentDisplaySchema = z.object({ assignment_ref: z.string().trim().min(1), policy_version: VersionSchema, mode: OperationalModeSchema, assigned_at: TimestampSchema, label: z.string().trim().min(1) }).strict();
export const ValidationMatrixRowSchema = z.object({
  layer: ValidationLayerSchema, subject_kind: ValidationSubjectKindSchema, subject_id: z.string().trim().min(1), subject_version: VersionSchema, evidence_type_id: EvidenceTypeIdSchema, assessment_ref: z.string().trim().min(1), assessment_version: z.number().int().positive(), validation_status: ScientificValidationStatusSchema,
  claim: z.string().trim().min(1), scope: ValidationScopeDisplaySchema, supporting_source_refs: z.array(z.string().trim().min(1)), contradicting_source_refs: z.array(z.string().trim().min(1)), study_refs: z.array(z.string().trim().min(1)), limitations: z.array(z.string().trim().min(1)),
  reviewer_ref: z.string().trim().min(1).nullable(), reviewed_at: TimestampSchema.nullable(), history_ref: z.string().trim().min(1).nullable(), operation_assignment: OperationAssignmentDisplaySchema.nullable(),
}).strict().superRefine((row, context) => {
  const expectedKind = row.layer === "A" ? "evidence_definition" : row.layer === "B" ? "generation_rule" : "state_update_rule";
  if (row.subject_kind !== expectedKind) context.addIssue({ code: "custom", path: ["subject_kind"], message: "A/B/C uses its exact subject kind" });
  if ((row.reviewer_ref === null) !== (row.reviewed_at === null)) context.addIssue({ code: "custom", path: ["reviewed_at"], message: "reviewer and review time are paired" });
  const scopeValues = Object.values(row.scope);
  const hasConcreteScope = scopeValues.every((value) => value !== null);
  const hasAnyScope = scopeValues.some((value) => value !== null);
  const hasSupportingBasis = row.supporting_source_refs.length > 0 || row.study_refs.length > 0;
  const hasContradictingBasis = row.contradicting_source_refs.length > 0;
  if (row.validation_status === "not_assessed" && (row.reviewer_ref !== null || row.reviewed_at !== null || hasAnyScope || row.supporting_source_refs.length > 0 || row.contradicting_source_refs.length > 0 || row.study_refs.length > 0 || row.history_ref !== null)) context.addIssue({ code: "custom", path: ["validation_status"], message: "not assessed is unscoped and has no sources or reviewer" });
  if (row.validation_status !== "not_assessed" && (row.reviewer_ref === null || row.reviewed_at === null)) context.addIssue({ code: "custom", path: ["validation_status"], message: "assessed status requires reviewer and review time" });
  if (["supported_in_scope", "mixed", "unsupported_in_scope"].includes(row.validation_status) && !hasConcreteScope) context.addIssue({ code: "custom", path: ["scope"], message: "in-scope conclusion requires complete scope" });
  if (row.validation_status === "supported_in_scope" && !hasSupportingBasis) context.addIssue({ code: "custom", path: ["supporting_source_refs"], message: "supported requires source or study basis" });
  if (row.validation_status === "mixed" && (!hasSupportingBasis || !hasContradictingBasis)) context.addIssue({ code: "custom", path: ["validation_status"], message: "mixed requires supporting and contradicting basis" });
  if (row.validation_status === "unsupported_in_scope" && !hasContradictingBasis) context.addIssue({ code: "custom", path: ["contradicting_source_refs"], message: "unsupported requires contradicting basis" });
  if (row.validation_status === "under_review" && !hasSupportingBasis && row.limitations.length === 0) context.addIssue({ code: "custom", path: ["validation_status"], message: "under review requires source, study, or limitation" });
});
export const AdminValidationMatrixSchema = z.object({ provenance: UiDataProvenanceSchema, rows: z.array(ValidationMatrixRowSchema) }).strict();

export type StudentStateProjection = z.infer<typeof StudentStateProjectionSchema>;
export type LearnerContextDisplay = z.infer<typeof LearnerContextDisplaySchema>;
export type SessionSummaryDisplay = z.infer<typeof SessionSummaryDisplaySchema>;
