import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createStudyMetaMcpDemoServer } from "./demo-server.js";

const options = {
  legacy: "stateless" as const,
  responseMode: "auto" as const,
  onerror: (error: Error) => console.error("StudyMeta demo MCP request failed", error),
};

export const studyMetaMcpDemoHttpHandler = createMcpHandler(
  createStudyMetaMcpDemoServer,
  options,
);

export const studyMetaMcpDemoNodeHandler = toNodeHandler(studyMetaMcpDemoHttpHandler, {
  onerror: (error) => console.error("StudyMeta demo MCP Node adapter failed", error),
});
