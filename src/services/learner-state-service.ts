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
import { buildTeachingContext } from "./teaching-context.js";

export class LearnerStateService {
  constructor(private readonly repository: StudyMetaRepository) {}

  async getMyContext(
    rawInput: GetMyLearnerContextInput,
  ): Promise<GetMyLearnerContextOutput> {
    const input = GetMyLearnerContextInputSchema.parse(rawInput);
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
      const learnerProfile = await this.repository.getLearnerProfile(studentId);
      return GetMyLearnerContextOutputSchema.parse({
        student_id: studentId,
        student,
        resolved_domain: null,
        learner_profile: learnerProfile,
        domain_state: null,
        skill_state: null,
        skill_states: [],
        recent_evidence: [],
        teaching_context: buildTeachingContext({
          learnerProfile,
          domainState: null,
          skillState: null,
          skillStates: [],
        }),
      });
    }

    const context = await this.getContext({
      student_id: studentId,
      domain: resolvedDomain,
      ...(input.skill_id ? { skill_id: input.skill_id } : {}),
    });
    return GetMyLearnerContextOutputSchema.parse({
      ...context,
      resolved_domain: resolvedDomain,
    });
  }

  async getContext(rawInput: GetLearnerContextInput): Promise<GetLearnerContextOutput> {
    const input = GetLearnerContextInputSchema.parse(rawInput);
    const student = await this.repository.getStudent(input.student_id);

    if (!student) {
      throw new NotFoundError(`Student not found: ${input.student_id}`);
    }

    const [learnerProfile, domainState, recentEvidence] = await Promise.all([
      this.repository.getLearnerProfile(input.student_id),
      this.repository.getDomainState(input.student_id, input.domain),
      this.repository.listRecentEvents(
        input.student_id,
        input.domain,
        input.skill_id,
        10,
      ),
    ]);

    const skillState = input.skill_id
      ? await this.repository.getSkillState(
          input.student_id,
          input.domain,
          input.skill_id,
        )
      : null;
    const skillStates = input.skill_id
      ? []
      : await this.repository.listSkillStates(input.student_id, input.domain, 10);

    return GetLearnerContextOutputSchema.parse({
      student_id: input.student_id,
      student,
      learner_profile: learnerProfile,
      domain_state: domainState,
      skill_state: skillState,
      skill_states: skillStates,
      recent_evidence: recentEvidence,
      teaching_context: buildTeachingContext({
        learnerProfile,
        domainState,
        skillState,
        skillStates,
      }),
    });
  }
}
