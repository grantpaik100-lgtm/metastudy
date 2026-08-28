import type { IncomingMessage, ServerResponse } from "node:http";
import { getEnvironment } from "../src/config/env.js";

export default function handler(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  if (request.method !== "GET") {
    response.writeHead(405, { allow: "GET" }).end();
    return;
  }

  const token = getEnvironment().OPENAI_APPS_CHALLENGE_TOKEN;
  if (!token) {
    response.writeHead(404, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end("Not configured");
    return;
  }

  response.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "public, max-age=60",
  });
  response.end(token);
}
