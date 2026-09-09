import { createServer } from "node:http";
import {
  localhostHostValidation,
  localhostOriginValidation,
} from "@modelcontextprotocol/node";
import { studyMetaMcpDemoNodeHandler } from "./mcp/demo-http-handler.js";

const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();
const port = Number(process.env.PORT ?? 3000);

const httpServer = createServer(async (request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", service: "studymeta-mcp" }));
    return;
  }

  if (request.url === "/mcp-demo") {
    if (!validateHost(request, response) || !validateOrigin(request, response)) {
      return;
    }
    await studyMetaMcpDemoNodeHandler(
      request as Parameters<typeof studyMetaMcpDemoNodeHandler>[0],
      response,
    );
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

  // Keep the existing authenticated/data-backed endpoint lazy so this isolated
  // UI spike can start /mcp-demo without any Supabase environment variables.
  const { studyMetaMcpNodeHandler } = await import("./mcp/http-handler.js");
  await studyMetaMcpNodeHandler(
    request as Parameters<typeof studyMetaMcpNodeHandler>[0],
    response,
  );
});

httpServer.listen(port, "127.0.0.1", () => {
  console.error(`StudyMeta MCP listening at http://127.0.0.1:${port}/mcp (authenticated) and /mcp-demo (synthetic demo)`);
});
