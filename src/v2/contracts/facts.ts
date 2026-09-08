import { z } from "zod";
import {
  ConfidenceSchema,
  TimestampSchema,
  UuidSchema,
  VersionSchema,
} from "./common.js";

export const FactOriginSchema = z.enum(["declared", "inferred", "catalog"]);
export const FactStatusSchema = z.enum([
  "unknown",
  "candidate",
  "confirmed",
  "not_applicable",
]);

export const FactAssertionSchema = z
  .object({
    assertion_id: UuidSchema,
    learner_id: UuidSchema,
    subject_type: z.string().trim().min(1),
    subject_id: z.string().trim().min(1).nullable(),
    attribute: z.string().trim().min(1),
    context_scope_id: z.string().trim().min(1).nullable(),
    origin: FactOriginSchema,
    value: z.json().nullable(),
    status: FactStatusSchema,
    source_refs: z.array(UuidSchema),
    basis_refs: z.array(UuidSchema),
    reason: z.string().trim().min(1).nullable(),
    confidence: ConfidenceSchema.nullable(),
    model_version: VersionSchema.nullable(),
    created_at: TimestampSchema,
    supersedes_assertion_id: UuidSchema.nullable(),
  })
  .strict()
  .superRefine((fact, context) => {
    if (fact.status === "unknown" && fact.value !== null) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "unknown facts must have a null value",
      });
    }
    if (fact.origin === "inferred" && fact.status !== "unknown") {
      if (fact.basis_refs.length === 0 || !fact.reason || !fact.model_version) {
        context.addIssue({
          code: "custom",
          message: "inferred facts require basis, reason, and model version",
        });
      }
    }
  });

export const FactSelectionSchema = z
  .object({
    selection_id: UuidSchema,
    learner_id: UuidSchema,
    assertion_id: UuidSchema,
    selected_from: FactOriginSchema,
    policy_version: VersionSchema,
    confirmation_ref: UuidSchema.nullable(),
    applied_at: TimestampSchema,
    supersedes_selection_id: UuidSchema.nullable(),
  })
  .strict();

export const EffectiveFactSchema = z
  .object({
    attribute: z.string().trim().min(1),
    context_scope_id: z.string().trim().min(1).nullable(),
    value: z.json().nullable(),
    status: FactStatusSchema,
    selected_from: FactOriginSchema.nullable(),
    selected_assertion_id: UuidSchema.nullable(),
    selection_policy_version: VersionSchema.nullable(),
    confirmation_ref: UuidSchema.nullable(),
  })
  .strict();

export type FactAssertion = z.infer<typeof FactAssertionSchema>;
export type FactSelection = z.infer<typeof FactSelectionSchema>;

