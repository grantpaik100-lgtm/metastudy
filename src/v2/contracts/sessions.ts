import { z } from "zod";
import { TimestampSchema, UuidSchema, VersionSchema } from "./common.js";
import { KnowledgeTargetRefSchema } from "./knowledge.js";

export const ActiveFocusSchema = z
  .object({
    domain_id: z.string().trim().min(1),
    primary_concept: KnowledgeTargetRefSchema.nullable(),
    supporting_concepts: z.array(KnowledgeTargetRefSchema),
    confirmed_by_event_id: UuidSchema.nullable(),
  })
  .strict();

export const SessionSchema = z
  .object({
    session_id: UuidSchema,
    learner_id: UuidSchema,
    status: z.enum(["active", "idle", "completed"]),
    semester_id: UuidSchema.nullable(),
    active_focus: ActiveFocusSchema.nullable(),
    focus_revision: z.number().int().nonnegative(),
    session_revision: z.number().int().nonnegative(),
    started_at: TimestampSchema,
    last_learning_event_at: TimestampSchema.nullable(),
    last_resumed_at: TimestampSchema.nullable(),
    idle_deadline_at: TimestampSchema,
    ended_at: TimestampSchema.nullable(),
    end_reason: z.string().trim().min(1).nullable(),
    summary_status: z.enum(["none", "draft", "final", "pending", "failed"]),
    timeout_policy_version: VersionSchema,
  })
  .strict();

export const EpisodeSchema = z
  .object({
    episode_id: UuidSchema,
    learner_id: UuidSchema,
    session_id: UuidSchema,
    started_at: TimestampSchema,
    ended_at: TimestampSchema.nullable(),
    focus_revision: z.number().int().nonnegative(),
  })
  .strict();

export const FocusProposalSchema = z
  .object({
    proposal_id: UuidSchema,
    learner_id: UuidSchema,
    session_id: UuidSchema,
    base_focus_revision: z.number().int().nonnegative(),
    previous_focus: ActiveFocusSchema.nullable(),
    proposed_focus: ActiveFocusSchema,
    relation: z.enum([
      "same_concept",
      "subskill",
      "prerequisite_or_supporting",
      "same_domain_new_concept",
      "new_domain",
      "uncertain",
    ]),
    fact_assertion_refs: z.array(UuidSchema),
    basis_refs: z.array(UuidSchema),
    status: z.enum(["pending", "confirmed", "rejected", "expired"]),
    confirmation_event_id: UuidSchema.nullable(),
  })
  .strict();

export const InterventionInstanceSchema = z
  .object({
    intervention_instance_id: UuidSchema,
    learner_id: UuidSchema,
    session_id: UuidSchema,
    targets: z.array(KnowledgeTargetRefSchema),
    intervention_type_id: z.string().trim().min(1),
    intervention_type_version: VersionSchema,
    offered_event_id: UuidSchema.nullable(),
    choice_event_id: UuidSchema.nullable(),
    delivered_event_id: UuidSchema.nullable(),
    before_attempt_id: UuidSchema.nullable(),
    after_attempt_ids: z.array(UuidSchema),
    followup_refs: z.array(UuidSchema),
  })
  .strict();

export const SessionSummarySchema = z
  .object({
    summary_id: UuidSchema,
    learner_id: UuidSchema,
    session_id: UuidSchema,
    revision: z.number().int().positive(),
    status: z.enum(["draft", "final"]),
    input_manifest_id: UuidSchema,
    concept_path: z.array(KnowledgeTargetRefSchema),
    activity_refs: z.array(UuidSchema),
    evidence_refs: z.array(UuidSchema),
    state_changes: z.array(UuidSchema),
    unchanged_states: z.array(
      z.object({ state_target_id: UuidSchema, reason_codes: z.array(z.string()) }).strict(),
    ),
    unknowns: z.array(z.string().trim().min(1)),
    intervention_refs: z.array(UuidSchema),
    next_start_point: z.string().trim().min(1).nullable(),
    generated_at: TimestampSchema,
    supersedes_summary_id: UuidSchema.nullable(),
  })
  .strict();

export type LearningSession = z.infer<typeof SessionSchema>;
export type FocusProposal = z.infer<typeof FocusProposalSchema>;

