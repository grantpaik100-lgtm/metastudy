import { z } from "zod";

export const SourceSchema = z.enum([
  "chatgpt",
  "claude",
  "camera",
  "quiz",
  "manual",
]);

export const EvidenceSchema = z.object({
  type: z.string().trim().min(1),
  value: z.json(),
  extractor_confidence: z.number().min(0).max(1),
});

export const StudentSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const LearnerProfileSchema = z.object({
  preferred_explanation_depth: z.string().nullable(),
  preferred_pace: z.string().nullable(),
  preferred_interaction_style: z.string().nullable(),
  example_preference: z.string().nullable(),
  hint_preference: z.string().nullable(),
  direct_answer_preference: z.string().nullable(),
  general_learning_goal: z.string().nullable(),
  preferred_language: z.string().nullable(),
});

export const DomainStateSchema = z.object({
  domain: z.string(),
  calibration: z.string().nullable(),
  intervention_response: z.record(z.string(), z.json()),
  state_confidence: z.number().min(0).max(1).nullable(),
  updated_at: z.string(),
});

export const SkillStateSchema = z.object({
  domain: z.string(),
  skill_id: z.string(),
  skill_name: z.string(),
  conceptual_mastery: z.number().min(0).max(1).nullable(),
  procedural_mastery: z.number().min(0).max(1).nullable(),
  retrievability: z.number().min(0).max(1).nullable(),
  transferability: z.number().min(0).max(1).nullable(),
  help_need: z.number().min(0).max(1).nullable(),
  misconceptions: z.array(z.record(z.string(), z.json())),
  state_confidence: z.number().min(0).max(1).nullable(),
  updated_at: z.string(),
});

export const RecentLearningEventSchema = z.object({
  id: z.string().uuid(),
  source: SourceSchema,
  event_type: z.string(),
  raw_event: z.record(z.string(), z.json()),
  evidence: z.array(EvidenceSchema),
  occurred_at: z.string(),
  created_at: z.string(),
});

export const TeachingContextSchema = z.object({
  summary: z.string(),
  recommendations: z.array(z.string()),
  policy_version: z.literal("mvp-rule-based-v1"),
});

export const GetLearnerContextInputSchema = z.object({
  student_id: z.string().uuid(),
  domain: z.string().trim().min(1),
  skill_id: z.string().trim().min(1).optional(),
});

export const GetLearnerContextOutputSchema = z.object({
  student_id: z.string().uuid(),
  learner_profile: LearnerProfileSchema.nullable(),
  domain_state: DomainStateSchema.nullable(),
  skill_state: SkillStateSchema.nullable(),
  skill_states: z.array(SkillStateSchema),
  recent_evidence: z.array(RecentLearningEventSchema),
  teaching_context: TeachingContextSchema,
});

export const RecordLearningEventInputSchema = z.object({
  student_id: z.string().uuid(),
  domain: z.string().trim().min(1),
  skill_id: z.string().trim().min(1),
  source: SourceSchema,
  event_type: z.string().trim().min(1).default("observation"),
  raw_event: z.record(z.string(), z.json()),
  evidence: z.array(EvidenceSchema).min(1),
  occurred_at: z.iso.datetime({ offset: true }).optional(),
});

export const RecordLearningEventOutputSchema = z.object({
  success: z.literal(true),
  event_id: z.string().uuid(),
  recorded_at: z.string(),
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type Student = z.infer<typeof StudentSchema>;
export type LearnerProfile = z.infer<typeof LearnerProfileSchema>;
export type DomainState = z.infer<typeof DomainStateSchema>;
export type SkillState = z.infer<typeof SkillStateSchema>;
export type RecentLearningEvent = z.infer<typeof RecentLearningEventSchema>;
export type TeachingContext = z.infer<typeof TeachingContextSchema>;
export type GetLearnerContextInput = z.input<typeof GetLearnerContextInputSchema>;
export type GetLearnerContextOutput = z.infer<typeof GetLearnerContextOutputSchema>;
export type RecordLearningEventInput = z.infer<typeof RecordLearningEventInputSchema>;
export type RecordLearningEventRawInput = z.input<typeof RecordLearningEventInputSchema>;
export type RecordLearningEventOutput = z.infer<typeof RecordLearningEventOutputSchema>;

export interface LearningEvent extends RecentLearningEvent {
  student_id: string;
  domain: string;
  skill_id: string;
}
