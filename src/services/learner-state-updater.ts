import type { LearningEvent } from "../domain/contracts.js";

export interface LearnerStateUpdater {
  process(event: LearningEvent): Promise<void>;
}

export class NoOpLearnerStateUpdater implements LearnerStateUpdater {
  async process(_event: LearningEvent): Promise<void> {
    // Deliberately empty. The Student Model team can inject its engine here.
  }
}
