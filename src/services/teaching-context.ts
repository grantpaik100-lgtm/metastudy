import type {
  DisplayPolicy,
  DomainState,
  EvidenceWriteback,
  FirstTurnContract,
  InteractionPolicy,
  LearnerProfile,
  LearnerProfileMetadata,
  SkillState,
  StateSignal,
  TeachingContext,
} from "../domain/contracts.js";

interface TeachingContextInput {
  learnerProfile: LearnerProfile | null;
  domainState: DomainState | null;
  skillState: SkillState | null;
  skillStates: SkillState[];
  demoMode: boolean;
  profileType: "stored" | "synthetic_demo";
  firstTurnContract: FirstTurnContract | null;
  stateUpdateAutomated: boolean;
  includeExperimentalStates: boolean;
}

export interface TeachingPlan {
  learner_profile_metadata: LearnerProfileMetadata;
  state_signals: StateSignal[];
  teaching_context: TeachingContext;
  interaction_policy: InteractionPolicy;
  display: DisplayPolicy;
  evidence_writeback: EvidenceWriteback;
}

function level(value: number): "low" | "moderate" | "high" {
  if (value < 0.4) return "low";
  if (value > 0.6) return "high";
  return "moderate";
}

function stateSignals(
  skill: SkillState | null,
  includeExperimentalStates: boolean,
): StateSignal[] {
  if (!skill) return [];

  const signals: StateSignal[] = [];
  const add = (
    name: string,
    value: number | null,
    evidenceStatus: "validated_focus" | "experimental",
  ) => {
    if (value !== null) {
      signals.push({
        name,
        value,
        level: level(value),
        evidence_status: evidenceStatus,
      });
    }
  };

  add("procedural_mastery", skill.procedural_mastery, "validated_focus");
  add("help_need", skill.help_need, "validated_focus");
  add("state_confidence", skill.state_confidence, "validated_focus");
  if (includeExperimentalStates) {
    add("conceptual_mastery", skill.conceptual_mastery, "experimental");
    add("retrievability", skill.retrievability, "experimental");
    add("transferability", skill.transferability, "experimental");
  }
  return signals;
}

export function buildTeachingPlan(input: TeachingContextInput): TeachingPlan {
  const recommendations: string[] = [];
  const executableInstructions: string[] = [];
  const summaryParts: string[] = [];
  const profile = input.learnerProfile;
  const primarySkill = input.skillState ?? input.skillStates[0] ?? null;
  const highHelpNeed = (primarySkill?.help_need ?? 0) > 0.6;
  const lowProcedure = (primarySkill?.procedural_mastery ?? 1) < 0.5;
  const lowRetrieval = (primarySkill?.retrievability ?? 1) < 0.5;
  const lowTransfer = (primarySkill?.transferability ?? 1) < 0.4;

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
    recommendations.push(
      "Prefer concrete practice over abstract exposition; retrieval and scaffold rules take priority over immediately showing a worked answer.",
    );
  }

  if (input.domainState?.calibration) {
    summaryParts.push(
      `Calibration in ${input.domainState.domain}: ${input.domainState.calibration}.`,
    );
    recommendations.push("Include a confidence check before revealing feedback.");
  }

  if (primarySkill) {
    summaryParts.push(`Current focus: ${primarySkill.skill_name}.`);
    if (primarySkill.conceptual_mastery !== null && primarySkill.conceptual_mastery > 0.7) {
      summaryParts.push("Conceptual familiarity is relatively strong.");
      recommendations.push(
        "Do not reteach the full concept definition unless the learner asks or repeated errors reveal a conceptual gap.",
      );
    }
    if (lowProcedure) {
      summaryParts.push("Procedural independence is low.");
      recommendations.push(
        "Have the learner execute one key procedure at a time instead of giving a long explanation or complete solution.",
      );
    }
    if (lowRetrieval) {
      recommendations.push(
        "Experimental retrievability signal: ask the learner to retrieve the next concept or procedure before explaining it.",
      );
    }
    if (highHelpNeed) {
      summaryParts.push("Help need is high.");
      recommendations.push(
        "Do not provide the complete answer initially; begin with 2–4 choices when useful and proceed one step at a time.",
      );
    }
    if (lowTransfer) {
      recommendations.push(
        "Experimental transfer signal: after basic independent success, use a problem with a meaningfully different surface form.",
      );
    }
  }

  const initialScaffold =
    highHelpNeed || lowProcedure
      ? "multiple_choice"
      : lowRetrieval
        ? "guided_short_answer"
        : "independent_solution";
  const choiceCount = initialScaffold === "multiple_choice" ? 3 : 0;

  executableInstructions.push(
    "Apply these instructions in the answer itself; do not merely describe the policy.",
    `Start with a ${initialScaffold.replaceAll("_", " ")} activity tied to the requested skill.`,
    "Present only the current learning step, ask one actionable question, then stop and wait for the learner's response.",
    "Never include the current question, its hints, its answer, and the next problem in the same response.",
    "On success, reduce scaffolding by one level. On failure, preserve the learning goal and increase scaffolding by one level without immediately revealing the answer.",
    "Infer success or failure from the learner's latest response; use the success_path or failure_path for the next turn.",
    input.stateUpdateAutomated
      ? "Never alter Learner State yourself. Record observed Evidence through record_my_learning_event; the server applies only its versioned, confidence-gated baseline updater and reports whether the update was verified, insufficient, or withheld."
      : "Do not invent learner-state updates. Evidence may be written separately, but the current state updater is not automated.",
  );
  if (input.firstTurnContract) {
    executableInstructions.unshift(
      "DETERMINISTIC IR FIRST-TURN CONTRACT: This contract overrides ordinary opening behavior for the first tutoring response only.",
      "Return the exact_response_template from first_turn_contract verbatim in structure and content. Do not add a greeting, lecture, formula, answer, hint, STEP 2, disclaimer, or any text after closing_instruction.",
      "The learner state was successfully returned by StudyMeta MCP. Never say that StudyMeta is unavailable or that live learner state could not be loaded.",
      "Stop immediately after ‘→ ㄱ / ㄴ / ㄷ 중 하나를 입력해주세요.’ and wait for the learner response.",
    );
  }
  if (input.demoMode) {
    executableInstructions.push(
      "Because demo_mode is enabled, visibly show the StudyMeta context banner, the most relevant state signals, the selected strategy, and step labels before starting the interaction.",
      input.profileType === "synthetic_demo"
        ? "Clearly label the context as Demo Learner / Synthetic Profile / Illustrative State; never imply that it is real user data or validated outcome data."
        : "The profile is stored learner data, not a synthetic fixture; do not label it synthetic.",
    );
  } else {
    executableInstructions.push(
      "Keep StudyMeta behind the experience: do not mention StudyMeta, state values, policy selection, or demo labels to the learner.",
    );
  }

  return {
    learner_profile_metadata: {
      profile_type: input.profileType,
      label:
        input.profileType === "synthetic_demo"
          ? "Synthetic Demo Learner · Illustrative State"
          : "Stored Learner Profile",
      is_real_user_data: input.profileType === "stored",
    },
    state_signals: stateSignals(primarySkill, input.includeExperimentalStates),
    teaching_context: {
      summary:
        summaryParts.join(" ") ||
        "No learner-specific teaching context is available yet.",
      recommendations,
      executable_instructions: executableInstructions,
      policy_version: "adaptive-rule-based-v2",
    },
    interaction_policy: {
      interaction_mode: highHelpNeed || lowProcedure ? "guided" : "independent",
      initial_scaffolding: highHelpNeed
        ? "high"
        : lowProcedure || lowRetrieval
          ? "medium"
          : "low",
      response_granularity: "one_step_at_a_time",
      initial_prompt_type: initialScaffold,
      success_action: "reduce_scaffolding",
      failure_action: "increase_scaffolding",
      wait_for_student_response: true,
      retrieval_before_explanation: lowRetrieval,
      transfer_problem_after_success: lowTransfer,
      teaching_approach: ["step_by_step", "socratic", "adaptive_scaffolding"],
      initial_scaffold: initialScaffold,
      choice_count: choiceCount,
      direct_answer: highHelpNeed || profile?.direct_answer_preference === "avoid"
        ? "avoid_initially"
        : "allow",
      wait_for_learner_response: true,
      success_path: [
        "multiple_choice",
        "guided_short_answer",
        "independent_solution",
        "novel_form_transfer_probe",
      ],
      failure_path: [
        "retry_without_answer",
        "small_hint",
        "stronger_hint_or_choices",
        "worked_example_then_new_attempt",
      ],
      independent_success_action:
        "Do not repeat an equally guided problem; move to a more independent application.",
      transfer_probe: {
        enabled: lowTransfer,
        signal_status: lowTransfer ? "experimental" : "not_applicable",
        instruction: lowTransfer
          ? "After basic independent success, ask a novel-form problem rather than changing only numbers."
          : "Use a transfer probe when pedagogically appropriate.",
      },
      retrievability_probe: {
        enabled: lowRetrieval,
        signal_status: lowRetrieval ? "experimental" : "not_applicable",
        instruction: lowRetrieval
          ? "Ask for recall before explanation."
          : "No extra retrieval-first adaptation is required by the current signal.",
      },
    },
    display: {
      demo_mode: input.demoMode,
      show_studymeta_banner: input.demoMode,
      show_state_summary: input.demoMode,
      show_policy_summary: input.demoMode,
      show_step_labels: input.demoMode,
    },
    evidence_writeback: {
      tool: "record_my_learning_event",
      event_type: "problem_attempt",
      evidence_fields: [
        "correct",
        "hint_used",
        "independent_success",
        "retry_count",
      ],
      state_update_automated: input.stateUpdateAutomated,
      update_policy: input.stateUpdateAutomated
        ? "Only Procedural Mastery and Help Need can be updated. Low-confidence camera Evidence, unsupported signals, and insufficient histories are preserved but withheld."
        : "Evidence is append-only and Learner State is unchanged.",
      instruction:
        input.stateUpdateAutomated
          ? "After a completed interaction, write observed outcomes through record_my_learning_event with an idempotency_key. Report the returned state_update status without overstating certainty."
          : "When the learner asks to record the completed interaction, write observed outcomes through record_my_learning_event. Do not claim that Learner State was automatically updated.",
    },
  };
}

export function buildTeachingContext(input: TeachingContextInput): TeachingContext {
  return buildTeachingPlan(input).teaching_context;
}
