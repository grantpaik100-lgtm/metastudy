import {
  GetLearnerContextInputSchema,
  GetLearnerContextOutputSchema,
  GetMyLearnerContextInputSchema,
  GetMyLearnerContextOutputSchema,
  type GetLearnerContextInput,
  type GetLearnerContextOutput,
  type GetMyLearnerContextInput,
  type GetMyLearnerContextOutput,
  type SkillState,
} from "../domain/contracts.js";
import { NotFoundError } from "../domain/errors.js";
import type { StudyMetaRepository } from "../repositories/study-meta-repository.js";
import {
  SYNTHETIC_LEARNER_PROFILE,
  buildSyntheticSkillState,
} from "./synthetic-learner.js";
import {
  CHAIN_RULE_IR_FIRST_TURN,
  DEFAULT_DEMO_STUDENT_ID,
  isChainRuleIrDemo,
} from "./demo-scenarios.js";
import { buildTeachingPlan } from "./teaching-context.js";

export class LearnerStateService {
  constructor(
    private readonly repository: StudyMetaRepository,
    private readonly defaults: {
      demoMode: boolean;
      learnerProfileType: "stored" | "synthetic" | "synthetic_demo";
      demoStudentId?: string;
      stateUpdateAutomated?: boolean;
    } = {
      demoMode: false,
      learnerProfileType: "stored",
      demoStudentId: DEFAULT_DEMO_STUDENT_ID,
      stateUpdateAutomated: true,
    },
  ) {}

  async getMyContext(
    rawInput: GetMyLearnerContextInput,
  ): Promise<GetMyLearnerContextOutput> {
    const input = GetMyLearnerContextInputSchema.parse(rawInput);
    const demoMode = input.demo_mode ?? this.defaults.demoMode;
    const learnerProfileType =
      input.learner_profile_type ?? this.defaults.learnerProfileType;
    const demoStudentId =
      this.defaults.demoStudentId ?? DEFAULT_DEMO_STUDENT_ID;

    // The deterministic Synthetic Demo is deliberately account-independent:
    // it is a local, read-only fixture rather than a learner record.  Real
    // learner reads still require an authenticated account-to-learner link.
    if (
      isChainRuleIrDemo({
        demoMode,
        studentId: demoStudentId,
        demoStudentId,
        domain: input.domain ?? "",
        ...(input.skill_id ? { skillId: input.skill_id } : {}),
        requestedProfileType: learnerProfileType,
      })
    ) {
      const context = await this.getContext({
        student_id: demoStudentId,
        domain: input.domain!,
        skill_id: input.skill_id,
        demo_mode: demoMode,
        learner_profile_type: learnerProfileType,
        include_experimental_states: input.include_experimental_states,
      });
      return GetMyLearnerContextOutputSchema.parse({
        ...context,
        resolved_domain: input.domain!,
      });
    }

    const studentId = await this.repository.getCurrentStudentId();
    if (!studentId) {
      throw new NotFoundError(
        "No learner is linked to the authenticated StudyMeta account",
      );
    }

    const resolvedDomain =
      input.domain ??
      (await this.repository.getMostRelevantDomain(studentId, input.skill_id));

    if (!resolvedDomain) {
      const student = await this.repository.getStudent(studentId);
      if (!student) {
        throw new NotFoundError(`Student not found: ${studentId}`);
      }
      const storedLearnerProfile = await this.repository.getLearnerProfile(studentId);
      const learnerProfile = storedLearnerProfile;
      const teachingPlan = buildTeachingPlan({
        learnerProfile,
        domainState: null,
        skillState: null,
        skillStates: [],
        demoMode,
        profileType: "stored",
        firstTurnContract: null,
        stateUpdateAutomated: this.defaults.stateUpdateAutomated ?? true,
        includeExperimentalStates: false,
      });
      return GetMyLearnerContextOutputSchema.parse({
        student_id: studentId,
        student,
        resolved_domain: null,
        learner_profile: learnerProfile,
        domain_state: null,
        skill_state: null,
        skill_states: [],
        recent_evidence: [],
        profile_type: "stored",
        learner_state: null,
        pedagogical_policy: teachingPlan.interaction_policy,
        demo_scenario: null,
        first_turn_contract: null,
        state_estimates: [],
        experimental_states_included: false,
        ...teachingPlan,
      });
    }

    const context = await this.getContext({
      student_id: studentId,
      domain: resolvedDomain,
      ...(input.skill_id ? { skill_id: input.skill_id } : {}),
      demo_mode: demoMode,
      learner_profile_type: learnerProfileType,
      include_experimental_states: input.include_experimental_states,
    });
    return GetMyLearnerContextOutputSchema.parse({
      ...context,
      resolved_domain: resolvedDomain,
    });
  }

  async getContext(rawInput: GetLearnerContextInput): Promise<GetLearnerContextOutput> {
    const input = GetLearnerContextInputSchema.parse(rawInput);
    const demoMode = input.demo_mode ?? this.defaults.demoMode;
    const learnerProfileType =
      input.learner_profile_type ?? this.defaults.learnerProfileType;
    const syntheticDemo = isChainRuleIrDemo({
      demoMode,
      studentId: input.student_id,
      demoStudentId: this.defaults.demoStudentId ?? DEFAULT_DEMO_STUDENT_ID,
      domain: input.domain,
      ...(input.skill_id ? { skillId: input.skill_id } : {}),
      requestedProfileType: learnerProfileType,
    });
    const effectiveProfileType = syntheticDemo ? "synthetic_demo" : "stored";
    const includeExperimentalStates =
      input.include_experimental_states ?? syntheticDemo;
    const firstTurnContract = syntheticDemo ? CHAIN_RULE_IR_FIRST_TURN : null;

    if (syntheticDemo) {
      const student = {
        id: input.student_id,
        display_name: "Synthetic Demo Learner",
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
      };
      const skillState = buildSyntheticSkillState(
        input.domain,
        input.skill_id!,
        null,
      );
      const teachingPlan = buildTeachingPlan({
        learnerProfile: SYNTHETIC_LEARNER_PROFILE,
        domainState: null,
        skillState,
        skillStates: [],
        demoMode,
        profileType: "synthetic_demo",
        firstTurnContract,
        stateUpdateAutomated: this.defaults.stateUpdateAutomated ?? true,
        includeExperimentalStates,
      });
      return GetLearnerContextOutputSchema.parse({
        student_id: input.student_id,
        student,
        learner_profile: SYNTHETIC_LEARNER_PROFILE,
        domain_state: null,
        skill_state: skillState,
        skill_states: [],
        recent_evidence: [],
        profile_type: "synthetic_demo",
        learner_state: skillState,
        pedagogical_policy: teachingPlan.interaction_policy,
        demo_scenario: firstTurnContract?.scenario ?? null,
        first_turn_contract: firstTurnContract,
        state_estimates: [],
        experimental_states_included: includeExperimentalStates,
        ...teachingPlan,
      });
    }

    const student = await this.repository.getStudent(input.student_id);

    if (!student) {
      throw new NotFoundError(`Student not found: ${input.student_id}`);
    }

    const [storedLearnerProfile, domainState, recentEvidence] = await Promise.all([
      this.repository.getLearnerProfile(input.student_id),
      this.repository.getDomainState(input.student_id, input.domain),
      this.repository.listRecentEvents(
        input.student_id,
        input.domain,
        input.skill_id,
        10,
      ),
    ]);

    const storedSkillState = input.skill_id
      ? await this.repository.getSkillState(
          input.student_id,
          input.domain,
          input.skill_id,
        )
      : null;
    const storedSkillStates = input.skill_id
      ? []
      : await this.repository.listSkillStates(input.student_id, input.domain, 10);
    const storedStateEstimates = input.skill_id
      ? await this.repository.listLearnerStateEstimates(
          input.student_id,
          input.domain,
          input.skill_id,
        )
      : (
          await Promise.all(
            storedSkillStates.map((state) =>
              this.repository.listLearnerStateEstimates(
                input.student_id,
                input.domain,
                state.skill_id,
              ),
            ),
          )
        ).flat();

    const learnerProfile =
      syntheticDemo
        ? SYNTHETIC_LEARNER_PROFILE
        : storedLearnerProfile;
    const unfilteredSkillState =
      syntheticDemo && input.skill_id
        ? buildSyntheticSkillState(input.domain, input.skill_id, storedSkillState)
        : storedSkillState;
    const skillState = filterStateForExposure(
      unfilteredSkillState,
      includeExperimentalStates,
      syntheticDemo,
      storedStateEstimates,
    );
    const skillStates = storedSkillStates.map((state) =>
      filterStateForExposure(
        state,
        includeExperimentalStates,
        false,
        storedStateEstimates.filter((estimate) => estimate.skill_id === state.skill_id),
      )!,
    );
    const stateEstimates = storedStateEstimates.filter(
      (estimate) =>
        includeExperimentalStates || estimate.status !== "experimental",
    );
    const teachingPlan = buildTeachingPlan({
      learnerProfile,
      domainState,
      skillState,
      skillStates,
      demoMode,
      profileType: effectiveProfileType,
      firstTurnContract,
      stateUpdateAutomated: this.defaults.stateUpdateAutomated ?? true,
      includeExperimentalStates,
    });

    return GetLearnerContextOutputSchema.parse({
      student_id: input.student_id,
      student,
      learner_profile: learnerProfile,
      domain_state: domainState,
      skill_state: skillState,
      skill_states: skillStates,
      recent_evidence: recentEvidence,
      profile_type: effectiveProfileType,
      learner_state: skillState,
      pedagogical_policy: teachingPlan.interaction_policy,
      demo_scenario: firstTurnContract?.scenario ?? null,
      first_turn_contract: firstTurnContract,
      state_estimates: stateEstimates,
      experimental_states_included: includeExperimentalStates,
      ...teachingPlan,
    });
  }
}

function filterStateForExposure(
  state: SkillState | null,
  includeExperimentalStates: boolean,
  syntheticDemo: boolean,
  estimates: Array<{ state_type: string; status: string }>,
): SkillState | null {
  if (!state) return state;
  const verifiedTypes = new Set(
    estimates
      .filter((estimate) => estimate.status === "verified")
      .map((estimate) => estimate.state_type),
  );
  return {
    ...state,
    conceptual_mastery:
      includeExperimentalStates || syntheticDemo
        ? state.conceptual_mastery
        : null,
    procedural_mastery:
      syntheticDemo || verifiedTypes.has("procedural_mastery")
        ? state.procedural_mastery
        : null,
    retrievability:
      includeExperimentalStates || syntheticDemo ? state.retrievability : null,
    transferability:
      includeExperimentalStates || syntheticDemo ? state.transferability : null,
    help_need:
      syntheticDemo || verifiedTypes.has("help_need") ? state.help_need : null,
    misconceptions:
      includeExperimentalStates || syntheticDemo ? state.misconceptions : [],
  };
}
