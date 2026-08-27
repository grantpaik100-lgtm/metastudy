import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { getDefaultServices } from "../services/default-services.js";
import type { StudyMetaServices } from "../services/service-container.js";
import { createStudyMetaMcpServer } from "./server.js";

function handlerOptions() {
  return {
    legacy: "stateless" as const,
    responseMode: "auto" as const,
    onerror: (error: Error) => console.error("MCP request failed", error),
  };
}

export function createStudyMetaMcpHttpHandlers(services: StudyMetaServices) {
  const httpHandler = createMcpHandler(
    () => createStudyMetaMcpServer(services),
    handlerOptions(),
  );
  const nodeHandler = toNodeHandler(httpHandler, {
    onerror: (error) => console.error("MCP Node adapter failed", error),
  });

  return { httpHandler, nodeHandler };
}

export const studyMetaMcpHttpHandler = createMcpHandler(
  () => createStudyMetaMcpServer(getDefaultServices()),
  handlerOptions(),
);

export const studyMetaMcpNodeHandler = toNodeHandler(studyMetaMcpHttpHandler, {
  onerror: (error) => console.error("MCP Node adapter failed", error),
});
