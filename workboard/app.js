// Independent workboard UI. Screens are shared by wireframes, the flow map, and the prototype.
// 실시간 공동 작업: 작업판 원본은 서버(server.mjs → data/board.json)에 있다.
// 이 브라우저의 변경은 op 하나씩 서버로 보내고, 서버가 정한 순서의 op를 모든 사람이 똑같이 적용한다.
import { ANONYMOUS, applyOp, blank, normalizeBoard, validUrl } from "./board-ops.js";

const KEY = "workboard-template-v1"; // 공동 작업 전 이 브라우저에만 저장하던 작업판. 서버로 옮길 때만 읽는다.
const NAME_KEY = "workboard-collab-name";
const MIGRATED_KEY = "workboard-collab-migrated";
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const id = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const routeNames = { home: "작업판", lab: "실험실", wireframe: "와이어프레임", flow: "흐름도", prototype: "목업 · 프로토타입", versions: "버전 폴더", requests: "자료 요청" };
const routeIcons = { home: "⌂", lab: "⌁", wireframe: "▦", flow: "⑂", prototype: "▶", versions: "▤", requests: "⇄" };
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* 저장소를 쓸 수 없어도 작업판은 열린다. */ } },
};
let state = blank();
let ready = false; // 서버에서 첫 작업판을 받기 전에는 빈 화면 대신 연결 중 안내를 보여 준다.
let selectedScreen = null;
// 버전 폴더: 저장된 버전을 여는 동안 state는 그 버전(읽기 전용)이고, 실시간 작업판은 liveState에 계속 반영된다.
let versions = [];
let viewing = null;
let liveState = null;
const openComments = new Set();
const commentDrafts = new Map();
const READ_ONLY_NOTICE = "저장된 버전은 읽기 전용이에요. 위쪽의 '현재 작업판으로 돌아가기'를 누른 뒤 고쳐 주세요.";
let editContext = null;
let toastTimer;

// 흐름도 확대·축소. 트랙패드 핀치(ctrlKey가 붙은 wheel), 버튼, 전체 맞춤을 지원한다.
const NODE_W = 248, NODE_H = 542, SCALE_MIN = .25, SCALE_MAX = 2, SCALE_KEY = "workboard-flow-scale";
const stageSize = (board = state) => ({
  width: Math.max(1930, ...board.screens.map((screen) => flowX(screen, board) + nodeWidth(screen) + 70)),
  height: Math.max(1230, ...board.screens.map((screen) => (Number.isFinite(screen.y) ? screen.y : 0) + NODE_H + 70)),
});
const clampScale = (value) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));
let flowScale = (() => { const saved = parseFloat(storage.get(SCALE_KEY)); return Number.isFinite(saved) ? clampScale(saved) : 1; })();
let flowFocus = null;
let flowExpanded = false;
function applyScale() {
  const stage = $("#flow-stage"), canvas = $("#flow-canvas"), label = $("#zoom-level");
  if (!stage || !canvas) return;
  const { width, height } = stageSize();
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.transform = `scale(${flowScale})`;
  canvas.style.width = `${width * flowScale}px`;
  canvas.style.height = `${height * flowScale}px`;
  if (label) label.textContent = `${Math.round(flowScale * 100)}%`;
  storage.set(SCALE_KEY, String(flowScale));
}
// anchor를 주면 그 지점(커서)이 제자리에 머무르도록 스크롤을 보정한다.
function setScale(next, anchor) {
  const scroll = document.querySelector(".flow-scroll");
  const value = clampScale(next);
  if (!scroll) { flowScale = value; applyScale(); return; }
  const rect = scroll.getBoundingClientRect();
  const ax = anchor ? anchor.x - rect.left : scroll.clientWidth / 2;
  const ay = anchor ? anchor.y - rect.top : scroll.clientHeight / 2;
  const stageX = (scroll.scrollLeft + ax) / flowScale;
  const stageY = (scroll.scrollTop + ay) / flowScale;
  flowScale = value;
  applyScale();
  scroll.scrollLeft = stageX * value - ax;
  scroll.scrollTop = stageY * value - ay;
}
function fitScale() {
  const scroll = document.querySelector(".flow-scroll");
  if (!scroll || !state.screens.length) return;
  const right = Math.max(...state.screens.map((item) => flowX(item) + nodeWidth(item) + 30));
  const bottom = Math.max(...state.screens.map((item) => (Number.isFinite(item.y) ? item.y : 0) + NODE_H + 30));
  flowScale = clampScale(Math.min((scroll.clientWidth - 24) / right, (scroll.clientHeight - 24) / bottom, 1));
  applyScale();
  scroll.scrollLeft = 0;
  scroll.scrollTop = 0;
}

// ── 실시간 공동 작업 ────────────────────────────────────────────────
const COLORS = ["#7c6cd8", "#e0706b", "#2e9d8f", "#d9973a", "#4b86d6", "#c562a8"];
const clientId = id();
const collab = {
  rev: 0,
  online: false,
  peers: {},
  me: { name: storage.get(NAME_KEY) || `팀원 ${Math.floor(100 + Math.random() * 900)}`, color: COLORS[Math.floor(Math.random() * COLORS.length)] },
  editing: null,
  mode: null,
  source: null,
  pendingRender: false,
};
const outbox = [];
let sending = false;
let resyncing = false;

async function post(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" }, body: JSON.stringify(body), signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.message || "request failed"), { data });
    return data;
  } finally { clearTimeout(timer); }
}
// 변경을 이 화면에 먼저 반영하고 서버로 보낸다. 서버가 거절하면 최신 상태로 다시 맞춘다.
function commit(op, { quiet = false, rerender = true } = {}) {
  if (viewing) { if (!quiet) toast(READ_ONLY_NOTICE); return false; }
  const result = applyOp(state, op);
  if (result.error) { if (!quiet) toast(result.message); return false; }
  if (rerender) refresh();
  // 드래그 중 위치는 같은 화면의 마지막 위치만 보내면 된다.
  const waiting = result.op.type === "screen.move" ? outbox.findIndex((entry) => entry.op.type === "screen.move" && entry.op.id === result.op.id) : -1;
  if (waiting >= 0) outbox[waiting] = { op: result.op, quiet };
  else outbox.push({ op: result.op, quiet });
  flush();
  return true;
}
// 보낸 순서대로 서버에 도착하도록 한 번에 하나씩 보낸다.
async function flush() {
  if (sending) return;
  sending = true;
  while (outbox.length) {
    const entry = outbox.shift();
    try { await post("/api/op", { client: clientId, op: entry.op }); }
    catch (error) {
      if (!entry.quiet || error.data?.error === "missing") toast(error.data?.message || "연결이 끊겨 저장하지 못했어요. 다시 연결되면 최신 내용으로 맞춥니다.");
      resync();
    }
  }
  sending = false;
}
async function resync() {
  if (resyncing) return;
  resyncing = true;
  try {
    const response = await fetch("/api/state", { headers: { "ngrok-skip-browser-warning": "1" } });
    if (response.ok) { const data = await response.json(); replaceState(data.board, data.rev); }
  } catch { /* 연결이 돌아오면 hello 이벤트가 다시 전체 상태를 보낸다. */ }
  finally { resyncing = false; }
}
function replaceState(board, rev) {
  const next = normalizeBoard(board) || blank();
  collab.rev = rev;
  if (viewing) { liveState = next; return; }
  state = next;
  refresh();
}
function receiveOp({ rev, op, by, name }) {
  if (rev <= collab.rev) return;
  if (rev !== collab.rev + 1) { resync(); return; } // 중간 변경을 놓쳤으면 전체를 다시 받는다.
  collab.rev = rev;
  applyOp(viewing ? liveState : state, op, { trusted: true });
  if (viewing) return; // 저장된 버전을 보는 동안에는 실시간 변경을 뒤에서만 반영한다.
  if (op.type === "screen.move") { moveNode(op.id, by); return; }
  if (op.type === "request.create" && by !== clientId && op.item?.to === collab.me.name) toast(`${name}님이 자료를 요청했어요: ${op.item.what}`);
  if (op.type === "request.item.add" && by !== clientId) { const request = (state.requests || []).find((item) => item.id === op.requestId); if (request?.from === collab.me.name) toast(`${name}님이 "${request.what}" 자료를 올렸어요.`); }
  if (op.type === "comment.add" && op.experimentId) { const target = state.experiments.find((item) => item.id === op.experimentId); if (target && !myAnonymousComments.delete(op.item?.id)) toast(`가설 "${target.title}"에 익명 의견이 달렸어요.`); }
  else if (op.type === "comment.add" && by !== clientId) { const target = state.screens.find((item) => item.id === op.screenId); if (target) toast(`${name}님이 "${target.title}"에 코멘트를 남겼어요.`); }
  // 그림 저장이 서버에서 빠졌다면 서버가 예전 board-ops.js를 쓰고 있다는 뜻이다.
  if (by === clientId && op.type === "screen.update" && drawSaveCheck?.id === op.id) {
    const sentFrame = drawSaveCheck.frame;
    drawSaveCheck = null;
    if (!op.fields || !("drawing" in op.fields) || op.fields.drawing.frame !== sentFrame) toast("서버가 예전 board-ops.js를 쓰고 있어서 그림이 저장되지 않았어요. board-ops.js를 교체하고 서버를 다시 켜 주세요.");
  }
  if (by !== clientId && draw && (op.id === draw.screenId || op.type === "replace")) {
    const notice = drawDialog()?.querySelector(".dw-notice");
    const gone = op.type === "screen.delete" || (op.type === "replace" && !state.screens.some((item) => item.id === draw.screenId));
    if (notice && (gone || op.fields?.drawing || op.type === "replace")) { notice.hidden = false; notice.textContent = gone ? `${name}님이 이 화면을 삭제했어요. 저장해도 반영되지 않습니다.` : `${name}님이 방금 이 화면 그림을 바꿨어요. 저장하면 내 그림으로 덮어씁니다.`; }
  }
  if (by !== clientId && editContext?.id && (op.id === editContext.id || op.item?.id === editContext.id || op.type === "replace")) {
    const notice = $("#collab-notice");
    const gone = op.type.endsWith(".delete") || (op.type === "replace" && ![...state.screens, ...state.experiments].some((item) => item.id === editContext.id));
    if (notice) { notice.hidden = false; notice.textContent = gone ? `${name}님이 이 항목을 삭제했어요. 저장해도 반영되지 않습니다.` : `${name}님이 방금 이 항목을 수정했어요. 저장하면 내가 바꾼 칸만 반영됩니다.`; }
  }
  if (op.type === "replace" && by !== clientId) toast(`${name}님이 작업판 전체를 새 파일로 바꿨어요.`);
  refresh();
}
// 다른 사람이 옮기는 카드는 전체를 다시 그리지 않고 그 카드만 움직인다.
function moveNode(screenId, by) {
  if (dragging && dragging.node.dataset.id === screenId && by === clientId) return;
  const screen = state.screens.find((item) => item.id === screenId);
  const node = [...document.querySelectorAll(".flow-node")].find((element) => element.dataset.id === screenId);
  if (!screen || !node || (dragging && dragging.node === node)) return;
  node.style.left = `${flowX(screen)}px`;
  node.style.top = `${screen.y}px`;
  applyScale();
  drawLines();
}
// 다시 그려도 보던 위치, 스크롤, 포커스를 유지한다.
function refresh() {
  if (dragging) { collab.pendingRender = true; return; }
  const scrollers = [document.scrollingElement, $("#app"), $(".main-column"), $(".flow-scroll"), $(".screen-rail")].filter(Boolean).map((element) => ({ selector: element === document.scrollingElement ? null : element.id ? `#${element.id}` : `.${element.classList[0]}`, top: element.scrollTop, left: element.scrollLeft }));
  const focused = document.activeElement?.closest?.("#app [data-action]");
  const focusKey = focused ? [focused.dataset.action, focused.dataset.id] : null;
  // 코멘트를 쓰는 중에 팀원 변경으로 다시 그려져도 입력 칸과 커서를 지킨다.
  const typing = document.activeElement?.matches?.("[data-keep-focus]") ? { key: document.activeElement.dataset.keepFocus, start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd } : null;
  render();
  if (typing) { const input = [...document.querySelectorAll("[data-keep-focus]")].find((element) => element.dataset.keepFocus === typing.key); if (input) { input.focus({ preventScroll: true }); try { input.setSelectionRange(typing.start, typing.end); } catch { /* 선택 영역을 지원하지 않는 칸 */ } } }
  for (const { selector, top, left } of scrollers) {
    const element = selector ? $(selector) : document.scrollingElement;
    if (element) { element.scrollTop = top; element.scrollLeft = left; }
  }
  if (focusKey) [...document.querySelectorAll("#app [data-action]")].find((element) => element.dataset.action === focusKey[0] && element.dataset.id === focusKey[1])?.focus({ preventScroll: true });
}
function sendPresence() {
  post("/api/presence", { client: clientId, name: collab.me.name, color: collab.me.color, editing: collab.editing, mode: collab.mode }).catch(() => {});
}
function setEditing(itemId, mode = "edit") {
  collab.editing = itemId || null;
  collab.mode = itemId ? mode : null;
  sendPresence();
}
function initials(name) { return [...String(name).trim()].slice(0, 1).join("") || "?"; }
function renderPresence() {
  const peers = Object.entries(collab.peers);
  const list = peers.map(([peerId, peer]) => `<span class="collab-chip" style="--collab-color:${escapeHtml(peer.color)}" title="${escapeHtml(peer.name)}${peerId === clientId ? " (나)" : ""}"><b>${escapeHtml(initials(peer.name))}</b><span>${escapeHtml(peer.name)}${peerId === clientId ? " · 나" : ""}</span></span>`).join("");
  $("#collab-presence").innerHTML = `<span class="collab-status ${collab.online ? "online" : "offline"}"><i></i>${collab.online ? `${peers.length}명 접속 중` : "연결 끊김 · 다시 연결 중"}</span><span class="collab-chips">${list}</span><button class="ghost-button collab-rename" data-action="rename">이름 바꾸기</button>`;
  decoratePresence();
}
// 다른 사람이 편집하거나 옮기고 있는 카드에 테두리와 이름표를 붙인다.
function decoratePresence() {
  document.querySelectorAll(".collab-badge").forEach((badge) => badge.remove());
  document.querySelectorAll(".collab-editing").forEach((element) => { element.classList.remove("collab-editing"); element.style.removeProperty("--collab-color"); });
  const targets = [...document.querySelectorAll("[data-presence-id]")];
  for (const [peerId, peer] of Object.entries(collab.peers)) {
    if (peerId === clientId || !peer.editing) continue;
    for (const element of targets.filter((item) => item.dataset.presenceId === peer.editing)) {
      element.classList.add("collab-editing");
      element.style.setProperty("--collab-color", peer.color);
      const badge = document.createElement("span");
      badge.className = "collab-badge";
      badge.textContent = `${peer.name} ${peer.mode === "move" ? "옮기는 중" : "편집 중"}`;
      element.append(badge);
    }
  }
}
function connect() {
  const params = new URLSearchParams({ client: clientId, name: collab.me.name, color: collab.me.color });
  const source = new EventSource(`/api/events?${params}`);
  collab.source = source;
  source.addEventListener("hello", (event) => {
    const data = JSON.parse(event.data);
    collab.online = true;
    collab.peers = data.peers;
    const first = !ready;
    ready = true;
    replaceState(data.board, data.rev);
    renderPresence();
    sendPresence(); // 다시 연결됐을 때 바뀐 이름과 편집 중 표시를 서버에 다시 알린다.
    if (first) migrateLocalBoard();
    loadVersions();
  });
  source.addEventListener("op", (event) => receiveOp(JSON.parse(event.data)));
  source.addEventListener("presence", (event) => { collab.peers = JSON.parse(event.data).peers; renderPresence(); });
  source.addEventListener("versions", (event) => { versions = JSON.parse(event.data).versions || []; if (currentRoute() === "versions") refresh(); });
  source.onerror = () => {
    collab.online = false;
    renderPresence();
    // 서버가 꺼졌다 켜지면 EventSource가 멈출 수 있어서 직접 다시 연결한다.
    if (source.readyState === EventSource.CLOSED) setTimeout(connect, 2000);
  };
}
// 공동 작업판이 비어 있고, 이 브라우저에 예전 작업판이 남아 있으면 올릴지 묻는다.
function migrateLocalBoard() {
  if (state.screens.length || state.experiments.length || state.links.length || storage.get(MIGRATED_KEY)) return;
  let local = null;
  try { local = normalizeBoard(JSON.parse(storage.get(KEY) || "null")); } catch { return; }
  if (!local || !(local.screens.length || local.experiments.length || local.links.length)) return;
  if (!confirm(`이 브라우저에 저장돼 있던 작업판 “${local.projectName}”(화면 ${local.screens.length}개 · 실험 ${local.experiments.length}개 · 연결 ${local.links.length}개)을 공동 작업판으로 올릴까요?`)) return;
  if (commit({ type: "replace", board: local })) { storage.set(MIGRATED_KEY, "1"); toast("예전 작업판을 공동 작업판으로 올렸습니다."); }
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2800);
}
function currentRoute() {
  const route = location.hash.replace(/^#/, "");
  return routeNames[route] ? route : "home";
}
function nav() {
  const active = currentRoute();
  $("#nav").innerHTML = Object.entries(routeNames).map(([route, label]) => `<a href="#${route}" class="nav-item ${active === route ? "active" : ""}" ${active === route ? 'aria-current="page"' : ""}><span class="nav-icon">${routeIcons[route]}</span><span>${label}</span>${route === "home" ? "" : '<span class="nav-arrow">↗</span>'}</a>`).join("");
  $("#project-breadcrumb").textContent = state.projectName;
  $("#page-breadcrumb").textContent = routeNames[active];
  document.title = `${routeNames[active]} · ${state.projectName}`;
}
function pageHeader(kicker, title, text, button = "") {
  return `<div class="page-intro"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${text}</p></div>${button}</div>`;
}
function empty(icon, title, text, action, label) {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><h2>${title}</h2><p>${text}</p><button class="primary-button" data-action="${action}">${label} <span>→</span></button></div>`;
}
function roomCard(route, number, title, description, meta) {
  return `<a class="room-card" href="#${route}"><div class="room-top"><span class="room-number">${number}</span><span class="room-open">↗</span></div><div class="room-symbol">${routeIcons[route]}</div><h2>${title}</h2><p>${description}</p><div class="room-foot"><span>${meta}</span><strong>공간 열기 →</strong></div></a>`;
}
function home() {
  const screenCount = state.screens.length;
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow light">YOUR DESIGN WORKSPACE / 00</div><h1>아이디어를 화면으로,<br><em>화면을 흐름으로.</em></h1><p>실험에서 시작해 구조를 잡고, 연결하고, 직접 눌러보는 UI 작업실입니다.</p><div class="hero-actions"><button class="white-button" data-action="edit-project">${escapeHtml(state.projectName)} <span>✎</span></button><span class="hero-caption">프로젝트 이름을 먼저 정해 주세요</span></div></div><div class="hero-art" aria-hidden="true"><div class="art-wire"><span></span><span></span><span></span></div><div class="art-line a"></div><div class="art-line b"></div><div class="art-mini one">⌁<small>LAB</small></div><div class="art-mini two">⑂<small>FLOW</small></div></div></section>
  <section class="overview"><div class="section-title"><div><span class="eyebrow">FOUR ROOMS</span><h2>작업실의 네 공간</h2></div><span>각 공간은 같은 화면 목록으로 연결됩니다</span></div><div class="room-grid">
  ${roomCard("lab", "01 / EXPLORE", "실험실", "화면을 만들기 전, UI 가설과 시안을 자유롭게 시험합니다.", `${state.experiments.length}개 실험`)}
  ${roomCard("wireframe", "02 / STRUCTURE", "와이어프레임", "화면의 목적과 정보 블록을 정리합니다.", `${screenCount}개 화면`)}
  ${roomCard("flow", "03 / CONNECT", "흐름도", "화면을 배치하고 이동 경로를 연결합니다.", `${state.links.length}개 연결`)}
  ${roomCard("prototype", "04 / EXPERIENCE", "목업 · 프로토타입", "같은 화면을 폰에서 누르며 사용 흐름을 검토합니다.", `${screenCount}개 화면`)}
  </div></section><section class="home-strip"><div><span class="eyebrow">START HERE</span><h2>첫 화면을 만들면 세 공간이 함께 채워집니다.</h2><p>와이어프레임에서 화면을 추가하고 흐름도에서 연결하세요. 프로토타입에 이동 버튼이 자동으로 생깁니다.</p></div><button class="outline-button" data-action="add-screen">화면 추가하기 →</button></section>
  <section id="ai-guide" class="ai-guide"><div class="section-title"><div><span class="eyebrow">AI COLLABORATION</span><h2>AI와 함께 쓰는 방법</h2></div><span>AI 대화는 평소 사용하는 도구에서 진행합니다</span></div><div class="ai-guide-grid"><div class="ai-guide-main"><div class="ai-guide-icon">✦</div><h3>작업판의 현재 상태를 AI에게 건네세요.</h3><p>AI가 실험 가설, 화면 구성, 연결을 제안하거나 JSON을 수정하도록 요청할 수 있습니다. 이 버튼은 현재 작업판 데이터와 형식을 요청문에 담아 복사합니다.</p><button class="primary-button" data-action="copy-ai-prompt">AI 요청문 복사 →</button><small>클립보드에만 복사됩니다. 원하는 AI 대화창에 직접 붙여 넣으세요.</small></div><div class="ai-steps"><div><b>01</b><span><strong>복사해 AI에게 전달</strong><small>프로젝트 목표와 원하는 작업을 요청문에 덧붙입니다.</small></span></div><div><b>02</b><span><strong>결과를 검토</strong><small>화면 이름, 연결, 문구를 확인하고 JSON으로 저장합니다.</small></span></div><div><b>03</b><span><strong>불러와 직접 눌러보기</strong><small>상단 불러오기로 반영하고 흐름도와 프로토타입을 확인합니다.</small></span></div></div></div><p class="ai-guide-note">작업판의 디자인·기능 자체를 바꾸려면 이 폴더를 AI 코딩 도구에서 열고 원하는 변경을 요청하세요. 작업판 데이터는 서버를 켠 컴퓨터의 <b>data/board.json</b>에 저장되고, 접속한 모든 팀원에게 실시간으로 반영됩니다. AI에게 건넬 때는 <b>내보내기</b>나 AI 요청문 복사를 사용하세요.</p></section>`;
}
function aiPrompt() {
  return `당신은 내 프로젝트의 UI 설계 협업자입니다. 아래 작업판 JSON을 현재 상태로 사용하세요.\n\n프로젝트 목표: [여기에 적기]\n이번에 원하는 작업: [실험 가설 / 화면 추가·수정 / 화면 흐름 연결 중 구체적으로 적기]\n\n규칙:\n- 기존 id와 작성된 내용을 임의로 지우지 마세요.\n- 결과는 설명이나 코드펜스 없이, 가져오기 가능한 JSON 객체 하나만 반환하세요.\n- 최상위 필드는 version(1), projectName, screens, experiments, links입니다.\n- 새 화면: {"id":"고유한-문자열","title":"화면 이름","purpose":"목적","sections":"블록1\\n블록2","actionLabel":"버튼 문구","url":"","status":"작업 중","x":60,"y":80}\n- 새 실험: {"id":"고유한-문자열","title":"실험 이름","question":"검증할 질문","url":"","status":"진행 중"}\n- 새 연결: {"id":"고유한-문자열","from":"출발 화면 id","to":"도착 화면 id","label":"이동 버튼 문구"}\n- links의 from/to는 반드시 screens에 있는 id를 가리켜야 합니다.\n- 화면 URL은 없으면 빈 문자열로 둡니다.\n- ChatGPT(MCP) 화면은 sections에 다음 형식을 씁니다. ${CHAT_RULES}. 위젯 표시 방식은 inline 카드(버튼 최대 2개, 탭·중첩 스크롤 없음) · inline 캐러셀(카드 3~8개, 카드마다 이미지와 버튼 1개) · fullscreen(왼쪽 위 닫기, 입력창 유지)입니다. 위젯 안에 로고를 넣지 마세요.\n- 화면의 drawing 필드는 그리기 도구로 그린 그림입니다. 있으면 내용을 바꾸지 말고 그대로 두세요.\n- 웹 화면은 sections에 다음 형식을 씁니다. ${WEB_RULES}.\n\n현재 작업판 JSON:\n${JSON.stringify(state, null, 2)}`;
}
async function copyAiPrompt() {
  try {
    await navigator.clipboard.writeText(aiPrompt());
    toast("현재 작업판이 포함된 AI 요청문을 복사했습니다.");
  } catch { toast("복사할 수 없습니다. 상단 내보내기로 JSON 파일을 저장해 AI에게 전달하세요."); }
}
function lab() {
  const button = `<button class="primary-button" data-action="add-experiment">+ 실험 추가</button>`;
  return `${pageHeader("ROOM 01 / EXPLORE", "실험실", "새로운 화면, 인터랙션, 가설을 독립적으로 시험하는 공간입니다.", button)}
  <div class="room-hint"><strong>실험실 사용법</strong><span>무엇을 확인하려는지 한 문장으로 적고, 결과가 정해지면 화면 목록에 반영하세요.</span></div>
  ${state.experiments.length ? `<div class="experiment-grid">${state.experiments.map((item, index) => `<article class="experiment-card" data-presence-id="${escapeHtml(item.id)}"><div class="card-top"><span class="index-label">EXPERIMENT ${String(index + 1).padStart(2, "0")}</span><span class="status ${item.status === "검토 완료" ? "done" : item.status === "보류" ? "paused" : "in-progress"}">${escapeHtml(item.status)}</span></div><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.question || "검증할 질문을 적어 주세요.")}</p>${voteBar(item)}<div class="card-actions">${validUrl(item.url) ? `<a href="${escapeHtml(validUrl(item.url))}" target="_blank" rel="noopener noreferrer">참고 링크 ↗</a>` : ""}<button data-action="edit-experiment" data-id="${escapeHtml(item.id)}">편집</button><button data-action="delete-experiment" data-id="${escapeHtml(item.id)}">삭제</button>${commentToggle(item, "experiment")}</div>${commentPanel(item, "experiment")}</article>`).join("")}</div>` : empty("⌁", "첫 실험을 준비해 볼까요?", "기능이나 화면의 가설을 적어 두면 실험실 카드로 쌓입니다.", "add-experiment", "+ 첫 실험 추가")}`;
}
function sectionLines(screen) { return String(screen.sections || "").split("\n").map((value) => value.trim()).filter(Boolean); }
// ── ChatGPT(MCP) 목업 ───────────────────────────────────────────────
// 정보 블록 줄 앞에 [사용자] [도구] [AI] [inline] [carousel] [fullscreen] [pip] [버튼] 머리표를 붙이면
// 그 화면은 폰 목업 대신 ChatGPT 대화 화면으로 그려진다. 데이터 형식(sections 문자열)은 그대로라
// 서버·board-ops.js를 바꾸지 않고, 팀원이 편집 창에서 함께 고칠 수 있다.
const CHAT_TAGS = { "틀": "frame", "frame": "frame", "사용자": "user", "user": "user", "ai": "ai", "chatgpt": "ai", "도구": "tool", "tool": "tool", "inline": "inline", "인라인": "inline", "carousel": "carousel", "캐러셀": "carousel", "fullscreen": "fullscreen", "전체화면": "fullscreen", "pip": "pip", "버튼": "button", "button": "button" };
const WIDGET_KINDS = { inline: "Inline 카드", carousel: "Inline 캐러셀", fullscreen: "Fullscreen", pip: "PiP" };
const CHAT_BLOCKS = {
  frame: { label: "웹(데스크톱)으로 보기", text: "[틀] 웹" },
  user: { label: "사용자 말", text: "[사용자] 오늘 공부 시작할래" },
  tool: { label: "앱 표시", text: "[도구] StudyMeta" },
  ai: { label: "AI 후속 답변", text: "[AI] 다음에 할 일을 짧게 제안해요." },
  inline: { label: "Inline 카드", text: "[inline] 할 일 체크리스트\n- [x] 극한의 정의 복습 | AI 제안\n- [ ] 교수님 강조 부분 | 내가 추가\n[버튼] 학습 시작 | 수정하기" },
  carousel: { label: "캐러셀", text: "[carousel] 오늘 공부할 범위\n- 2장 연속 | 개념 3개\n- 3장 미분 | 개념 4개\n- 1장 극한 | 복습\n[버튼] 이 범위로 시작" },
  fullscreen: { label: "Fullscreen", text: "[fullscreen] 오늘 공부한 내용\n- 2장 연속\n-- [x] 연속의 정의\n-- [ ] 중간값 정리\n[버튼] 내 상태 보기" },
  button: { label: "버튼", text: "[버튼] 버튼 1 | 버튼 2" },
};
// Apps SDK 가이드라인 순서: 앱 표시 → 위젯 → AI 후속 답변
const CHAT_STARTER = [CHAT_BLOCKS.user.text, CHAT_BLOCKS.tool.text, CHAT_BLOCKS.inline.text, CHAT_BLOCKS.ai.text].join("\n");
const CHAT_RULES = "[틀] 웹 을 넣으면 ChatGPT 웹(데스크톱) 화면 · [사용자] [AI] [도구] 한 줄씩 · 위젯은 AI 답변보다 먼저(앱 표시 → 위젯 → AI 후속 답변) · [inline] [carousel] [fullscreen] 제목 줄 아래에 '- 항목 | 배지', 한 단계 아래는 '-- 항목' · 체크박스는 '[ ]' '[x]' · 위젯 버튼은 [버튼] A | B";

const chatTag = (line) => { const match = /^\[([^\]]+)\]\s*(.*)$/.exec(line); const tag = match && CHAT_TAGS[match[1].trim().toLowerCase()]; return tag ? { tag, text: match[2].trim() } : null; };
const isChatScreen = (screen) => sectionLines(screen).some((line) => chatTag(line));
// [틀] 웹 이 있으면 ChatGPT 웹(데스크톱) 화면으로 그린다. 흐름도에서는 웹 화면처럼 폰 두 칸 너비.
const isChatWebNative = (screen) => sectionLines(screen).some((line) => { const tagged = chatTag(line); return tagged?.tag === "frame" && /웹|web|desktop|데스크톱|pc/i.test(tagged.text); });
// ChatGPT 보기 전환: 화면대로(auto) · 폰(phone) · 웹(web). 파일은 하나로 두고 보는 틀만 바꾼다.
// 팀원마다 이 브라우저에만 저장되어서, 한 사람이 바꿔도 다른 사람 화면은 그대로다.
const VIEW_KEY = "workboard-chat-view";
const CHAT_VIEWS = [["auto", "화면대로"], ["phone", "폰"], ["web", "웹"]];
let chatView = ["phone", "web"].includes(storage.get(VIEW_KEY)) ? storage.get(VIEW_KEY) : "auto";
const isChatWebScreen = (screen) => (chatView === "auto" ? isChatWebNative(screen) : chatView === "web");
function parseChat(screen) {
  const blocks = [];
  let widget = null;
  const addText = (text) => {
    const last = blocks[blocks.length - 1];
    if (last?.type === "ai") last.lines.push(text); else blocks.push({ type: "ai", lines: [text] });
  };
  for (const line of sectionLines(screen)) {
    const tagged = chatTag(line);
    if (tagged && WIDGET_KINDS[tagged.tag]) { widget = { type: "widget", kind: tagged.tag, title: tagged.text, items: [], body: [], buttons: [] }; blocks.push(widget); continue; }
    if (tagged?.tag === "button") {
      const labels = tagged.text.split("|").map((label) => label.trim()).filter(Boolean);
      if (widget) widget.buttons.push(...labels); else blocks.push({ type: "buttons", labels });
      continue;
    }
    if (tagged?.tag === "frame") continue;
    if (tagged) { widget = null; if (tagged.tag === "ai") blocks.push({ type: "ai", lines: [tagged.text] }); else blocks.push({ type: tagged.tag, text: tagged.text }); continue; }
    const item = /^(-+)\s*(.*)$/.exec(line);
    if (item) {
      const [text, ...badges] = item[2].split("|").map((part) => part.trim());
      if (widget) widget.items.push({ depth: Math.min(3, item[1].length), text, badge: badges.join(" · ") });
      else addText(`• ${item[2]}`);
      continue;
    }
    if (widget) widget.body.push(line); else addText(line);
  }
  return blocks;
}
// Apps SDK 디자인 가이드라인에 맞춰 설계 중에 바로 알 수 있도록 짧은 경고를 붙인다.
function chatLint(widget, counts) {
  const notes = [];
  if (widget.kind === "inline" && widget.buttons.length > 2) notes.push("Inline 카드 버튼은 최대 2개 (주 버튼 1 + 보조 1)");
  if (widget.kind === "inline" && widget.items.length > 6) notes.push("목록이 길면 '더 보기'로 나눠 보여 주기");
  if (widget.kind === "inline" && widget.items.some((item) => item.depth > 1)) notes.push("카드 안에서는 여러 단계 위계 · 탭을 피하기 (카드를 나누거나 Fullscreen)");
  if (widget.kind === "pip" && widget.buttons.length > 1) notes.push("PiP에는 컨트롤을 최소로");
  if (widget.kind === "carousel" && (widget.items.length < 3 || widget.items.length > 8)) notes.push("캐러셀은 카드 3~8개 권장");
  if (widget.kind === "carousel" && widget.buttons.length > 1) notes.push("캐러셀 카드마다 버튼은 1개");
  if ((widget.kind === "fullscreen" || widget.kind === "pip") && counts[widget.kind] > 1) notes.push(`${WIDGET_KINDS[widget.kind]}는 한 화면에 1개만 보여요`);
  return notes.length ? `<div class="cg-lint">⚠ ${notes.map(escapeHtml).join(" · ")}</div>` : "";
}
const chatCheck = (text) => String(text).replace(/^\[\s\]\s*/, "☐ ").replace(/^\[[xX✓]\]\s*/, "☑ ");
const chatBadge = (badge) => badge ? `<b class="cg-badge${/AI/.test(badge) ? " ai" : /내가|사용자/.test(badge) ? " mine" : ""}">${escapeHtml(badge)}</b>` : "";
function chatWidget(widget, counts) {
  // 로고·앱 이름은 ChatGPT가 위젯 위에 붙이므로 위젯 안에는 넣지 않는다. Fullscreen 닫기는 왼쪽 위(시스템 닫기).
  const close = '<span class="cg-close" aria-hidden="true">✕</span>';
  const head = widget.kind === "fullscreen"
    ? `<div class="cg-widget-head">${close}<strong>${escapeHtml(widget.title || "제목")}</strong><em>${WIDGET_KINDS[widget.kind]}</em></div>`
    : `<div class="cg-widget-head"><strong>${escapeHtml(widget.title || "제목")}</strong><em>${WIDGET_KINDS[widget.kind]}</em>${widget.kind === "pip" ? close : ""}</div>`;
  const body = widget.body.map((text) => `<p class="cg-widget-text">${escapeHtml(chatCheck(text))}</p>`).join("");
  const buttons = (labels) => labels.length ? `<div class="cg-widget-buttons">${labels.map((label, index) => `<span class="cg-button${index ? "" : " primary"}">${escapeHtml(label)}</span>`).join("")}</div>` : "";
  if (widget.kind === "carousel") {
    const cards = widget.items.map((item) => `<div class="cg-slide"><div class="cg-slide-art"></div><strong>${escapeHtml(chatCheck(item.text))}</strong>${item.badge ? `<small>${escapeHtml(item.badge)}</small>` : ""}${buttons(widget.buttons.slice(0, 1))}</div>`).join("");
    return `<div class="cg-carousel"><div class="cg-carousel-head"><strong>${escapeHtml(widget.title || "StudyMeta")}</strong><em>${WIDGET_KINDS.carousel}</em></div><div class="cg-slides">${cards || '<div class="cg-slide"><strong>- 항목을 추가해 주세요</strong></div>'}</div>${chatLint(widget, counts)}</div>`;
  }
  const items = widget.items.map((item) => `<div class="cg-item depth-${item.depth}"><span>${item.depth > 1 ? "└ " : ""}${escapeHtml(chatCheck(item.text))}</span>${chatBadge(item.badge)}</div>`).join("");
  return `<div class="cg-widget ${widget.kind}">${head}<div class="cg-widget-body">${body}${items}</div>${buttons(widget.buttons)}${chatLint(widget, counts)}</div>`;
}
function chatScreen(screen, desktop = false) {
  const blocks = parseChat(screen);
  const counts = blocks.reduce((total, block) => (block.type === "widget" ? { ...total, [block.kind]: (total[block.kind] || 0) + 1 } : total), {});
  const thread = [], overlays = [];
  let previous = null, fullscreenSeen = false, snippet = "";
  const appLabel = (text = "StudyMeta") => `<div class="cg-tool"><span class="cg-app-icon">S</span>${escapeHtml(text)}</div>`;
  for (const block of blocks) {
    if (block.type === "ai" && fullscreenSeen) snippet = block.lines.join(" ");
    if (block.type === "user") thread.push(`<div class="cg-user">${escapeHtml(block.text)}</div>`);
    if (block.type === "tool") thread.push(appLabel(block.text || "StudyMeta"));
    if (block.type === "ai") thread.push(`<div class="cg-ai">${block.lines.map((text) => escapeHtml(text)).join("<br>")}</div>`);
    if (block.type === "buttons") thread.push(`<div class="cg-widget-buttons loose">${block.labels.map((label) => `<span class="cg-button">${escapeHtml(label)}</span>`).join("")}</div><div class="cg-lint">⚠ 버튼은 위젯 안에서만 쓸 수 있어요</div>`);
    if (block.type === "widget" && (block.kind === "inline" || block.kind === "carousel")) {
      // 가이드라인: 위젯은 늘 AI 답변보다 먼저 나오고, 위젯 위에는 ChatGPT가 앱 이름과 아이콘을 붙인다.
      if (previous === "ai") thread.push(`<div class="cg-lint">⚠ 위젯은 AI 답변보다 먼저 나와요 — AI 답변을 위젯 아래로 옮겨 주세요</div>`);
      if (previous !== "tool") thread.push(appLabel());
      thread.push(chatWidget(block, counts));
    }
    // Fullscreen·PiP는 대화 위에 겹쳐 뜬다. 여러 개면 마지막 것만 보인다.
    if (block.type === "widget" && (block.kind === "fullscreen" || block.kind === "pip")) overlays[block.kind === "pip" ? 1 : 0] = chatWidget(block, counts);
    if (block.type === "widget" && block.kind === "fullscreen") fullscreenSeen = true;
    previous = block.type;
  }
  // Fullscreen에서는 AI 답변이 입력창 위에 짧은 조각으로 잠깐 떠요.
  if (overlays[0] && snippet) overlays.push(`<div class="cg-snippet">${escapeHtml(snippet)}</div>`);
  const main = `<div class="cg-header"><strong>ChatGPT${desktop ? " ▾" : ""}</strong><span>StudyMeta 연결됨</span></div><div class="cg-thread">${thread.join("") || '<div class="cg-empty">대화 블록을 추가해 주세요</div>'}</div>${overlays.filter(Boolean).join("")}<div class="cg-composer"><span>무엇이든 물어보세요</span><b>⬆</b></div>`;
  if (desktop) return `<div class="cg-app cg-desktop${overlays[0] ? " has-fullscreen" : ""}"><aside class="cg-side"><strong>ChatGPT</strong><span>＋ 새 채팅</span><span><i class="cg-app-icon">S</i> StudyMeta</span><small>최근</small><span class="active">오늘의 학습</span><span>미적분 중간고사 계획</span><span>연속 개념 정리</span></aside><div class="cg-main">${main}</div></div>`;
  return `<div class="cg-app${overlays[0] ? " has-fullscreen" : ""}">${main}</div>`;
}
const chatDesktop = (screen, footer) => `<div class="wb-shell cg-desktop-shell">${chatScreen(screen, true)}${footer}</div>`;
const chatMock = (screen, footer) => (isChatWebScreen(screen) ? chatDesktop(screen, footer) : chatPhone(screen, footer));
function chatPhone(screen, footer) {
  return `<div class="phone-frame flow-phone cg-phone"><div class="phone-island"></div><div class="phone-screen"><div class="phone-top"><span>9:41</span><span>●●● ▰</span></div>${chatScreen(screen)}${footer}</div><div class="phone-home"></div></div>`;
}
function insertChatBlock(kind, blocks = CHAT_BLOCKS) {
  const textarea = $("#editor-fields textarea[name='sections']");
  const block = blocks[kind];
  if (!textarea || !block) return;
  const start = textarea.selectionStart ?? textarea.value.length, end = textarea.selectionEnd ?? start;
  const before = textarea.value.slice(0, start), after = textarea.value.slice(end);
  const text = `${before && !before.endsWith("\n") ? "\n" : ""}${block.text}${after && !after.startsWith("\n") ? "\n" : ""}`;
  textarea.setRangeText(text, start, end, "end");
  textarea.focus();
  updateChatPreview();
}
function updateChatPreview() {
  const preview = $("#cg-preview");
  const sections = $("#editor-fields textarea[name='sections']")?.value || "";
  if (!preview) return;
  const draft = { sections };
  preview.innerHTML = isWebScreen(draft) ? webShell(draft, "") : isChatScreen(draft) ? chatMock(draft, "") : `<p class="cg-preview-empty">위 버튼으로 ChatGPT 블록이나 웹 블록을 추가하면 여기에 미리보기가 나타나요.</p>`;
}
function chatEditorTools() {
  const toolbar = (label, action, blocks, rules, highlight) => `<div class="cg-toolbar" role="group" aria-label="${label}"><span>${label}</span>${Object.entries(blocks).map(([kind, block]) => `<button type="button" class="${highlight(kind) ? "widget" : ""}" data-action="${action}" data-id="${kind}">＋ ${escapeHtml(block.label)}</button>`).join("")}</div><small class="cg-rules">${escapeHtml(rules)}</small>`;
  return `<div class="cg-tools">${toolbar("ChatGPT 블록 추가", "insert-chat-block", CHAT_BLOCKS, CHAT_RULES, (kind) => WIDGET_KINDS[kind])}${toolbar("웹 블록 추가", "insert-web-block", WEB_BLOCKS, WEB_RULES, (kind) => kind === "card" || kind === "aside")}<div class="cg-preview-wrap"><span>미리보기</span><div id="cg-preview" aria-live="polite"></div></div></div>`;
}
function injectChatStyles() {
  if (document.getElementById("cg-styles")) return;
  const style = document.createElement("style");
  style.id = "cg-styles";
  style.textContent = `
.cg-phone .phone-screen{display:flex;flex-direction:column}
.cg-app{position:relative;flex:1 1 0;min-height:340px;display:flex;flex-direction:column;overflow:hidden;background:#fff;color:#0d0d0d;font:10px/1.45 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;text-align:left}
.cg-header{display:flex;align-items:baseline;justify-content:space-between;gap:6px;padding:6px 10px;border-bottom:1px solid #ececec}
.cg-header strong{font-size:11px}.cg-header span{color:#8e8e8e;font-size:8.5px}
.cg-thread{flex:1 1 0;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;gap:6px;padding:8px;overflow:hidden}
.cg-user{align-self:flex-end;max-width:82%;padding:5px 9px;border-radius:12px;background:#f0f0f0;white-space:pre-wrap}
.cg-ai{max-width:100%;padding:0 2px}
.cg-tool{display:flex;align-items:center;gap:5px;color:#8e8e8e;font-size:9px}
.cg-app-icon{display:inline-grid;place-items:center;flex:none;width:14px;height:14px;border-radius:4px;background:#7c6cd8;color:#fff;font-size:8px;font-weight:700;font-style:normal}
.cg-widget,.cg-carousel{border:1px solid #e3e3e3;border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.cg-widget-head,.cg-carousel-head{display:flex;align-items:center;gap:5px;padding:6px 8px;border-bottom:1px solid #f0f0f0}
.cg-widget-head strong,.cg-carousel-head strong{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cg-widget-head em,.cg-carousel-head em{flex:none;padding:1px 5px;border-radius:6px;background:#f1efff;color:#5b4bc4;font-size:7.5px;font-style:normal;font-weight:700}
.cg-close{color:#8e8e8e}
.cg-widget-body{padding:5px 8px;display:grid;gap:3px}
.cg-widget-text{margin:0;color:#444}
.cg-item{display:flex;align-items:center;justify-content:space-between;gap:6px}
.cg-item span{min-width:0}.cg-item.depth-2{padding-left:10px}.cg-item.depth-3{padding-left:20px}.cg-item.depth-1+.cg-item.depth-1{border-top:1px dashed #f0f0f0;padding-top:3px}
.cg-badge{flex:none;padding:1px 5px;border-radius:6px;background:#f2f2f2;color:#555;font-size:7.5px}
.cg-badge.ai{background:#f1efff;color:#5b4bc4}.cg-badge.mine{background:#e8f6ee;color:#1f7a4a}
.cg-widget-buttons{display:flex;flex-wrap:wrap;gap:4px;padding:0 8px 7px}.cg-widget-buttons.loose{padding:0}
.cg-button{padding:3px 8px;border:1px solid #d9d9d9;border-radius:999px;font-size:8.5px;font-weight:600}
.cg-button.primary{border-color:#6a58d6;background:#6a58d6;color:#fff}
.cg-slides{display:flex;gap:6px;padding:7px 8px;overflow:hidden}
.cg-slide{flex:0 0 62%;display:grid;gap:3px;padding:6px;border:1px solid #ececec;border-radius:10px}
.cg-slide small{color:#8e8e8e}.cg-slide .cg-widget-buttons{padding:2px 0 0}
.cg-slide-art{height:30px;border-radius:7px;background:linear-gradient(135deg,#efedff,#f7f7f7)}
.cg-widget.fullscreen{position:absolute;top:0;left:0;right:0;bottom:34px;z-index:2;display:flex;flex-direction:column;border:0;border-radius:0;box-shadow:none}
.cg-widget.fullscreen .cg-widget-body{flex:1;align-content:start;overflow:hidden}
.cg-widget.pip{position:absolute;top:30px;left:6px;right:6px;z-index:3;box-shadow:0 6px 18px rgba(0,0,0,.18)}
.cg-snippet{position:absolute;left:10px;right:10px;bottom:40px;z-index:4;padding:5px 9px;border-radius:12px;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.16);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cg-lint{margin:0 8px 6px;padding:3px 6px;border-radius:6px;background:#fff6e5;color:#9a5b00;font-size:8px}
.cg-thread>.cg-lint{margin:0}
.cg-composer{display:flex;align-items:center;justify-content:space-between;margin:0 8px 8px;padding:6px 6px 6px 10px;border:1px solid #e3e3e3;border-radius:999px;color:#8e8e8e;position:relative;z-index:4;background:#fff}
.cg-composer b{display:grid;place-items:center;width:16px;height:16px;border-radius:50%;background:#0d0d0d;color:#fff;font-size:9px}
.cg-empty{margin:auto;color:#b0b0b0}
.cg-tools{display:grid;gap:8px;margin:-4px 0 14px}
.cg-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.cg-toolbar span{width:100%;font-size:12px;font-weight:700}
.cg-toolbar button{padding:5px 10px;border:1px solid #d9d9d9;border-radius:999px;background:#fff;color:#333;font:inherit;font-size:12px;cursor:pointer}
.cg-toolbar button.widget{border-color:#c9c1f3;background:#f5f3ff;color:#4a3ab0}
.cg-toolbar button:hover{border-color:#7c6cd8}
.cg-toolbar button:focus-visible{outline:2px solid #7c6cd8;outline-offset:2px}
.cg-rules{color:#777;font-size:11px;line-height:1.5}
.cg-preview-wrap{display:grid;gap:6px;padding:10px;border-radius:12px;background:#f6f6f8}
.cg-preview-wrap>span{font-size:12px;font-weight:700}
#cg-preview{display:flex;justify-content:center}
#cg-preview .cg-phone{width:248px;max-width:100%}
#cg-preview .cg-app{min-height:380px}
.cg-preview-empty{margin:0;color:#888;font-size:12px}
.cg-to-draw{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:-6px 0 14px}
.cg-to-draw button{padding:6px 12px;border:1px solid #7c6cd8;border-radius:8px;background:#efedff;color:#4a3ab0;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.cg-to-draw small{color:#777;font-size:11px}
.cg-app.cg-desktop{flex-direction:row;flex:none;height:400px;min-height:0;border:1px solid #d9dbe3;border-radius:10px}
.cg-side{flex:none;width:112px;display:flex;flex-direction:column;gap:2px;padding:10px 7px;background:#f9f9f9;border-right:1px solid #ececec;color:#333;font-size:8.5px;overflow:hidden}
.cg-side strong{margin:0 5px 6px;color:#0d0d0d;font-size:11px}
.cg-side span{display:flex;align-items:center;gap:4px;padding:3px 5px;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cg-side span.active{background:#ececec}
.cg-side small{margin:8px 5px 2px;color:#8e8e8e;font-size:8px}
.cg-main{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}
.cg-desktop .cg-header{border-bottom:0}
.cg-desktop .cg-thread{width:100%;max-width:340px;align-self:center}
.cg-desktop .cg-composer{width:calc(100% - 16px);max-width:340px;align-self:center}
.cg-desktop .cg-widget.pip{top:34px;left:50%;right:auto;width:min(340px,92%);transform:translateX(-50%)}
.cg-desktop .cg-snippet{left:50%;right:auto;width:min(320px,88%);transform:translateX(-50%)}
.cg-desktop .cg-slide{flex-basis:44%}
.wire-card .cg-app.cg-desktop{height:360px}
.preview-center .cg-app.cg-desktop{height:540px;font-size:11px}
#cg-preview .cg-app.cg-desktop{height:380px}
`;
  document.head.append(style);
}
// ── 웹 목업 ─────────────────────────────────────────────────────────
// 정보 블록에 [web] [메뉴] [제목] [탭] [배너] [카드] [목록] [입력] [사이드] 머리표가 있으면 브라우저 화면으로 그린다.
// 웹 화면은 흐름도에서 폰 두 칸 너비(WEB_W)를 차지한다.
const WEB_W = NODE_W * 2 + 62;
const WEB_TAGS = { "web": "page", "웹": "page", "페이지": "page", "메뉴": "menu", "menu": "menu", "제목": "heading", "title": "heading", "탭": "tabs", "tabs": "tabs", "배너": "banner", "banner": "banner", "카드": "card", "card": "card", "목록": "list", "list": "list", "사이드": "aside", "aside": "aside", "입력": "input", "input": "input", "버튼": "button", "button": "button" };
const WEB_BLOCKS = {
  page: { label: "페이지 · 메뉴", text: "[web] 홈 · 과목 대시보드\n[메뉴] *홈 | 계획 | 학습 | 정리" },
  heading: { label: "제목", text: "[제목] 안녕하세요! 오늘은 무엇부터 해볼까요?" },
  tabs: { label: "탭", text: "[탭] *미적분학 | 일반물리학 | ＋" },
  banner: { label: "배너", text: "[배너] 가장 가까운 시험은 미적분학 중간고사예요 (D-25)" },
  card: { label: "카드", text: "[카드] 미적분학\n- 중간고사 | D-25\n- 중간값 정리 | 도움이 필요해요\n[버튼] 과목 열기" },
  list: { label: "목록", text: "[목록] 오늘 할 일\n- [ ] 연속 · 예제 5개 | AI 제안\n- [ ] 교수님 강조 부분 | 내가 추가" },
  input: { label: "입력칸", text: "[입력] 과목명 | 미적분학" },
  aside: { label: "사이드 패널", text: "[사이드] 다가오는 시험\n- 일반물리학 퀴즈 | D-9\n- 미적분학 중간고사 | D-25" },
  button: { label: "버튼", text: "[버튼] 버튼 1 | 버튼 2" },
};
const WEB_STARTER = `[web] 홈 · 과목 대시보드
[메뉴] *홈 | 계획 | 학습 | 정리 | 설정
[제목] 안녕하세요! 오늘은 무엇부터 해볼까요?
[배너] 가장 가까운 시험은 일반물리학 퀴즈예요 (D-9)
[버튼] 오늘 학습 시작
[카드] 미적분학
- 중간고사 | D-25
- 할 일 | 3 / 7
- 중간값 정리 | 도움이 필요해요
[버튼] 과목 열기
[카드] 일반물리학
- 퀴즈 | D-9
- 할 일 | 1 / 4
- 운동 법칙 | 복습 추천
[버튼] 과목 열기
[카드] ＋ 과목 추가
과목 · 일정 · 시험범위 · PDF를 등록해요
[버튼] 등록하기
[목록] 오늘 할 일
- [ ] 연속 · 예제 5개 | AI 제안
- [ ] 교수님 강조 부분 정리 | 내가 추가
- [x] 극한의 정의 복습 | AI 제안
[사이드] 다가오는 시험
- 일반물리학 퀴즈 | D-9
- 미적분학 중간고사 | D-25`;
const WEB_RULES = "[web] 탭 제목 · [메뉴] *홈 | 계획 (*는 선택된 메뉴) · [제목] [배너] [탭] 한 줄 · [카드] [목록] [사이드] 제목 줄 아래에 '- 항목 | 배지', '-- 하위 항목' · [입력] 라벨 | 값 · [버튼] A | B는 바로 위 블록의 버튼 · 이어지는 [카드]는 격자로 배치";
const STATE_BADGES = ["확인 필요", "도움이 필요해요", "복습 추천"];

const webTag = (line) => { const match = /^\[([^\]]+)\]\s*(.*)$/.exec(line); const tag = match && WEB_TAGS[match[1].trim().toLowerCase()]; return tag ? { tag, text: match[2].trim() } : null; };
const isWebScreen = (screen) => sectionLines(screen).some((line) => { const tagged = webTag(line); return tagged && tagged.tag !== "button"; });
const barItems = (text) => {
  const items = String(text).split("|").map((item) => item.trim()).filter(Boolean);
  const active = Math.max(0, items.findIndex((item) => item.startsWith("*")));
  return items.map((item, index) => ({ label: item.replace(/^\*\s*/, ""), active: index === active }));
};
function parseWeb(screen) {
  const page = { title: "", menu: [], main: [], aside: [] };
  let current = null;
  for (const line of sectionLines(screen)) {
    const tagged = webTag(line);
    if (tagged) {
      const { tag, text } = tagged;
      if (tag === "page") { page.title = text; continue; }
      if (tag === "menu") { page.menu = barItems(text); continue; }
      if (tag === "button") { const labels = text.split("|").map((label) => label.trim()).filter(Boolean); if (current) current.buttons.push(...labels); else page.main.push({ type: "buttons", labels }); continue; }
      if (tag === "heading" || tag === "tabs" || tag === "input") {
        current = null;
        if (tag === "heading") page.main.push({ type: "heading", text });
        if (tag === "tabs") page.main.push({ type: "tabs", items: barItems(text) });
        if (tag === "input") { const [label, ...value] = text.split("|").map((part) => part.trim()); page.main.push({ type: "input", label, value: value.join(" · ") }); }
        continue;
      }
      current = { type: tag, title: text, items: [], body: [], buttons: [] };
      (tag === "aside" ? page.aside : page.main).push(current);
      continue;
    }
    const item = /^(-+)\s*(.*)$/.exec(line);
    if (item && current && current.type !== "banner") {
      const [text, ...badges] = item[2].split("|").map((part) => part.trim());
      current.items.push({ depth: Math.min(3, item[1].length), text, badge: badges.join(" · ") });
    } else if (current?.type === "banner") current.title = `${current.title} ${line}`.trim();
    else if (current) current.body.push(line);
    else page.main.push({ type: "text", text: line });
  }
  return page;
}
const webBadgeTone = (badge) => (/확인 필요/.test(badge) ? "red" : /도움이 필요|늘고 있/.test(badge) ? "amber" : /복습/.test(badge) ? "blue" : /AI/.test(badge) ? "purple" : /내가|완료|좋아지|능숙|안정/.test(badge) ? "green" : /^D-\d/.test(badge) ? "dark" : "");
const webButtons = (labels) => (labels.length ? `<div class="wb-buttons">${labels.map((label, index) => `<span class="wb-button${index ? "" : " primary"}">${escapeHtml(label)}</span>`).join("")}</div>` : "");
function webBlock(block) {
  const rows = block.items.map((item) => `<div class="wb-row depth-${item.depth}"><span>${item.depth > 1 ? "└ " : ""}${escapeHtml(chatCheck(item.text))}</span>${item.badge ? `<b class="wb-badge ${webBadgeTone(item.badge)}">${escapeHtml(item.badge)}</b>` : ""}</div>`).join("");
  const stateBadges = block.items.filter((item) => STATE_BADGES.some((badge) => item.badge.includes(badge))).length;
  const lint = block.type === "card" && stateBadges > 2 ? `<div class="wb-lint">⚠ 카드당 상태 배지는 2개까지 (design.md)</div>` : "";
  const cls = block.type === "aside" ? "wb-panel" : block.type === "list" ? "wb-list" : "wb-card";
  return `<section class="${cls}">${block.title ? `<strong>${escapeHtml(block.title)}</strong>` : ""}${block.body.map((text) => `<p class="wb-text">${escapeHtml(chatCheck(text))}</p>`).join("")}${rows}${webButtons(block.buttons)}${lint}</section>`;
}
function webPage(screen) {
  const page = parseWeb(screen);
  const main = [];
  for (let index = 0; index < page.main.length; index += 1) {
    const block = page.main[index];
    // 이어지는 카드와 입력칸은 한 격자로 묶는다.
    if (block.type === "card" || block.type === "input") {
      const group = [];
      while (page.main[index]?.type === block.type) group.push(page.main[index++]);
      index -= 1;
      main.push(block.type === "card"
        ? `<div class="wb-grid">${group.map(webBlock).join("")}</div>`
        : `<div class="wb-form">${group.map((field) => `<label class="wb-input"><span>${escapeHtml(field.label)}</span><b>${escapeHtml(field.value || "입력해 주세요")}</b></label>`).join("")}</div>`);
      continue;
    }
    if (block.type === "heading") main.push(`<h4 class="wb-heading">${escapeHtml(block.text)}</h4>`);
    if (block.type === "tabs") main.push(`<div class="wb-tabs">${block.items.map((item) => `<span class="wb-tab${item.active ? " active" : ""}">${escapeHtml(item.label)}</span>`).join("")}</div>`);
    if (block.type === "banner") main.push(`<div class="wb-banner"><span>${escapeHtml(block.title)}</span>${webButtons(block.buttons)}</div>`);
    if (block.type === "list") main.push(webBlock(block));
    if (block.type === "buttons") main.push(webButtons(block.labels));
    if (block.type === "text") main.push(`<p class="wb-text">${escapeHtml(block.text)}</p>`);
  }
  const menu = page.menu.length ? `<nav class="wb-side"><strong class="wb-logo">StudyMeta</strong>${page.menu.map((item) => `<span class="wb-nav${item.active ? " active" : ""}">${escapeHtml(item.label)}</span>`).join("")}</nav>` : "";
  const aside = page.aside.length ? `<aside class="wb-aside">${page.aside.map(webBlock).join("")}</aside>` : "";
  return `<div class="wb-web${menu ? " has-menu" : ""}${aside ? " has-aside" : ""}"><div class="wb-chrome"><i></i><i></i><i></i><span class="wb-url">studymeta.app${page.title ? ` · ${escapeHtml(page.title)}` : ""}</span></div><div class="wb-page">${menu}<main class="wb-main">${main.join("") || '<p class="wb-text">블록을 추가해 주세요</p>'}</main>${aside}</div></div>`;
}
const webShell = (screen, footer) => `<div class="wb-shell">${webPage(screen)}${footer}</div>`;
const nodeWidth = (screen) => (screen && isWideScreen(screen) ? WEB_W : NODE_W);
function injectWebStyles() {
  if (document.getElementById("wb-styles")) return;
  const style = document.createElement("style");
  style.id = "wb-styles";
  style.textContent = `
.wb-shell{display:grid;gap:6px;width:100%}
.wb-web{container-type:inline-size;display:flex;flex-direction:column;height:400px;border:1px solid #d9dbe3;border-radius:10px;overflow:hidden;background:#f7f8fb;color:#1d2330;font:9.5px/1.45 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;text-align:left}
.wb-chrome{display:flex;align-items:center;gap:4px;padding:5px 8px;background:#eceef3;border-bottom:1px solid #dfe2ea}
.wb-chrome i{flex:none;width:7px;height:7px;border-radius:50%;background:#ff5f57}.wb-chrome i:nth-child(2){background:#febc2e}.wb-chrome i:nth-child(3){background:#28c840}
.wb-url{flex:1;min-width:0;margin-left:8px;padding:2px 8px;border-radius:6px;background:#fff;color:#6b7280;font-size:8.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wb-page{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr);overflow:hidden}
.wb-web.has-menu .wb-page{grid-template-columns:90px minmax(0,1fr)}
.wb-web.has-aside .wb-page{grid-template-columns:minmax(0,1fr) 138px}
.wb-web.has-menu.has-aside .wb-page{grid-template-columns:90px minmax(0,1fr) 138px}
.wb-side{display:flex;flex-direction:column;gap:2px;padding:9px 7px;background:#fff;border-right:1px solid #e6e8ef;overflow:hidden}
.wb-logo{margin:0 5px 8px;color:#4a3ab0;font-size:10.5px}
.wb-nav{padding:4px 6px;border-radius:6px;color:#4b5563;white-space:nowrap}.wb-nav.active{background:#efedff;color:#4a3ab0;font-weight:700}
.wb-main{min-width:0;display:flex;flex-direction:column;gap:7px;padding:10px 11px;overflow:hidden}
.wb-heading{margin:0;font-size:13px;font-weight:750;letter-spacing:-.01em}
.wb-tabs{display:flex;gap:2px;border-bottom:1px solid #e3e5ec;overflow:hidden}.wb-tab{padding:3px 8px;color:#6b7280;white-space:nowrap}.wb-tab.active{color:#1d2330;font-weight:700;box-shadow:inset 0 -2px #7c6cd8}
.wb-banner{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;padding:7px 9px;border-radius:8px;background:#efedff;color:#3b2f94}.wb-banner .wb-buttons{margin:0}
.wb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px}
.wb-card,.wb-list,.wb-panel{display:flex;flex-direction:column;gap:4px;min-width:0;padding:8px 9px;border:1px solid #e3e5ec;border-radius:9px;background:#fff}
.wb-card>strong,.wb-list>strong,.wb-panel>strong{font-size:10px}
.wb-text{margin:0;color:#4b5563;overflow-wrap:anywhere}
.wb-row{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0}
.wb-row>span{min-width:0;overflow-wrap:anywhere}.wb-row.depth-2{padding-left:10px}.wb-row.depth-3{padding-left:20px}
.wb-list .wb-row.depth-1{font-weight:600}.wb-row+.wb-row.depth-1{border-top:1px dashed #eceef3;padding-top:3px}
.wb-badge{flex:none;max-width:62%;padding:1px 6px;border-radius:999px;background:#f1f2f6;color:#4b5563;font-size:8px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wb-badge.red{background:#fdecec;color:#b42318}.wb-badge.amber{background:#fff4e0;color:#9a5b00}.wb-badge.blue{background:#e8f1fd;color:#1d5fbf}.wb-badge.purple{background:#f1efff;color:#4a3ab0}.wb-badge.green{background:#e7f6ee;color:#1f7a4a}.wb-badge.dark{background:#1d2330;color:#fff}
.wb-buttons{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
.wb-button{padding:3px 9px;border:1px solid #d5d8e1;border-radius:7px;background:#fff;font-size:8.5px;font-weight:600;white-space:nowrap}.wb-button.primary{border-color:#4a3ab0;background:#4a3ab0;color:#fff}
.wb-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px}
.wb-input{display:grid;gap:2px}.wb-input span{color:#6b7280;font-size:8px}.wb-input b{padding:5px 7px;border:1px solid #d5d8e1;border-radius:7px;background:#fff;font-weight:500}
.wb-aside{display:flex;flex-direction:column;gap:7px;min-width:0;padding:10px 9px 10px 0;overflow:hidden}
.wb-lint{padding:3px 6px;border-radius:6px;background:#fff6e5;color:#9a5b00;font-size:8px}
@container (max-width:440px){.wb-web.has-menu .wb-page,.wb-web.has-aside .wb-page,.wb-web.has-menu.has-aside .wb-page{grid-template-columns:minmax(0,1fr);grid-auto-rows:max-content}.wb-side{flex-direction:row;align-items:center;padding:5px 7px;border-right:0;border-bottom:1px solid #e6e8ef}.wb-logo{margin:0 6px 0 0}.wb-aside{padding:0 11px 10px}}
.flow-node.web-node{width:${WEB_W}px}
.wire-card.wb-wire-card{grid-column:span 2}
.wire-card .wb-web{height:360px}
.preview-center .wb-shell{width:min(860px,100%)}.preview-center .wb-web{height:540px;font-size:11px}
#cg-preview .wb-shell{width:100%}#cg-preview .wb-web{height:380px}
@media (max-width:900px){.wire-card.wb-wire-card{grid-column:auto}}
`;
  document.head.append(style);
}
// ── 그리기 도구 ─────────────────────────────────────────────────────
// 화면마다 drawing { frame, shapes } 를 저장한다(board-ops.js의 drawingField가 검사).
// 도형이 하나라도 있으면 그 화면은 글자 블록 대신 그림으로 그려진다. 좌표는 틀의 가상 크기 기준이다.
const DRAW_FRAME_SIZE = {
  phone: { label: "폰", width: 390, height: 760 },
  web: { label: "웹", width: 1280, height: 800 },
  chatgpt: { label: "ChatGPT 모바일", width: 390, height: 760 },
  "chatgpt-web": { label: "ChatGPT 웹", width: 1280, height: 800 },
};
const WIDE_FRAMES = new Set(["web", "chatgpt-web"]);
const CHAT_FRAMES = new Set(["chatgpt", "chatgpt-web"]);
// ChatGPT 틀에서 대화가 쌓이는 영역과 요소 도장을 놓을 자리. 도장 좌표(폭 390 기준)를 area 폭에 맞춰 늘린다.
const CHAT_LAYOUT = {
  chatgpt: { top: 48, bottom: 696, column: { x: 0, w: 390 }, full: { x: 0, w: 390, y: 48 }, pip: { x: 0, w: 390, y: 60 } },
  "chatgpt-web": { top: 64, bottom: 704, column: { x: 470, w: 600 }, full: { x: 260, w: 1020, y: 56 }, pip: { x: 668, w: 613, y: 70 } },
};
function frameUnderlay(frame) {
  if (frame === "chatgpt") return `<g pointer-events="none"><rect x="0" y="0" width="390" height="48" fill="#ffffff"/><line x1="0" y1="48" x2="390" y2="48" stroke="#ececec"/><text x="18" y="30" font-size="17" font-weight="700" fill="#0d0d0d">ChatGPT</text><text x="372" y="30" font-size="12" fill="#8e8e8e" text-anchor="end">StudyMeta 연결됨</text><rect x="14" y="704" width="362" height="44" rx="22" fill="#ffffff" stroke="#e3e3e3"/><text x="34" y="731" font-size="14" fill="#8e8e8e">무엇이든 물어보세요</text><circle cx="352" cy="726" r="14" fill="#0d0d0d"/><text x="352" y="731" font-size="14" fill="#fff" text-anchor="middle">↑</text></g>`;
  if (frame === "chatgpt-web") {
    const chats = ["오늘의 학습", "미적분 중간고사 계획", "연속 개념 정리", "물리 퀴즈 준비"];
    return `<g pointer-events="none"><rect x="0" y="0" width="260" height="800" fill="#f9f9f9"/><line x1="260" y1="0" x2="260" y2="800" stroke="#ececec"/><text x="24" y="42" font-size="20" font-weight="700" fill="#0d0d0d">ChatGPT</text><text x="24" y="88" font-size="15" fill="#0d0d0d">＋ 새 채팅</text><rect x="24" y="112" width="20" height="20" rx="5" fill="#7c6cd8"/><text x="34" y="127" font-size="12" font-weight="700" fill="#fff" text-anchor="middle">S</text><text x="52" y="127" font-size="15" fill="#0d0d0d">StudyMeta</text><text x="24" y="178" font-size="12" fill="#8e8e8e">최근</text>${chats.map((chat, index) => `${index ? "" : `<rect x="14" y="${192 + index * 34}" width="232" height="30" rx="8" fill="#ececec"/>`}<text x="24" y="${212 + index * 34}" font-size="14" fill="#333">${chat}</text>`).join("")}<text x="284" y="38" font-size="19" font-weight="700" fill="#0d0d0d">ChatGPT ▾</text><text x="1256" y="38" font-size="13" fill="#8e8e8e" text-anchor="end">StudyMeta 연결됨</text><rect x="470" y="716" width="600" height="56" rx="28" fill="#ffffff" stroke="#e3e3e3"/><text x="496" y="750" font-size="15" fill="#8e8e8e">무엇이든 물어보세요</text><circle cx="1038" cy="744" r="17" fill="#0d0d0d"/><text x="1038" y="750" font-size="16" fill="#fff" text-anchor="middle">↑</text></g>`;
  }
  return "";
}
// ChatGPT 요소 도장: 기본 도형 몇 개를 묶어 한 번에 넣는다. 좌표는 폭 390 기준, y는 넣을 위치 기준 상대 좌표.
// Apps SDK 가이드라인 기준: 앱 표시(ChatGPT가 붙임) → 위젯 → AI 후속 답변. 위젯 안에는 로고를 넣지 않고,
// 주 버튼은 브랜드 색, Inline 카드 버튼은 최대 2개, 캐러셀 카드는 이미지 + 버튼 1개, Fullscreen은 왼쪽 위 닫기.
const carouselCard = (x, n) => [
  { type: "rect", x, y: 0, w: 170, h: 176, tone: "line", round: true },
  { type: "image", x: x + 10, y: 10, w: 150, h: 70, round: true },
  { type: "text", x: x + 10, y: 88, text: `카드 ${n}`, tone: "line", size: "m" },
  { type: "text", x: x + 10, y: 112, text: "한 줄 정보", tone: "soft", size: "s" },
  { type: "rect", x: x + 10, y: 138, w: 80, h: 28, text: "선택", tone: "brand", size: "s", round: true },
];
const CHAT_STAMPS = {
  user: { label: "사용자 말풍선", shapes: [{ type: "rect", x: 150, y: 0, w: 222, h: 44, text: "사용자 메시지", tone: "soft", size: "s", round: true }] },
  tool: { label: "앱 표시", shapes: [{ type: "rect", x: 18, y: 2, w: 18, h: 18, text: "S", tone: "brand", size: "s", round: true }, { type: "text", x: 42, y: 0, text: "StudyMeta", tone: "soft", size: "s" }] },
  inline: { label: "Inline 카드", shapes: [
    { type: "rect", x: 16, y: 0, w: 358, h: 150, tone: "line", round: true },
    { type: "text", x: 30, y: 14, text: "카드 제목", tone: "line", size: "m" },
    { type: "text", x: 30, y: 46, text: "필요한 정보만 짧게 보여줘요", tone: "soft", size: "s" },
    { type: "rect", x: 30, y: 104, w: 120, h: 32, text: "주 버튼", tone: "brand", size: "s", round: true },
    { type: "rect", x: 160, y: 104, w: 120, h: 32, text: "보조 버튼", tone: "line", size: "s", round: true },
  ] },
  carousel: { label: "캐러셀", shapes: [...carouselCard(16, 1), ...carouselCard(196, 2), ...carouselCard(376, 3)] },
  ai: { label: "AI 후속 답변", shapes: [{ type: "text", x: 18, y: 0, text: "다음에 할 일을 짧게 제안해요", tone: "line", size: "m" }] },
  fullscreen: { label: "Fullscreen", area: "full", shapes: [
    { type: "rect", x: 0, y: 0, w: 390, h: 648, tone: "line" },
    { type: "text", x: 14, y: 12, text: "✕", tone: "soft", size: "m" },
    { type: "text", x: 44, y: 12, text: "화면 제목", tone: "line", size: "m" },
    { type: "text", x: 18, y: 56, text: "넓은 공간이 필요한 편집 · 탐색 내용", tone: "soft", size: "s" },
    { type: "rect", x: 16, y: 588, w: 300, h: 40, text: "AI 답변 조각…", tone: "soft", size: "s", round: true },
  ] },
};
const DRAW_TOOL_LIST = [["select", "선택", "V", "↖"], ["rect", "사각형", "R", "▭"], ["ellipse", "원", "O", "◯"], ["line", "선", "L", "╱"], ["arrow", "화살표", "A", "↗"], ["text", "텍스트", "T", "T"], ["image", "이미지 자리", "I", "⊠"]];
const DRAW_TONE_LIST = [["line", "선만"], ["soft", "회색"], ["accent", "연보라"], ["brand", "브랜드"], ["dark", "검정"]];
const DRAW_SIZE_LIST = [["s", "작게"], ["m", "보통"], ["l", "크게"]];
const TONE_STYLE = {
  line: { fill: "#ffffff", stroke: "#1d2330", text: "#1d2330" },
  soft: { fill: "#eef0f4", stroke: "#b9bfcb", text: "#1d2330" },
  accent: { fill: "#efedff", stroke: "#7c6cd8", text: "#4a3ab0" },
  dark: { fill: "#1d2330", stroke: "#1d2330", text: "#ffffff" },
  brand: { fill: "#6a58d6", stroke: "#6a58d6", text: "#ffffff" }, // 가이드라인: 주 버튼에는 브랜드 색
};
const FONT_SIZE = { s: 13, m: 16, l: 24 };
const FONT_MIN = 8, FONT_MAX = 120;
// 도형의 글자 크기(px). 작게/보통/크게 또는 숫자를 모두 받는다.
const sizePx = (size) => (typeof size === "number" ? size : FONT_SIZE[size] || FONT_SIZE.m);
const clampFont = (value) => Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(Number(value) || FONT_SIZE.m)));
const LINE_TYPES = new Set(["line", "arrow"]);
const rawDrawing = (screen) => (screen?.drawing && Array.isArray(screen.drawing.shapes) ? screen.drawing : null);
// 보기 전환 중이면 ChatGPT 그림을 보는 틀(모바일 ↔ 웹)로 옮겨서 돌려준다. 저장된 그림은 바꾸지 않는다.
const drawingOf = (screen) => { const raw = rawDrawing(screen); return raw ? viewDrawing(raw, screen) : null; };
const hasDrawing = (screen) => (rawDrawing(screen)?.shapes.length || 0) > 0;
const isWideScreen = (screen) => (hasDrawing(screen) ? WIDE_FRAMES.has(drawingOf(screen).frame) : isWebScreen(screen) || (isChatScreen(screen) && isChatWebScreen(screen)));
// 보기 전환과 상관없이 원래 저장된 모양이 넓은지(흐름도 간격을 맞출 때 쓴다).
const isWideNative = (screen) => (hasDrawing(screen) ? WIDE_FRAMES.has(screen.drawing.frame) : isWebScreen(screen) || (isChatScreen(screen) && isChatWebNative(screen)));
const isChatLike = (screen) => (hasDrawing(screen) ? CHAT_FRAMES.has(screen.drawing.frame) : isChatScreen(screen));
// ChatGPT 모바일 ↔ 웹 그림 옮기기. 대화 그림은 웹의 가운데 대화 칸으로, Fullscreen 그림은 웹의 넓은 영역으로 옮긴다.
// 넓은 도형(폭 200 이상) · 선 · 글상자는 칸 폭에 맞춰 늘리고, 배지 · 버튼 같은 작은 도형은 크기를 두고 가운데 위치만 옮긴다.
// 폰 화면 밖에 치워 둔 도형은 웹에서도 화면 밖에 둔다. 모바일 → 웹 → 모바일로 옮겨도 제자리로 돌아온다.
const viewCache = new WeakMap();
function isFullscreenDrawing(drawing, screen) {
  if (sectionLines(screen).some((line) => chatTag(line)?.tag === "fullscreen") || /fullscreen|전체\s*화면/i.test(screen.title || "")) return true;
  const area = CHAT_LAYOUT[drawing.frame].full;
  return drawing.shapes.some((shape) => shape.type === "rect" && Math.abs(shape.w) >= area.w * .9 && Math.abs(shape.h) >= 500);
}
function convertChatDrawing(drawing, target, full) {
  const phone = CHAT_LAYOUT.chatgpt, web = CHAT_LAYOUT["chatgpt-web"];
  const from = full ? phone.full : { ...phone.column, y: phone.top }, to = full ? web.full : { ...web.column, y: web.top };
  const k = to.w / from.w, ky = full ? 1 : (web.bottom - web.top) / (phone.bottom - phone.top);
  const toWeb = target === "chatgpt-web";
  const mapX = (x) => (toWeb ? to.x + (x - from.x) * k : from.x + (x - to.x) / k);
  const mapY = (y) => (toWeb ? to.y + (y - from.y) * ky : from.y + (y - to.y) / ky);
  const scaleW = (w) => (toWeb ? w * k : w / k);
  const shapes = drawing.shapes.map((shape) => {
    const box = boxOf(shape), next = { ...shape, y: Math.round(mapY(shape.y)) };
    if (toWeb && (box.x + box.w <= 0 || box.x >= 390)) { next.x = shape.x + (box.x + box.w <= 0 ? -1500 : 1500); return next; }
    const wide = LINE_TYPES.has(shape.type) || (shape.type !== "text" && Math.abs(toWeb ? shape.w : shape.w / k) >= 200);
    if (wide) { next.x = Math.round(mapX(shape.x)); next.w = Math.round(scaleW(shape.w)); }
    else if (shape.type === "text") { next.x = Math.round(mapX(shape.x)); next.w = Math.round(scaleW(shape.w)); } // 글상자는 칸 폭만큼 넓혀 줄바꿈을 맞춘다
    else next.x = Math.round(mapX(shape.x + shape.w / 2) - shape.w / 2);
    return next;
  });
  return { ...drawing, frame: target, shapes };
}
function viewDrawing(drawing, screen) {
  if (chatView === "auto" || !CHAT_FRAMES.has(drawing.frame)) return drawing;
  const target = chatView === "web" ? "chatgpt-web" : "chatgpt";
  if (drawing.frame === target) return drawing;
  const full = isFullscreenDrawing(drawing, screen), key = `${target}|${full}`;
  const cached = viewCache.get(drawing);
  if (cached?.key === key) return cached.drawing;
  const converted = convertChatDrawing(drawing, target, full);
  viewCache.set(drawing, { key, drawing: converted });
  return converted;
}
// 폰으로 배치한 흐름도를 웹 보기로 보면 카드가 두 배로 넓어지므로 가로 간격도 두 배로 벌린다(반대도 마찬가지).
// 저장된 x는 그대로 두고, 화면에 그릴 때와 옮긴 위치를 저장할 때만 이 배율을 쓴다.
function flowXScale(board = state) {
  if (chatView === "auto") return 1;
  const chats = board.screens.filter(isChatLike);
  if (!chats.length) return 1;
  const wide = chats.filter(isWideNative).length;
  if (chatView === "web" && wide * 2 < chats.length) return (WEB_W + 62) / (NODE_W + 62);
  if (chatView === "phone" && wide * 2 > chats.length) return (NODE_W + 62) / (WEB_W + 62);
  return 1;
}
const flowX = (screen, board = state) => (Number.isFinite(screen.x) ? screen.x : 0) * flowXScale(board);
function viewSwitch() {
  return `<div class="vw-switch" role="group" aria-label="ChatGPT 화면 보기"><span>ChatGPT 보기</span>${CHAT_VIEWS.map(([value, label]) => `<button type="button" data-action="chat-view" data-view="${value}" aria-pressed="${chatView === value}">${label}</button>`).join("")}</div>`;
}
const shapeId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const boxOf = (shape) => ({ x: Math.min(shape.x, shape.x + shape.w), y: Math.min(shape.y, shape.y + shape.h), w: Math.abs(shape.w), h: Math.abs(shape.h) });
// 상자 도형 안에 완전히 들어 있고 그 위에 그려진 도형들. 상자를 옮기거나 복제·복사할 때 함께 다룬다.
function shapesInside(container, shapes) {
  if (LINE_TYPES.has(container.type) || container.type === "text") return [];
  const box = boxOf(container), index = shapes.indexOf(container);
  const inside = (x, y) => x >= box.x - .5 && x <= box.x + box.w + .5 && y >= box.y - .5 && y <= box.y + box.h + .5;
  return shapes.slice(index + 1).filter((shape) => { const other = boxOf(shape); return inside(other.x, other.y) && inside(other.x + other.w, other.y + other.h); });
}
// 글자 폭을 대충 잰다(한글·전각은 글자 크기만큼, 나머지는 0.6배).
const textWidth = (line, size) => [...line].reduce((sum, char) => sum + (/[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(char) ? size : size * .6), 0);
function fitTextBox(shape) {
  const size = sizePx(shape.size);
  const lines = String(shape.text || " ").split("\n");
  shape.w = Math.max(24, Math.ceil(Math.max(...lines.map((line) => textWidth(line, size))) + 4));
  shape.h = Math.ceil(lines.length * size * 1.3 + 4);
}
// 주어진 폭에 맞춰 줄을 나눈다(띄어쓰기 단위, 너무 긴 낱말은 글자 단위).
function wrapText(text, width, size) {
  const out = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, size) <= width || !line) line = next;
      else { out.push(line); line = word; }
      while (textWidth(line, size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && textWidth(line.slice(0, cut), size) > width) cut -= 1;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line);
  }
  return out.join("\n");
}
function svgText(text, x, y, size, color, anchor, weight = 500) {
  const lines = String(text).split("\n");
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? size * 1.3 : 0}">${escapeHtml(line) || " "}</tspan>`).join("")}</text>`;
}
function centeredLabel(shape, box, color) {
  if (!shape.text) return "";
  const size = sizePx(shape.size);
  const lines = String(shape.text).split("\n").length;
  return svgText(shape.text, box.x + box.w / 2, box.y + box.h / 2 - ((lines - 1) * size * 1.3) / 2 + size * .35, size, color, "middle", 600);
}
function shapeSvg(shape, editing) {
  const tone = TONE_STYLE[shape.tone] || TONE_STYLE.line;
  const box = boxOf(shape);
  const tag = editing ? ` data-shape-id="${escapeHtml(shape.id)}"` : "";
  if (shape.type === "rect") return `<g${tag}><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${shape.round ? Math.min(14, box.h / 2) : 2}" fill="${tone.fill}" stroke="${tone.stroke}" stroke-width="2"/>${centeredLabel(shape, box, tone.text)}</g>`;
  if (shape.type === "ellipse") return `<g${tag}><ellipse cx="${box.x + box.w / 2}" cy="${box.y + box.h / 2}" rx="${box.w / 2}" ry="${box.h / 2}" fill="${tone.fill}" stroke="${tone.stroke}" stroke-width="2"/>${centeredLabel(shape, box, tone.text)}</g>`;
  if (shape.type === "image") return `<g${tag}><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${shape.round ? 12 : 2}" fill="#f3f4f6" stroke="#b9bfcb" stroke-width="2"/><path d="M ${box.x} ${box.y} L ${box.x + box.w} ${box.y + box.h} M ${box.x + box.w} ${box.y} L ${box.x} ${box.y + box.h}" stroke="#d3d7de" stroke-width="1.5"/>${centeredLabel({ ...shape, text: shape.text || "이미지" }, box, "#6b7280")}</g>`;
  if (shape.type === "text") {
    const size = sizePx(shape.size);
    const color = shape.tone === "dark" ? "#0d0d0d" : shape.tone === "soft" ? "#6b7280" : tone.text;
    return `<g${tag}>${editing ? `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="rgba(0,0,0,0)"/>` : ""}${svgText(shape.text || "텍스트", box.x, box.y + size, size, color, "start", shape.tone === "dark" || shape.size === "l" ? 700 : 500)}</g>`;
  }
  // 선 · 화살표. 화살촉은 marker 대신 직접 그려서 여러 SVG가 한 페이지에 있어도 깨지지 않게 한다.
  const x2 = shape.x + shape.w, y2 = shape.y + shape.h;
  const color = shape.tone === "soft" ? "#9aa1ad" : tone.stroke;
  const angle = Math.atan2(shape.h, shape.w), head = 14;
  const arrow = shape.type === "arrow" && (shape.w || shape.h) ? `<polygon points="${x2},${y2} ${x2 - head * Math.cos(angle - .45)},${y2 - head * Math.sin(angle - .45)} ${x2 - head * Math.cos(angle + .45)},${y2 - head * Math.sin(angle + .45)}" fill="${color}"/>` : "";
  const hit = editing ? `<line x1="${shape.x}" y1="${shape.y}" x2="${x2}" y2="${y2}" stroke="rgba(0,0,0,0)" stroke-width="16"/>` : "";
  const label = shape.text ? svgText(shape.text, (shape.x + x2) / 2, (shape.y + y2) / 2 - 8, sizePx(shape.size), color, "middle", 600) : "";
  return `<g${tag}>${hit}<line x1="${shape.x}" y1="${shape.y}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>${arrow}${label}</g>`;
}
function drawingView(screen, footer) {
  const drawing = drawingOf(screen);
  const frame = DRAW_FRAME_SIZE[drawing.frame] || DRAW_FRAME_SIZE.phone;
  const svg = `<svg class="dw-view" viewBox="0 0 ${frame.width} ${frame.height}" preserveAspectRatio="xMidYMin meet" role="img" aria-label="${escapeHtml(screen.title || "화면")} 그림">${frameUnderlay(drawing.frame)}${drawing.shapes.map((shape) => shapeSvg(shape, false)).join("")}</svg>`;
  if (WIDE_FRAMES.has(drawing.frame)) return `<div class="wb-shell"><div class="wb-web dw-webview"><div class="wb-chrome"><i></i><i></i><i></i><span class="wb-url">${drawing.frame === "chatgpt-web" ? "chatgpt.com" : `studymeta.app · ${escapeHtml(screen.title || "")}`}</span></div>${svg}</div>${footer}</div>`;
  return `<div class="phone-frame flow-phone dw-phone"><div class="phone-island"></div><div class="phone-screen"><div class="phone-top"><span>9:41</span><span>●●● ▰</span></div>${svg}${footer}</div><div class="phone-home"></div></div>`;
}

// ── 지금 목업을 도형으로 바꾸기 ──
// 그림이 없는 화면에서 그리기를 열면, 지금 보이는 목업(폰 · ChatGPT · 웹)을 화면 밖에 그려 놓고
// 각 요소의 위치 · 색 · 글자를 읽어 도형으로 옮긴다. 실제 styles.css가 적용된 모습 그대로 옮겨진다.
const CONVERT_SKIP = ".phone-top, .phone-island, .phone-home, .flow-phone-footer, .phone-footer, .cg-header, .cg-composer, .wb-chrome, .mock-brand, .cg-lint, .wb-lint, .cg-side, iframe, script, style";
// ChatGPT 틀에서 PiP · Fullscreen 위젯을 옮겨 놓을 자리
const CONVERT_OVERLAY = { chatgpt: { pip: { x: 164, y: 60, w: 210 }, fullscreen: { x: 0, y: 48, w: 390 } }, "chatgpt-web": { pip: { x: 926, y: 70, w: 330 }, fullscreen: { x: 260, y: 56, w: 1020 } } };
function parseColor(value) {
  const match = /rgba?\(([^)]+)\)/.exec(value || "");
  if (!match) return null;
  const [r, g, b, a = 1] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a, lum: (.2126 * r + .7152 * g + .0722 * b) / 255 };
}
const borderSide = (style, side) => parseFloat(style[`border${side}Width`]) >= .5 && style[`border${side}Style`] !== "none" && (parseColor(style[`border${side}Color`])?.a || 0) > .1;
function convertBox(style) {
  const bg = parseColor(style.backgroundColor);
  const hasBg = bg && bg.a > .1, hasImage = style.backgroundImage && style.backgroundImage !== "none";
  const hasBorder = ["Top", "Right", "Bottom", "Left"].every((side) => borderSide(style, side));
  if (!hasBg && !hasBorder && !hasImage) return null;
  let tone = "line";
  if (hasBg) {
    if (bg.lum < .55 && bg.b - bg.g > 60 && bg.b - bg.r > 30) tone = "brand";
    else if (bg.lum < .35) tone = "dark";
    else if (bg.lum > .97) { if (!hasBorder) return null; }
    else if (bg.b - bg.r > 10 && bg.b - bg.g > 6) tone = "accent";
    else tone = "soft";
  } else if (hasImage) tone = "soft";
  return { tone, round: parseFloat(style.borderTopLeftRadius) >= 6 };
}
function convertTextTone(style) {
  const color = parseColor(style.color);
  if (!color) return "line";
  if (color.lum > .8) return "white";
  if (color.b - color.r > 25 && color.b - color.g > 15) return "accent";
  return color.lum > .35 ? "soft" : "line";
}
// from(화면 밖에 그린 목업의 영역)을 to(그림판 좌표)로 옮기는 변환. 가로 폭 기준으로 같은 비율로 늘린다.
function convertMapper(from, to) {
  const scale = to.w / from.width;
  return { scale, map: (rect) => ({ x: Math.round(to.x + (rect.left - from.left) * scale), y: Math.round(to.y + (rect.top - from.top) * scale), w: Math.round(rect.width * scale), h: Math.round(rect.height * scale) }) };
}
function mockToDrawing(screen) {
  if (validUrl(screen.url)) return null;
  const plain = { ...screen, drawing: null };
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-30000px;top:0;width:${isWideScreen(plain) ? WEB_W : NODE_W}px;pointer-events:none`;
  host.innerHTML = flowPhoneContent(plain, "noop");
  document.body.append(host);
  try {
    let frame, root, mapper, thread = null, overlays = null;
    const desktop = host.querySelector(".cg-desktop .cg-main"), chat = host.querySelector(".cg-app"), page = host.querySelector(".wb-page"), phone = host.querySelector(".mock-body, .phone-body");
    if (desktop || chat) {
      // ChatGPT: 대화는 가운데 대화 칸에 아래쪽부터 쌓고, PiP · Fullscreen은 정해진 자리로 옮긴다.
      frame = desktop ? "chatgpt-web" : "chatgpt";
      root = desktop || chat;
      const layout = CHAT_LAYOUT[frame], threadRect = root.querySelector(".cg-thread").getBoundingClientRect();
      const scale = layout.column.w / threadRect.width;
      mapper = convertMapper(threadRect, { x: layout.column.x, y: layout.bottom - threadRect.height * scale, w: layout.column.w });
      thread = layout;
      overlays = CONVERT_OVERLAY[frame];
    } else if (page) { frame = "web"; root = page; mapper = convertMapper(page.getBoundingClientRect(), { x: 0, y: 0, w: 1280 }); }
    else if (phone && (phone.classList.contains("mock-body") || sectionLines(screen).length)) { frame = "phone"; root = phone; mapper = convertMapper(phone.getBoundingClientRect(), { x: 0, y: 0, w: 390 }); }
    else return null; // 내용이 없는 빈 화면은 빈 그림판으로 시작한다.
    if (!root.getBoundingClientRect().width) return null;
    const shapes = [];
    const isBoxy = (element) => !element.matches(CONVERT_SKIP) && convertBox(getComputedStyle(element));
    // 자식이 모두 인라인 글자뿐인 요소는 글자 한 덩어리로 읽는다.
    const leafText = (element) => {
      for (const child of element.children) {
        if (child.matches(CONVERT_SKIP)) continue;
        if (getComputedStyle(child).display !== "inline" || isBoxy(child)) return null;
      }
      return element.innerText.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
    };
    const sizeOf = (style, map) => clampFont(parseFloat(style.fontSize) * map.scale); // 목업 글자 크기를 그대로 옮긴다
    const addText = (text, style, rect, map) => {
      const place = map.map(rect), size = sizeOf(style, map), tone = convertTextTone(style);
      // 목업에서 한 줄이던 글은 그대로 한 줄로, 여러 줄이던 글만 폭에 맞춰 나눈다.
      const fontPx = parseFloat(style.fontSize), lineHeight = parseFloat(style.lineHeight) || fontPx * 1.45;
      const wrapped = rect.height > lineHeight * 1.5 ? wrapText(text, (place.w + 6) * sizePx(size) / (fontPx * map.scale), sizePx(size)) : text;
      const shape = { type: "text", x: place.x, y: place.y, w: 0, h: 0, text: wrapped.slice(0, 300), tone: tone === "white" ? "line" : tone, size, round: false };
      fitTextBox(shape);
      if (style.textAlign === "center") shape.x = Math.round(place.x + (place.w - shape.w) / 2);
      if (style.textAlign === "right" || style.textAlign === "end") shape.x = Math.round(place.x + place.w - shape.w);
      // 어두운 상자 위 흰 글자는 그대로 두면 안 보이므로 그 상자를 보라색으로 바꾼다.
      if (tone === "white") { const under = [...shapes].reverse().find((item) => item.type === "rect" && item.tone === "dark" && item.x <= shape.x && item.y <= shape.y && item.x + item.w >= shape.x + shape.w - 2); if (under) under.tone = "accent"; }
      shapes.push(shape);
    };
    const visit = (element, map, isRoot = false) => {
      if (!isRoot && element.matches(CONVERT_SKIP)) return;
      if (overlays) {
        const kind = element.matches(".cg-widget.fullscreen") ? "fullscreen" : element.matches(".cg-widget.pip") ? "pip" : null;
        if (kind) { map = { ...convertMapper(element.getBoundingClientRect(), overlays[kind]), overlay: true }; }
      }
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return;
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const tag = (shape) => (map.overlay ? { ...shape, overlay: true } : shape);
      if (element.tagName === "IMG" || element.tagName.toLowerCase() === "svg") { shapes.push(tag({ type: "image", ...map.map(rect), text: "", tone: "line", size: "s", round: false })); return; }
      const box = isRoot ? null : convertBox(style);
      const text = leafText(element);
      if (box) {
        const shape = tag({ type: "rect", ...map.map(rect), text: "", tone: box.tone, size: sizeOf(style, map), round: box.round });
        shapes.push(shape);
        if (text !== null && text.length <= 60 && text.split("\n").length <= 3) { shape.text = text; return; }
      } else if (!isRoot) {
        const place = map.map(rect);
        if (borderSide(style, "Top")) shapes.push(tag({ type: "line", x: place.x, y: place.y, w: place.w, h: 0, text: "", tone: "soft", size: "s", round: false }));
        if (borderSide(style, "Bottom")) shapes.push(tag({ type: "line", x: place.x, y: place.y + place.h, w: place.w, h: 0, text: "", tone: "soft", size: "s", round: false }));
      }
      const before = shapes.length;
      if (text !== null) { if (text) addText(text, style, rect, map); }
      else for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const value = node.textContent.replace(/\s+/g, " ").trim();
          if (!value) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const textRect = range.getBoundingClientRect();
          if (textRect.width) addText(value, style, textRect, map);
        } else if (node.nodeType === Node.ELEMENT_NODE) visit(node, map);
      }
      if (map.overlay) for (let index = before; index < shapes.length; index += 1) shapes[index].overlay = true;
    };
    visit(root, mapper, true);
    const size = DRAW_FRAME_SIZE[frame];
    const visible = shapes.filter((shape) => {
      const box = boxOf(shape);
      if (thread && !shape.overlay && (box.y < thread.top || box.y + box.h > thread.bottom + 4)) return false; // 대화 칸 위로 밀려난 옛 대화는 뺀다
      return box.y < size.height && box.y + box.h > 0 && box.x < size.width && box.x + box.w > 0;
    });
    return { frame, shapes: visible.slice(0, 380).map(({ overlay, ...shape }) => ({ ...shape, id: shapeId() })) };
  } catch (error) {
    console.warn("목업을 도형으로 바꾸지 못했습니다.", error);
    return null;
  } finally { host.remove(); }
}

// 그리기 창 상태. 저장 전까지는 이 브라우저에만 있고, 저장하면 screen.update 하나로 팀원에게 보낸다.
let draw = null;
let drawSaveCheck = null;
let drawClipboard = null;
let drawStatusTimer;
const DRAW_CLIP_KEY = "workboard-draw-clipboard";
const drawDialog = () => document.getElementById("draw-dialog");
const selectedShapes = () => (draw ? draw.shapes.filter((shape) => draw.selection.includes(shape.id)) : []);
const selectedShape = () => { const list = selectedShapes(); return list.length === 1 ? list[0] : null; };
// 선택한 도형 + 그 안에 들어 있는 도형(z 순서 유지)
function withChildren(list) {
  const ids = new Set(list.map((shape) => shape.id));
  for (const shape of list) for (const child of shapesInside(shape, draw.shapes)) ids.add(child.id);
  return draw.shapes.filter((shape) => ids.has(shape.id));
}
function drawSnapshot() { return JSON.stringify({ frame: draw.frame, shapes: draw.shapes }); }
function pushDrawHistory() {
  draw.history.push(drawSnapshot());
  if (draw.history.length > 100) draw.history.shift();
  draw.future = [];
  draw.dirty = true;
}
function restoreDraw(snapshot) {
  const data = JSON.parse(snapshot);
  draw.frame = data.frame;
  draw.shapes = data.shapes;
  draw.selection = draw.selection.filter((selected) => draw.shapes.some((shape) => shape.id === selected));
  draw.dirty = true;
  renderDrawUi();
}
function undoDraw() { if (draw.history.length) { draw.future.push(drawSnapshot()); restoreDraw(draw.history.pop()); } }
function redoDraw() { if (draw.future.length) { draw.history.push(drawSnapshot()); restoreDraw(draw.future.pop()); } }
function normalizeShape(shape) {
  if (LINE_TYPES.has(shape.type)) return;
  Object.assign(shape, boxOf(shape));
  if (shape.type === "text") fitTextBox(shape);
}
function drawStatus(message) {
  const status = drawDialog()?.querySelector(".dw-status");
  if (!status) return;
  status.textContent = message;
  clearTimeout(drawStatusTimer);
  drawStatusTimer = setTimeout(() => { status.textContent = ""; }, 3000);
}
function openDraw(screenId) {
  const screen = state.screens.find((item) => item.id === screenId);
  if (!screen) return;
  ensureDrawDialog();
  const saved = drawingOf(screen);
  let shapes = saved?.shapes || [], frame = saved?.frame, converted = 0;
  // 그림이 아직 없으면 지금 목업을 도형으로 옮겨 와서 그 위에 이어 그린다.
  if (!shapes.length) {
    const result = mockToDrawing(screen);
    if (result?.shapes.length) { shapes = result.shapes; frame = result.frame; converted = shapes.length; }
  }
  frame ||= isWebScreen(screen) ? "web" : isChatScreen(screen) ? (isChatWebScreen(screen) ? "chatgpt-web" : "chatgpt") : "phone";
  draw = { screenId, title: screen.title, frame, shapes: JSON.parse(JSON.stringify(shapes)), selection: [], marquee: null, tool: "select", tone: "line", size: "m", round: false, grid: true, history: [], future: [], dirty: false, action: null, textFocused: false };
  const dialog = drawDialog();
  dialog.querySelector(".dw-title").value = screen.title;
  const notice = dialog.querySelector(".dw-notice");
  const viewed = saved && saved.frame !== screen.drawing.frame;
  notice.hidden = !converted && !viewed;
  if (viewed) notice.textContent = `지금 ChatGPT ${chatView === "web" ? "웹" : "폰"} 보기라서 이 그림을 ${DRAW_FRAME_SIZE[saved.frame].label} 틀로 옮겨 열었어요. 저장하면 이 틀로 저장되고, 다른 보기에서는 다시 자동으로 맞춰져요.`;
  if (converted) notice.innerHTML = `지금 화면을 도형 ${converted}개로 옮겨 왔어요. 이어서 고치고 저장하면 이 화면은 그림으로 보여요. <button type="button" data-dw="clear">빈 그림판으로 시작</button>`;
  dialog.showModal();
  renderDrawUi();
  dialog.querySelector("#dw-svg").focus({ preventScroll: true }); // 단축키가 제목 칸에 입력되지 않게 그림판에 포커스를 둔다.
  setEditing(screenId, "edit");
}
function closeDraw(force = false) {
  if (!draw) return;
  if (!force && draw.dirty && !confirm("저장하지 않은 그림이 있어요. 저장하지 않고 닫을까요?")) return;
  draw = null;
  if (drawDialog()?.open) drawDialog().close();
  setEditing(null);
}
function saveDraw() {
  if (!draw) return;
  const screen = state.screens.find((item) => item.id === draw.screenId);
  if (!screen) { toast("다른 팀원이 삭제한 화면이에요."); closeDraw(true); return; }
  draw.shapes.forEach(normalizeShape);
  const fields = { drawing: { frame: draw.frame, shapes: draw.shapes } };
  const title = drawDialog().querySelector(".dw-title").value.trim();
  if (title && title !== screen.title) fields.title = title;
  if (!commit({ type: "screen.update", id: draw.screenId, fields })) return;
  drawSaveCheck = { id: draw.screenId, frame: draw.frame };
  closeDraw(true);
  toast("그림을 저장했습니다.");
}
// ── 복사 · 붙여넣기 ── 이 브라우저 안에서는 다른 화면으로도 붙여 넣을 수 있게 localStorage에도 둔다.
function readDrawClipboard() {
  if (drawClipboard) return drawClipboard;
  try { const saved = JSON.parse(storage.get(DRAW_CLIP_KEY) || "null"); if (saved?.shapes?.length) drawClipboard = saved; } catch { /* 없으면 빈 클립보드 */ }
  return drawClipboard;
}
function copyShapes(cut = false) {
  const list = withChildren(selectedShapes());
  if (!list.length) return;
  drawClipboard = { source: draw.screenId, target: null, pastes: 0, shapes: JSON.parse(JSON.stringify(list)) };
  storage.set(DRAW_CLIP_KEY, JSON.stringify(drawClipboard));
  if (cut) {
    pushDrawHistory();
    const ids = new Set(list.map((shape) => shape.id));
    draw.shapes = draw.shapes.filter((shape) => !ids.has(shape.id));
    draw.selection = [];
  }
  renderDrawUi();
  drawStatus(`도형 ${list.length}개를 ${cut ? "잘라 냈어요" : "복사했어요"}. ⌘/Ctrl+V로 붙여 넣으세요 (다른 화면에서도 돼요).`);
}
function pasteShapes() {
  const clip = readDrawClipboard();
  if (!clip) { drawStatus("먼저 도형을 선택하고 복사해 주세요."); return; }
  if (clip.target !== draw.screenId) { clip.target = draw.screenId; clip.pastes = 0; }
  clip.pastes += 1;
  const offset = (clip.source === draw.screenId ? clip.pastes : clip.pastes - 1) * 20;
  storage.set(DRAW_CLIP_KEY, JSON.stringify(clip));
  pushDrawHistory();
  const copies = clip.shapes.map((shape) => ({ ...shape, id: shapeId(), x: shape.x + offset, y: shape.y + offset }));
  draw.shapes.push(...copies);
  draw.selection = copies.map((shape) => shape.id);
  draw.tool = "select";
  renderDrawUi();
  drawStatus(`도형 ${copies.length}개를 붙여 넣었어요.`);
}
function fitDrawDevice() {
  if (!draw) return;
  const dialog = drawDialog();
  const stage = dialog.querySelector(".dw-stage"), device = dialog.querySelector(".dw-device"), svg = dialog.querySelector("#dw-svg");
  const frame = DRAW_FRAME_SIZE[draw.frame];
  const phoneLike = !WIDE_FRAMES.has(draw.frame);
  const bar = phoneLike ? 24 : 28, border = phoneLike ? 16 : 2;
  const room = { width: stage.clientWidth - 32 - border, height: stage.clientHeight - 32 - border - bar };
  const scale = Math.max(.1, Math.min(room.width / frame.width, room.height / frame.height));
  svg.style.width = `${Math.floor(frame.width * scale)}px`;
  svg.style.height = `${Math.floor(frame.height * scale)}px`;
  device.className = `dw-device ${phoneLike ? "phone" : "web"}`;
  device.querySelector(".dw-device-bar").innerHTML = phoneLike ? "<span>9:41</span><span>●●● ▰</span>" : `<i></i><i></i><i></i><span>${draw.frame === "chatgpt-web" ? "chatgpt.com" : `studymeta.app · ${escapeHtml(draw.title || "")}`}</span>`;
}
function renderDrawSvg() {
  const svg = drawDialog().querySelector("#dw-svg");
  const frame = DRAW_FRAME_SIZE[draw.frame];
  svg.setAttribute("viewBox", `0 0 ${frame.width} ${frame.height}`);
  svg.classList.toggle("drawing-tool", draw.tool !== "select");
  const unit = frame.width / Math.max(1, svg.clientWidth || frame.width); // 화면 1px이 가상 좌표로 몇인지
  const grid = draw.grid ? `<defs><pattern id="dw-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="#eef0f4" stroke-width="${unit}"/></pattern></defs><rect width="100%" height="100%" fill="url(#dw-grid)"/>` : "";
  const outline = (box) => `<rect x="${box.x - 2 * unit}" y="${box.y - 2 * unit}" width="${box.w + 4 * unit}" height="${box.h + 4 * unit}" fill="none" stroke="#7c6cd8" stroke-width="${1.5 * unit}" stroke-dasharray="${4 * unit} ${3 * unit}" pointer-events="none"/>`;
  const list = selectedShapes();
  let selection = "";
  if (list.length === 1) {
    const [shape] = list;
    const handle = (name, x, y) => `<rect data-handle="${name}" x="${x - 5 * unit}" y="${y - 5 * unit}" width="${10 * unit}" height="${10 * unit}" fill="#fff" stroke="#7c6cd8" stroke-width="${1.5 * unit}"/>`;
    if (LINE_TYPES.has(shape.type)) selection = handle("p1", shape.x, shape.y) + handle("p2", shape.x + shape.w, shape.y + shape.h);
    else {
      const box = boxOf(shape);
      selection = outline(box) + (shape.type === "text" ? "" : handle("nw", box.x, box.y) + handle("ne", box.x + box.w, box.y) + handle("sw", box.x, box.y + box.h) + handle("se", box.x + box.w, box.y + box.h));
    }
  } else selection = list.map((shape) => outline(boxOf(shape))).join("");
  const marquee = draw.marquee ? `<rect x="${draw.marquee.x}" y="${draw.marquee.y}" width="${draw.marquee.w}" height="${draw.marquee.h}" fill="rgba(124,108,216,.08)" stroke="#7c6cd8" stroke-width="${unit}" stroke-dasharray="${3 * unit} ${2 * unit}" pointer-events="none"/>` : "";
  svg.innerHTML = `<rect width="100%" height="100%" fill="#fff"/>${grid}${frameUnderlay(draw.frame)}${draw.shapes.map((item) => shapeSvg(item, true)).join("")}${selection}${marquee}`;
}
function renderDrawUi() {
  if (!draw) return;
  const dialog = drawDialog();
  const pressed = (selector, value) => dialog.querySelectorAll(selector).forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === value)));
  const list = selectedShapes(), shape = list.length === 1 ? list[0] : null, first = list[0];
  pressed("[data-dw-tool]", draw.tool);
  pressed("[data-dw-frame]", draw.frame);
  pressed("[data-dw-tone]", first?.tone || draw.tone);
  const px = sizePx(first ? first.size : draw.size);
  dialog.querySelectorAll("[data-dw-size]").forEach((button) => button.setAttribute("aria-pressed", String(FONT_SIZE[button.dataset.value] === px)));
  const sizeField = dialog.querySelector("#dw-size");
  if (document.activeElement !== sizeField) sizeField.value = px;
  dialog.querySelector("[data-dw='round']").setAttribute("aria-pressed", String(first ? first.round : draw.round));
  dialog.querySelector("[data-dw='grid']").setAttribute("aria-pressed", String(draw.grid));
  dialog.querySelector("[data-dw='undo']").disabled = !draw.history.length;
  dialog.querySelector("[data-dw='redo']").disabled = !draw.future.length;
  dialog.querySelectorAll("[data-dw='duplicate'],[data-dw='delete'],[data-dw='front'],[data-dw='back'],[data-dw='copy'],[data-dw='cut']").forEach((button) => { button.disabled = !list.length; });
  dialog.querySelector("[data-dw='paste']").disabled = !readDrawClipboard();
  const textField = dialog.querySelector("#dw-text");
  textField.disabled = !shape;
  if (!draw.textFocused) textField.value = shape?.text || "";
  textField.placeholder = shape ? "도형에 넣을 글자 (Enter로 줄바꿈)" : list.length > 1 ? "글자는 도형을 하나만 선택했을 때 넣을 수 있어요" : "도형을 선택하면 글자를 넣을 수 있어요";
  dialog.querySelector(".dw-count").textContent = `도형 ${draw.shapes.length}개${list.length > 1 ? ` · ${list.length}개 선택` : ""}`;
  dialog.querySelector(".dw-stamps").hidden = !CHAT_FRAMES.has(draw.frame);
  fitDrawDevice();
  renderDrawSvg();
}
function drawPoint(event) {
  const svg = drawDialog().querySelector("#dw-svg");
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(svg.getScreenCTM().inverse());
  return { x: local.x, y: local.y };
}
const snapValue = (value) => (draw.grid ? Math.round(value / 10) * 10 : Math.round(value));
function applyToSelection(change) {
  const list = selectedShapes();
  if (!list.length) return false;
  pushDrawHistory();
  for (const shape of list) { change(shape); if (shape.type === "text") fitTextBox(shape); }
  renderDrawUi();
  return true;
}
function moveSelection(dx, dy) {
  const list = withChildren(selectedShapes());
  if (!list.length) return;
  pushDrawHistory();
  for (const shape of list) { shape.x += dx; shape.y += dy; }
  renderDrawUi();
}
function placeStamp(key) {
  const stamp = CHAT_STAMPS[key], layout = CHAT_LAYOUT[draw.frame];
  if (!stamp || !layout) return;
  const area = layout[stamp.area || "column"], k = area.w / 390;
  const shapes = stamp.shapes.map((item) => ({ w: 0, h: 0, text: "", tone: "line", size: "m", round: false, ...item, id: shapeId(), x: Math.round(area.x + item.x * k), w: Math.round((item.w || 0) * k) }));
  shapes.filter((item) => item.type === "text").forEach(fitTextBox);
  let top = area.y;
  if (!stamp.area) {
    // 대화 요소는 지금까지 그린 것 아래에 이어 붙인다(대화가 쌓이는 방향).
    const bottom = Math.max(layout.top + 4, ...draw.shapes.map((item) => boxOf(item).y + boxOf(item).h).filter((y) => y < layout.bottom));
    const height = Math.max(...shapes.map((item) => item.y + (item.h || 24)));
    top = snapValue(Math.min(bottom + 12, layout.bottom - height));
  }
  for (const shape of shapes) shape.y += top;
  pushDrawHistory();
  draw.shapes.push(...shapes);
  draw.selection = [shapes[0].id];
  draw.tool = "select";
}
function drawCommand(command, value) {
  if (!draw) return;
  const list = selectedShapes();
  if (command === "tool") { draw.tool = value; if (value !== "select") draw.selection = []; }
  if (command === "frame" && value !== draw.frame) { pushDrawHistory(); draw.frame = value; }
  if (command === "tone") { draw.tone = value; if (applyToSelection((item) => { item.tone = value; })) return; }
  if (command === "size") { draw.size = value; if (applyToSelection((item) => { item.size = value; })) return; }
  if (command === "size-up" || command === "size-down") {
    const step = command === "size-up" ? 2 : -2;
    const next = (current) => clampFont(sizePx(current) + step);
    draw.size = next(draw.size);
    if (applyToSelection((item) => { item.size = next(item.size); })) return;
  }
  if (command === "round") { if (list.length) { const next = !list[0].round; applyToSelection((item) => { item.round = next; }); return; } draw.round = !draw.round; }
  if (command === "grid") draw.grid = !draw.grid;
  if (command === "undo") { undoDraw(); return; }
  if (command === "redo") { redoDraw(); return; }
  if (command === "copy") { copyShapes(false); return; }
  if (command === "cut") { copyShapes(true); return; }
  if (command === "paste") { pasteShapes(); return; }
  if (command === "select-all") { draw.tool = "select"; draw.selection = draw.shapes.map((shape) => shape.id); }
  if (command === "clear" && draw.shapes.length) { pushDrawHistory(); draw.shapes = []; draw.selection = []; drawDialog().querySelector(".dw-notice").hidden = true; }
  if (command === "delete" && list.length) { pushDrawHistory(); draw.shapes = draw.shapes.filter((item) => !list.includes(item)); draw.selection = []; }
  if (command === "duplicate" && list.length) {
    pushDrawHistory();
    const ids = new Map();
    const copies = withChildren(list).map((item) => { const copy = { ...item, id: shapeId(), x: item.x + 20, y: item.y + 20 }; ids.set(item.id, copy.id); return copy; });
    draw.shapes.push(...copies);
    draw.selection = list.map((item) => ids.get(item.id));
  }
  if (command === "stamp") placeStamp(value);
  if ((command === "front" || command === "back") && list.length) {
    pushDrawHistory();
    const rest = draw.shapes.filter((item) => !list.includes(item));
    draw.shapes = command === "front" ? [...rest, ...list] : [...list, ...rest];
  }
  if (command === "save") { saveDraw(); return; }
  if (command === "close") { closeDraw(); return; }
  renderDrawUi();
}
function drawPointerDown(event) {
  if (!draw || event.button !== 0) return;
  const svg = event.currentTarget;
  const point = drawPoint(event);
  const handle = event.target.closest("[data-handle]");
  const hit = event.target.closest("[data-shape-id]");
  // 아래에서 그림판을 다시 그리면 눌린 요소가 사라져 브라우저가 포커스를 body로 옮긴다.
  // 기본 동작을 막고 포커스를 그림판에 직접 두어야 단축키가 계속 동작한다.
  event.preventDefault();
  svg.setPointerCapture(event.pointerId);
  svg.focus({ preventScroll: true });
  if (handle && selectedShape()) {
    pushDrawHistory();
    draw.action = { kind: "resize", handle: handle.dataset.handle, origin: { ...selectedShape() } };
    return;
  }
  if (draw.tool === "select") {
    const id = hit?.dataset.shapeId;
    if (id && event.shiftKey) {
      // Shift+클릭: 선택에 더하거나 빼기
      draw.selection = draw.selection.includes(id) ? draw.selection.filter((item) => item !== id) : [...draw.selection, id];
      draw.action = null;
    } else if (id) {
      if (!draw.selection.includes(id)) draw.selection = [id];
      draw.action = { kind: "move", start: point, items: withChildren(selectedShapes()).map((shape) => ({ shape, x: shape.x, y: shape.y })), pushed: false };
    } else {
      // 빈 곳을 끌면 네모 영역으로 여러 개 선택
      if (!event.shiftKey) draw.selection = [];
      draw.action = { kind: "marquee", start: point, base: [...draw.selection] };
    }
    renderDrawUi();
    return;
  }
  const start = { x: snapValue(point.x), y: snapValue(point.y) };
  const shape = { id: shapeId(), type: draw.tool, x: start.x, y: start.y, w: 0, h: 0, text: draw.tool === "text" ? "텍스트" : "", tone: draw.tone, size: draw.size, round: draw.tool === "rect" && draw.round };
  pushDrawHistory();
  draw.shapes.push(shape);
  draw.selection = [shape.id];
  draw.action = { kind: "create", start };
  renderDrawSvg();
}
function drawPointerMove(event) {
  if (!draw?.action) return;
  const point = drawPoint(event);
  const action = draw.action;
  if (action.kind === "marquee") {
    const x = Math.min(point.x, action.start.x), y = Math.min(point.y, action.start.y);
    const w = Math.abs(point.x - action.start.x), h = Math.abs(point.y - action.start.y);
    if (w < 4 && h < 4) return;
    draw.marquee = { x, y, w, h };
    const hits = draw.shapes.filter((shape) => { const box = boxOf(shape); return box.x <= x + w && box.x + box.w >= x && box.y <= y + h && box.y + box.h >= y; }).map((shape) => shape.id);
    draw.selection = [...new Set([...action.base, ...hits])];
    renderDrawSvg();
    return;
  }
  if (action.kind === "move") {
    const dx = snapValue(point.x - action.start.x), dy = snapValue(point.y - action.start.y);
    if (!action.pushed && (dx || dy)) { pushDrawHistory(); action.pushed = true; }
    for (const item of action.items) { item.shape.x = item.x + dx; item.shape.y = item.y + dy; }
    renderDrawSvg();
    return;
  }
  const shape = selectedShape();
  if (!shape) return;
  if (action.kind === "create") {
    let w = snapValue(point.x) - action.start.x, h = snapValue(point.y) - action.start.y;
    if (event.shiftKey && LINE_TYPES.has(shape.type)) {
      const angle = Math.round(Math.atan2(h, w) / (Math.PI / 4)) * (Math.PI / 4), length = Math.hypot(w, h);
      w = Math.round(Math.cos(angle) * length);
      h = Math.round(Math.sin(angle) * length);
    } else if (event.shiftKey) {
      const side = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * side;
      h = Math.sign(h || 1) * side;
    }
    shape.w = w;
    shape.h = h;
  }
  if (action.kind === "resize") {
    const x = snapValue(point.x), y = snapValue(point.y), origin = action.origin;
    if (action.handle === "p1") { shape.x = x; shape.y = y; shape.w = origin.x + origin.w - x; shape.h = origin.y + origin.h - y; }
    else if (action.handle === "p2") { shape.w = x - origin.x; shape.h = y - origin.y; }
    else {
      const box = boxOf(origin);
      const left = action.handle.includes("w") ? x : box.x, right = action.handle.includes("e") ? x : box.x + box.w;
      const top = action.handle.includes("n") ? y : box.y, bottom = action.handle.includes("s") ? y : box.y + box.h;
      Object.assign(shape, { x: left, y: top, w: right - left, h: bottom - top });
    }
  }
  renderDrawSvg();
}
function drawPointerUp() {
  if (!draw?.action) return;
  const action = draw.action;
  draw.action = null;
  draw.marquee = null;
  if (action.kind === "move") action.items.forEach(({ shape }) => normalizeShape(shape));
  const shape = selectedShape();
  if (shape && action.kind === "create") {
    // 끌지 않고 클릭만 했으면 누른 곳을 가운데로 기본 크기 도형을 만든다.
    if (Math.abs(shape.w) < 6 && Math.abs(shape.h) < 6 && shape.type !== "text") {
      const size = { rect: { w: 160, h: 52 }, ellipse: { w: 80, h: 80 }, image: { w: 200, h: 140 }, line: { w: 140, h: 0 }, arrow: { w: 140, h: 0 } }[shape.type];
      Object.assign(shape, size, { x: snapValue(shape.x - size.w / 2), y: snapValue(shape.y - size.h / 2) });
    }
    draw.tool = "select";
  }
  if (shape && (action.kind === "create" || action.kind === "resize")) normalizeShape(shape);
  renderDrawUi();
  if (shape && action.kind === "create" && shape.type === "text") { const field = drawDialog().querySelector("#dw-text"); field.focus(); field.select(); }
}
function drawKeyDown(event) {
  if (!draw) return;
  const typing = event.target.matches("input, textarea");
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (mod && key === "s") { event.preventDefault(); saveDraw(); return; }
  if (typing) return;
  if (mod && key === "z") { event.preventDefault(); if (event.shiftKey) redoDraw(); else undoDraw(); return; }
  if (mod && key === "y") { event.preventDefault(); redoDraw(); return; }
  if (mod && key === "d") { event.preventDefault(); drawCommand("duplicate"); return; }
  if (mod && key === "c") { event.preventDefault(); drawCommand("copy"); return; }
  if (mod && key === "x") { event.preventDefault(); drawCommand("cut"); return; }
  if (mod && key === "v") { event.preventDefault(); drawCommand("paste"); return; }
  if (mod && key === "a") { event.preventDefault(); drawCommand("select-all"); return; }
  if (mod && event.shiftKey && (event.key === ">" || event.key === ".")) { event.preventDefault(); drawCommand("size-up"); return; }
  if (mod && event.shiftKey && (event.key === "<" || event.key === ",")) { event.preventDefault(); drawCommand("size-down"); return; }
  if (mod) return;
  if (event.key === "Escape" && (draw.selection.length || draw.tool !== "select")) { event.preventDefault(); draw.selection = []; draw.tool = "select"; renderDrawUi(); return; }
  if ((event.key === "Delete" || event.key === "Backspace") && draw.selection.length) { event.preventDefault(); drawCommand("delete"); return; }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (arrows && draw.selection.length) {
    event.preventDefault();
    const step = event.shiftKey || draw.grid ? 10 : 1;
    moveSelection(arrows[0] * step, arrows[1] * step);
    return;
  }
  const tool = DRAW_TOOL_LIST.find(([, , shortcut]) => shortcut.toLowerCase() === key);
  if (tool) { event.preventDefault(); drawCommand("tool", tool[0]); }
}
function ensureDrawDialog() {
  if (drawDialog()) return;
  const button = (attrs, label, title = "") => `<button type="button" ${attrs}${title ? ` title="${title}"` : ""}>${label}</button>`;
  const dialog = document.createElement("dialog");
  dialog.id = "draw-dialog";
  dialog.className = "dw-dialog";
  dialog.setAttribute("aria-label", "화면 그리기");
  dialog.innerHTML = `<div class="dw-top"><input class="dw-title" aria-label="화면 이름" maxlength="200"><div class="dw-seg" role="group" aria-label="화면 틀">${Object.entries(DRAW_FRAME_SIZE).map(([value, frame]) => button(`data-dw-frame data-value="${value}" aria-pressed="false"`, frame.label)).join("")}</div><span class="dw-count"></span><span class="dw-spacer"></span>${button(`data-dw="undo"`, "↶ 되돌리기", "되돌리기 (Ctrl/⌘+Z)")}${button(`data-dw="redo"`, "↷ 다시", "다시 실행 (Ctrl/⌘+Shift+Z)")}${button(`data-dw="close"`, "닫기")}${button(`data-dw="save" class="dw-primary"`, "저장", "저장 (Ctrl/⌘+S)")}</div>
  <p class="dw-notice" role="status" hidden></p>
  <div class="dw-body"><div class="dw-tools" role="toolbar" aria-label="그리기 도구"><span class="dw-group-label">도구</span>${DRAW_TOOL_LIST.map(([value, label, key, icon]) => button(`data-dw-tool data-value="${value}" aria-pressed="false"`, `<b aria-hidden="true">${icon}</b>${label}<kbd>${key}</kbd>`, `${label} (${key})`)).join("")}<div class="dw-stamps" role="group" aria-label="ChatGPT 요소"><span class="dw-sep"></span><span class="dw-group-label">ChatGPT 요소</span>${Object.entries(CHAT_STAMPS).map(([value, stamp]) => button(`data-dw-stamp data-value="${value}"`, `<b aria-hidden="true">＋</b>${stamp.label}`)).join("")}</div><span class="dw-sep"></span><span class="dw-group-label">편집</span>${button(`data-dw="copy"`, "복사<kbd>⌘C</kbd>", "복사 (Ctrl/⌘+C)")}${button(`data-dw="paste"`, "붙여넣기<kbd>⌘V</kbd>", "붙여넣기 (Ctrl/⌘+V)")}${button(`data-dw="cut"`, "잘라내기<kbd>⌘X</kbd>", "잘라내기 (Ctrl/⌘+X)")}${button(`data-dw="duplicate"`, "복제<kbd>⌘D</kbd>", "복제 (Ctrl/⌘+D)")}${button(`data-dw="select-all"`, "전체 선택<kbd>⌘A</kbd>", "전체 선택 (Ctrl/⌘+A)")}${button(`data-dw="front"`, "맨 앞으로")}${button(`data-dw="back"`, "맨 뒤로")}${button(`data-dw="delete" class="dw-danger"`, "삭제<kbd>Del</kbd>", "삭제 (Delete)")}<span class="dw-sep"></span><span class="dw-group-label">색</span>${DRAW_TONE_LIST.map(([value, label]) => button(`data-dw-tone data-value="${value}" aria-pressed="false"`, `<i class="dw-swatch" style="background:${TONE_STYLE[value].fill};border-color:${TONE_STYLE[value].stroke}"></i>${label}`)).join("")}<span class="dw-sep"></span><span class="dw-group-label">글자 크기</span>${DRAW_SIZE_LIST.map(([value, label]) => button(`data-dw-size data-value="${value}" aria-pressed="false"`, `${label}<kbd>${FONT_SIZE[value]}</kbd>`)).join("")}<div class="dw-size-custom">${button(`data-dw="size-down"`, "A−", "글자 작게 (Ctrl/⌘+Shift+,)")}<label><input id="dw-size" type="number" inputmode="numeric" min="${FONT_MIN}" max="${FONT_MAX}" step="1" aria-label="글자 크기 (px)"><span>px</span></label>${button(`data-dw="size-up"`, "A+", "글자 크게 (Ctrl/⌘+Shift+.)")}</div><span class="dw-sep"></span>${button(`data-dw="round" aria-pressed="false"`, "둥근 모서리")}${button(`data-dw="grid" aria-pressed="true"`, "격자에 맞추기")}</div>
  <div class="dw-stage"><div class="dw-device"><div class="dw-device-bar"></div><svg id="dw-svg" class="dw-svg" xmlns="http://www.w3.org/2000/svg" tabindex="0" role="application" aria-label="그림판. 도구를 고른 뒤 끌어서 그리세요."></svg></div></div></div>
  <div class="dw-bottom"><label class="dw-text"><span>글자</span><textarea id="dw-text" rows="1"></textarea></label><span class="dw-status" role="status" aria-live="polite"></span><small>Shift+클릭 · 빈 곳 끌기: 여러 개 선택 · 큰 도형을 옮기면 안에 든 도형도 함께 · ⌘⇧. / ⌘⇧, : 글자 크게/작게 · Esc: 선택 해제</small></div>`;
  document.body.append(dialog);
  dialog.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target || !draw) return;
    if ("dwTool" in target.dataset) drawCommand("tool", target.dataset.value);
    else if ("dwFrame" in target.dataset) drawCommand("frame", target.dataset.value);
    else if ("dwTone" in target.dataset) drawCommand("tone", target.dataset.value);
    else if ("dwSize" in target.dataset) drawCommand("size", target.dataset.value);
    else if ("dwStamp" in target.dataset) drawCommand("stamp", target.dataset.value);
    else if (target.dataset.dw) drawCommand(target.dataset.dw);
  });
  dialog.addEventListener("keydown", drawKeyDown);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDraw(); });
  dialog.querySelector(".dw-title").addEventListener("input", (event) => { if (draw) { draw.title = event.target.value; draw.dirty = true; fitDrawDevice(); } });
  const svg = dialog.querySelector("#dw-svg");
  svg.addEventListener("pointerdown", drawPointerDown);
  svg.addEventListener("pointermove", drawPointerMove);
  svg.addEventListener("pointerup", drawPointerUp);
  svg.addEventListener("pointercancel", drawPointerUp);
  svg.addEventListener("dblclick", (event) => {
    const hit = event.target.closest("[data-shape-id]");
    if (!draw || !hit) return;
    draw.selection = [hit.dataset.shapeId];
    renderDrawUi();
    dialog.querySelector("#dw-text").focus();
  });
  // 글자 크기 숫자 칸: 입력하는 동안 바로 반영하고, 되돌리기 기록은 칸에 들어간 뒤 처음 바꿀 때 한 번만 남긴다.
  const sizeField = dialog.querySelector("#dw-size");
  sizeField.addEventListener("focus", () => { if (draw) draw.sizeSnapshot = drawSnapshot(); });
  sizeField.addEventListener("input", () => {
    if (!draw || sizeField.value === "") return;
    const value = clampFont(sizeField.value);
    if (draw.sizeSnapshot && selectedShapes().length) { draw.history.push(draw.sizeSnapshot); draw.future = []; draw.dirty = true; draw.sizeSnapshot = null; }
    draw.size = value;
    for (const shape of selectedShapes()) { shape.size = value; if (shape.type === "text") fitTextBox(shape); }
    dialog.querySelectorAll("[data-dw-size]").forEach((button) => button.setAttribute("aria-pressed", String(FONT_SIZE[button.dataset.value] === value)));
    renderDrawSvg();
  });
  // Enter를 누르면 그림판으로 포커스를 돌려서 단축키가 바로 다시 동작하게 한다.
  sizeField.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); dialog.querySelector("#dw-svg").focus({ preventScroll: true }); } });
  sizeField.addEventListener("blur", () => { if (draw) { sizeField.value = clampFont(sizeField.value); renderDrawUi(); } });
  const textField = dialog.querySelector("#dw-text");
  // 글자 칸에 들어갈 때 상태를 기억해 두고, 실제로 입력했을 때만 되돌리기 기록에 넣는다.
  textField.addEventListener("focus", () => { if (draw && selectedShape()) { draw.textSnapshot = drawSnapshot(); draw.textFocused = true; } });
  textField.addEventListener("blur", () => { if (draw) { draw.textFocused = false; renderDrawUi(); } });
  textField.addEventListener("input", () => {
    const shape = selectedShape();
    if (!shape) return;
    if (draw.textSnapshot) { draw.history.push(draw.textSnapshot); draw.future = []; draw.dirty = true; draw.textSnapshot = null; }
    shape.text = textField.value.slice(0, 300);
    if (shape.type === "text") fitTextBox(shape);
    renderDrawSvg();
  });
  window.addEventListener("resize", () => { if (draw) renderDrawUi(); });
}
function injectDrawStyles() {
  if (document.getElementById("dw-styles")) return;
  const style = document.createElement("style");
  style.id = "dw-styles";
  style.textContent = `
.dw-phone .phone-screen{display:flex;flex-direction:column}
.dw-view{display:block;flex:1 1 0;width:100%;min-height:320px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
.dw-webview{display:flex;flex-direction:column}.dw-webview .dw-view{min-height:0}
.dw-node-actions{display:inline-flex;gap:4px}
.flow-lines path.flow-link{fill:none}
.dw-dialog{width:min(1200px,96vw);height:min(880px,94vh);max-width:none;max-height:none;margin:auto;padding:0;border:0;border-radius:16px;background:#f4f5f8;color:#1d2330;box-shadow:0 24px 60px rgba(0,0,0,.28);font:13px/1.4 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;overflow:hidden}
.dw-dialog[open]{display:flex;flex-direction:column}
.dw-dialog::backdrop{background:rgba(20,22,30,.5)}
.dw-dialog button{font:inherit;cursor:pointer;color:#1d2330}
.dw-dialog button:disabled{opacity:.4;cursor:default}
.dw-dialog button:focus-visible,.dw-dialog input:focus-visible,.dw-dialog textarea:focus-visible{outline:2px solid #7c6cd8;outline-offset:2px}
.dw-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;background:#fff;border-bottom:1px solid #e3e5ec}
.dw-title{flex:1 1 200px;min-width:0;padding:7px 10px;border:1px solid #d5d8e1;border-radius:8px;font:inherit;font-weight:700}
.dw-seg{display:inline-flex;flex-wrap:wrap;border:1px solid #d5d8e1;border-radius:8px;overflow:hidden}
.dw-seg button{padding:6px 12px;border:0;background:#fff;white-space:nowrap}
.dw-top>button{padding:6px 11px;border:1px solid #d5d8e1;border-radius:8px;background:#fff}
.dw-count{color:#6b7280;font-size:12px}
.dw-spacer{flex:1}
.dw-dialog [aria-pressed=true]{background:#efedff!important;color:#4a3ab0!important;border-color:#7c6cd8!important;font-weight:700}
.dw-dialog .dw-primary{background:#4a3ab0;border-color:#4a3ab0;color:#fff;font-weight:700}
.dw-notice{margin:0;padding:7px 12px;background:#efedff;color:#3b2f94}
.dw-notice button{margin-left:8px;padding:3px 10px;border:1px solid #7c6cd8;border-radius:7px;background:#fff}
.dw-body{flex:1;min-height:0;display:flex}
.dw-tools{display:flex;flex-direction:column;gap:4px;width:150px;flex:none;padding:10px;overflow:auto;background:#fff;border-right:1px solid #e3e5ec}
.dw-tools button{display:flex;align-items:center;gap:7px;padding:5px 8px;border:1px solid #e3e5ec;border-radius:8px;background:#fff;font-size:12px;text-align:left}
.dw-tools button:hover:not(:disabled){border-color:#7c6cd8}
.dw-tools b{width:16px;text-align:center}
.dw-tools kbd{margin-left:auto;color:#9aa1ad;font:11px ui-monospace,monospace}
.dw-tools .dw-danger{color:#b42318}
.dw-stamps{display:flex;flex-direction:column;gap:4px}.dw-stamps[hidden]{display:none}
.dw-size-custom{display:flex;align-items:center;gap:4px}
.dw-size-custom button{flex:none;justify-content:center;min-width:34px;font-weight:700}
.dw-size-custom label{display:flex;align-items:center;gap:3px;flex:1;min-width:0;font-size:11px;color:#6b7280}
.dw-size-custom input{width:100%;min-width:0;padding:4px 6px;border:1px solid #d5d8e1;border-radius:8px;font:inherit;font-size:12px;text-align:center}
.dw-size-custom input:focus-visible{outline:2px solid #7c6cd8;outline-offset:1px}
.dw-sep{flex:none;height:1px;margin:4px 0;background:#e3e5ec}
.dw-group-label{color:#6b7280;font-size:11px;font-weight:700}
.dw-swatch{display:inline-block;width:12px;height:12px;border:1.5px solid;border-radius:3px}
.dw-stage{flex:1;min-width:0;min-height:0;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto}
.dw-device{display:flex;flex-direction:column;flex:none;overflow:hidden;background:#fff;box-shadow:0 8px 26px rgba(0,0,0,.14)}
.dw-device.phone{border:8px solid #16181d;border-radius:30px}
.dw-device.web{border:1px solid #d9dbe3;border-radius:10px}
.dw-device-bar{display:flex;align-items:center;gap:5px;height:24px;padding:0 14px;font-size:11px;justify-content:space-between}
.dw-device.web .dw-device-bar{height:28px;justify-content:flex-start;padding:0 10px;background:#eceef3;border-bottom:1px solid #dfe2ea}
.dw-device-bar i{width:9px;height:9px;border-radius:50%;background:#ff5f57}.dw-device-bar i:nth-child(2){background:#febc2e}.dw-device-bar i:nth-child(3){background:#28c840}
.dw-device-bar span:last-child{color:#6b7280}.dw-device.web .dw-device-bar span{margin-left:8px;padding:2px 10px;border-radius:6px;background:#fff}
.dw-svg{display:block;touch-action:none;user-select:none;cursor:default;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
.dw-svg.drawing-tool{cursor:crosshair}.dw-svg:focus{outline:none}.dw-svg:focus-visible{outline:2px solid #7c6cd8}
.dw-svg [data-shape-id]{cursor:move}.dw-svg [data-handle]{cursor:nwse-resize}
.dw-bottom{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:8px 12px;background:#fff;border-top:1px solid #e3e5ec}
.dw-text{display:flex;align-items:center;gap:8px;flex:1 1 320px;font-weight:700}
.dw-text textarea{flex:1;min-width:0;resize:vertical;padding:6px 8px;border:1px solid #d5d8e1;border-radius:8px;font:inherit;font-weight:400}
.dw-status{color:#4a3ab0;font-weight:700}
.dw-status:empty{display:none}
.dw-bottom small{color:#6b7280}
@media (max-width:760px){.dw-dialog{width:100vw;height:100vh;border-radius:0}.dw-body{flex-direction:column}.dw-tools{flex-direction:row;flex-wrap:wrap;width:auto;max-height:118px;border-right:0;border-bottom:1px solid #e3e5ec}.dw-sep{width:1px;height:auto;margin:0 2px}.dw-stamps{flex-direction:row;flex-wrap:wrap}.dw-group-label,.dw-tools kbd,.dw-bottom small{display:none}}
`;
  document.head.append(style);
}
function phoneContent(screen, interactive = false, action = "go-screen") {
  const blocks = sectionLines(screen);
  const links = state.links.filter((link) => link.from === screen.id).map((link) => ({ link, target: state.screens.find((item) => item.id === link.to) })).filter((entry) => entry.target);
  const footer = `<div class="phone-footer">${interactive && links.length ? links.map(({ link, target }) => `<button class="phone-cta" data-action="${action}" data-id="${escapeHtml(target.id)}">${escapeHtml(link.label || target.title)} →</button>`).join("") : `<div class="phone-cta muted">${escapeHtml(screen.actionLabel || "주요 버튼")}</div>`}</div>`;
  if (hasDrawing(screen)) return drawingView(screen, footer);
  if (isWebScreen(screen)) return webShell(screen, footer);
  if (isChatScreen(screen)) return chatMock(screen, footer);
  return `<div class="phone-frame"><div class="phone-island"></div><div class="phone-screen"><div class="phone-top"><span>9:41</span><span>●●● ▰</span></div><div class="phone-body"><div class="phone-kicker">${escapeHtml(state.projectName)}</div><h3>${escapeHtml(screen.title)}</h3><p class="phone-purpose">${escapeHtml(screen.purpose || "이 화면의 목적을 적어 주세요.")}</p><div class="wire-blocks">${blocks.length ? blocks.map((block, index) => `<div class="wire-block"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(block)}</div>`).join("") : `<div class="wire-placeholder">+ 정보 블록을 추가해 주세요</div>`}</div></div>${footer}</div><div class="phone-home"></div></div>`;
}
function wireframe() {
  const button = `<div class="intro-buttons">${viewSwitch()}<button class="outline-button" data-action="save-version">버전 저장</button><button class="outline-button" data-action="export-pdf">PDF 내보내기</button><button class="outline-button" data-action="import-merge">파일 합쳐 불러오기</button><button class="outline-button" data-action="add-draw-screen">+ 그림 화면</button><button class="outline-button" data-action="add-web-screen">+ 웹 화면</button><button class="outline-button" data-action="add-chat-screen">+ ChatGPT 화면</button><button class="primary-button" data-action="add-screen">+ 화면 추가</button></div>`;
  return `${pageHeader("ROOM 02 / STRUCTURE", "와이어프레임", "화면별 목적과 정보의 순서를 잡습니다. 이 목록이 흐름도와 프로토타입의 공통 원본입니다. 정보 블록에 ChatGPT 블록을 넣으면 ChatGPT 대화 목업으로, 웹 블록을 넣으면 브라우저 목업으로 그려집니다. 원하는 모양이 있으면 그리기로 네모·원·선을 직접 그리세요.", button)}
  ${state.screens.length ? `<div class="wire-grid">${state.screens.map((screen, index) => `<article class="wire-card${isWideScreen(screen) ? " wb-wire-card" : ""}" data-presence-id="${escapeHtml(screen.id)}"><div class="wire-heading"><span class="index-label">SCREEN ${String(index + 1).padStart(2, "0")}</span><span class="status ${screen.status === "확정" ? "done" : "in-progress"}">${escapeHtml(screen.status)}</span></div>${phoneContent(screen)}<div class="wire-meta"><h2>${escapeHtml(screen.title)}</h2><p>${escapeHtml(screen.purpose || "목적 미입력")}</p><div class="card-actions"><button data-action="draw-screen" data-id="${escapeHtml(screen.id)}">그리기</button><button data-action="edit-screen" data-id="${escapeHtml(screen.id)}">편집</button><button data-action="delete-screen" data-id="${escapeHtml(screen.id)}">삭제</button>${commentToggle(screen)}</div>${commentPanel(screen)}</div></article>`).join("")}</div>` : empty("▦", "아직 화면이 없습니다", "첫 화면을 추가하면 흐름도와 프로토타입에도 자동으로 나타납니다.", "add-screen", "+ 첫 화면 추가")}`;
}
// 흐름도에서는 설명 목록 대신 실제 화면 구조를 닮은 작은 폰 목업을 보여 준다.
// StudyMeta의 계획 → 학습 → 정리 화면은 각각 구성하고, 이후 추가하는 화면은 공통 폰 목업을 사용한다.
function flowPhoneContent(screen, action = "focus-flow-screen") {
  const linkButtons = state.links.filter((link) => link.from === screen.id)
    .map((link) => ({ link, target: state.screens.find((item) => item.id === link.to) }))
    .filter(({ target }) => target)
    .map(({ link, target }) => `<button class="flow-phone-action" data-action="${action}" data-id="${escapeHtml(target.id)}">${escapeHtml(link.label || target.title)} <span>→</span></button>`).join("");
  const url = validUrl(screen.url);
  if (url) return `<div class="phone-frame flow-phone"><div class="phone-island"></div><div class="phone-screen"><iframe class="flow-live-frame" title="${escapeHtml(screen.title)} 미리보기" src="${escapeHtml(url)}"></iframe><div class="flow-phone-footer">${linkButtons}</div></div><div class="phone-home"></div></div>`;
  // ChatGPT 블록이 있는 화면은 아래 고정 목업보다 우선한다. 정보 블록을 고치면 흐름도에도 바로 반영된다.
  const flowFooter = `<div class="flow-phone-footer">${linkButtons || `<span class="flow-no-link">연결된 화면이 없어요</span>`}</div>`;
  if (hasDrawing(screen)) return drawingView(screen, flowFooter);
  if (isWebScreen(screen)) return webShell(screen, flowFooter);
  if (isChatScreen(screen)) return chatMock(screen, flowFooter);
  const field = (label, value = "입력해 주세요") => `<div class="mock-field"><span>${label}</span><strong>${value}</strong></div>`;
  const chip = (text, active = false) => `<span class="mock-chip${active ? " active" : ""}">${text}</span>`;
  const card = (title, text, badge = "") => `<div class="mock-card"><div><strong>${title}</strong>${badge ? `<b>${badge}</b>` : ""}</div><p>${text}</p></div>`;
  // 체크박스와 위계는 기존 목업 클래스 안에서 기호로 표현한다.
  const todo = (title, text, badge, done = false) => card(`${done ? "☑" : "☐"} ${title}`, text, badge);
  const metric = (label, value) => `<div class="mock-metric">${label} <b>${value}</b></div>`;
  const views = {
    "plan-input": `<div class="mock-step">계획 세우기 <span>1 / 3</span></div><h4>무엇을<br>준비하고 있나요?</h4><p class="mock-sub">입력한 내용으로 할 일 체크리스트를 만들어요.</p>${field("과목", "미적분학")}${field("일정", "중간고사 · 10월 21일")}${field("시험범위", "1장 극한 ~ 3장 미분")}<div class="mock-upload">＋　PDF 업로드 <small>선택</small></div><div class="mock-secondary">＋ 과목 추가</div>`,
    "plan-analyze": `<div class="mock-step">자료 분석 <span>2 / 3</span></div><h4>PDF를 살펴보고<br>있어요</h4><p class="mock-sub">단원과 개념을 찾아 시험범위와 맞춰 봐요.</p><div class="mock-progress"><span></span></div><div class="mock-progress-label">미적분학 강의노트.pdf <strong>68%</strong></div>${card("찾은 단원", "극한 · 연속 · 미분", "3개")}${card("시험범위와 맞춰보기", "2장 연속도 범위에 들어가요", "확인")}<p class="mock-tip">PDF가 없으면 시험범위만으로 만들어요.</p>`,
    "plan-checklist": `<div class="mock-step">할 일 체크리스트 <span>3 / 3</span></div><h4>시험까지 할 일</h4><div class="mock-chips">${chip("전체", true)}${chip("AI 제안")}${chip("내가 추가")}</div>${todo("극한의 정의 복습", "근거: 시험범위 1장 · PDF 4쪽", "AI 제안", true)}${todo("연속 · 예제 5개", "근거: PDF 2장 예제", "AI 제안")}${todo("교수님 강조 부분 정리", "내가 판단해 추가", "내가 추가")}<div class="mock-secondary">＋ 할 일 직접 추가</div><p class="mock-tip">AI 제안은 수락 · 수정 · 삭제할 수 있어요.</p>`,
    "learn-start": `<div class="mock-step">학습 모드 <span>범위 선택</span></div><h4>오늘은 어디까지<br>공부할까요?</h4><div class="mock-chips">${chip("단원 단위", true)}${chip("개념 단위")}</div>${card("◉ 2장 연속", "개념 3개 · 할 일 2개", "선택")}${card("○ 3장 미분", "개념 4개 · 할 일 3개")}${card("○ 1장 극한", "완료한 할 일 1개")}<p class="mock-tip">계획은 학습 중에도 언제든 열어볼 수 있어요.</p>`,
    "learn-session": `<div class="mock-step">학습 중 <span>2장 연속</span></div><div class="mock-toggle">▤ 계획 보기 <span>상시</span></div>${metric("진행한 개념", "2 / 3")}<div class="mock-question-no">개념 · 중간값 정리</div><div class="mock-question">f가 [1, 3]에서 연속이고<br>f(1) &lt; 0 &lt; f(3)이면?</div>${field("내 답", "답을 입력하세요")}<div class="mock-secondary">힌트 · 설명 요청</div><p class="mock-tip">힌트·설명 요청과 풀이 과정이 관찰로 기록돼요.</p>`,
    "plan-drawer": `<div class="mock-step">학습 중 <span>계획 열람</span></div><h4>내 계획</h4><div class="mock-exam"><strong>D-25　미적분학 중간고사</strong><span>10월 21일</span></div><div class="mock-expanded"><strong>할 일 체크리스트</strong>${metric("☑ 극한의 정의 복습", "완료")}${metric("☐ 연속 · 예제 5개", "학습 중")}${metric("☐ 교수님 강조 부분", "내가 추가")}</div><p class="mock-tip">학습 화면 위에 열리는 패널이에요. 닫으면 하던 곳으로 돌아가요.</p>`,
    "learn-wrapup": `<div class="mock-step">학습 중 <span>마무리 감지</span></div><div class="mock-result">거의 다 봤어요!<small>2장 연속의 개념 3개를 모두 다뤘어요</small></div><h4>정리하고<br>넘어갈까요?</h4>${card("감지한 신호", "선택한 범위의 개념을 모두 다룸 · 마지막 문제 해결", "신호")}<div class="mock-suggestion">지금 정리해 두면<br>다음에 떠올리기 쉬워요.</div>`,
    "review-structure": `<div class="mock-step">정리 <span>구조화</span></div><h4>오늘 공부한<br>내용이에요</h4><div class="mock-expanded"><strong>2장 연속</strong>${metric("└ 연속의 정의", "☑")}${metric("　└ 좌·우극한 일치", "☑")}${metric("└ 불연속의 종류", "☐")}${metric("└ 중간값 정리", "☐")}${metric("　└ 근의 존재 판단", "☐")}</div><p class="mock-tip">이해했다고 느끼는 항목에 체크해 주세요. '이해했다'는 응답으로 기록돼요.</p>`,
    "review-state": `<div class="mock-step">정리 <span>내 상태</span></div><h4>이번 학습에서<br>보인 모습</h4>${card("연속의 정의", "개념 이해가 좋아지고 있어요", "변화")}${card("중간값 정리", "필요한 도움이 늘고 있어요", "도움이 필요해요")}${metric("도움 받은 횟수", "3 ›")}${metric("스스로 수정", "1 ›")}<p class="mock-tip">숫자를 누르면 근거를 볼 수 있어요. 합친 점수는 만들지 않아요.</p>`,
    "review-evidence": `<div class="mock-step">근거 보기 <span>도움 받은 횟수 3</span></div><h4>이런 관찰에서<br>나왔어요</h4><div class="mock-chips">${chip("힌트 요청", true)}${chip("힌트 받고 해결", true)}${chip("설명 듣고 해결")}</div>${card("중간값 정리 · 문제 2", "힌트 1회 요청 후 해결했어요", "관찰")}<div class="mock-expanded"><strong>관련 상태</strong>${metric("필요한 도움", "늘고 있어요")}${metric("풀이 과정", "능숙해지고 있어요")}${metric("기억", "변화 없음")}</div>`,
  };
  if (!views[screen.id]) return phoneContent(screen, true, action);
  return `<div class="phone-frame flow-phone"><div class="phone-island"></div><div class="phone-screen"><div class="phone-top"><span>9:41</span><span>●●● ▰</span></div><div class="mock-body"><div class="mock-brand">StudyMeta <span>설계 목업</span></div>${views[screen.id]}</div><div class="flow-phone-footer">${linkButtons || `<span class="flow-no-link">연결된 화면이 없어요</span>`}</div></div><div class="phone-home"></div></div>`;
}
// 흐름도 카드 하나. PDF로 내보낼 때(print)는 버튼 없이 같은 모양으로 그린다.
function flowNodeHtml(screen, index, print = false) {
  const wide = isWideScreen(screen);
  const unresolved = (screen.comments || []).filter((item) => !item.resolved).length;
  const actions = print ? "" : `<span class="dw-node-actions">${unresolved ? `<button class="cm-count" data-action="open-comments" data-id="${escapeHtml(screen.id)}" aria-label="코멘트 ${unresolved}개 보기">💬 ${unresolved}</button>` : ""}<button data-action="draw-screen" data-id="${escapeHtml(screen.id)}" aria-label="${escapeHtml(screen.title)} 그리기">그리기</button><button data-action="edit-screen" data-id="${escapeHtml(screen.id)}" aria-label="${escapeHtml(screen.title)} 편집">편집</button></span>`;
  return `<div class="flow-node${!print && flowFocus === screen.id ? " focused" : ""}${wide ? " web-node" : ""}" data-id="${escapeHtml(screen.id)}" data-presence-id="${escapeHtml(screen.id)}" style="left:${Number.isFinite(screen.x) ? flowX(screen) : 60 + (index % 5) * 310}px;top:${Number.isFinite(screen.y) ? screen.y : 60 + Math.floor(index / 5) * 580}px${wide ? `;width:${WEB_W}px` : ""}"><div class="flow-node-head"><span>SCREEN ${String(index + 1).padStart(2, "0")}　·　${screen.status === "확정" ? "확정" : "작업 중"}</span><span aria-hidden="true">⠿</span></div><div class="flow-node-title"><h3 title="${escapeHtml(screen.purpose || "")}">${escapeHtml(screen.title)}</h3>${actions}</div>${flowPhoneContent(screen)}</div>`;
}
function flow() {
  const button = `<div class="intro-buttons"><button class="outline-button" data-action="save-version">버전 저장</button><button class="outline-button" data-action="export-pdf">PDF 내보내기</button><button class="outline-button" data-action="add-screen">+ 화면</button><button class="outline-button" data-action="add-chat-screen">+ ChatGPT 화면</button><button class="outline-button" data-action="add-web-screen">+ 웹 화면</button><button class="outline-button" data-action="add-draw-screen">+ 그림 화면</button><button class="primary-button" data-action="add-link" ${state.screens.length < 2 ? "disabled" : ""}>+ 연결</button></div>`;
  return `${pageHeader("ROOM 03 / CONNECT", "흐름도", "화면을 보며 동선을 확인하세요. 폰 속 버튼을 누르면 연결된 화면으로 이동합니다.", button)}
  ${state.screens.length ? `<div class="flow-board"><div class="flow-toolbar"><span>상단 손잡이로 화면 이동 · 빈 바탕 드래그로 캔버스 이동 · 폰 버튼으로 연결 따라가기</span>${viewSwitch()}<div class="zoom-controls"><button class="zoom-button" type="button" data-action="zoom-out" aria-label="축소">−</button><span id="zoom-level" aria-live="polite">100%</span><button class="zoom-button" type="button" data-action="zoom-in" aria-label="확대">+</button><button class="zoom-button wide" type="button" data-action="zoom-fit">전체 맞춤</button></div></div><div class="flow-scroll"><div class="flow-canvas" id="flow-canvas"><div class="flow-stage" id="flow-stage"><svg id="flow-lines" class="flow-lines" aria-hidden="true"></svg>${state.screens.map((screen, index) => flowNodeHtml(screen, index)).join("")}</div></div></div></div><div class="flow-list"><div class="section-title small"><div><span class="eyebrow">CONNECTIONS</span><h2>화면 연결</h2></div><span>${state.links.length}개</span></div>${state.links.length ? state.links.map((link) => { const from = state.screens.find((item) => item.id === link.from); const to = state.screens.find((item) => item.id === link.to); return `<div class="link-row"><span>${escapeHtml(from?.title || "삭제된 화면")} <strong>→</strong> ${escapeHtml(to?.title || "삭제된 화면")}</span><span>${escapeHtml(link.label || "이동")}</span><button data-action="delete-link" data-id="${escapeHtml(link.id)}" aria-label="연결 삭제">×</button></div>`; }).join("") : `<p class="subtle">연결을 추가하면 여기와 프로토타입에 이동 경로가 나타납니다.</p>`}</div>` : empty("⑂", "연결할 화면이 없습니다", "와이어프레임에서 화면을 먼저 추가하세요.", "add-screen", "+ 첫 화면 추가")}`;
}
function prototype() {
  if (!state.screens.length) return `${pageHeader("ROOM 04 / EXPERIENCE", "목업 · 프로토타입", "화면을 폰 프레임에서 눌러보며 동선을 확인합니다.")}${empty("▶", "아직 눌러볼 화면이 없습니다", "와이어프레임에서 화면을 추가하면 이곳에서 바로 확인할 수 있습니다.", "add-screen", "+ 첫 화면 추가")}`;
  if (!state.screens.some((item) => item.id === selectedScreen)) selectedScreen = state.screens[0].id;
  const screen = state.screens.find((item) => item.id === selectedScreen);
  const url = validUrl(screen.url);
  return `${pageHeader("ROOM 04 / EXPERIENCE", "목업 · 프로토타입", "왼쪽에서 화면을 고르거나 폰 안의 이동 버튼을 눌러 실제 흐름처럼 확인하세요.", `<div class="intro-buttons">${viewSwitch()}</div>`)}
  <div class="prototype-layout"><aside class="screen-rail"><div class="rail-heading"><span class="eyebrow">SCREENS</span><strong>${state.screens.length}개 화면</strong></div>${state.screens.map((item, index) => `<button class="rail-item ${item.id === screen.id ? "selected" : ""}" data-action="go-screen" data-id="${escapeHtml(item.id)}" data-presence-id="${escapeHtml(item.id)}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(item.title)}</strong><i>↗</i></button>`).join("")}<div class="rail-note">흐름도에서 연결한 화면은 폰 안의 버튼으로 이동할 수 있습니다.</div></aside><div class="preview-area"><div class="preview-toolbar"><span class="live-dot"></span><span>${url ? "실제 화면 미리보기" : "설계 목업"}</span><span class="spacer"></span>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">새 탭에서 열기 ↗</a>` : `<button data-action="draw-screen" data-id="${escapeHtml(screen.id)}">이 화면 그리기 ✎</button><button data-action="edit-screen" data-id="${escapeHtml(screen.id)}">이 화면 편집 ↗</button>`}</div><div class="preview-center">${url ? `<div class="phone-frame live-phone"><div class="phone-island"></div><iframe title="${escapeHtml(screen.title)} 미리보기" src="${escapeHtml(url)}"></iframe><div class="phone-home"></div></div>` : flowPhoneContent(screen, "go-screen")}<div class="preview-caption"><strong>${escapeHtml(screen.title)}</strong><p>${escapeHtml(screen.purpose || "화면 목적 미입력")}</p>${url ? "<small>외부 사이트는 임베드를 차단할 수 있습니다. 이 경우 새 탭에서 여세요.</small>" : ""}</div></div></div></div>`;
}
function drawLines(root = document, board = state) {
  const svg = root.querySelector("#flow-lines");
  if (!svg) return;
  const { width, height } = stageSize(board);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  const widths = Object.fromEntries(board.screens.map((screen) => [screen.id, nodeWidth(screen)]));
  const nodes = [...root.querySelectorAll(".flow-node")];
  const focus = root === document ? flowFocus : null;
  svg.innerHTML = `<defs><marker id="flow-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M 0 0 L 9 4.5 L 0 9 z" fill="#8879d4"/></marker></defs>` + board.links.map((link) => {
    const from = nodes.find((node) => node.dataset.id === link.from);
    const to = nodes.find((node) => node.dataset.id === link.to);
    if (!from || !to) return "";
    const fx = parseFloat(from.style.left), fy = parseFloat(from.style.top);
    const tx = parseFloat(to.style.left), ty = parseFloat(to.style.top);
    // 웹 화면은 폰보다 넓어서 화면마다 너비를 따로 쓰고, 방향은 두 화면의 가운데끼리 비교한다.
    const fw = widths[link.from] || NODE_W, tw = widths[link.to] || NODE_W;
    const dx = (tx + tw / 2) - (fx + fw / 2), dy = ty - fy;
    const horizontal = Math.abs(dx) > Math.abs(dy) * .8;
    const x1 = horizontal ? fx + (dx >= 0 ? fw : 0) : fx + fw / 2;
    const fh = from.offsetHeight || NODE_H, th = to.offsetHeight || NODE_H; // 카드 실제 높이(목적 문구를 빼서 화면마다 다를 수 있다)
    const y1 = horizontal ? fy + fh / 2 : fy + (dy >= 0 ? fh : 0);
    const x2 = horizontal ? tx + (dx >= 0 ? 0 : tw) : tx + tw / 2;
    const y2 = horizontal ? ty + th / 2 : ty + (dy >= 0 ? 0 : th);
    const bend = Math.max(55, Math.min(180, (horizontal ? Math.abs(x2 - x1) : Math.abs(y2 - y1)) * .48));
    // 서로 되돌아오는 두 연결은 겹치지 않게 조금 벌린다(오른쪽·아래로 가는 선이 위·왼쪽).
    const paired = board.links.some((other) => other.from === link.to && other.to === link.from);
    const shift = paired ? ((horizontal ? dx : dy) >= 0 ? -22 : 22) : 0;
    let path = horizontal
      ? `M ${x1} ${y1 + shift} C ${x1 + Math.sign(dx) * bend} ${y1 + shift}, ${x2 - Math.sign(dx) * bend} ${y2 + shift}, ${x2} ${y2 + shift}`
      : `M ${x1 + shift} ${y1} C ${x1 + shift} ${y1 + Math.sign(dy) * bend}, ${x2 + shift} ${y2 - Math.sign(dy) * bend}, ${x2 + shift} ${y2}`;
    // 같은 줄에서 화면을 건너뛰는 연결은 화면 위쪽으로 넘어가 중간 화면을 가리지 않는다.
    if (horizontal && Math.abs(dy) < 40 && Math.abs(x2 - x1) > NODE_W + 70) {
      const top = Math.max(8, Math.min(fy, ty) - 52);
      path = `M ${fx + fw / 2} ${fy} C ${fx + fw / 2} ${top}, ${tx + tw / 2} ${top}, ${tx + tw / 2} ${ty}`;
    }
    // 다른 열로 올라가거나 내려가는 연결은 두 줄 사이 틈으로 보내고, 가운데를 비켜 도착한다.
    if (!horizontal && Math.abs(dx) > 40) {
      const endX = tx + tw / 2 + (dx > 0 ? -1 : 1) * Math.min(tw, NODE_W) * .3;
      const middle = (y1 + y2) / 2;
      path = `M ${x1} ${y1} C ${x1} ${middle}, ${endX} ${middle}, ${endX} ${y2}`;
    }
    const active = focus && (focus === link.from || focus === link.to);
    return `<path class="flow-link${active ? " active" : ""}${link.to === "plan-drawer" ? " panel-link" : ""}" d="${path}" fill="none" stroke="${active ? "#6a58d6" : "#8879d4"}" stroke-width="${active ? 3 : 2}" stroke-linecap="round" marker-end="url(#flow-arrow)"><title>${escapeHtml(link.label || "화면 이동")}</title></path>`;
  }).join("");
}
function focusFlowScreen(screenId) {
  flowFocus = screenId;
  document.querySelectorAll(".flow-node").forEach((node) => node.classList.toggle("focused", node.dataset.id === screenId));
  drawLines();
  const node = [...document.querySelectorAll(".flow-node")].find((element) => element.dataset.id === screenId);
  const scroll = $(".flow-scroll");
  if (!node || !scroll) return;
  scroll.scrollTo({ left: (parseFloat(node.style.left) + node.offsetWidth / 2) * flowScale - scroll.clientWidth / 2, top: (parseFloat(node.style.top) + node.offsetHeight / 2) * flowScale - scroll.clientHeight / 2, behavior: "smooth" });
}
function setFlowExpanded(expanded) {
  flowExpanded = expanded;
  document.body.classList.toggle("flow-expanded", expanded);
  const button = $("[data-action='toggle-flow-fullscreen']");
  if (button) {
    button.textContent = expanded ? "전체화면 닫기" : "전체화면";
    button.setAttribute("aria-pressed", String(expanded));
  }
  // 흐름도 틀(.flow-board)을 창 전체로 넓히고, 가능하면 브라우저 전체화면도 켠다.
  // 문서 전체를 전체화면으로 두어서 팀원 변경으로 다시 그려져도 풀리지 않는다.
  if (expanded && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  if (!expanded && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  requestAnimationFrame(() => { if (expanded) fitScale(); else applyScale(); });
}
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && flowExpanded) setFlowExpanded(false); });
function render() {
  nav();
  const route = currentRoute();
  $("#app").innerHTML = ready ? versionBanner() + ({ home, lab, wireframe, flow, prototype, versions: versionsRoom, requests: requestsRoom })[route]() : `<div class="empty-state collab-loading"><div class="empty-icon">⟳</div><h2>공동 작업판에 연결하는 중…</h2><p>작업판 서버가 켜져 있는지 확인해 주세요.</p></div>`;
  document.body.classList.toggle("flow-expanded", ready && route === "flow" && flowExpanded);
  if (ready && route === "flow") $(".zoom-controls")?.insertAdjacentHTML("beforeend", `<button class="zoom-button wide fullscreen-button" type="button" data-action="toggle-flow-fullscreen" aria-pressed="${flowExpanded}">${flowExpanded ? "전체화면 닫기" : "전체화면"}</button>`);
  if (ready && route === "flow") { applyScale(); drawLines(); }
  if (ready && route === "requests") loadThumbs();
  decoratePresence();
}

// ── 버전 폴더 ───────────────────────────────────────────────────────
// 버튼 한 번으로 지금 작업판(와이어프레임 + 흐름도 + 코멘트)을 서버의 data/versions/에 저장하고,
// 폴더를 열면 그때 모습을 읽기 전용으로 본다. 되돌리기는 기존 replace op를 쓴다(서버가 직전 상태를 백업).
const shortDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); };
async function loadVersions() {
  try {
    const response = await fetch("/api/versions", { headers: { "ngrok-skip-browser-warning": "1" } });
    if (response.ok) { versions = (await response.json()).versions || []; if (currentRoute() === "versions") refresh(); }
  } catch { /* 서버가 예전 버전이면 목록 없이 둔다 */ }
}
async function fetchVersion(versionId) {
  const response = await fetch(`/api/versions/${encodeURIComponent(versionId)}`, { headers: { "ngrok-skip-browser-warning": "1" } });
  if (!response.ok) throw new Error("missing version");
  return (await response.json()).version;
}
async function saveVersion() {
  const name = prompt("저장할 버전 이름을 적어 주세요.", `v${versions.length + 1} · ${new Date().toLocaleDateString("ko-KR")}`);
  if (name === null) return;
  try {
    const data = await post("/api/versions", { client: clientId, name });
    toast(`"${data.version.name}" 버전을 버전 폴더에 저장했어요.`);
  } catch { toast("버전을 저장하지 못했어요. 작업판 서버(server.mjs)를 새 파일로 바꾸고 다시 켰는지 확인해 주세요."); }
}
async function openVersion(versionId, route = "wireframe") {
  try {
    const version = await fetchVersion(versionId);
    if (!viewing) liveState = state;
    viewing = { id: version.id, name: version.name, savedAt: version.savedAt, by: version.by };
    state = normalizeBoard(version.board) || blank();
    if (currentRoute() === route) refresh(); else location.hash = `#${route}`;
  } catch { toast("버전을 열 수 없어요. 이미 삭제됐을 수 있어요."); }
}
function closeVersion() {
  if (!viewing) return;
  state = liveState || state;
  liveState = null;
  viewing = null;
  refresh();
}
async function restoreVersion(versionId) {
  if (!confirm("이 버전으로 작업판 전체를 되돌릴까요?\n지금 상태는 '되돌리기 전 자동 저장' 버전으로 먼저 저장해 둘게요.")) return;
  try {
    const version = viewing?.id === versionId ? { name: viewing.name, board: state } : await fetchVersion(versionId);
    const snapshot = JSON.parse(JSON.stringify(version.board));
    closeVersion();
    await post("/api/versions", { client: clientId, name: `되돌리기 전 자동 저장 · ${new Date().toLocaleString("ko-KR")}` });
    if (commit({ type: "replace", board: snapshot })) toast(`"${version.name}" 버전으로 되돌렸어요.`);
  } catch { toast("되돌리지 못했어요. 서버 연결을 확인해 주세요."); }
}
async function deleteVersion(versionId) {
  const version = versions.find((item) => item.id === versionId);
  if (!confirm(`"${version?.name || "이 버전"}" 폴더를 삭제할까요? 모든 팀원에게서 함께 사라져요.`)) return;
  try {
    await post(`/api/versions/${encodeURIComponent(versionId)}/delete`, { client: clientId });
    if (viewing?.id === versionId) closeVersion();
    toast("버전을 삭제했어요.");
  } catch { toast("버전을 삭제하지 못했어요."); }
}
async function versionPdf(versionId) {
  try {
    const version = await fetchVersion(versionId);
    exportPdf(version.name, normalizeBoard(version.board) || blank());
  } catch { toast("버전을 열 수 없어요."); }
}
function versionBanner() {
  if (!viewing) return "";
  return `<div class="vr-banner" role="status"><span><b>📁 ${escapeHtml(viewing.name)}</b> · ${escapeHtml(shortDate(viewing.savedAt))} · ${escapeHtml(viewing.by)} — 저장된 버전을 보는 중이에요 (읽기 전용)</span><span class="vr-banner-actions"><a href="#wireframe">와이어프레임</a><a href="#flow">흐름도</a><button data-action="export-pdf">PDF</button><button data-action="restore-version" data-id="${escapeHtml(viewing.id)}">이 버전으로 되돌리기</button><button class="vr-primary" data-action="close-version">현재 작업판으로 돌아가기</button></span></div>`;
}
function versionsRoom() {
  const button = `<div class="intro-buttons"><button class="outline-button" data-action="export-pdf">${viewing ? "보는 버전 PDF" : "지금 작업판 PDF"}</button><button class="primary-button" data-action="save-version">+ 지금 상태를 버전으로 저장</button></div>`;
  const card = (version) => `<article class="vr-card${viewing?.id === version.id ? " viewing" : ""}"><div class="vr-folder" aria-hidden="true">📁</div><div class="vr-info"><strong>${escapeHtml(version.name)}</strong><span>${escapeHtml(shortDate(version.savedAt))} · ${escapeHtml(version.by)}</span><small>화면 ${version.screens}개 · 연결 ${version.links}개</small></div><div class="card-actions"><button data-action="open-version" data-id="${escapeHtml(version.id)}" data-route="wireframe">와이어프레임</button><button data-action="open-version" data-id="${escapeHtml(version.id)}" data-route="flow">흐름도</button><button data-action="version-pdf" data-id="${escapeHtml(version.id)}">PDF</button><button data-action="restore-version" data-id="${escapeHtml(version.id)}">되돌리기</button><button data-action="delete-version" data-id="${escapeHtml(version.id)}">삭제</button></div></article>`;
  return `${pageHeader("ROOM 05 / VERSIONS", "버전 폴더", "와이어프레임과 흐름도를 한 묶음으로 저장해 둡니다. 폴더를 열면 그때의 화면과 흐름을 그대로 볼 수 있고, 필요하면 그 버전으로 되돌릴 수 있어요.", button)}
  ${versions.length ? `<div class="vr-grid">${versions.map(card).join("")}</div>` : empty("▤", "아직 저장한 버전이 없어요", "지금 상태를 저장하면 폴더로 쌓입니다. 와이어프레임 · 흐름도의 [버전 저장] 버튼으로도 저장할 수 있어요.", "save-version", "+ 첫 버전 저장")}`;
}

// ── 코멘트 ─────────────────────────────────────────────────────────
// 와이어프레임 화면(kind "screen")과 실험실 가설(kind "experiment")에 같은 코멘트 칸을 쓴다.
const commentWhere = (kind, targetId) => (kind === "experiment" ? { experimentId: targetId } : { screenId: targetId });
const commentTarget = (kind, targetId) => (kind === "experiment" ? state.experiments : state.screens).find((item) => item.id === targetId);
const STANCE_LABEL = { agree: "찬성", disagree: "반대" };
function commentToggle(item, kind = "screen") {
  const comments = item.comments || [];
  const open = unresolvedCount(item);
  return `<button class="cm-toggle${open ? " has-open" : ""}" data-action="toggle-comments" data-id="${escapeHtml(item.id)}" aria-expanded="${openComments.has(item.id)}">코멘트${comments.length ? ` ${open}/${comments.length}` : ""}</button>`;
}
const unresolvedCount = (item) => (item.comments || []).filter((comment) => !comment.resolved).length;
function commentPanel(target, kind = "screen") {
  if (!openComments.has(target.id)) return "";
  const key = `data-target="${escapeHtml(target.id)}" data-kind="${kind}"`;
  const comments = [...(target.comments || [])].sort((a, b) => Number(a.resolved) - Number(b.resolved));
  const list = comments.map((item) => `<li class="cm-item${item.resolved ? " resolved" : ""}"><div class="cm-meta"><b style="color:${escapeHtml(item.color)}">${escapeHtml(item.by)}</b>${item.stance ? `<span class="cm-stance ${item.stance}">${STANCE_LABEL[item.stance]}</span>` : ""}<time>${escapeHtml(shortDate(item.at))}</time>${item.resolved ? "<em>해결됨</em>" : ""}</div><p>${escapeHtml(item.text)}</p>${viewing ? "" : `<div class="cm-actions"><button data-action="resolve-comment" data-id="${escapeHtml(item.id)}" ${key}>${item.resolved ? "다시 열기" : "해결"}</button><button data-action="delete-comment" data-id="${escapeHtml(item.id)}" ${key}>삭제</button></div>`}</li>`).join("");
  const stance = kind === "experiment" ? myVote(target) : "";
  const label = kind === "experiment" ? `익명으로 의견 남기기 — 이름은 저장되지 않아요${stance ? ` · 내 표 <span class="cm-stance ${stance}">${STANCE_LABEL[stance]}</span>가 함께 붙어요` : ""}` : `${escapeHtml(collab.me.name)}(으)로 코멘트 남기기`;
  const form = viewing ? "" : `<form class="cm-form" ${key}><label class="cm-label" for="cm-${escapeHtml(target.id)}">${label}</label><textarea id="cm-${escapeHtml(target.id)}" data-keep-focus="cm-${escapeHtml(target.id)}" data-comment-input="${escapeHtml(target.id)}" rows="2" maxlength="1000" placeholder="${kind === "experiment" ? "찬성 · 반대 이유나 보완할 점을 남겨 주세요" : "의견을 남겨 주세요"} (⌘/Ctrl+Enter로 등록)">${escapeHtml(commentDrafts.get(target.id) || "")}</textarea><button type="submit">등록</button></form>`;
  return `<div class="cm-panel" aria-label="${escapeHtml(target.title)} 코멘트">${list ? `<ul class="cm-list">${list}</ul>` : `<p class="cm-empty">아직 코멘트가 없어요.</p>`}${form}</div>`;
}
function addComment(targetId, kind = "screen") {
  const text = String(commentDrafts.get(targetId) || $(`[data-comment-input="${CSS.escape(targetId)}"]`)?.value || "").trim();
  if (!text) return;
  const target = commentTarget(kind, targetId);
  const anonymous = kind === "experiment";
  const stance = anonymous && target ? myVote(target) : "";
  const commentId = id();
  if (anonymous) myAnonymousComments.add(commentId);
  if (commit({ type: "comment.add", ...commentWhere(kind, targetId), item: { id: commentId, text, by: anonymous ? ANONYMOUS : collab.me.name, color: anonymous ? "#6b7280" : collab.me.color, at: new Date().toISOString(), ...(stance ? { stance } : {}) } })) {
    commentDrafts.delete(targetId);
    refresh();
    $(`[data-comment-input="${CSS.escape(targetId)}"]`)?.focus();
  }
}

// ── 실험실 가설 찬반 (익명) ── 이 브라우저가 가설마다 무작위 투표자 id를 따로 만들어 둔다.
// 가설끼리 id가 달라서 한 사람의 표를 여러 가설에 걸쳐 이어 볼 수 없다. 같은 버튼을 다시 누르면 표를 거둔다.
const VOTER_IDS_KEY = "workboard-voter-ids", LEGACY_VOTER_KEY = "workboard-voter-id";
const myAnonymousComments = new Set(); // 내가 방금 단 익명 코멘트(내 코멘트 알림을 나에게 띄우지 않으려고)
function voterFor(experiment, create = false) {
  let ids = {};
  try { ids = JSON.parse(storage.get(VOTER_IDS_KEY) || "{}") || {}; } catch { ids = {}; }
  if (ids[experiment.id]) return ids[experiment.id];
  const legacy = storage.get(LEGACY_VOTER_KEY); // 익명 전환 전에 던진 표는 그 id로 계속 알아본다
  if (legacy && (experiment.votes || []).some((vote) => vote.id === legacy)) return legacy;
  if (!create) return "";
  ids[experiment.id] = `v-${id()}`;
  storage.set(VOTER_IDS_KEY, JSON.stringify(ids));
  return ids[experiment.id];
}
const myVote = (experiment) => { const voter = voterFor(experiment); return voter ? (experiment.votes || []).find((vote) => vote.id === voter)?.value || "" : ""; };
function voteBar(experiment) {
  const votes = experiment.votes || [], mine = myVote(experiment);
  const group = (value) => votes.filter((vote) => vote.value === value);
  const agree = group("agree").length, disagree = group("disagree").length;
  const button = (value, icon) => `<button type="button" class="xp-vote-btn ${value}" data-action="vote" data-id="${escapeHtml(experiment.id)}" data-value="${value}" aria-pressed="${mine === value}">${icon} ${STANCE_LABEL[value]} <b>${group(value).length}</b></button>`;
  const who = `<p class="xp-voters${votes.length ? "" : " empty"}">${votes.length ? `${votes.length}명 참여 · ` : "아직 표가 없어요 · "}익명 투표라 누가 어느 쪽인지는 보이지 않아요${mine ? ` · 내 표: ${STANCE_LABEL[mine]}` : ""}</p>`;
  const meter = votes.length ? `<div class="xp-meter" role="img" aria-label="찬성 ${agree}표, 반대 ${disagree}표"><i class="agree" style="width:${(agree / votes.length) * 100}%"></i><i class="disagree" style="width:${(disagree / votes.length) * 100}%"></i></div>` : "";
  return `<div class="xp-votes"><div class="xp-vote-row" role="group" aria-label="이 가설에 대한 찬반">${button("agree", "👍")}${button("disagree", "👎")}</div>${meter}${who}</div>`;
}
function castVote(experimentId, value) {
  const experiment = state.experiments.find((item) => item.id === experimentId);
  if (!experiment) return;
  const next = myVote(experiment) === value ? "" : value;
  const voter = voterFor(experiment, true);
  commit({ type: "vote.set", experimentId, vote: next ? { id: voter, value: next } : { id: voter } });
}

// ── 자료 요청 · 전달 ────────────────────────────────────────────────
// 요청하는 사람 / 요청할 자료 · 형식 / 요청 받는 사람을 적고, 받는 사람이 카드 안 업로드 칸에 파일이나 링크를 올린다.
// 파일은 서버의 data/files/에 저장되고, 작업판에는 이름 · 크기만 남는다. 받기는 fetch로 해서 ngrok 경고 페이지를 피한다.
const REQUEST_FORMATS = ["PDF", "이미지 (PNG · JPG)", "피그마 링크", "문서 (Word · 한글 · 구글 문서)", "엑셀 · CSV", "PPT · 키노트", "영상", "텍스트 · 메모", "기타"];
const UPLOAD_MAX = 50 * 1024 * 1024;
const THUMB_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const REQUEST_ORDER = { "요청": 0, "전달됨": 1, "완료": 2 };
let requestFilter = "all";
const uploads = new Map(); // 요청 id → { name, done, total, loaded, size }
const thumbs = new Map(); // 파일 id → blob URL
const requestPayload = (source) => ({ from: String(source.from || "").trim().slice(0, 40), to: String(source.to || "").trim().slice(0, 40), what: String(source.what || "").trim().slice(0, 300), format: String(source.format || "").trim().slice(0, 200), note: String(source.note || "").trim().slice(0, 2000) });
const fileSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)}MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)}KB` : `${bytes}B`);
function teamNames() {
  const names = new Set([collab.me.name, ...Object.values(collab.peers || {}).map((peer) => peer.name)]);
  for (const request of state.requests || []) { if (request.from) names.add(request.from); if (request.to) names.add(request.to); }
  return [...names].filter(Boolean);
}
function requestEditorFields(item) {
  const list = (name, options) => `<datalist id="${name}">${options.map((option) => `<option value="${escapeHtml(option)}"></option>`).join("")}</datalist>`;
  const input = (label, name, value, extra = "", help = "") => `<label class="form-field"><span>${label}</span><input name="${name}" value="${escapeHtml(value)}" ${extra} />${help ? `<small>${help}</small>` : ""}</label>`;
  return input("요청하는 사람", "from", item?.from ?? collab.me.name, 'list="rq-names" maxlength="40"')
    + input("요청할 자료", "what", item?.what || "", 'required maxlength="300" placeholder="예: 3주차 강의 자료, 로고 원본"')
    + input("형식", "format", item?.format || "", 'list="rq-formats" maxlength="200" placeholder="예: PDF, 피그마 링크"', "목록에서 고르거나 직접 적어 주세요.")
    + input("요청 받는 사람", "to", item?.to || "", 'list="rq-names" maxlength="40" placeholder="팀원 이름"', "받는 사람 이름이 작업판에서 쓰는 이름과 같으면 그 사람에게 알림이 떠요.")
    + `<label class="form-field"><span>메모 (선택)</span><textarea name="note" rows="3" maxlength="2000" placeholder="언제까지, 어디에 쓸 자료인지 등">${escapeHtml(item?.note || "")}</textarea></label>`
    + list("rq-names", teamNames()) + list("rq-formats", REQUEST_FORMATS);
}
function requestItemHtml(request, item) {
  const meta = `<small>${item.kind === "file" ? `${fileSize(item.size)} · ` : ""}${escapeHtml(item.by)} · ${escapeHtml(shortDate(item.at))}</small>`;
  const remove = viewing ? "" : `<button class="rq-item-delete" data-action="delete-request-item" data-id="${escapeHtml(item.id)}" data-request="${escapeHtml(request.id)}" aria-label="${escapeHtml(item.name)} 지우기">×</button>`;
  if (item.kind === "link") return `<li class="rq-item"><span class="rq-item-icon" aria-hidden="true">🔗</span><div><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.name)} ↗</a>${meta}</div>${remove}</li>`;
  const thumb = THUMB_TYPES.has(item.type) ? `<img class="rq-thumb" data-thumb="${escapeHtml(item.id)}" alt="" ${thumbs.has(item.id) ? `src="${thumbs.get(item.id)}"` : ""} />` : `<span class="rq-item-icon" aria-hidden="true">📄</span>`;
  return `<li class="rq-item">${thumb}<div><button class="rq-file" data-action="download-file" data-id="${escapeHtml(item.id)}">${escapeHtml(item.name)} ↓</button>${meta}</div>${remove}</li>`;
}
function requestCard(request) {
  const statusClass = request.status === "완료" ? "done" : request.status === "전달됨" ? "in-progress" : "paused";
  const upload = uploads.get(request.id);
  const drop = viewing ? "" : `<div class="rq-drop" data-request="${escapeHtml(request.id)}"><p>파일을 여기로 끌어다 놓거나 <label class="rq-pick">파일 선택<input type="file" multiple data-upload="${escapeHtml(request.id)}" /></label> <small>(파일당 50MB까지)</small></p><form class="rq-link" data-request="${escapeHtml(request.id)}"><input type="url" name="url" placeholder="또는 링크 붙여넣기 (피그마 · 드라이브 등)" aria-label="자료 링크" required /><button type="submit">링크 추가</button></form><p class="rq-progress" data-progress="${escapeHtml(request.id)}" aria-live="polite">${upload ? uploadText(upload) : ""}</p></div>`;
  const statusButton = request.status === "완료" ? `<button data-action="request-status" data-id="${escapeHtml(request.id)}" data-status="${request.items.length ? "전달됨" : "요청"}">다시 열기</button>` : `<button data-action="request-status" data-id="${escapeHtml(request.id)}" data-status="완료">받았어요 · 완료</button>`;
  return `<article class="rq-card" data-presence-id="${escapeHtml(request.id)}"><div class="card-top"><span class="status ${statusClass}">${escapeHtml(request.status)}</span><time>${escapeHtml(shortDate(request.createdAt))}</time></div>
    <dl class="rq-people"><div><dt>요청하는 사람</dt><dd>${escapeHtml(request.from || "—")}</dd></div><span aria-hidden="true">→</span><div><dt>요청 받는 사람</dt><dd>${escapeHtml(request.to || "—")}</dd></div></dl>
    <div class="rq-what"><span class="rq-label">요청할 자료</span><h2>${escapeHtml(request.what)}</h2>${request.format ? `<p><span class="rq-label">형식</span> ${escapeHtml(request.format)}</p>` : ""}${request.note ? `<p class="rq-note">${escapeHtml(request.note)}</p>` : ""}</div>
    <section class="rq-box" aria-label="자료 올리는 곳"><h3>자료 올리는 곳 <span>${request.items.length}개</span></h3>${request.items.length ? `<ul class="rq-items">${request.items.map((item) => requestItemHtml(request, item)).join("")}</ul>` : `<p class="rq-empty">아직 올라온 자료가 없어요.</p>`}${drop}</section>
    <div class="card-actions">${statusButton}<button data-action="edit-request" data-id="${escapeHtml(request.id)}">편집</button><button data-action="delete-request" data-id="${escapeHtml(request.id)}">삭제</button></div></article>`;
}
function requestsRoom() {
  const me = collab.me.name, list = state.requests || [];
  const tests = { all: () => true, "to-me": (request) => request.to === me, "from-me": (request) => request.from === me, open: (request) => request.status !== "완료" };
  const filters = [["all", "전체"], ["to-me", "나에게 온 요청"], ["from-me", "내가 한 요청"], ["open", "안 끝난 요청"]];
  const shown = list.filter(tests[requestFilter] || tests.all).sort((a, b) => REQUEST_ORDER[a.status] - REQUEST_ORDER[b.status] || String(b.createdAt).localeCompare(String(a.createdAt)));
  const button = `<button class="primary-button" data-action="add-request">+ 자료 요청</button>`;
  return `${pageHeader("ROOM 06 / SHARE", "자료 요청 · 전달", "필요한 자료를 누구에게, 어떤 형식으로 받을지 적어 두세요. 요청 받은 사람은 카드 안 칸에 파일이나 링크를 바로 올리면 됩니다.", button)}
  ${list.length ? `<div class="rq-filters" role="group" aria-label="요청 거르기">${filters.map(([value, label]) => `<button type="button" data-action="request-filter" data-filter="${value}" aria-pressed="${requestFilter === value}">${label} <b>${list.filter(tests[value]).length}</b></button>`).join("")}<span class="rq-me">내 이름: <b>${escapeHtml(me)}</b></span></div>
  ${shown.length ? `<div class="rq-grid">${shown.map(requestCard).join("")}</div>` : `<p class="subtle rq-none">이 조건에 맞는 요청이 없어요.</p>`}` : empty("⇄", "아직 자료 요청이 없어요", "필요한 자료와 형식, 받을 사람을 적으면 요청 카드가 생기고, 받는 사람이 그 카드에 자료를 올립니다.", "add-request", "+ 첫 자료 요청")}`;
}
const uploadText = (upload) => `${escapeHtml(upload.name)} 올리는 중… ${upload.size ? Math.round((upload.loaded / upload.size) * 100) : 0}%${upload.total > 1 ? ` (${upload.done + 1}/${upload.total})` : ""}`;
function showUpload(requestId) {
  const element = [...document.querySelectorAll("[data-progress]")].find((item) => item.dataset.progress === requestId);
  const upload = uploads.get(requestId);
  if (element) element.innerHTML = upload ? uploadText(upload) : "";
}
function uploadOne(requestId, file, upload) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/files?request=${encodeURIComponent(requestId)}&client=${encodeURIComponent(clientId)}`);
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("ngrok-skip-browser-warning", "1");
    xhr.upload.onprogress = (event) => { upload.loaded = event.loaded; showUpload(requestId); };
    xhr.onload = () => { if (xhr.status !== 200) { let message = "파일을 올리지 못했어요."; try { message = JSON.parse(xhr.responseText).message || message; } catch { /* 기본 문구 */ } toast(`${file.name}: ${message}`); } resolve(); };
    xhr.onerror = () => { toast(`${file.name}: 연결이 끊겨 올리지 못했어요.`); resolve(); };
    xhr.send(file);
  });
}
async function uploadFiles(requestId, fileList) {
  if (viewing) { toast(READ_ONLY_NOTICE); return; }
  if (uploads.has(requestId)) { toast("앞의 파일을 올리는 중이에요. 끝나면 다시 올려 주세요."); return; }
  const files = [...fileList].filter((file) => { if (file.size > UPLOAD_MAX) { toast(`${file.name}은(는) 50MB가 넘어서 올릴 수 없어요. 링크로 올려 주세요.`); return false; } return true; });
  if (!files.length) return;
  const upload = { name: "", done: 0, total: files.length, loaded: 0, size: 0 };
  uploads.set(requestId, upload);
  for (const file of files) {
    Object.assign(upload, { name: file.name, loaded: 0, size: file.size });
    showUpload(requestId);
    await uploadOne(requestId, file, upload);
    upload.done += 1;
  }
  uploads.delete(requestId);
  showUpload(requestId);
}
function addRequestLink(form) {
  const url = validUrl(form.elements.url.value);
  if (!/^https?:/.test(url)) { toast("http 또는 https로 시작하는 링크를 넣어 주세요."); return; }
  let name = url;
  try { const parsed = new URL(url); name = `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.length > 1 ? parsed.pathname.slice(0, 40) : ""}`; } catch { /* 주소 그대로 */ }
  if (commit({ type: "request.item.add", requestId: form.dataset.request, item: { id: id(), kind: "link", name, url, by: collab.me.name, at: new Date().toISOString() } })) form.reset();
}
async function fetchFile(fileId, inline = false) {
  const response = await fetch(`/api/files/${encodeURIComponent(fileId)}${inline ? "?inline=1" : ""}`, { headers: { "ngrok-skip-browser-warning": "1" } });
  if (!response.ok) throw new Error("missing file");
  return response.blob();
}
async function downloadFile(fileId) {
  const item = (state.requests || []).flatMap((request) => request.items).find((entry) => entry.id === fileId);
  if (!item) return;
  try {
    const blob = await fetchFile(fileId);
    const url = URL.createObjectURL(new File([blob], item.name, { type: blob.type || "application/octet-stream" }));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", item.name);
    link.hidden = true;
    document.body.append(link);
    link.click();
    setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 30000);
  } catch { toast("파일을 받을 수 없어요. 이미 지워졌을 수 있어요."); }
}
// 그림 파일은 작은 미리보기를 한 번만 받아 두고 다시 그릴 때 재사용한다.
function loadThumbs() {
  for (const image of document.querySelectorAll("img[data-thumb]:not([src])")) {
    const fileId = image.dataset.thumb;
    if (thumbs.has(fileId)) { image.src = thumbs.get(fileId); continue; }
    thumbs.set(fileId, "");
    fetchFile(fileId, true).then((blob) => { const url = URL.createObjectURL(blob); thumbs.set(fileId, url); for (const element of document.querySelectorAll("img[data-thumb]")) if (element.dataset.thumb === fileId) element.src = url; }).catch(() => thumbs.delete(fileId));
  }
}
document.addEventListener("change", (event) => {
  const input = event.target.closest?.("input[data-upload]");
  if (!input || !input.files?.length) return;
  uploadFiles(input.dataset.upload, input.files);
  input.value = "";
});
document.addEventListener("dragover", (event) => {
  const zone = event.target.closest?.(".rq-drop");
  if (!zone || !event.dataTransfer?.types?.includes("Files")) return;
  event.preventDefault();
  zone.classList.add("dragging-over");
});
document.addEventListener("dragleave", (event) => { const zone = event.target.closest?.(".rq-drop"); if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove("dragging-over"); });
document.addEventListener("drop", (event) => {
  const zone = event.target.closest?.(".rq-drop");
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove("dragging-over");
  if (event.dataTransfer?.files?.length) uploadFiles(zone.dataset.request, event.dataTransfer.files);
});

// ── PDF 내보내기 ────────────────────────────────────────────────────
// 표지 → 흐름도(한 장에 맞춤) → 와이어프레임 카드(목적 · 목업 · 코멘트) 순서의 인쇄용 문서를 숨은 iframe에 만들고,
// 인쇄 창을 연다. 인쇄 창에서 '대상: PDF로 저장'을 고르면 PDF 파일이 된다(외부 라이브러리 없이).
const PRINT_CSS = `
@page{size:A4 landscape;margin:10mm}
html,body{margin:0;background:#fff}
.pr-body{width:1040px;margin:0 auto;color:#1d2330;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pr-page{break-after:page;page-break-after:always}
.pr-cover{padding:90px 30px 0}
.pr-cover .pr-kicker{color:#6a58d6;font-size:12px;font-weight:800;letter-spacing:.08em}
.pr-cover h1{margin:10px 0 6px;font-size:34px}
.pr-cover p{margin:4px 0;color:#555;font-size:14px}
.pr-toc{margin-top:28px;columns:2;font-size:12px;color:#444;line-height:1.7}
.pr-flow h2,.pr-wires h2{margin:0 0 10px;font-size:18px}
.pr-flow-frame{position:relative;width:1040px;height:640px;overflow:hidden;border:1px solid #e3e5ec;border-radius:10px;background:#fbfbfd}
.pr-flow-frame .flow-stage{position:absolute;left:0;top:0;transform-origin:0 0}
.pr-flow-frame .flow-node{position:absolute}
.pr-flow-frame .flow-lines{position:absolute;left:0;top:0;overflow:visible}
.pr-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.pr-card{break-inside:avoid;page-break-inside:avoid;border:1px solid #e3e5ec;border-radius:10px;padding:10px;background:#fff}
.pr-card.wide{grid-column:span 2}
.pr-card-head{display:flex;justify-content:space-between;color:#888;font-size:9px}
.pr-card h3{margin:4px 0;font-size:13px}
.pr-purpose{margin:0 0 8px;color:#555;font-size:10px;line-height:1.5}
.pr-mock{display:flex;justify-content:center}
.pr-mock .wb-shell,.pr-mock .cg-desktop-shell{width:100%}
.pr-comments{margin-top:8px;padding-top:6px;border-top:1px dashed #e3e5ec;font-size:10px}
.pr-comments ul{margin:4px 0 0;padding-left:16px}
.pr-comments .resolved{color:#999;text-decoration:line-through}
.pr-body .flow-phone-footer,.pr-body .phone-footer{pointer-events:none}
.pr-body .cg-lint,.pr-body .wb-lint{display:none}
`;
function exportPdf(label = "현재 작업판", board = state) {
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => `<link rel="stylesheet" href="${escapeHtml(link.href)}">`).join("");
  const styles = [...document.querySelectorAll("style")].map((style) => style.textContent).join("\n");
  const commentCount = board.screens.reduce((sum, screen) => sum + (screen.comments || []).length, 0);
  // 목업 함수들이 state를 보므로 문서를 만드는 동안만 내보낼 작업판으로 바꿔 둔다.
  const previous = state;
  state = board;
  let html;
  try {
    const { width, height } = stageSize(board);
    const cards = board.screens.map((screen, index) => `<article class="pr-card${isWideScreen(screen) ? " wide" : ""}"><div class="pr-card-head"><span>SCREEN ${String(index + 1).padStart(2, "0")}</span><b>${escapeHtml(screen.status)}</b></div><h3>${escapeHtml(screen.title)}</h3>${screen.purpose ? `<p class="pr-purpose">${escapeHtml(screen.purpose)}</p>` : ""}<div class="pr-mock">${phoneContent(screen)}</div>${(screen.comments || []).length ? `<div class="pr-comments"><strong>코멘트 ${screen.comments.length}개</strong><ul>${screen.comments.map((item) => `<li class="${item.resolved ? "resolved" : ""}"><b>${escapeHtml(item.by)}</b> · ${escapeHtml(shortDate(item.at))} — ${escapeHtml(item.text)}</li>`).join("")}</ul></div>` : ""}</article>`).join("");
    html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(board.projectName)} - ${escapeHtml(label)}</title>${links}<style>${styles}</style><style>${PRINT_CSS}</style></head><body class="pr-body">
      <section class="pr-page pr-cover"><div class="pr-kicker">WORKBOARD EXPORT</div><h1>${escapeHtml(board.projectName)}</h1><p>${escapeHtml(label)}${chatView === "auto" ? "" : ` · ChatGPT ${chatView === "web" ? "웹" : "폰"} 보기`} · ${escapeHtml(new Date().toLocaleString("ko-KR"))}</p><p>화면 ${board.screens.length}개 · 연결 ${board.links.length}개 · 코멘트 ${commentCount}개 · 실험 ${board.experiments.length}개</p><ol class="pr-toc">${board.screens.map((screen) => `<li>${escapeHtml(screen.title)}</li>`).join("")}</ol></section>
      <section class="pr-page pr-flow"><h2>흐름도</h2><div class="pr-flow-frame"><div class="flow-stage" id="flow-stage" style="width:${width}px;height:${height}px"><svg id="flow-lines" class="flow-lines" aria-hidden="true"></svg>${board.screens.map((screen, index) => flowNodeHtml(screen, index, true)).join("")}</div></div></section>
      <section class="pr-wires"><h2>와이어프레임</h2><div class="pr-grid">${cards}</div></section></body></html>`;
  } finally { state = previous; }
  document.querySelector("#pr-frame")?.remove();
  const frame = document.createElement("iframe");
  frame.id = "pr-frame";
  frame.title = "PDF 내보내기";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-20000px;top:0;width:1123px;height:794px;border:0";
  frame.addEventListener("load", async () => {
    const doc = frame.contentDocument, win = frame.contentWindow;
    try { await doc.fonts?.ready; } catch { /* 글꼴 대기 실패는 무시 */ }
    drawLines(doc, board);
    const stage = doc.getElementById("flow-stage"), holder = doc.querySelector(".pr-flow-frame");
    if (stage && holder) {
      const { width, height } = stageSize(board);
      const used = board.screens.reduce((box, screen) => ({ right: Math.max(box.right, flowX(screen, board) + nodeWidth(screen) + 30), bottom: Math.max(box.bottom, (screen.y || 0) + NODE_H + 30) }), { right: 0, bottom: 0 });
      const scale = Math.min(holder.clientWidth / Math.min(width, used.right || width), holder.clientHeight / Math.min(height, used.bottom || height), 1);
      stage.style.transform = `scale(${scale})`;
    }
    win.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 500));
    win.focus();
    win.print();
  }, { once: true });
  frame.srcdoc = html;
  document.body.append(frame);
  toast("인쇄 창이 열리면 대상에서 'PDF로 저장'을 골라 주세요.");
}
function injectRoundStyles() {
  if (document.getElementById("round-styles")) return;
  const style = document.createElement("style");
  style.id = "round-styles";
  style.textContent = `
body.flow-expanded{overflow:hidden}
body.flow-expanded .flow-board{position:fixed;inset:0;z-index:950;display:flex;flex-direction:column;gap:8px;margin:0;padding:12px 14px;background:#f4f5f8}
body.flow-expanded .flow-board .flow-toolbar{flex:none;margin:0}
body.flow-expanded .flow-board .flow-scroll{flex:1 1 auto;min-height:0;width:100%!important;height:auto!important;max-height:none!important;margin:0}
.vr-banner{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin:0 0 16px;padding:10px 14px;border:1px solid #c9c1f3;border-radius:12px;background:#f5f3ff;color:#3b2f94;font-size:13px}
.vr-banner-actions{display:flex;flex-wrap:wrap;gap:6px}
.vr-banner-actions a,.vr-banner-actions button{padding:5px 10px;border:1px solid #c9c1f3;border-radius:8px;background:#fff;color:#3b2f94;font:inherit;font-size:12px;text-decoration:none;cursor:pointer}
.vr-banner-actions .vr-primary{border-color:#6a58d6;background:#6a58d6;color:#fff;font-weight:700}
.vr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.vr-card{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:start;padding:14px;border:1px solid #e3e5ec;border-radius:14px;background:#fff}
.vr-card.viewing{border-color:#6a58d6;box-shadow:0 0 0 2px #efedff}
.vr-folder{font-size:30px;line-height:1}
.vr-info{display:grid;gap:2px;min-width:0}
.vr-info strong{font-size:15px;overflow-wrap:anywhere}
.vr-info span,.vr-info small{color:#6b7280;font-size:12px}
.vr-card .card-actions{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:6px}
.cm-toggle.has-open{font-weight:700;color:#4a3ab0}
.cm-panel{display:grid;gap:8px;margin-top:10px;padding:10px;border:1px solid #e3e5ec;border-radius:10px;background:#fafafc;text-align:left}
.cm-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.cm-item{padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #eceef3}
.cm-item.resolved{opacity:.6}
.cm-item.resolved p{text-decoration:line-through}
.cm-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;font-size:12px}
.cm-meta time{color:#8e8e8e}
.cm-meta em{color:#1f7a4a;font-style:normal;font-weight:700}
.cm-item p{margin:4px 0;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.cm-actions{display:flex;gap:6px}
.cm-actions button{padding:2px 8px;border:1px solid #d5d8e1;border-radius:6px;background:#fff;font:inherit;font-size:11px;cursor:pointer}
.cm-empty{margin:0;color:#8e8e8e;font-size:12px}
.cm-form{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:end}
.cm-label{grid-column:1 / -1;color:#6b7280;font-size:11px}
.cm-form textarea{min-width:0;padding:6px 8px;border:1px solid #d5d8e1;border-radius:8px;font:inherit;font-size:13px;resize:vertical}
.cm-form button{padding:7px 12px;border:0;border-radius:8px;background:#6a58d6;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.cm-panel button:focus-visible,.cm-form textarea:focus-visible,.vr-banner a:focus-visible,.vr-banner button:focus-visible{outline:2px solid #7c6cd8;outline-offset:2px}
.cm-stance{display:inline-block;padding:1px 6px;border-radius:999px;font-size:11px;font-weight:700;line-height:1.5}
.cm-stance.agree{background:#e7f6ee;color:#1f7a4a}
.cm-stance.disagree{background:#fdecea;color:#b3261e}
.xp-votes{display:grid;gap:6px;margin:10px 0 4px}
.xp-vote-row{display:flex;flex-wrap:wrap;gap:6px}
.xp-vote-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border:1px solid #d5d8e1;border-radius:999px;background:#fff;color:#1d2330;font:inherit;font-size:13px;cursor:pointer}
.xp-vote-btn b{font-weight:700}
.xp-vote-btn.agree[aria-pressed="true"]{border-color:#2e9d6a;background:#e7f6ee;color:#1f7a4a}
.xp-vote-btn.disagree[aria-pressed="true"]{border-color:#d9534f;background:#fdecea;color:#b3261e}
.xp-vote-btn:focus-visible,.vw-switch button:focus-visible{outline:2px solid #7c6cd8;outline-offset:2px}
.xp-meter{display:flex;height:6px;overflow:hidden;border-radius:999px;background:#eceef3}
.xp-meter .agree{background:#2e9d6a}
.xp-meter .disagree{background:#d9534f}
.xp-voters{margin:0;color:#4b5563;font-size:12px;line-height:1.6;overflow-wrap:anywhere}
.xp-voters.empty{color:#8e8e8e}
.experiment-card .cm-panel{margin-top:10px}
.vw-switch{display:inline-flex;align-items:center;gap:2px;padding:3px;border:1px solid #d5d8e1;border-radius:10px;background:#fff;font-size:12px}
.vw-switch span{padding:0 6px;color:#6b7280;white-space:nowrap}
.vw-switch button{padding:5px 10px;border:0;border-radius:7px;background:transparent;color:#374151;font:inherit;cursor:pointer;white-space:nowrap}
.vw-switch button[aria-pressed="true"]{background:#1d2330;color:#fff;font-weight:700}
.flow-toolbar .vw-switch{margin-left:auto;margin-right:8px}
@media (prefers-reduced-motion:no-preference){.xp-meter i{transition:width .2s ease}}
.rq-filters{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 16px}
.rq-filters button{padding:6px 12px;border:1px solid #d5d8e1;border-radius:999px;background:#fff;color:#374151;font:inherit;font-size:13px;cursor:pointer}
.rq-filters button[aria-pressed="true"]{border-color:#1d2330;background:#1d2330;color:#fff}
.rq-filters button b{margin-left:2px}
.rq-me{margin-left:auto;color:#6b7280;font-size:12px}
.rq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:16px;align-items:start}
.rq-card{display:grid;gap:12px;min-width:0;padding:18px;border:1px solid #e3e5ec;border-radius:16px;background:#fff}
.rq-card .card-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.rq-card .card-top time{color:#8e8e8e;font-size:12px}
.rq-people{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0;padding:10px 12px;border-radius:10px;background:#f7f8fb}
.rq-people div{min-width:0}
.rq-people dt{color:#6b7280;font-size:11px}
.rq-people dd{margin:2px 0 0;font-weight:700;overflow-wrap:anywhere}
.rq-people span{color:#9aa1ae}
.rq-label{display:inline-block;margin-right:4px;color:#6b7280;font-size:11px;font-weight:700}
.rq-what h2{margin:2px 0 6px;font-size:18px;line-height:1.4;overflow-wrap:anywhere}
.rq-what p{margin:0 0 4px;font-size:13px;overflow-wrap:anywhere}
.rq-note{color:#4b5563;white-space:pre-wrap}
.rq-box{display:grid;gap:8px;padding:12px;border:1px solid #e3e5ec;border-radius:12px;background:#fafafc}
.rq-box h3{display:flex;justify-content:space-between;margin:0;font-size:13px}
.rq-box h3 span{color:#6b7280;font-weight:400}
.rq-empty{margin:0;color:#8e8e8e;font-size:12px}
.rq-items{display:grid;gap:6px;margin:0;padding:0;list-style:none}
.rq-item{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;min-width:0;padding:6px 8px;border:1px solid #eceef3;border-radius:8px;background:#fff}
.rq-item div{display:grid;min-width:0}
.rq-item a,.rq-file{overflow:hidden;padding:0;border:0;background:none;color:#1d4ed8;font:inherit;font-size:13px;text-align:left;text-overflow:ellipsis;white-space:nowrap;text-decoration:none;cursor:pointer}
.rq-item small{color:#8e8e8e;font-size:11px}
.rq-item-icon{font-size:16px}
.rq-thumb{width:40px;height:40px;border-radius:6px;object-fit:cover;background:#eceef3}
.rq-item-delete{padding:2px 8px;border:0;border-radius:6px;background:transparent;color:#9aa1ae;font-size:16px;cursor:pointer}
.rq-drop{display:grid;gap:8px;padding:10px;border:2px dashed #cfd4de;border-radius:10px;background:#fff;text-align:center}
.rq-drop.dragging-over{border-color:#2563eb;background:#eff6ff}
.rq-drop p{margin:0;color:#4b5563;font-size:12px}
.rq-pick{display:inline-block;padding:3px 10px;border-radius:999px;background:#1d2330;color:#fff;font-weight:700;cursor:pointer}
.rq-pick input{position:absolute;width:1px;height:1px;opacity:0}
.rq-pick:focus-within{outline:2px solid #7c6cd8;outline-offset:2px}
.rq-link{display:grid;grid-template-columns:1fr auto;gap:6px}
.rq-link input{min-width:0;padding:6px 8px;border:1px solid #d5d8e1;border-radius:8px;font:inherit;font-size:12px}
.rq-link button{padding:6px 10px;border:1px solid #d5d8e1;border-radius:8px;background:#fff;font:inherit;font-size:12px;cursor:pointer}
.rq-progress{min-height:0;color:#1d4ed8!important;font-weight:700}
.rq-progress:empty{display:none}
.rq-none{margin:0}
.rq-filters button:focus-visible,.rq-file:focus-visible,.rq-item a:focus-visible,.rq-item-delete:focus-visible,.rq-link button:focus-visible,.rq-link input:focus-visible{outline:2px solid #7c6cd8;outline-offset:2px}
@media (max-width:640px){.rq-me{margin-left:0;width:100%}.rq-card{padding:14px}}
.cm-count{padding:1px 6px;border:1px solid #c9c1f3;border-radius:999px;background:#f5f3ff;color:#4a3ab0;font:inherit;font-size:11px;cursor:pointer}
`;
  document.head.append(style);
}
function field(label, name, value = "", kind = "input", help = "") {
  const control = kind === "textarea" ? `<textarea name="${name}" rows="4">${escapeHtml(value)}</textarea>` : `<input name="${name}" value="${escapeHtml(value)}" ${name === "title" || name === "projectName" ? "required" : ""} />`;
  return `<label class="form-field"><span>${label}</span>${control}${help ? `<small>${help}</small>` : ""}</label>`;
}
const screenPayload = (source) => ({ title: String(source.title || "").trim(), purpose: String(source.purpose || "").trim(), sections: String(source.sections || "").trim(), actionLabel: String(source.actionLabel || "").trim(), url: validUrl(source.url), status: source.status === "확정" ? "확정" : "작업 중" });
const experimentPayload = (source) => ({ title: String(source.title || "").trim(), question: String(source.question || "").trim(), url: validUrl(source.url), status: ["진행 중", "검토 완료", "보류"].includes(source.status) ? source.status : "진행 중" });
// 편집 창을 연 뒤 내가 바꾼 칸만 보낸다. 같은 항목의 다른 칸을 팀원이 동시에 고쳐도 서로 덮어쓰지 않는다.
const changedFields = (next, before) => Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== before[key]));
function openEditor(kind, item = null, preset = {}) {
  const original = kind === "screen" && item ? screenPayload(item) : kind === "experiment" && item ? experimentPayload(item) : null;
  editContext = { kind, id: item?.id || null, original };
  if (kind === "request" && item) editContext.original = requestPayload(item);
  const titles = { project: "프로젝트 이름", screen: item ? "화면 편집" : "화면 추가", experiment: item ? "실험 편집" : "실험 추가", link: "화면 연결", nickname: "내 이름", request: item ? "자료 요청 편집" : "자료 요청하기" };
  $("#editor-title").textContent = titles[kind];
  let html = "";
  if (kind === "project") html = field("프로젝트 이름", "projectName", state.projectName);
  if (kind === "screen") html = field("화면 이름", "title", item?.title || "") + field("이 화면의 목적", "purpose", item?.purpose || "", "textarea") + field("정보 블록", "sections", item?.sections ?? preset.sections ?? "", "textarea", "한 줄에 하나씩 적어 주세요. ChatGPT 블록을 넣으면 ChatGPT 대화 목업으로 그려집니다.") + chatEditorTools() + `<div class="cg-to-draw"><button type="button" data-action="editor-to-draw">✎ 그리기로 이어서 편집</button><small>지금 내용을 저장하고, 이 목업을 도형으로 옮겨 그림판에서 이어서 고칩니다.</small></div>` + field("기본 버튼 문구", "actionLabel", item?.actionLabel || "") + field("실제 화면 URL (선택)", "url", item?.url || "", "input", "URL을 넣으면 프로토타입에서 해당 페이지를 폰에 표시합니다.") + `<label class="form-field"><span>진행 상태</span><select name="status"><option ${item?.status !== "확정" ? "selected" : ""}>작업 중</option><option ${item?.status === "확정" ? "selected" : ""}>확정</option></select></label>`;
  if (kind === "experiment") html = field("실험 이름", "title", item?.title || "") + field("확인할 질문", "question", item?.question || "", "textarea") + field("참고 URL (선택)", "url", item?.url || "") + `<label class="form-field"><span>상태</span><select name="status">${["진행 중", "검토 완료", "보류"].map((status) => `<option ${item?.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label>`;
  if (kind === "link") html = `<label class="form-field"><span>출발 화면</span><select name="from">${state.screens.map((screen) => `<option value="${escapeHtml(screen.id)}">${escapeHtml(screen.title)}</option>`).join("")}</select></label><label class="form-field"><span>도착 화면</span><select name="to">${state.screens.map((screen, index) => `<option value="${escapeHtml(screen.id)}" ${index === 1 ? "selected" : ""}>${escapeHtml(screen.title)}</option>`).join("")}</select></label>${field("버튼 문구", "label", "", "input", "비우면 도착 화면 이름이 표시됩니다.")}`;
  if (kind === "request") html = requestEditorFields(item);
  if (kind === "nickname") html = field("팀원에게 보일 이름", "nickname", collab.me.name, "input", "작업판을 함께 보는 사람들에게 이 이름으로 표시됩니다.");
  if (item) html = `<p id="collab-notice" class="collab-notice" role="status" hidden></p>${html}`;
  $("#editor-fields").innerHTML = html;
  if (kind === "screen") {
    const sections = $("#editor-fields textarea[name='sections']");
    sections.rows = 12;
    sections.addEventListener("input", updateChatPreview);
    updateChatPreview();
  }
  $("#editor").showModal();
  $("#editor-fields input, #editor-fields select")?.focus();
  if (item) setEditing(item.id);
}
function closeEditor() {
  if ($("#editor").open) $("#editor").close();
  editContext = null;
  if (collab.editing) setEditing(null);
}
let drawAfterSubmit = false;
function submitEditor(event) {
  event.preventDefault();
  const thenDraw = drawAfterSubmit;
  drawAfterSubmit = false;
  if (!editContext) return;
  let savedScreenId = null;
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  const kind = editContext.kind;
  if (kind === "nickname") {
    collab.me.name = String(values.nickname || "").trim().slice(0, 20) || collab.me.name;
    storage.set(NAME_KEY, collab.me.name);
    closeEditor();
    sendPresence();
    toast(`${collab.me.name}(으)로 표시됩니다.`);
    return;
  }
  if (kind === "project") {
    const projectName = String(values.projectName).trim();
    if (!projectName) return;
    if (projectName !== state.projectName) commit({ type: "project", projectName });
  }
  if (kind === "screen") {
    const payload = screenPayload(values);
    if (!payload.title) return;
    if (values.url && !payload.url) { toast("URL은 http, https 또는 로컬 경로로 입력해 주세요."); return; }
    if (editContext.id) {
      const fields = changedFields(payload, editContext.original);
      if (Object.keys(fields).length) commit({ type: "screen.update", id: editContext.id, fields });
      savedScreenId = editContext.id;
    } else {
      const index = state.screens.length, newId = id();
      if (commit({ type: "screen.create", item: { id: newId, ...payload, x: 60 + (index % 5) * 310, y: 60 + Math.floor(index / 5) * 580 } })) savedScreenId = newId;
    }
  }
  if (kind === "experiment") {
    const payload = experimentPayload(values);
    if (!payload.title) return;
    if (values.url && !payload.url) { toast("URL은 http 또는 https로 입력해 주세요."); return; }
    if (editContext.id) {
      const fields = changedFields(payload, editContext.original);
      if (Object.keys(fields).length) commit({ type: "experiment.update", id: editContext.id, fields });
    } else commit({ type: "experiment.create", item: { id: id(), ...payload } });
  }
  if (kind === "request") {
    const payload = requestPayload(values);
    if (!payload.what) { toast("요청할 자료를 적어 주세요."); return; }
    if (editContext.id) {
      const fields = changedFields(payload, editContext.original);
      if (Object.keys(fields).length) commit({ type: "request.update", id: editContext.id, fields });
    } else commit({ type: "request.create", item: { id: id(), ...payload, status: "요청", createdAt: new Date().toISOString() } });
  }
  if (kind === "link") {
    if (values.from === values.to) { toast("서로 다른 화면을 연결해 주세요."); return; }
    if (state.links.some((link) => link.from === values.from && link.to === values.to)) { toast("이미 연결된 화면입니다."); return; }
    if (!commit({ type: "link.create", item: { id: id(), from: values.from, to: values.to, label: String(values.label).trim() } })) return;
  }
  closeEditor();
  toast("저장했습니다.");
  if (thenDraw && savedScreenId) openDraw(savedScreenId);
}
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = "workboard-project.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  toast("작업판 JSON을 내보냈습니다.");
}
// 합쳐 불러오기: 지금 작업판은 그대로 두고, 파일의 화면·연결·실험을 기존 op로 하나씩 추가한다.
// 같은 id가 있으면 새 id를 붙이고, 화면은 기존 화면들 아래쪽에 놓는다.
let importMode = "replace";
function mergeBoard(data) {
  const taken = new Set([...state.screens, ...state.experiments].map((item) => item.id));
  const freshId = (itemId) => { let next = itemId; while (taken.has(next)) next = `${itemId}-${id().slice(0, 6)}`; taken.add(next); return next; };
  const offsetY = state.screens.length ? Math.max(...state.screens.map((screen) => (Number.isFinite(screen.y) ? screen.y : 0))) + 600 : 0;
  const ids = {};
  for (const screen of data.screens) {
    ids[screen.id] = freshId(screen.id);
    commit({ type: "screen.create", item: { ...screen, id: ids[screen.id], y: Math.min(5000, (Number.isFinite(screen.y) ? screen.y : 0) + offsetY) } }, { rerender: false });
  }
  for (const link of data.links) commit({ type: "link.create", item: { id: id(), from: ids[link.from], to: ids[link.to], label: link.label } }, { quiet: true, rerender: false });
  const experiments = data.experiments.filter((experiment) => !state.experiments.some((item) => item.title === experiment.title));
  for (const experiment of experiments) commit({ type: "experiment.create", item: { ...experiment, id: freshId(experiment.id) } }, { rerender: false });
  refresh();
  toast(`화면 ${data.screens.length}개 · 연결 ${data.links.length}개 · 실험 ${experiments.length}개를 지금 작업판에 더했습니다.`);
}
async function importData(file) {
  try {
    const data = normalizeBoard(JSON.parse(await file.text()));
    if (!data) throw new Error("invalid");
    if (importMode === "merge") { importMode = "replace"; mergeBoard(data); return; }
    if (!confirm("접속한 모든 팀원의 작업판이 선택한 파일 내용으로 바뀝니다. 바꾸기 직전 상태는 서버의 data/backups/에 자동으로 백업됩니다. 계속할까요?")) return;
    selectedScreen = null;
    if (commit({ type: "replace", board: data })) toast("작업판을 불러왔습니다.");
  } catch { toast("작업판 JSON 파일을 읽을 수 없습니다."); }
  finally { $("#import-file").value = ""; }
}
function remove(kind, itemId) {
  const label = kind === "screen" ? "화면과 연결" : kind === "experiment" ? "실험" : "연결";
  if (!confirm(`${label}을 삭제할까요? 모든 팀원의 작업판에서 함께 삭제됩니다.`)) return;
  if (commit({ type: `${kind}.delete`, id: itemId })) toast("삭제했습니다.");
}
const READ_ONLY_ACTIONS = new Set(["edit-project", "add-screen", "add-chat-screen", "add-web-screen", "add-draw-screen", "edit-screen", "delete-screen", "draw-screen", "add-experiment", "edit-experiment", "delete-experiment", "add-link", "delete-link", "import-merge", "import", "save-version", "resolve-comment", "delete-comment", "vote", "add-request", "edit-request", "delete-request", "request-status", "delete-request-item"]);
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action, itemId = target.dataset.id;
  if (viewing && READ_ONLY_ACTIONS.has(action)) { toast(READ_ONLY_NOTICE); return; }
  if (action === "save-version") saveVersion();
  if (action === "export-pdf") exportPdf(viewing ? viewing.name : "현재 작업판");
  if (action === "open-version") openVersion(itemId, target.dataset.route || "wireframe");
  if (action === "close-version") closeVersion();
  if (action === "restore-version") restoreVersion(itemId);
  if (action === "delete-version") deleteVersion(itemId);
  if (action === "version-pdf") versionPdf(itemId);
  if (action === "toggle-comments") { if (openComments.has(itemId)) openComments.delete(itemId); else openComments.add(itemId); refresh(); }
  if (action === "open-comments") { openComments.add(itemId); location.hash = "#wireframe"; setTimeout(() => [...document.querySelectorAll(".wire-card")].find((card) => card.dataset.presenceId === itemId)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60); }
  if (action === "resolve-comment") { const comment = commentTarget(target.dataset.kind, target.dataset.target)?.comments?.find((item) => item.id === itemId); if (comment) commit({ type: "comment.resolve", ...commentWhere(target.dataset.kind, target.dataset.target), id: itemId, resolved: !comment.resolved }); }
  if (action === "delete-comment" && confirm("이 코멘트를 삭제할까요? 모든 팀원에게서 함께 사라져요.")) commit({ type: "comment.delete", ...commentWhere(target.dataset.kind, target.dataset.target), id: itemId });
  if (action === "vote") castVote(itemId, target.dataset.value);
  if (action === "add-request") openEditor("request");
  if (action === "edit-request") { const item = (state.requests || []).find((request) => request.id === itemId); if (item) openEditor("request", item); }
  if (action === "delete-request") { const item = (state.requests || []).find((request) => request.id === itemId); if (item && confirm(`"${item.what}" 요청을 삭제할까요?${item.items.length ? ` 올린 자료 ${item.items.length}개도 함께 지워져요.` : ""}`)) commit({ type: "request.delete", id: itemId }); }
  if (action === "request-status") commit({ type: "request.update", id: itemId, fields: { status: target.dataset.status } });
  if (action === "request-filter") { requestFilter = target.dataset.filter; refresh(); }
  if (action === "delete-request-item") { const item = (state.requests || []).find((request) => request.id === target.dataset.request)?.items.find((entry) => entry.id === itemId); if (item && confirm(`"${item.name}"을(를) 지울까요? 모든 팀원에게서 함께 사라져요.`)) commit({ type: "request.item.delete", requestId: target.dataset.request, id: itemId }); }
  if (action === "download-file") downloadFile(itemId);
  if (action === "chat-view") { chatView = target.dataset.view; storage.set(VIEW_KEY, chatView); refresh(); }
  if (action === "edit-project") openEditor("project");
  if (action === "add-screen") openEditor("screen");
  if (action === "add-chat-screen") openEditor("screen", null, { sections: CHAT_STARTER });
  if (action === "insert-chat-block") insertChatBlock(itemId);
  if (action === "draw-screen") openDraw(itemId);
  if (action === "editor-to-draw" && $("#editor-form").reportValidity()) { drawAfterSubmit = true; $("#editor-form").requestSubmit(); }
  if (action === "add-draw-screen") {
    const index = state.screens.length, newId = id();
    if (commit({ type: "screen.create", item: { id: newId, title: "새 그림 화면", purpose: "", sections: "", actionLabel: "", url: "", status: "작업 중", x: 60 + (index % 5) * 310, y: 60 + Math.floor(index / 5) * 580, drawing: { frame: "phone", shapes: [] } } })) openDraw(newId);
  }
  if (action === "add-web-screen") openEditor("screen", null, { sections: WEB_STARTER });
  if (action === "insert-web-block") insertChatBlock(itemId, WEB_BLOCKS);
  if (action === "import-merge") { importMode = "merge"; $("#import-file").click(); }
  if (action === "edit-screen") { const item = state.screens.find((screen) => screen.id === itemId); if (item) openEditor("screen", item); }
  if (action === "delete-screen") remove("screen", itemId);
  if (action === "add-experiment") openEditor("experiment");
  if (action === "edit-experiment") { const item = state.experiments.find((experiment) => experiment.id === itemId); if (item) openEditor("experiment", item); }
  if (action === "delete-experiment") remove("experiment", itemId);
  if (action === "add-link") openEditor("link");
  if (action === "delete-link") remove("link", itemId);
  if (action === "go-screen") { selectedScreen = itemId; render(); }
  if (action === "focus-flow-screen") focusFlowScreen(itemId);
  if (action === "close-dialog") closeEditor();
  if (action === "rename") openEditor("nickname");
  if (action === "export") exportData();
  if (action === "import") { importMode = "replace"; $("#import-file").click(); }
  if (action === "copy-ai-prompt") copyAiPrompt();
  if (action === "zoom-in") setScale(flowScale * 1.2);
  if (action === "zoom-out") setScale(flowScale / 1.2);
  if (action === "zoom-fit") fitScale();
  if (action === "toggle-flow-fullscreen") setFlowExpanded(!flowExpanded);
  if (action === "ai-guide") { location.hash = "#home"; setTimeout(() => $("#ai-guide")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }
});
$("#editor-form").addEventListener("submit", submitEditor);
$("#editor").addEventListener("close", () => { editContext = null; if (collab.editing) setEditing(null); }); // Esc로 닫아도 편집 중 표시를 지운다.
$("#import-file").addEventListener("change", (event) => { if (event.target.files[0]) importData(event.target.files[0]); });
window.addEventListener("hashchange", () => { if (flowExpanded) setFlowExpanded(false); render(); $("#app").focus(); });
document.addEventListener("submit", (event) => {
  const linkForm = event.target.closest?.(".rq-link");
  if (linkForm) { event.preventDefault(); addRequestLink(linkForm); return; }
  const form = event.target.closest?.(".cm-form");
  if (!form) return;
  event.preventDefault();
  addComment(form.dataset.target, form.dataset.kind);
});
document.addEventListener("input", (event) => { if (event.target.matches?.("[data-comment-input]")) commentDrafts.set(event.target.dataset.commentInput, event.target.value); });
document.addEventListener("keydown", (event) => {
  if (event.target.matches?.("[data-comment-input]") && event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.target.form?.requestSubmit(); return; }
  if (event.key === "Escape" && flowExpanded && !$("#editor")?.open && !drawDialog()?.open) setFlowExpanded(false);
});

document.addEventListener("wheel", (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(".flow-scroll")) return;
  event.preventDefault();
  setScale(flowScale * Math.exp(-event.deltaY * .01), { x: event.clientX, y: event.clientY });
}, { passive: false });

let dragging = null;
let panning = null;
document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const handle = event.target.closest(".flow-node-head");
  if (!handle) {
    const scroll = event.target.closest(".flow-scroll");
    if (scroll && !event.target.closest(".flow-node")) {
      panning = { scroll, startX: event.clientX, startY: event.clientY, left: scroll.scrollLeft, top: scroll.scrollTop };
      scroll.setPointerCapture(event.pointerId);
      scroll.classList.add("panning");
    }
    return;
  }
  if (viewing) { toast(READ_ONLY_NOTICE); return; }
  const node = handle.closest(".flow-node");
  dragging = { node, startX: event.clientX, startY: event.clientY, left: parseFloat(node.style.left), top: parseFloat(node.style.top) };
  node.setPointerCapture(event.pointerId);
  node.classList.add("dragging");
  setEditing(node.dataset.id, "move");
});
document.addEventListener("pointermove", (event) => {
  if (panning) {
    panning.scroll.scrollLeft = panning.left - (event.clientX - panning.startX);
    panning.scroll.scrollTop = panning.top - (event.clientY - panning.startY);
    return;
  }
  if (!dragging) return;
  dragging.node.style.left = `${Math.max(0, Math.min(5000 * flowXScale(), dragging.left + (event.clientX - dragging.startX) / flowScale))}px`;
  dragging.node.style.top = `${Math.max(0, Math.min(5000, dragging.top + (event.clientY - dragging.startY) / flowScale))}px`;
  applyScale();
  drawLines();
  // 옮기는 동안에도 팀원 화면에서 카드가 따라 움직인다.
  commit({ type: "screen.move", id: dragging.node.dataset.id, x: parseFloat(dragging.node.style.left) / flowXScale(), y: parseFloat(dragging.node.style.top) }, { quiet: true, rerender: false });
});
function endDrag() {
  if (panning) { panning.scroll.classList.remove("panning"); panning = null; }
  if (!dragging) return;
  const node = dragging.node, moved = parseFloat(node.style.left) !== dragging.left || parseFloat(node.style.top) !== dragging.top;
  node.classList.remove("dragging");
  dragging = null;
  if (moved) commit({ type: "screen.move", id: node.dataset.id, x: parseFloat(node.style.left) / flowXScale(), y: parseFloat(node.style.top), final: true }, { quiet: true, rerender: false });
  setEditing(null);
  if (collab.pendingRender) { collab.pendingRender = false; refresh(); }
}
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);

// 처음 들어오면 팀원에게 보일 이름을 정한다.
injectChatStyles();
injectWebStyles();
injectDrawStyles();
injectRoundStyles();
render();
renderPresence();
connect();
if (!storage.get(NAME_KEY)) openEditor("nickname");
