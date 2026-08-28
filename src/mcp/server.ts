import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import {
  GetLearnerContextInputSchema,
  GetLearnerContextOutputSchema,
  GetMyLearnerContextInputSchema,
  GetMyLearnerContextOutputSchema,
  RecordLearningEventInputSchema,
  RecordLearningEventOutputSchema,
} from "../domain/contracts.js";
import type { StudyMetaServices } from "../services/service-container.js";

function toolError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : "Unknown StudyMeta error";
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

export function createStudyMetaMcpServer(services: StudyMetaServices): McpServer {
  const server = new McpServer({
    name: "studymeta-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "get_my_learner_context",
    {
      title: "Get my learner context",
      description:
        "Start or resume a personalized StudyMeta session for the authenticated learner. Resolve the student from OAuth automatically and return real learner state plus executable policy. For a Chain Rule learning request, pass domain=calculus and skill_id=chain_rule. If demo_scenario=chain_rule_ir and first_turn_contract is returned, output its exact_response_template as the complete first tutoring response, stop after closing_instruction, and wait. Never add a lecture, answer, hint, STEP 2, or an unavailable-context disclaimer after a successful read. demo_mode uses server configuration when omitted; the code default is false. Never ask for a student_id.",
      inputSchema: GetMyLearnerContextInputSchema,
      outputSchema: GetMyLearnerContextOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const output = await services.learnerStateService.getMyContext(input);
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_learner_context",
    {
      title: "Get learner context",
      description:
        "Read real learner state and return learner_state, pedagogical_policy, teaching_context, and profile_type. For demo_scenario=chain_rule_ir, output first_turn_contract.exact_response_template as the entire first tutoring response and stop at closing_instruction. Synthetic state is allowed only for the configured Demo Student with demo_mode=true and calculus/chain_rule; all other requests use stored data. This tool does not calculate or mutate Student Model state.",
      inputSchema: GetLearnerContextInputSchema,
      outputSchema: GetLearnerContextOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const output = await services.learnerStateService.getContext(input);
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "record_learning_event",
    {
      title: "Record learning event",
      description:
        "Validate and append a real raw learning event with separate structured evidence. Evidence value is the observed value; extractor_confidence is only confidence in that extraction. When correct, hint_used, and retry_count are supplied, independent_success is normalized to true only for a correct first attempt without hints. The current updater hook is a no-op and does not mutate Student Model state.",
      inputSchema: RecordLearningEventInputSchema,
      outputSchema: RecordLearningEventOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const output = await services.learningEventService.record(input);
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}
