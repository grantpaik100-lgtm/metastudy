"use strict";

// StudyMeta MCP 서버에 연결하는 서버 전용 클라이언트.
//
// 브라우저 JS는 MCP 툴을 직접 호출할 수 없다(MCP 툴은 MCP 클라이언트만 호출
// 가능하고, 웹페이지는 클라이언트가 아니다). 그래서 이 파일이 대신 MCP
// 클라이언트가 되어 서버 쪽(Vercel 서버리스 함수, api/ 폴더)에서만 호출되고,
// 프론트엔드(service-prototype.html)는 이 파일이 만든 REST 엔드포인트만 fetch한다.
//
// 연결 정보(MCP_SERVER_URL, MCP_API_KEY)는 아직 이 팀의 실제 MCP 서버 값으로
// 채워진 적이 없다 — MCP_INTEGRATION.md에 팀원이 확인해야 할 항목을 정리해
// 두었으니 배포 전에 먼저 읽어달라.

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const { SSEClientTransport } = require("@modelcontextprotocol/sdk/client/sse.js");

let cachedClientPromise = null;

function buildTransport(serverUrl, apiKey) {
  const requestInit = apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : undefined;
  const transportKind = (process.env.MCP_TRANSPORT || "streamable-http").toLowerCase();

  if (transportKind === "sse") {
    return new SSEClientTransport(new URL(serverUrl), requestInit ? { requestInit } : undefined);
  }
  // 기본값: 최신 MCP 표준 전송인 Streamable HTTP.
  return new StreamableHTTPClientTransport(new URL(serverUrl), requestInit ? { requestInit } : undefined);
}

// 서버리스 함수는 콜드 스타트마다 새 프로세스일 수 있지만, 같은 웜 인스턴스가
// 여러 요청을 처리할 때는 연결을 재사용한다.
async function getMcpClient() {
  if (!cachedClientPromise) {
    cachedClientPromise = connect().catch((err) => {
      cachedClientPromise = null; // 실패하면 다음 요청이 재시도할 수 있게 캐시를 비운다
      throw err;
    });
  }
  return cachedClientPromise;
}

async function connect() {
  const serverUrl = process.env.MCP_SERVER_URL;
  if (!serverUrl) {
    throw new Error("MCP_SERVER_URL이 설정되어 있지 않습니다. .env.example / MCP_INTEGRATION.md를 확인하세요.");
  }
  const apiKey = process.env.MCP_API_KEY;

  const transport = buildTransport(serverUrl, apiKey);
  const client = new Client({ name: "studymeta-service-prototype", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

// MCP 툴을 호출하고 결과 텍스트를 JSON으로 파싱해서 돌려준다.
// (StudyMeta MCP 툴들은 결과를 JSON 문자열 하나로 담은 text content로 응답한다 —
//  이 세션에서 get_learner_context를 직접 호출해 확인한 형태를 그대로 따른다.)
async function callMcpTool(name, args) {
  const client = await getMcpClient();
  const result = await client.callTool({ name, arguments: args });

  if (result.isError) {
    const message = Array.isArray(result.content) && result.content[0] && result.content[0].text
      ? result.content[0].text
      : "MCP 툴 호출이 실패했습니다: " + name;
    throw new Error(message);
  }

  const first = Array.isArray(result.content) ? result.content[0] : null;
  if (!first || first.type !== "text") {
    throw new Error("예상하지 못한 MCP 응답 형식입니다: " + name);
  }
  return JSON.parse(first.text);
}

module.exports = { getMcpClient, callMcpTool };
