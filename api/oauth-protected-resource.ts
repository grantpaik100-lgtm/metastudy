import type { IncomingMessage, ServerResponse } from "node:http";
import {
  buildProtectedResourceMetadata,
  requestOrigin,
} from "../src/auth/oauth.js";
import { getEnvironment } from "../src/config/env.js";

export default function handler(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  if (request.method !== "GET") {
    response.writeHead(405, { allow: "GET" }).end();
    return;
  }
  const metadata = buildProtectedResourceMetadata(
    requestOrigin(request),
    getEnvironment().SUPABASE_URL,
  );
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=300",
  });
  response.end(JSON.stringify(metadata));
}
