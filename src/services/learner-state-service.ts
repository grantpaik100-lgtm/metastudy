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
import { buildTeachingPlan } from "./teaching-context.js";

export class LearnerStateService {
  constructor(
    private readonly repository: StudyMetaRepository,
    private readonly defaults: {
      demoMode: boolean;
      learnerProfileType: "stored" | "synthetic";
    } = { demoMode: false, learnerProfileType: "stored" },
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
      const learnerProfile =
        learnerProfileType === "synthetic"
          ? SYNTHETIC_LEARNER_PROFILE
          : storedLearnerProfile;
      const teachingPlan = buildTeachingPlan({
        learnerProfile,
        domainState: null,
        skillState: null,
        skillStates: [],
        demoMode,
        profileType: learnerProfileType,
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
      learnerProfileType === "synthetic"
        ? SYNTHETIC_LEARNER_PROFILE
        : storedLearnerProfile;
    const skillState =
      learnerProfileType === "synthetic" && input.skill_id
        ? buildSyntheticSkillState(input.domain, input.skill_id, storedSkillState)
        : storedSkillState;
    const skillStates =
      learnerProfileType === "synthetic" && !input.skill_id
        ? storedSkillStates.map((state) =>
            buildSyntheticSkillState(input.domain, state.skill_id, state),
          )
        : storedSkillStates;
    const teachingPlan = buildTeachingPlan({
      learnerProfile,
      domainState,
      skillState,
      skillStates,
      demoMode,
      profileType: learnerProfileType,
    });

    return GetLearnerContextOutputSchema.parse({
      student_id: input.student_id,
      student,
      learner_profile: learnerProfile,
      domain_state: domainState,
      skill_state: skillState,
      skill_states: skillStates,
      recent_evidence: recentEvidence,
      ...teachingPlan,
    });
  }
}
