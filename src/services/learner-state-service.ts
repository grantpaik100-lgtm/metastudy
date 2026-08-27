import {
  GetLearnerContextInputSchema,
  GetLearnerContextOutputSchema,
  type GetLearnerContextInput,
  type GetLearnerContextOutput,
} from "../domain/contracts.js";
import { NotFoundError } from "../domain/errors.js";
import type { StudyMetaRepository } from "../repositories/study-meta-repository.js";
import { buildTeachingContext } from "./teaching-context.js";

export class LearnerStateService {
  constructor(private readonly repository: StudyMetaRepository) {}

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
