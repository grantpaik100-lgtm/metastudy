import type { IncomingMessage, ServerResponse } from "node:http";
import { studyMetaMcpDemoNodeHandler } from "../src/mcp/demo-http-handler.js";

/** Public deployment is intentionally out of scope for this local-only spike. */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await studyMetaMcpDemoNodeHandler(
    request as Parameters<typeof studyMetaMcpDemoNodeHandler>[0],
    response,
  );
}
