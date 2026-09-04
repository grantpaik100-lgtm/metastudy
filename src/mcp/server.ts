import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import {
  GetLearnerContextInputSchema,
  GetLearnerContextOutputSchema,
  GetMyLearnerContextInputSchema,
  GetMyLearnerContextOutputSchema,
  RecordMyLearningEventInputSchema,
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
        "Read real learner state and return learner_state, versioned state_estimates, pedagogical_policy, teaching_context, and profile_type. Verified MVP states are returned by default; experimental fields require include_experimental_states=true, except the explicitly labeled synthetic IR demo. For demo_scenario=chain_rule_ir, output first_turn_contract.exact_response_template as the entire first tutoring response and stop at closing_instruction. This read does not mutate Learner State.",
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
    "record_my_learning_event",
    {
      title: "Record my learning event",
      description:
        "Record an append-only raw learning event for the authenticated learner without asking for a student ID. Keep raw_event separate from structured Evidence, include source and extraction provenance, and provide an idempotency_key for safe retries. The server derives independent_success when possible, preserves low-confidence observations, and updates only verified MVP states (Procedural Mastery and Help Need) when evidence gates are met. Always report the returned state_update status; withheld or insufficient evidence is not a decline.",
      inputSchema: RecordMyLearningEventInputSchema,
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
        const output = await services.learningEventService.recordMy(input);
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
        "Legacy scoped write for a known learner ID. Prefer record_my_learning_event for authenticated tutoring. Validate and append a raw event with separate structured Evidence, derive independent_success when possible, and run the same confidence-gated MVP State updater. Low-confidence camera Evidence is preserved but withheld from State updates.",
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
