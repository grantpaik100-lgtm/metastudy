import type {
  DomainState,
  LearnerProfile,
  LearningEvent,
  RecordLearningEventInput,
  RecentLearningEvent,
  SkillState,
  Student,
} from "../domain/contracts.js";

export interface StudyMetaRepository {
  getStudent(studentId: string): Promise<Student | null>;
  getLearnerProfile(studentId: string): Promise<LearnerProfile | null>;
  getDomainState(studentId: string, domain: string): Promise<DomainState | null>;
  getSkillState(
    studentId: string,
    domain: string,
    skillId: string,
  ): Promise<SkillState | null>;
  listSkillStates(
    studentId: string,
    domain: string,
    limit: number,
  ): Promise<SkillState[]>;
  listRecentEvents(
    studentId: string,
    domain: string,
    skillId: string | undefined,
    limit: number,
  ): Promise<RecentLearningEvent[]>;
  insertLearningEvent(input: RecordLearningEventInput): Promise<LearningEvent>;
}
