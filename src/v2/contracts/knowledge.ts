import { z } from "zod";
import { UuidSchema, VersionSchema } from "./common.js";

export const MappingStatusSchema = z.enum([
  "unmapped",
  "provisional",
  "approved",
  "rejected",
]);

export const KnowledgeTargetRefSchema = z
  .object({
    target_type: z.enum(["concept", "skill"]),
    target_id: z.string().trim().min(1),
    target_version: VersionSchema,
    domain_id: z.string().trim().min(1),
    scope_id: z.string().trim().min(1),
    mapping_status: MappingStatusSchema,
    mapping_revision_id: UuidSchema,
    basis_refs: z.array(UuidSchema),
  })
  .strict();

export const TargetRoleSchema = z.enum([
  "primary",
  "supporting",
  "prerequisite",
]);

export const LearningTargetSchema = z
  .object({
    role: TargetRoleSchema,
    target: KnowledgeTargetRefSchema,
  })
  .strict();

export const DomainDefinitionSchema = z
  .object({
    domain_id: z.string().trim().min(1),
    version: VersionSchema,
    name_ko: z.string().trim().min(1),
    status: z.enum(["draft", "provisional", "approved", "retired"]),
  })
  .strict();

export const ConceptDefinitionSchema = z
  .object({
    concept_id: z.string().trim().min(1),
    version: VersionSchema,
    domain_id: z.string().trim().min(1),
    name_ko: z.string().trim().min(1),
    definition: z.string().trim().min(1).nullable(),
    scope_id: z.string().trim().min(1),
    status: z.enum(["draft", "provisional", "approved", "retired"]),
    source_refs: z.array(UuidSchema),
  })
  .strict();

export const SkillDefinitionSchema = z
  .object({
    skill_id: z.string().trim().min(1),
    version: VersionSchema,
    domain_id: z.string().trim().min(1),
    name_ko: z.string().trim().min(1),
    description: z.string().trim().min(1),
    rubric_ref: z.string().trim().min(1).nullable(),
    status: z.enum(["draft", "provisional", "approved", "retired"]),
  })
  .strict();

export type KnowledgeTargetRef = z.infer<typeof KnowledgeTargetRefSchema>;
export type LearningTarget = z.infer<typeof LearningTargetSchema>;

