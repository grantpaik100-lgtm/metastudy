import type { StudyMetaRepository } from "../repositories/study-meta-repository.js";
import { LearnerStateService } from "./learner-state-service.js";
import { LearningEventService } from "./learning-event-service.js";
import {
  NoOpLearnerStateUpdater,
  type LearnerStateUpdater,
} from "./learner-state-updater.js";

export interface StudyMetaServices {
  learnerStateService: LearnerStateService;
  learningEventService: LearningEventService;
}

export function createStudyMetaServices(
  repository: StudyMetaRepository,
  updater: LearnerStateUpdater = new NoOpLearnerStateUpdater(),
  contextDefaults: {
    demoMode: boolean;
    learnerProfileType: "stored" | "synthetic" | "synthetic_demo";
    demoStudentId?: string;
  } = {
    demoMode: false,
    learnerProfileType: "stored",
    demoStudentId: "00000000-0000-4000-8000-000000000001",
  },
): StudyMetaServices {
  return {
    learnerStateService: new LearnerStateService(repository, contextDefaults),
    learningEventService: new LearningEventService(repository, updater),
  };
}
