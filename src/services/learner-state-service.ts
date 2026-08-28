import {
  GetLearnerContextInputSchema,
  GetLearnerContextOutputSchema,
  GetMyLearnerContextInputSchema,
  GetMyLearnerContextOutputSchema,
  type GetLearnerContextInput,
  type GetLearnerContextOutput,
  type GetMyLearnerContextInput,
  type GetMyLearnerContextOutput,
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
    } = {
      demoMode: false,
      learnerProfileType: "stored",
      demoStudentId: DEFAULT_DEMO_STUDENT_ID,
    },
  ) {}

  async getMyContext(
    rawInput: GetMyLearnerContextInput,
  ): Promise<GetMyLearnerContextOutput> {
    const input = GetMyLearnerContextInputSchema.parse(rawInput);
    const demoMode = input.demo_mode ?? this.defaults.demoMode;
    const learnerProfileType =
      input.learner_profile_type ?? this.defaults.learnerProfileType;
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
        ...teachingPlan,
      });
    }

    const context = await this.getContext({
      student_id: studentId,
      domain: resolvedDomain,
      ...(input.skill_id ? { skill_id: input.skill_id } : {}),
      demo_mode: demoMode,
      learner_profile_type: learnerProfileType,
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
    const firstTurnContract = syntheticDemo ? CHAIN_RULE_IR_FIRST_TURN : null;
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

    const learnerProfile =
      syntheticDemo
        ? SYNTHETIC_LEARNER_PROFILE
        : storedLearnerProfile;
    const skillState =
      syntheticDemo && input.skill_id
        ? buildSyntheticSkillState(input.domain, input.skill_id, storedSkillState)
        : storedSkillState;
    const skillStates =
      storedSkillStates;
    const teachingPlan = buildTeachingPlan({
      learnerProfile,
      domainState,
      skillState,
      skillStates,
      demoMode,
      profileType: effectiveProfileType,
      firstTurnContract,
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
      ...teachingPlan,
    });
  }
}
