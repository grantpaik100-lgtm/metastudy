// 작업판 공동 작업 서버.
// - 정적 파일: 이 폴더 바로 아래의 화면 파일(html/js/css/이미지/폰트)만 제공한다. data/, 숨김 파일, .md, .json, .mjs는 제공하지 않는다.
// - 실시간 동기화: 브라우저는 /api/events(SSE)로 변경을 받고, /api/op(POST)로 변경을 보낸다.
// - 저장: data/board.json. 백업은 data/backups/(최근 50개), 변경 기록은 data/changes.log.
// - 버전 폴더: 버튼으로 저장한 작업판 스냅샷은 data/versions/에 한 파일씩 둔다(자동으로 지우지 않음).
// 외부 패키지 없이 Node 기본 기능만 사용한다.
import http from "node:http";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ANONYMOUS, applyOp, blank, isAnonymousOp, normalizeBoard } from "./board-ops.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
const DATA_DIR = path.join(ROOT, "data");
const BOARD_FILE = path.join(DATA_DIR, "board.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const LOG_FILE = path.join(DATA_DIR, "changes.log");
const VERSION_DIR = path.join(DATA_DIR, "versions");
const BACKUP_KEEP = 50;
const BACKUP_EVERY_MS = 5 * 60 * 1000;
const SAVE_DELAY_MS = 400;
const MAX_BODY = 2 * 1024 * 1024;
const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
};

mkdirSync(BACKUP_DIR, { recursive: true });
mkdirSync(VERSION_DIR, { recursive: true });

// ── 저장 ────────────────────────────────────────────────────────────
let board = blank();
let rev = 0;
let dirty = false;
let backupDirty = false;
let saveTimer = null;

function writeAtomic(file, content) {
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, content);
  renameSync(temp, file); // 쓰는 도중 종료돼도 board.json이 반쯤 깨지지 않게 한다.
}
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!dirty) return;
  writeAtomic(BOARD_FILE, JSON.stringify(board, null, 2));
  dirty = false;
}
function scheduleSave() {
  dirty = true;
  backupDirty = true;
  if (!saveTimer) saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}
function backupNow(reason) {
  saveNow();
  if (!existsSync(BOARD_FILE)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(path.join(BACKUP_DIR, `board-${stamp}-${reason}.json`), readFileSync(BOARD_FILE));
  const files = readdirSync(BACKUP_DIR).filter((name) => name.startsWith("board-") && name.endsWith(".json")).sort();
  for (const name of files.slice(0, Math.max(0, files.length - BACKUP_KEEP))) unlinkSync(path.join(BACKUP_DIR, name));
  backupDirty = false;
}
function readBoardFile(file) {
  try { return normalizeBoard(JSON.parse(readFileSync(file, "utf8"))); } catch { return null; }
}
function loadInitialBoard() {
  const seedIndex = process.argv.indexOf("--seed");
  if (seedIndex > 0) {
    const seedPath = path.resolve(process.argv[seedIndex + 1] || "");
    const seeded = readBoardFile(seedPath);
    if (!seeded) { console.error(`[작업판] --seed 파일을 작업판 JSON으로 읽을 수 없습니다: ${seedPath}`); process.exit(1); }
    if (existsSync(BOARD_FILE)) backupNow("before-seed");
    board = seeded;
    dirty = true;
    saveNow();
    console.log(`[작업판] ${seedPath} 내용으로 공동 작업판을 시작합니다.`);
    return;
  }
  if (existsSync(BOARD_FILE)) {
    const saved = readBoardFile(BOARD_FILE);
    if (!saved) {
      // 빈 작업판으로 덮어쓰면 데이터가 사라지므로 시작하지 않는다.
      console.error("[작업판] data/board.json을 읽을 수 없습니다. data/backups/의 최근 파일로 복구한 뒤 다시 실행하세요.");
      process.exit(1);
    }
    board = saved;
    backupNow("start");
    return;
  }
  dirty = true;
  saveNow();
}
function logChange(name, op) {
  if (op.type === "screen.move" && !op.final) return;
  const entry = { at: new Date().toISOString(), by: name, type: op.type, id: op.id || op.item?.id || undefined, title: op.item?.title || op.fields?.title || op.projectName || undefined };
  try { appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`); } catch { /* 기록 실패가 편집을 막지 않게 한다. */ }
}

// ── 버전 폴더 ────────────────────────────────────────────────────────
const cleanVersionId = (value) => (typeof value === "string" && /^v-\d{13}-[a-z0-9]{4}$/.test(value) ? value : null);
const versionMeta = (version) => ({ id: version.id, name: version.name, savedAt: version.savedAt, by: version.by, screens: version.board.screens.length, links: version.board.links.length });
function readVersion(id) {
  try {
    const data = JSON.parse(readFileSync(path.join(VERSION_DIR, `${id}.json`), "utf8"));
    const snapshot = normalizeBoard(data.board);
    return snapshot ? { id, name: String(data.name || id).slice(0, 80), savedAt: String(data.savedAt || ""), by: String(data.by || "팀원").slice(0, 20), board: snapshot } : null;
  } catch { return null; }
}
function listVersions() {
  return readdirSync(VERSION_DIR).filter((name) => name.endsWith(".json")).map((name) => cleanVersionId(name.slice(0, -5))).filter(Boolean)
    .map(readVersion).filter(Boolean).map(versionMeta).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
async function saveVersion(req, res) {
  const body = await readBody(req);
  const by = clients.get(cleanId(body.client))?.name || "팀원";
  const count = readdirSync(VERSION_DIR).filter((name) => name.endsWith(".json")).length;
  const name = String(body.name || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80) || `버전 ${count + 1}`;
  const version = { id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`, name, savedAt: new Date().toISOString(), by, board: JSON.parse(JSON.stringify(board)) };
  writeAtomic(path.join(VERSION_DIR, `${version.id}.json`), JSON.stringify(version, null, 2));
  logChange(by, { type: "version.save", id: version.id, projectName: name });
  broadcast("versions", { versions: listVersions() });
  sendJson(res, 200, { ok: true, version: versionMeta(version) });
}
async function deleteVersion(req, res, id) {
  const body = await readBody(req);
  const by = clients.get(cleanId(body.client))?.name || "팀원";
  try { unlinkSync(path.join(VERSION_DIR, `${id}.json`)); } catch { return sendJson(res, 404, { message: "이미 삭제된 버전이에요." }); }
  logChange(by, { type: "version.delete", id });
  broadcast("versions", { versions: listVersions() });
  sendJson(res, 200, { ok: true });
}

// ── 접속자 ──────────────────────────────────────────────────────────
const clients = new Map(); // clientId → { name, color, editing, mode, streams:Set<res> }
const cleanName = (value) => String(value || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 20) || "팀원";
const cleanColor = (value) => (/^#[0-9a-f]{6}$/i.test(String(value)) ? value : "#7c6cd8");
const cleanId = (value) => (typeof value === "string" && /^[\w-]{1,80}$/.test(value) ? value : null);
function peers() {
  return Object.fromEntries([...clients].map(([clientId, client]) => [clientId, { name: client.name, color: client.color, editing: client.editing, mode: client.mode }]));
}
function sendEvent(res, event, data) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients.values()) for (const res of client.streams) res.write(payload);
}
setInterval(() => { for (const client of clients.values()) for (const res of client.streams) res.write(": ping\n\n"); }, 20000);

// ── HTTP ────────────────────────────────────────────────────────────
const baseHeaders = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
function sendJson(res, status, data) {
  res.writeHead(status, { ...baseHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
function notFound(res) { res.writeHead(404, { ...baseHeaders, "Content-Type": "text/plain; charset=utf-8" }); res.end("Not found"); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(Object.assign(new Error("bad json"), { status: 400 })); } });
    req.on("error", reject);
  });
}

function openEvents(req, res, url) {
  const clientId = cleanId(url.searchParams.get("client"));
  if (!clientId) return sendJson(res, 400, { message: "client id가 필요합니다." });
  res.writeHead(200, { ...baseHeaders, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write("retry: 2000\n\n");
  let client = clients.get(clientId);
  if (!client) {
    client = { name: cleanName(url.searchParams.get("name")), color: cleanColor(url.searchParams.get("color")), editing: null, mode: null, streams: new Set() };
    clients.set(clientId, client);
  }
  client.streams.add(res);
  sendEvent(res, "hello", { board, rev, peers: peers() });
  broadcast("presence", { peers: peers() });
  req.on("close", () => {
    client.streams.delete(res);
    if (!client.streams.size) clients.delete(clientId);
    broadcast("presence", { peers: peers() });
  });
}

async function receiveOp(req, res) {
  const body = await readBody(req);
  const clientId = cleanId(body.client);
  const name = clients.get(clientId)?.name || "팀원";
  if (body.op?.type === "replace") backupNow("before-import");
  const result = applyOp(board, body.op);
  if (result.error) return sendJson(res, 409, result);
  rev += 1;
  scheduleSave();
  // 실험실 가설의 코멘트 · 찬반은 익명이라 기록에도, 다른 팀원에게 보내는 알림에도 누가 했는지 넣지 않는다.
  const anonymous = isAnonymousOp(result.op);
  logChange(anonymous ? ANONYMOUS : name, result.op);
  broadcast("op", { rev, op: result.op, by: anonymous ? "" : clientId, name: anonymous ? ANONYMOUS : name });
  sendJson(res, 200, { ok: true, rev });
}

async function receivePresence(req, res) {
  const body = await readBody(req);
  const client = clients.get(cleanId(body.client));
  if (!client) return sendJson(res, 404, { message: "연결이 끊겼습니다." });
  if ("name" in body) client.name = cleanName(body.name);
  if ("color" in body) client.color = cleanColor(body.color);
  client.editing = typeof body.editing === "string" ? body.editing.slice(0, 120) : null;
  client.mode = body.mode === "move" ? "move" : body.mode === "edit" ? "edit" : null;
  broadcast("presence", { peers: peers() });
  sendJson(res, 200, { ok: true });
}

async function serveStatic(req, res, pathname) {
  let name;
  try { name = decodeURIComponent(pathname); } catch { return notFound(res); }
  if (name === "/") name = "/index.html";
  name = name.slice(1);
  // 이 폴더 바로 아래 파일만. 하위 폴더(data/ 등), 숨김 파일, 상위 경로는 모두 거절한다.
  if (!name || /[\/\\\0]/.test(name) || name.startsWith(".")) return notFound(res);
  const type = STATIC_TYPES[path.extname(name).toLowerCase()];
  if (!type) return notFound(res);
  try {
    const content = await readFile(path.join(ROOT, name));
    res.writeHead(200, { ...baseHeaders, "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch { notFound(res); }
}

async function handle(req, res) {
  const url = new URL(req.url, "http://workboard.local");
  try {
    if (url.pathname === "/api/events" && req.method === "GET") return openEvents(req, res, url);
    if (url.pathname === "/api/state" && req.method === "GET") return sendJson(res, 200, { board, rev });
    if (url.pathname === "/api/op" && req.method === "POST") return await receiveOp(req, res);
    if (url.pathname === "/api/presence" && req.method === "POST") return await receivePresence(req, res);
    if (url.pathname === "/api/versions" && req.method === "GET") return sendJson(res, 200, { versions: listVersions() });
    if (url.pathname === "/api/versions" && req.method === "POST") return await saveVersion(req, res);
    const versionPath = /^\/api\/versions\/([^/]+)(\/delete)?$/.exec(url.pathname);
    if (versionPath && cleanVersionId(versionPath[1])) {
      const id = versionPath[1];
      if (!versionPath[2] && req.method === "GET") { const version = readVersion(id); return version ? sendJson(res, 200, { version }) : sendJson(res, 404, { message: "버전을 찾을 수 없어요." }); }
      if (versionPath[2] && req.method === "POST") return await deleteVersion(req, res, id);
    }
    if (url.pathname.startsWith("/api/")) return notFound(res);
    if (url.pathname === "/favicon.ico" && !existsSync(path.join(ROOT, "favicon.ico"))) { res.writeHead(204, baseHeaders); return res.end(); }
    if (req.method === "GET" || req.method === "HEAD") return await serveStatic(req, res, url.pathname);
    res.writeHead(405, baseHeaders);
    res.end();
  } catch (error) {
    if (!res.headersSent) sendJson(res, error.status || 500, { message: error.status ? "요청을 읽을 수 없습니다." : "서버 오류가 발생했습니다." });
    if (!error.status) console.error(error);
  }
}

// ── 시작 / 종료 ─────────────────────────────────────────────────────
loadInitialBoard();
setInterval(() => { if (backupDirty) backupNow("auto"); }, BACKUP_EVERY_MS);

// 이 컴퓨터 안에서만 접속을 받는다. 외부 공유는 ngrok을 통해서만 이뤄진다.
for (const host of ["127.0.0.1", "::1"]) {
  const server = http.createServer(handle);
  server.on("error", (error) => {
    if (host === "::1") return; // IPv6를 쓸 수 없는 환경이면 127.0.0.1만 사용한다.
    if (error.code === "EADDRINUSE") console.error(`[작업판] ${PORT} 포트를 이미 다른 프로그램이 쓰고 있습니다. 먼저 켜 둔 작업판 서버를 Ctrl+C로 끄고 다시 실행하세요.`);
    else console.error(error);
    process.exit(1);
  });
  server.listen(PORT, host, () => {
    if (host !== "127.0.0.1") return;
    console.log(`\n[작업판] 실시간 공동 작업 서버가 켜졌습니다: http://127.0.0.1:${PORT}`);
    console.log(`[작업판] 팀원과 공유하려면 새 터미널 창에서:  ngrok http ${PORT}`);
    console.log("[작업판] 끄려면 이 창에서 Ctrl+C\n");
  });
}

function shutdown() {
  try { saveNow(); if (backupDirty) backupNow("shutdown"); } finally { process.exit(0); }
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
