import { createServer } from "node:http";
import {
  localhostHostValidation,
  localhostOriginValidation,
} from "@modelcontextprotocol/node";
import { getEnvironment } from "./config/env.js";
import { studyMetaMcpNodeHandler } from "./mcp/http-handler.js";

const environment = getEnvironment();
const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();

const httpServer = createServer(async (request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", service: "studymeta-mcp" }));
    return;
  }

  if (request.url !== "/mcp") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  if (!validateHost(request, response) || !validateOrigin(request, response)) {
    return;
  }

  await studyMetaMcpNodeHandler(
    request as Parameters<typeof studyMetaMcpNodeHandler>[0],
    response,
  );
});

httpServer.listen(environment.PORT, "127.0.0.1", () => {
  console.error(`StudyMeta MCP listening at http://127.0.0.1:${environment.PORT}/mcp`);
});
