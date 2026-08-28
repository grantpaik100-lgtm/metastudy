#!/usr/bin/env node
"use strict";

// 로컬에서 MCP 연동을 테스트하기 위한 최소 개발 서버. Vercel CLI/로그인 없이도
// `node scripts/dev-server.js`로 실행해 정적 파일과 api/ 폴더의 서버리스
// 함수를 같은 origin에서 함께 서빙한다(그래야 service-prototype.html의
// fetch("/api/...")가 브라우저 CORS 제약 없이 동작한다).
//
// 실제 배포는 Vercel이 담당한다 — 이 서버는 로컬 개발 편의용이며, api/*.js를
// Vercel과 동일한 (req, res) 형태로 그대로 호출한다.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;

loadDotEnv();

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://" + req.headers.host);

  if (url.pathname.startsWith("/api/")) {
    handleApi(url, req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "서버 오류", detail: String((err && err.message) || err) }));
    });
    return;
  }

  serveStatic(url, res);
});

async function handleApi(url, req, res) {
  const fnName = url.pathname.replace(/^\/api\//, "").replace(/\/+$/, "");
  const fnPath = path.join(ROOT, "api", fnName + ".js");

  if (!fnName || !fs.existsSync(fnPath)) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "알 수 없는 API입니다: /api/" + fnName }));
    return;
  }

  const query = Object.fromEntries(url.searchParams.entries());
  req.query = query;

  const vercelRes = {
    _status: 200,
    status(code) { this._status = code; return this; },
    setHeader: res.setHeader.bind(res),
    json(payload) {
      res.writeHead(this._status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(payload));
    }
  };

  delete require.cache[require.resolve(fnPath)];
  const handler = require(fnPath);
  await handler(req, vercelRes);
}

function serveStatic(url, res) {
  const reqPath = url.pathname === "/" ? "/service-prototype.html" : url.pathname;
  const filePath = path.join(ROOT, reqPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found: " + reqPath);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": STATIC_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

// .env가 있으면 읽어 process.env에 채운다(이미 설정된 값은 덮어쓰지 않는다).
// 외부 의존성 없이 최소한만 파싱한다 — 따옴표로 감싼 값, #주석, 빈 줄 정도만 처리한다.
function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const m = trimmed.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!m) return;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  });
}

server.listen(PORT, () => {
  console.log("StudyMeta 로컬 개발 서버: http://localhost:" + PORT);
  if (!process.env.MCP_SERVER_URL) {
    console.log("MCP_SERVER_URL이 설정되어 있지 않습니다 — /api/learner-context는 502를 반환하고, 화면은 예시 값을 그대로 보여줍니다.");
    console.log(".env 파일을 만들고 .env.example을 참고해 값을 채우세요.");
  }
});
