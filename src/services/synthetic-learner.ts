import type { LearnerProfile, SkillState } from "../domain/contracts.js";

export const SYNTHETIC_LEARNER_PROFILE: LearnerProfile = {
  preferred_explanation_depth: "concise",
  preferred_pace: "step_by_step",
  preferred_interaction_style: "socratic",
  example_preference: "example_first",
  hint_preference: "adaptive",
  direct_answer_preference: "avoid",
  general_learning_goal: "Build independent problem-solving ability",
  preferred_language: "ko",
};

function humanizeSkillId(skillId: string): string {
  return skillId
    .split(/[_-]/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function buildSyntheticSkillState(
  domain: string,
  skillId: string,
  storedState: SkillState | null,
): SkillState {
  return {
    domain,
    skill_id: skillId,
    skill_name: storedState?.skill_name ?? humanizeSkillId(skillId),
    conceptual_mastery: 0.85,
    procedural_mastery: 0.35,
    retrievability: 0.3,
    transferability: 0.2,
    help_need: 0.75,
    misconceptions: [],
    state_confidence: 0.8,
    updated_at: new Date(0).toISOString(),
  };
}
