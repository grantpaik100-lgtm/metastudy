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

export const LearningEventTypeSchema = z.enum([
  "question",
  "attempt_submitted",
  "self_report",
  "intervention_offered",
  "intervention_choice",
  "intervention_delivered",
  "focus_confirmation",
  "correction",
  "session_action",
  "observation",
]);

export const LearningEventSourceSchema = z.enum([
  "chatgpt",
  "claude",
  "external_ai",
  "learning_app",
  "mcp_ui",
  "student_web",
  "admin_web",
  "system",
]);

export const EventActionSchema = z
  .object({
    action_id: UuidSchema,
    action_type: z.string().trim().min(1),
    occurred_at: TimestampSchema,
    source_refs: z.array(UuidSchema),
    detail: JsonObjectSchema,
  })
  .strict();

export const AnswerObservationSchema = z
  .object({
    answer_id: UuidSchema,
    attempt_id: UuidSchema,
    step_id: UuidSchema.nullable(),
    content_ref: UuidSchema,
    answer_kind: z.enum(["draft", "submitted", "revised"]),
    occurred_at: TimestampSchema,
  })
  .strict();

export const AssessmentObservationSchema = z
  .object({
    assessment_id: UuidSchema,
    answer_id: UuidSchema,
    result: z.enum(["correct", "incorrect", "partial", "unknown"]),
    judge_type: z.enum(["external_ai", "server", "human", "rubric"]),
    judge_version: VersionSchema,
    rubric_version: VersionSchema.nullable(),
    basis_refs: z.array(UuidSchema),
    observation_confidence: ConfidenceSchema.nullable(),
    confidence_method: VersionSchema.nullable(),
    reported_status: z.enum(["source_reported", "server_checked", "human_reviewed"]),
  })
  .strict();

export const SelfReportObservationSchema = z
  .object({
    self_report_id: UuidSchema,
    report_type: z.enum(["confidence", "understanding", "difficulty", "preference", "goal"]),
    value: z.json(),
    scale_ref: z.string().trim().min(1).nullable(),
    target_refs: z.array(KnowledgeTargetRefSchema),
    timing: z.enum(["before_feedback", "after_feedback", "unspecified"]),
    occurred_at: TimestampSchema,
    source_refs: z.array(UuidSchema).min(1),
  })
  .strict();

export const MeasurementObservationSchema = z
  .object({
    name: z.string().trim().min(1),
    value: z.number().nonnegative().nullable(),
    unit: z.string().trim().min(1),
    method: z.string().trim().min(1),
    interval_start: TimestampSchema.nullable(),
    interval_end: TimestampSchema.nullable(),
    coverage: z.enum(["complete", "partial", "unknown"]),
    missing_reason: z.string().trim().min(1).nullable(),
  })
  .strict()
  .superRefine((measurement, context) => {
    if (measurement.value === null && !measurement.missing_reason) {
      context.addIssue({
        code: "custom",
        path: ["missing_reason"],
        message: "a missing measurement requires a reason",
      });
    }
  });

export const SupportTraceSchema = z
  .object({
    offered: z.boolean().nullable(),
    requested: z.boolean().nullable(),
    selected: z.boolean().nullable(),
    delivered: z.boolean().nullable(),
    answer_exposed: z.boolean().nullable(),
    intervention_instance_ids: z.array(UuidSchema),
    coverage: z.enum(["complete", "partial", "unknown"]),
    source_refs: z.array(UuidSchema),
  })
  .strict();

export const LearningEventCoordinatesSchema = z
  .object({
    session_id: UuidSchema,
    episode_id: UuidSchema.nullable(),
    goal_ids: z.array(UuidSchema),
    assessment_goal_ids: z.array(UuidSchema),
    course_offering_id: UuidSchema.nullable(),
    catalog_node_ids: z.array(z.string().trim().min(1)),
    domain_id: z.string().trim().min(1).nullable(),
    primary_concept_id: z.string().trim().min(1).nullable(),
    supporting_concept_ids: z.array(z.string().trim().min(1)),
    targets: z.array(KnowledgeTargetRefSchema),
    focus_revision: z.number().int().nonnegative().nullable(),
    catalog_version: VersionSchema.nullable(),
    material_id: UuidSchema.nullable(),
    task_id: UuidSchema.nullable(),
    item_id: UuidSchema.nullable(),
    step_id: UuidSchema.nullable(),
    attempt_id: UuidSchema.nullable(),
    intervention_instance_ids: z.array(UuidSchema),
  })
  .strict();

export const LearningObservationSchema = z
  .object({
    learner_actions: z.array(EventActionSchema),
    assistant_actions: z.array(EventActionSchema),
    answers: z.array(AnswerObservationSchema),
    assessments: z.array(AssessmentObservationSchema),
    self_reports: z.array(SelfReportObservationSchema),
    measurements: z.array(MeasurementObservationSchema),
    support_trace: SupportTraceSchema,
  })
  .strict();

const LearningEventCoreSchema = z
  .object({
    schema_version: z.literal(V2_SCHEMA_VERSION),
    event_type: LearningEventTypeSchema,
    source: LearningEventSourceSchema,
    source_provider_reported: z.string().trim().min(1).nullable(),
    external_event_id: z.string().trim().min(1).max(500).nullable(),
    idempotency_key: z.string().trim().min(8).max(200),
    occurred_at: TimestampSchema,
    started_at: TimestampSchema.nullable(),
    ended_at: TimestampSchema.nullable(),
    coordinates: LearningEventCoordinatesSchema,
    observation: LearningObservationSchema,
    source_refs: z.array(UuidSchema),
    caused_by_event_id: UuidSchema.nullable(),
    correction_of_event_id: UuidSchema.nullable(),
  })
  .strict()
  .superRefine((event, context) => {
    if (
      event.started_at &&
      event.ended_at &&
      Date.parse(event.ended_at) < Date.parse(event.started_at)
    ) {
      context.addIssue({
        code: "custom",
        path: ["ended_at"],
        message: "ended_at must not be earlier than started_at",
      });
    }
  });

/** External clients may submit observations, never Evidence or State values. */
export const LearningEventCommandSchema = LearningEventCoreSchema;

export const StoredLearningEventSchema = LearningEventCoreSchema.safeExtend({
  event_id: UuidSchema,
  learner_id: UuidSchema,
  actor_id: UuidSchema,
  actor_type: z.enum(["student", "agent", "admin", "system"]),
  connection_id: UuidSchema.nullable(),
  connection_scope: z.string().trim().min(1),
  payload_hash: z.string().trim().min(1),
  recorded_at: TimestampSchema,
});

export const LearningEventReceiptSchema = z
  .object({
    event_id: UuidSchema,
    recorded_at: TimestampSchema,
    duplicate: z.boolean(),
    processing_status: z.enum(["pending", "processing", "completed", "failed", "dead_letter"]),
  })
  .strict();

/** Built only after JWT verification; it is never parsed from the Event body. */
export const LearningEventAuthContextSchema = z
  .object({
    auth_user_id: UuidSchema,
    actor_type: z.enum(["student", "admin"]),
    connection_id: UuidSchema.nullable(),
  })
  .strict();

export type LearningEventCommand = z.infer<typeof LearningEventCommandSchema>;
export type StoredLearningEvent = z.infer<typeof StoredLearningEventSchema>;
export type LearningEventReceipt = z.infer<typeof LearningEventReceiptSchema>;
export type LearningEventAuthContext = z.infer<typeof LearningEventAuthContextSchema>;
