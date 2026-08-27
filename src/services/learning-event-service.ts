import {
  RecordLearningEventInputSchema,
  RecordLearningEventOutputSchema,
  type RecordLearningEventOutput,
  type RecordLearningEventRawInput,
} from "../domain/contracts.js";
import type { StudyMetaRepository } from "../repositories/study-meta-repository.js";
import type { LearnerStateUpdater } from "./learner-state-updater.js";

export class LearningEventService {
  constructor(
    private readonly repository: StudyMetaRepository,
    private readonly learnerStateUpdater: LearnerStateUpdater,
  ) {}

  async record(rawInput: RecordLearningEventRawInput): Promise<RecordLearningEventOutput> {
    const input = RecordLearningEventInputSchema.parse(rawInput);
    const event = await this.repository.insertLearningEvent(input);

    await this.learnerStateUpdater.process(event);

    return RecordLearningEventOutputSchema.parse({
      success: true,
      event_id: event.id,
      recorded_at: event.created_at,
    });
  }
}
