import { z } from "zod";

export const V2_SCHEMA_VERSION = "studymeta.v2" as const;

export const UuidSchema = z.string().uuid();
export const VersionSchema = z.string().trim().min(1).max(100);
export const TimestampSchema = z.iso.datetime({ offset: true });
export const ConfidenceSchema = z.number().min(0).max(1);
export const JsonObjectSchema = z.record(z.string(), z.json());

export const ValueStatusSchema = z.enum([
  "unknown",
  "observed",
  "inferred",
  "candidate",
  "confirmed",
  "estimated",
  "not_applicable",
]);

export const ValueWithStatusSchema = z.union([
  z.object({ value: z.null(), status: z.literal("unknown") }).strict(),
  z
    .object({
      value: z.json(),
      status: ValueStatusSchema.exclude(["unknown"]),
    })
    .strict(),
]);

export const SourceKindSchema = z.enum([
  "message",
  "answer",
  "task",
  "material",
  "event_field",
  "ui_action",
]);

export const SourceRefSchema = z
  .object({
    source_ref_id: UuidSchema,
    learner_id: UuidSchema,
    source_kind: SourceKindSchema,
    connection_id: UuidSchema.nullable(),
    external_ref: z.string().trim().min(1).nullable(),
    event_id: UuidSchema.nullable(),
    json_pointer: z.string().trim().min(1).nullable(),
    content_ref: z.string().trim().min(1).nullable(),
    content_hash: z.string().trim().min(1).nullable(),
    availability: z.enum(["available", "reference_only", "expired", "deleted"]),
    provenance_status: z.enum([
      "source_reported",
      "server_captured",
      "human_reviewed",
    ]),
    retention_policy_id: UuidSchema.nullable(),
    expires_at: TimestampSchema.nullable(),
  })
  .strict();

export type ValueWithStatus = z.infer<typeof ValueWithStatusSchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;

