import type { LearnerContextDisplay, SessionSummaryDisplay } from "../ui/contracts.js";
import { syntheticLearnerContext, syntheticSessionSummary } from "../ui/mock/fixtures.js";

/**
 * A deliberately explicit boundary for UI-1.  Replacing this adapter with the
 * authenticated v2 gateway is the only change a live integration should need.
 */
export interface InChatUiAdapter {
  getDisplay(): Promise<{ learner_context: LearnerContextDisplay; session_summary: SessionSummaryDisplay }>;
}

export class SyntheticUiMockAdapter implements InChatUiAdapter {
  async getDisplay(): Promise<{ learner_context: LearnerContextDisplay; session_summary: SessionSummaryDisplay }> {
    return { learner_context: structuredClone(syntheticLearnerContext), session_summary: structuredClone(syntheticSessionSummary) };
  }
}
