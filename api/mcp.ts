import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AuthenticationError,
  authenticateRequest,
  sendOAuthChallenge,
} from "../src/auth/oauth.js";
import { createStudyMetaMcpHttpHandlers } from "../src/mcp/http-handler.js";
import { createAuthenticatedServices } from "../src/services/default-services.js";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const authenticated = await authenticateRequest(request);
    const handlers = createStudyMetaMcpHttpHandlers(
      createAuthenticatedServices(authenticated.accessToken),
    );
    try {
      await handlers.nodeHandler(
        request as Parameters<typeof handlers.nodeHandler>[0],
        response,
      );
    } finally {
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
