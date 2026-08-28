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
        "Start or resume a personalized StudyMeta session for the authenticated learner. Resolve the student from OAuth automatically, choose the most recent domain when omitted, and return executable teaching and interaction policy derived from learner state. Apply executable_instructions in the answer itself, present only one learning step, and wait for the learner response. demo_mode only changes visible presentation; when omitted it uses server configuration, whose code default is false. Never ask the user for a student_id.",
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
        "Read learner state and return an executable adaptive teaching plan. Apply the teaching context in the answer itself rather than explaining it: one step at a time, wait for the learner response, reduce scaffolding after success, and increase it after failure. demo_mode only changes visible presentation; omitted options use server configuration with production/stored code defaults. learner_profile_type=synthetic is explicitly illustrative. This tool does not calculate or mutate Student Model state.",
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
        "Validate and append a raw learning event with separate structured evidence. The current updater hook is a no-op and does not mutate Student Model state.",
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
