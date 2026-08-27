import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import {
  GetLearnerContextInputSchema,
  GetLearnerContextOutputSchema,
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
    "get_learner_context",
    {
      title: "Get learner context",
      description:
        "Read the learner's global profile, domain state, skill state, recent evidence, and teaching context. This tool does not calculate or mutate Student Model state.",
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
