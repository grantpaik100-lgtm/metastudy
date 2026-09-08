import { z } from "zod";
import { JsonObjectSchema, TimestampSchema, VersionSchema } from "./common.js";

export const ParameterSetRefSchema = z
  .object({
    parameter_set_id: z.string().trim().min(1),
    parameter_set_version: VersionSchema,
  })
  .strict();

export const ParameterSetSchema = ParameterSetRefSchema.extend({
  parameter_schema: JsonObjectSchema,
  parameter_payload: JsonObjectSchema,
  canonical_artifact_digest: z.string().trim().min(1),
  created_at: TimestampSchema,
}).strict();

export type ParameterSetRef = z.infer<typeof ParameterSetRefSchema>;
export type ParameterSet = z.infer<typeof ParameterSetSchema>;
