import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { getDefaultServices } from "./services/default-services.js";
import { createStudyMetaMcpServer } from "./mcp/server.js";

serveStdio(() => createStudyMetaMcpServer(getDefaultServices()));
