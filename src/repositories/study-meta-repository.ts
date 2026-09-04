import type {
  DomainState,
  LearnerProfile,
  LearnerStateEstimate,
  LearningEvent,
  RecordLearningEventInput,
  RecentLearningEvent,
  SkillState,
  Student,
} from "../domain/contracts.js";

export interface StudyMetaRepository {
  getCurrentStudentId(): Promise<string | null>;
  getMostRelevantDomain(
    studentId: string,
    skillId?: string,
  ): Promise<string | null>;
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
  listLearnerStateEstimates(
    studentId: string,
    domain: string,
    skillId: string,
  ): Promise<LearnerStateEstimate[]>;
  findLearningEventByIdempotencyKey(
    studentId: string,
    idempotencyKey: string,
  ): Promise<LearningEvent | null>;
  insertLearningEvent(input: RecordLearningEventInput): Promise<LearningEvent>;
  saveLearnerStateEstimate(
    studentId: string,
    skillName: string,
    estimate: LearnerStateEstimate,
  ): Promise<void>;
}
