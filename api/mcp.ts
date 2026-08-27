import type { IncomingMessage, ServerResponse } from "node:http";
import { studyMetaMcpNodeHandler } from "../src/mcp/http-handler.js";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await studyMetaMcpNodeHandler(
    request as Parameters<typeof studyMetaMcpNodeHandler>[0],
    response,
  );
}
