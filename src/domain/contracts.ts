import { z } from "zod";

export const SourceSchema = z.enum([
  "chatgpt",
  "claude",
  "external_ai",
  "ai_tutor",
  "learning_app",
  "lms",
  "camera",
  "quiz",
  "manual",
]);

export const EvidenceSchema = z.object({
  type: z.string().trim().min(1),
  value: z.json(),
  extractor_confidence: z.number().min(0).max(1),
  extractor: z.string().trim().min(1).default("source_reported"),
  extractor_version: z.string().trim().min(1).default("unknown"),
  definition_version: z
    .string()
    .trim()
    .min(1)
    .default("studymeta-evidence-v1"),
  missing_reason: z.string().trim().min(1).nullable().default(null),
});

export const LearnerStateStatusSchema = z.enum([
  "verified",
  "experimental",
  "insufficient_evidence",
  "withheld",
]);

export const LearnerStateTypeSchema = z.enum([
  "procedural_mastery",
  "help_need",
  "retrievability",
  "transferability",
]);

export const LearnerStateEstimateSchema = z.object({
  domain: z.string(),
  skill_id: z.string(),
  state_type: LearnerStateTypeSchema,
  value: z.number().min(0).max(1).nullable(),
  status: LearnerStateStatusSchema,
  confidence: z.number().min(0).max(1).nullable(),
  evidence_count: z.number().int().min(0),
  effective_sample_size: z.number().min(0),
  last_updated: z.string(),
  model_version: z.string(),
  supporting_event_ids: z.array(z.string().uuid()),
  limitation: z.string(),
});

export const LearnerStateUpdateSchema = z.object({
  status: z.enum(["updated", "insufficient_evidence", "withheld", "disabled"]),
  updated_states: z.array(LearnerStateEstimateSchema),
  excluded_evidence: z.array(
    z.object({
      event_id: z.string().uuid(),
      evidence_type: z.string(),
      reason: z.string(),
    }),
  ),
  message: z.string(),
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
  source_provider: z.string().nullable().optional(),
  problem_id: z.string().nullable().optional(),
  event_type: z.string(),
  raw_event: z.record(z.string(), z.json()),
  evidence: z.array(EvidenceSchema),
  started_at: z.string().nullable().optional(),
  ended_at: z.string().nullable().optional(),
  occurred_at: z.string(),
  created_at: z.string(),
});

export const TeachingContextSchema = z.object({
  summary: z.string(),
  recommendations: z.array(z.string()),
  executable_instructions: z.array(z.string()),
  policy_version: z.literal("adaptive-rule-based-v2"),
});

export const InteractionPolicySchema = z.object({
  interaction_mode: z.enum(["guided", "independent"]),
  initial_scaffolding: z.enum(["high", "medium", "low"]),
  response_granularity: z.literal("one_step_at_a_time"),
  initial_prompt_type: z.enum([
    "multiple_choice",
    "guided_short_answer",
    "independent_solution",
  ]),
  success_action: z.literal("reduce_scaffolding"),
  failure_action: z.literal("increase_scaffolding"),
  wait_for_student_response: z.literal(true),
  retrieval_before_explanation: z.boolean(),
  transfer_problem_after_success: z.boolean(),
  teaching_approach: z.array(z.string()),
  initial_scaffold: z.enum([
    "multiple_choice",
    "guided_short_answer",
    "independent_solution",
  ]),
  choice_count: z.number().int().min(0).max(4),
  direct_answer: z.enum(["avoid_initially", "allow"]),
  wait_for_learner_response: z.literal(true),
  success_path: z.array(z.string()),
  failure_path: z.array(z.string()),
  independent_success_action: z.string(),
  transfer_probe: z.object({
    enabled: z.boolean(),
    signal_status: z.enum(["experimental", "not_applicable"]),
    instruction: z.string(),
  }),
  retrievability_probe: z.object({
    enabled: z.boolean(),
    signal_status: z.enum(["experimental", "not_applicable"]),
    instruction: z.string(),
  }),
});

export const DisplayPolicySchema = z.object({
  demo_mode: z.boolean(),
  show_studymeta_banner: z.boolean(),
  show_state_summary: z.boolean(),
  show_policy_summary: z.boolean(),
  show_step_labels: z.boolean(),
});

export const LearnerProfileMetadataSchema = z.object({
  profile_type: z.enum(["stored", "synthetic_demo"]),
  label: z.string(),
  is_real_user_data: z.boolean(),
});

export const DemoChoiceSchema = z.object({
  key: z.enum(["ㄱ", "ㄴ", "ㄷ"]),
  text: z.string(),
});

export const FirstTurnContractSchema = z.object({
  scenario: z.literal("chain_rule_ir"),
  applies_to_first_tutoring_turn_only: z.literal(true),
  banner: z.literal("[StudyMeta · Demo Learner]"),
  state_summary: z.array(z.string()),
  strategy_summary: z.literal("Step-by-step · Socratic · Adaptive Scaffolding"),
  step_label: z.literal("STEP 1 · 구조 인식"),
  problem: z.literal("y = (3x² + 1)^5"),
  question: z.literal("가장 먼저 해야 할 행동은?"),
  choices: z.tuple([DemoChoiceSchema, DemoChoiceSchema, DemoChoiceSchema]),
  closing_instruction: z.literal("→ ㄱ / ㄴ / ㄷ 중 하나를 입력해주세요."),
  stop_after_closing_instruction: z.literal(true),
  exact_response_template: z.string(),
  forbidden_content: z.array(z.string()),
});

export const StateSignalSchema = z.object({
  name: z.string(),
  value: z.number().min(0).max(1),
  level: z.enum(["low", "moderate", "high"]),
  evidence_status: z.enum(["validated_focus", "experimental"]),
});

export const EvidenceWritebackSchema = z.object({
  tool: z.enum(["record_my_learning_event", "record_learning_event"]),
  event_type: z.literal("problem_attempt"),
  evidence_fields: z.array(z.string()),
  state_update_automated: z.boolean(),
  update_policy: z.string(),
  instruction: z.string(),
});

export const GetLearnerContextInputSchema = z.object({
  student_id: z.string().uuid(),
  domain: z.string().trim().min(1),
  skill_id: z.string().trim().min(1).optional(),
  demo_mode: z.boolean().optional(),
  learner_profile_type: z
    .enum(["stored", "synthetic", "synthetic_demo"])
    .optional(),
  include_experimental_states: z.boolean().optional(),
});

export const GetLearnerContextOutputSchema = z.object({
  student_id: z.string().uuid(),
  student: StudentSchema,
  learner_profile: LearnerProfileSchema.nullable(),
  domain_state: DomainStateSchema.nullable(),
  skill_state: SkillStateSchema.nullable(),
  skill_states: z.array(SkillStateSchema),
  recent_evidence: z.array(RecentLearningEventSchema),
  profile_type: z.enum(["stored", "synthetic_demo"]),
  learner_state: SkillStateSchema.nullable(),
  learner_profile_metadata: LearnerProfileMetadataSchema,
  state_signals: z.array(StateSignalSchema),
  teaching_context: TeachingContextSchema,
  interaction_policy: InteractionPolicySchema,
  pedagogical_policy: InteractionPolicySchema,
  demo_scenario: z.literal("chain_rule_ir").nullable(),
  first_turn_contract: FirstTurnContractSchema.nullable(),
  display: DisplayPolicySchema,
  evidence_writeback: EvidenceWritebackSchema,
  state_estimates: z.array(LearnerStateEstimateSchema),
  experimental_states_included: z.boolean(),
});

export const GetMyLearnerContextInputSchema = z.object({
  domain: z.string().trim().min(1).optional(),
  skill_id: z.string().trim().min(1).optional(),
  demo_mode: z.boolean().optional(),
  learner_profile_type: z
    .enum(["stored", "synthetic", "synthetic_demo"])
    .optional(),
  include_experimental_states: z.boolean().optional(),
});

export const GetMyLearnerContextOutputSchema = GetLearnerContextOutputSchema.extend({
  resolved_domain: z.string().nullable(),
});

const LearningEventFieldsSchema = z
  .object({
    domain: z.string().trim().min(1),
    skill_id: z.string().trim().min(1),
    skill_name: z.string().trim().min(1).optional(),
    source: SourceSchema,
    source_provider: z.string().trim().min(1).optional(),
    event_type: z.string().trim().min(1).default("observation"),
    problem_id: z.string().trim().min(1).optional(),
    raw_event: z.record(z.string(), z.json()),
    evidence: z.array(EvidenceSchema).min(1),
    started_at: z.iso.datetime({ offset: true }).optional(),
    ended_at: z.iso.datetime({ offset: true }).optional(),
    occurred_at: z.iso.datetime({ offset: true }).optional(),
    idempotency_key: z.string().trim().min(8).max(200).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.started_at &&
      value.ended_at &&
      Date.parse(value.ended_at) < Date.parse(value.started_at)
    ) {
      context.addIssue({
        code: "custom",
        path: ["ended_at"],
        message: "ended_at must not be earlier than started_at",
      });
    }
  });

export const RecordLearningEventInputSchema = LearningEventFieldsSchema.safeExtend({
  student_id: z.string().uuid(),
});

export const RecordMyLearningEventInputSchema = LearningEventFieldsSchema;

export const RecordLearningEventOutputSchema = z.object({
  success: z.literal(true),
  event_id: z.string().uuid(),
  recorded_at: z.string(),
  duplicate: z.boolean(),
  state_update: LearnerStateUpdateSchema,
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type LearnerStateStatus = z.infer<typeof LearnerStateStatusSchema>;
export type LearnerStateType = z.infer<typeof LearnerStateTypeSchema>;
export type LearnerStateEstimate = z.infer<typeof LearnerStateEstimateSchema>;
export type LearnerStateUpdate = z.infer<typeof LearnerStateUpdateSchema>;
export type Student = z.infer<typeof StudentSchema>;
export type LearnerProfile = z.infer<typeof LearnerProfileSchema>;
export type DomainState = z.infer<typeof DomainStateSchema>;
export type SkillState = z.infer<typeof SkillStateSchema>;
export type RecentLearningEvent = z.infer<typeof RecentLearningEventSchema>;
export type TeachingContext = z.infer<typeof TeachingContextSchema>;
export type InteractionPolicy = z.infer<typeof InteractionPolicySchema>;
export type DisplayPolicy = z.infer<typeof DisplayPolicySchema>;
export type LearnerProfileMetadata = z.infer<typeof LearnerProfileMetadataSchema>;
export type FirstTurnContract = z.infer<typeof FirstTurnContractSchema>;
export type StateSignal = z.infer<typeof StateSignalSchema>;
export type EvidenceWriteback = z.infer<typeof EvidenceWritebackSchema>;
export type GetLearnerContextInput = z.input<typeof GetLearnerContextInputSchema>;
export type GetLearnerContextOutput = z.infer<typeof GetLearnerContextOutputSchema>;
export type GetMyLearnerContextInput = z.input<typeof GetMyLearnerContextInputSchema>;
export type GetMyLearnerContextOutput = z.infer<typeof GetMyLearnerContextOutputSchema>;
export type RecordLearningEventInput = z.infer<typeof RecordLearningEventInputSchema>;
export type RecordLearningEventRawInput = z.input<typeof RecordLearningEventInputSchema>;
export type RecordMyLearningEventRawInput = z.input<
  typeof RecordMyLearningEventInputSchema
>;
export type RecordLearningEventOutput = z.infer<typeof RecordLearningEventOutputSchema>;

export interface LearningEvent extends RecentLearningEvent {
  student_id: string;
  domain: string;
  skill_id: string;
  skill_name?: string;
  idempotency_key?: string;
}
