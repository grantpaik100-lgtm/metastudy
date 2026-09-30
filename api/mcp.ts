import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AuthenticationError,
  authenticateRequest,
  sendOAuthChallenge,
} from "../src/auth/oauth.js";
import { createStudyMetaMcpHttpHandlers } from "../src/mcp/http-handler.js";
import { createAuthenticatedServices } from "../src/services/default-services.js";

const STREAM_DEADLINE_MS = 25_000;

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const authenticated = await authenticateRequest(request);
    const handlers = createStudyMetaMcpHttpHandlers(
      createAuthenticatedServices(authenticated.accessToken),
    );
    // Long-lived SSE streams (e.g. subscriptions/listen) never end on their
    // own. Close them before Vercel's maxDuration (30s) so the client sees a
    // clean end of stream instead of a runtime timeout.
    const streamDeadline = setTimeout(() => {
      void handlers.httpHandler.close();
    }, STREAM_DEADLINE_MS);
    try {
      await handlers.nodeHandler(
        request as Parameters<typeof handlers.nodeHandler>[0],
        response,
      );
    } finally {
      clearTimeout(streamDeadline);
      await handlers.httpHandler.close();
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendOAuthChallenge(request, response, error.message);
      return;
    }
    console.error("Authenticated MCP request failed", error);
    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "MCP request failed" }));
    }
  }
}
