import { z } from "zod";
import { JsonObjectSchema, TimestampSchema, UuidSchema, VersionSchema } from "./common.js";

export const EventReviewSchema = z
  .object({
    review_id: UuidSchema,
    learner_id: UuidSchema,
    event_id: UuidSchema,
    decision: z.enum(["valid", "disputed", "corrected", "invalidated"]),
    reason: z.string().trim().min(1),
    actor_id: UuidSchema,
    correction_event_id: UuidSchema.nullable(),
    created_at: TimestampSchema,
  })
  .strict();

export const CorrectionRequestSchema = z
  .object({
    correction_id: UuidSchema,
    learner_id: UuidSchema,
    target_kind: z.enum(["event", "evidence", "fact", "focus"]),
    target_id: UuidSchema,
    reason: z.string().trim().min(1),
    proposed_correction: JsonObjectSchema,
    source_refs: z.array(UuidSchema).min(1),
    requested_by: UuidSchema,
    requested_at: TimestampSchema,
  })
  .strict();

export const CorrectionReviewSchema = z
  .object({
    correction_review_id: UuidSchema,
    learner_id: UuidSchema,
    correction_id: UuidSchema,
    decision: z.enum(["accepted", "rejected", "superseded"]),
    reason: z.string().trim().min(1),
    reviewed_by: UuidSchema,
    reviewed_at: TimestampSchema,
    resulting_event_id: UuidSchema.nullable(),
  })
  .strict();

export const InputManifestSchema = z
  .object({
    input_manifest_id: UuidSchema,
    learner_id: UuidSchema,
    items: z.array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("event"), ref_id: UuidSchema }).strict(),
        z.object({ kind: z.literal("source"), ref_id: UuidSchema }).strict(),
        z.object({ kind: z.literal("evidence"), ref_id: UuidSchema }).strict(),
        z.object({ kind: z.literal("event_review"), ref_id: UuidSchema }).strict(),
        z.object({ kind: z.literal("evidence_review"), ref_id: UuidSchema }).strict(),
      ]).and(
        z.object({
          ordinal: z.number().int().nonnegative(),
          included: z.boolean(),
          exclusion_reason_code: z.string().trim().min(1).nullable(),
        }),
      ),
    ),
    catalog_mapping_versions: z.array(VersionSchema),
    rule_artifacts: z.array(
      z.object({ id: z.string(), version: VersionSchema, digest: z.string() }).strict(),
    ),
    model_version: VersionSchema.nullable(),
    prompt_version: VersionSchema.nullable(),
    parameter_set_id: z.string().trim().min(1).nullable(),
    parameter_set_version: VersionSchema.nullable(),
    validation_snapshot_id: UuidSchema,
    operational_policy_version: VersionSchema.nullable(),
    as_of: TimestampSchema,
    knowledge_cutoff: TimestampSchema,
    random_seed: z.string().nullable(),
    input_hash: z.string().trim().min(1),
    created_at: TimestampSchema,
    sealed_at: TimestampSchema.nullable(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const ordinals = manifest.items.map((item) => item.ordinal);
    if (new Set(ordinals).size !== ordinals.length) {
      context.addIssue({ code: "custom", path: ["items"], message: "manifest ordinals must be unique" });
    }
    manifest.items.forEach((item, index) => {
      if (item.included === (item.exclusion_reason_code !== null)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "exclusion_reason_code"],
          message: "only excluded inputs require an exclusion reason",
        });
      }
    });
    if ((manifest.parameter_set_id === null) !== (manifest.parameter_set_version === null)) {
      context.addIssue({
        code: "custom",
        path: ["parameter_set_version"],
        message: "parameter set ID and version must be present together",
      });
    }
  });

export const ProcessingJobSchema = z
  .object({
    job_id: UuidSchema,
    owner_learner_id: UuidSchema,
    event_id: UuidSchema,
    run_id: UuidSchema,
    kind: z.enum(["derive_evidence", "evaluate_state", "recalculate", "summarize"]),
    status: z.enum(["pending", "processing", "completed", "failed", "dead_letter"]),
    available_at: TimestampSchema,
    lease_until: TimestampSchema.nullable(),
    attempt_count: z.number().int().nonnegative(),
    max_attempt_policy: VersionSchema,
    last_error_code: z.string().trim().min(1).nullable(),
    payload: JsonObjectSchema,
    created_at: TimestampSchema,
  })
  .strict();

export type InputManifest = z.infer<typeof InputManifestSchema>;
export type ProcessingJob = z.infer<typeof ProcessingJobSchema>;
