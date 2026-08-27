import type {
  DomainState,
  LearnerProfile,
  SkillState,
  TeachingContext,
} from "../domain/contracts.js";

interface TeachingContextInput {
  learnerProfile: LearnerProfile | null;
  domainState: DomainState | null;
  skillState: SkillState | null;
  skillStates: SkillState[];
}

export function buildTeachingContext(input: TeachingContextInput): TeachingContext {
  const recommendations: string[] = [];
  const summaryParts: string[] = [];
  const profile = input.learnerProfile;
  const primarySkill = input.skillState ?? input.skillStates[0] ?? null;

  if (profile?.preferred_pace) {
    summaryParts.push(`The learner prefers a ${profile.preferred_pace} pace.`);
  }
  if (profile?.preferred_explanation_depth) {
    recommendations.push(
      `Use ${profile.preferred_explanation_depth} explanation depth.`,
    );
  }
  if (profile?.preferred_interaction_style) {
    recommendations.push(
      `Use a ${profile.preferred_interaction_style} interaction style.`,
    );
  }
  if (profile?.example_preference === "example_first") {
    recommendations.push("Start with an example before abstraction.");
  }

  if (input.domainState?.calibration) {
    summaryParts.push(
      `Calibration in ${input.domainState.domain}: ${input.domainState.calibration}.`,
    );
    recommendations.push("Include a confidence check before revealing feedback.");
  }

  if (primarySkill) {
    if (primarySkill.retrievability !== null) {
      summaryParts.push(
        `${primarySkill.skill_name} retrievability is ${primarySkill.retrievability.toFixed(2)}.`,
      );
    }
    if (primarySkill.retrievability !== null && primarySkill.retrievability < 0.5) {
      recommendations.push(
        "Avoid repeating the full explanation; begin with retrieval practice.",
      );
    }
    if (primarySkill.help_need !== null && primarySkill.help_need > 0.6) {
      recommendations.push("Offer a small hint before a complete solution.");
    }
    if (primarySkill.transferability !== null && primarySkill.transferability < 0.4) {
      recommendations.push("Use a novel application after the basic check.");
    }
  }

  return {
    summary:
      summaryParts.join(" ") ||
      "No learner-specific teaching context is available yet.",
    recommendations,
    policy_version: "mvp-rule-based-v1",
  };
}
