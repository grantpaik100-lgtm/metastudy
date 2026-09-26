// Independent workboard UI. Screens are shared by wireframes, the flow map, and the prototype.
// 실시간 공동 작업: 작업판 원본은 서버(server.mjs → data/board.json)에 있다.
// 이 브라우저의 변경은 op 하나씩 서버로 보내고, 서버가 정한 순서의 op를 모든 사람이 똑같이 적용한다.
import { applyOp, blank, normalizeBoard, validUrl } from "./board-ops.js";

const KEY = "workboard-template-v1"; // 공동 작업 전 이 브라우저에만 저장하던 작업판. 서버로 옮길 때만 읽는다.
const NAME_KEY = "workboard-collab-name";
const MIGRATED_KEY = "workboard-collab-migrated";
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const id = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const routeNames = { home: "작업판", lab: "실험실", wireframe: "와이어프레임", flow: "흐름도", prototype: "목업 · 프로토타입" };
const routeIcons = { home: "⌂", lab: "⌁", wireframe: "▦", flow: "⑂", prototype: "▶" };
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* 저장소를 쓸 수 없어도 작업판은 열린다. */ } },
};
let state = blank();
let ready = false; // 서버에서 첫 작업판을 받기 전에는 빈 화면 대신 연결 중 안내를 보여 준다.
let selectedScreen = null;
let editContext = null;
let toastTimer;

// 흐름도 확대·축소. 트랙패드 핀치(ctrlKey가 붙은 wheel), 버튼, 전체 맞춤을 지원한다.
const NODE_W = 248, NODE_H = 542, SCALE_MIN = .25, SCALE_MAX = 2, SCALE_KEY = "workboard-flow-scale";
const stageSize = () => ({
  width: Math.max(1930, ...state.screens.map((screen) => (Number.isFinite(screen.x) ? screen.x : 0) + NODE_W + 70)),
  height: Math.max(1230, ...state.screens.map((screen) => (Number.isFinite(screen.y) ? screen.y : 0) + NODE_H + 70)),
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
  const right = Math.max(...state.screens.map((item) => (Number.isFinite(item.x) ? item.x : 0) + NODE_W + 30));
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
  state = normalizeBoard(board) || blank();
  collab.rev = rev;
  refresh();
}
function receiveOp({ rev, op, by, name }) {
  if (rev <= collab.rev) return;
  if (rev !== collab.rev + 1) { resync(); return; } // 중간 변경을 놓쳤으면 전체를 다시 받는다.
  collab.rev = rev;
  applyOp(state, op, { trusted: true });
  if (op.type === "screen.move") { moveNode(op.id, by); return; }
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
  node.style.left = `${screen.x}px`;
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
  render();
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
  });
  source.addEventListener("op", (event) => receiveOp(JSON.parse(event.data)));
  source.addEventListener("presence", (event) => { collab.peers = JSON.parse(event.data).peers; renderPresence(); });
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
  return `당신은 내 프로젝트의 UI 설계 협업자입니다. 아래 작업판 JSON을 현재 상태로 사용하세요.\n\n프로젝트 목표: [여기에 적기]\n이번에 원하는 작업: [실험 가설 / 화면 추가·수정 / 화면 흐름 연결 중 구체적으로 적기]\n\n규칙:\n- 기존 id와 작성된 내용을 임의로 지우지 마세요.\n- 결과는 설명이나 코드펜스 없이, 가져오기 가능한 JSON 객체 하나만 반환하세요.\n- 최상위 필드는 version(1), projectName, screens, experiments, links입니다.\n- 새 화면: {"id":"고유한-문자열","title":"화면 이름","purpose":"목적","sections":"블록1\\n블록2","actionLabel":"버튼 문구","url":"","status":"작업 중","x":60,"y":80}\n- 새 실험: {"id":"고유한-문자열","title":"실험 이름","question":"검증할 질문","url":"","status":"진행 중"}\n- 새 연결: {"id":"고유한-문자열","from":"출발 화면 id","to":"도착 화면 id","label":"이동 버튼 문구"}\n- links의 from/to는 반드시 screens에 있는 id를 가리켜야 합니다.\n- 화면 URL은 없으면 빈 문자열로 둡니다.\n\n현재 작업판 JSON:\n${JSON.stringify(state, null, 2)}`;
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
  ${state.experiments.length ? `<div class="experiment-grid">${state.experiments.map((item, index) => `<article class="experiment-card" data-presence-id="${escapeHtml(item.id)}"><div class="card-top"><span class="index-label">EXPERIMENT ${String(index + 1).padStart(2, "0")}</span><span class="status ${item.status === "검토 완료" ? "done" : item.status === "보류" ? "paused" : "in-progress"}">${escapeHtml(item.status)}</span></div><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.question || "검증할 질문을 적어 주세요.")}</p><div class="card-actions">${validUrl(item.url) ? `<a href="${escapeHtml(validUrl(item.url))}" target="_blank" rel="noopener noreferrer">참고 링크 ↗</a>` : ""}<button data-action="edit-experiment" data-id="${escapeHtml(item.id)}">편집</button><button data-action="delete-experiment" data-id="${escapeHtml(item.id)}">삭제</button></div></article>`).join("")}</div>` : empty("⌁", "첫 실험을 준비해 볼까요?", "기능이나 화면의 가설을 적어 두면 실험실 카드로 쌓입니다.", "add-experiment", "+ 첫 실험 추가")}`;
}
function sectionLines(screen) { return String(screen.sections || "").split("\n").map((value) => value.trim()).filter(Boolean); }
function phoneContent(screen, interactive = false, action = "go-screen") {
  const blocks = sectionLines(screen);
  const links = state.links.filter((link) => link.from === screen.id).map((link) => ({ link, target: state.screens.find((item) => item.id === link.to) })).filter((entry) => entry.target);
  return `<div class="phone-frame"><div class="phone-island"></div><div class="phone-screen"><div class="phone-top"><span>9:41</span><span>●●● ▰</span></div><div class="phone-body"><div class="phone-kicker">${escapeHtml(state.projectName)}</div><h3>${escapeHtml(screen.title)}</h3><p class="phone-purpose">${escapeHtml(screen.purpose || "이 화면의 목적을 적어 주세요.")}</p><div class="wire-blocks">${blocks.length ? blocks.map((block, index) => `<div class="wire-block"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(block)}</div>`).join("") : `<div class="wire-placeholder">+ 정보 블록을 추가해 주세요</div>`}</div></div><div class="phone-footer">${interactive && links.length ? links.map(({ link, target }) => `<button class="phone-cta" data-action="${action}" data-id="${escapeHtml(target.id)}">${escapeHtml(link.label || target.title)} →</button>`).join("") : `<div class="phone-cta muted">${escapeHtml(screen.actionLabel || "주요 버튼")}</div>`}</div></div><div class="phone-home"></div></div>`;
}
function wireframe() {
  const button = `<button class="primary-button" data-action="add-screen">+ 화면 추가</button>`;
  return `${pageHeader("ROOM 02 / STRUCTURE", "와이어프레임", "화면별 목적과 정보의 순서를 잡습니다. 이 목록이 흐름도와 프로토타입의 공통 원본입니다.", button)}
  ${state.screens.length ? `<div class="wire-grid">${state.screens.map((screen, index) => `<article class="wire-card" data-presence-id="${escapeHtml(screen.id)}"><div class="wire-heading"><span class="index-label">SCREEN ${String(index + 1).padStart(2, "0")}</span><span class="status ${screen.status === "확정" ? "done" : "in-progress"}">${escapeHtml(screen.status)}</span></div>${phoneContent(screen)}<div class="wire-meta"><h2>${escapeHtml(screen.title)}</h2><p>${escapeHtml(screen.purpose || "목적 미입력")}</p><div class="card-actions"><button data-action="edit-screen" data-id="${escapeHtml(screen.id)}">편집</button><button data-action="delete-screen" data-id="${escapeHtml(screen.id)}">삭제</button></div></div></article>`).join("")}</div>` : empty("▦", "아직 화면이 없습니다", "첫 화면을 추가하면 흐름도와 프로토타입에도 자동으로 나타납니다.", "add-screen", "+ 첫 화면 추가")}`;
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
function flow() {
  const button = `<div class="intro-buttons"><button class="outline-button" data-action="add-screen">+ 화면</button><button class="primary-button" data-action="add-link" ${state.screens.length < 2 ? "disabled" : ""}>+ 연결</button></div>`;
  return `${pageHeader("ROOM 03 / CONNECT", "흐름도", "화면을 보며 동선을 확인하세요. 폰 속 버튼을 누르면 연결된 화면으로 이동합니다.", button)}
  ${state.screens.length ? `<div class="flow-toolbar"><span>상단 손잡이로 화면 이동 · 빈 바탕 드래그로 캔버스 이동 · 폰 버튼으로 연결 따라가기</span><div class="zoom-controls"><button class="zoom-button" type="button" data-action="zoom-out" aria-label="축소">−</button><span id="zoom-level" aria-live="polite">100%</span><button class="zoom-button" type="button" data-action="zoom-in" aria-label="확대">+</button><button class="zoom-button wide" type="button" data-action="zoom-fit">전체 맞춤</button></div></div><div class="flow-scroll"><div class="flow-canvas" id="flow-canvas"><div class="flow-stage" id="flow-stage"><svg id="flow-lines" class="flow-lines" aria-hidden="true"></svg>${state.screens.map((screen, index) => `<div class="flow-node${flowFocus === screen.id ? " focused" : ""}" data-id="${escapeHtml(screen.id)}" data-presence-id="${escapeHtml(screen.id)}" style="left:${Number.isFinite(screen.x) ? screen.x : 60 + (index % 5) * 310}px;top:${Number.isFinite(screen.y) ? screen.y : 60 + Math.floor(index / 5) * 580}px"><div class="flow-node-head"><span>SCREEN ${String(index + 1).padStart(2, "0")}　·　${screen.status === "확정" ? "확정" : "작업 중"}</span><span aria-hidden="true">⠿</span></div><div class="flow-node-title"><h3>${escapeHtml(screen.title)}</h3><button data-action="edit-screen" data-id="${escapeHtml(screen.id)}" aria-label="${escapeHtml(screen.title)} 편집">편집</button></div>${flowPhoneContent(screen)}<div class="flow-node-caption">${escapeHtml(screen.purpose || "화면 목적 미입력")}</div></div>`).join("")}</div></div></div><div class="flow-list"><div class="section-title small"><div><span class="eyebrow">CONNECTIONS</span><h2>화면 연결</h2></div><span>${state.links.length}개</span></div>${state.links.length ? state.links.map((link) => { const from = state.screens.find((item) => item.id === link.from); const to = state.screens.find((item) => item.id === link.to); return `<div class="link-row"><span>${escapeHtml(from?.title || "삭제된 화면")} <strong>→</strong> ${escapeHtml(to?.title || "삭제된 화면")}</span><span>${escapeHtml(link.label || "이동")}</span><button data-action="delete-link" data-id="${escapeHtml(link.id)}" aria-label="연결 삭제">×</button></div>`; }).join("") : `<p class="subtle">연결을 추가하면 여기와 프로토타입에 이동 경로가 나타납니다.</p>`}</div>` : empty("⑂", "연결할 화면이 없습니다", "와이어프레임에서 화면을 먼저 추가하세요.", "add-screen", "+ 첫 화면 추가")}`;
}
function prototype() {
  if (!state.screens.length) return `${pageHeader("ROOM 04 / EXPERIENCE", "목업 · 프로토타입", "화면을 폰 프레임에서 눌러보며 동선을 확인합니다.")}${empty("▶", "아직 눌러볼 화면이 없습니다", "와이어프레임에서 화면을 추가하면 이곳에서 바로 확인할 수 있습니다.", "add-screen", "+ 첫 화면 추가")}`;
  if (!state.screens.some((item) => item.id === selectedScreen)) selectedScreen = state.screens[0].id;
  const screen = state.screens.find((item) => item.id === selectedScreen);
  const url = validUrl(screen.url);
  return `${pageHeader("ROOM 04 / EXPERIENCE", "목업 · 프로토타입", "왼쪽에서 화면을 고르거나 폰 안의 이동 버튼을 눌러 실제 흐름처럼 확인하세요.")}
  <div class="prototype-layout"><aside class="screen-rail"><div class="rail-heading"><span class="eyebrow">SCREENS</span><strong>${state.screens.length}개 화면</strong></div>${state.screens.map((item, index) => `<button class="rail-item ${item.id === screen.id ? "selected" : ""}" data-action="go-screen" data-id="${escapeHtml(item.id)}" data-presence-id="${escapeHtml(item.id)}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(item.title)}</strong><i>↗</i></button>`).join("")}<div class="rail-note">흐름도에서 연결한 화면은 폰 안의 버튼으로 이동할 수 있습니다.</div></aside><div class="preview-area"><div class="preview-toolbar"><span class="live-dot"></span><span>${url ? "실제 화면 미리보기" : "설계 목업"}</span><span class="spacer"></span>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">새 탭에서 열기 ↗</a>` : `<button data-action="edit-screen" data-id="${escapeHtml(screen.id)}">이 화면 편집 ↗</button>`}</div><div class="preview-center">${url ? `<div class="phone-frame live-phone"><div class="phone-island"></div><iframe title="${escapeHtml(screen.title)} 미리보기" src="${escapeHtml(url)}"></iframe><div class="phone-home"></div></div>` : flowPhoneContent(screen, "go-screen")}<div class="preview-caption"><strong>${escapeHtml(screen.title)}</strong><p>${escapeHtml(screen.purpose || "화면 목적 미입력")}</p>${url ? "<small>외부 사이트는 임베드를 차단할 수 있습니다. 이 경우 새 탭에서 여세요.</small>" : ""}</div></div></div></div>`;
}
function drawLines() {
  const svg = $("#flow-lines");
  if (!svg) return;
  const { width, height } = stageSize();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `<defs><marker id="flow-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M 0 0 L 9 4.5 L 0 9 z" fill="#8879d4"/></marker></defs>` + state.links.map((link) => {
    const from = [...document.querySelectorAll(".flow-node")].find((node) => node.dataset.id === link.from);
    const to = [...document.querySelectorAll(".flow-node")].find((node) => node.dataset.id === link.to);
    if (!from || !to) return "";
    const fx = parseFloat(from.style.left), fy = parseFloat(from.style.top);
    const tx = parseFloat(to.style.left), ty = parseFloat(to.style.top);
    const dx = tx - fx, dy = ty - fy;
    const horizontal = Math.abs(dx) > Math.abs(dy) * .8;
    const x1 = horizontal ? fx + (dx >= 0 ? NODE_W : 0) : fx + NODE_W / 2;
    const y1 = horizontal ? fy + NODE_H / 2 : fy + (dy >= 0 ? NODE_H : 0);
    const x2 = horizontal ? tx + (dx >= 0 ? 0 : NODE_W) : tx + NODE_W / 2;
    const y2 = horizontal ? ty + NODE_H / 2 : ty + (dy >= 0 ? 0 : NODE_H);
    const bend = Math.max(55, Math.min(180, (horizontal ? Math.abs(x2 - x1) : Math.abs(y2 - y1)) * .48));
    // 서로 되돌아오는 두 연결은 겹치지 않게 조금 벌린다(오른쪽·아래로 가는 선이 위·왼쪽).
    const paired = state.links.some((other) => other.from === link.to && other.to === link.from);
    const shift = paired ? ((horizontal ? dx : dy) >= 0 ? -22 : 22) : 0;
    let path = horizontal
      ? `M ${x1} ${y1 + shift} C ${x1 + Math.sign(dx) * bend} ${y1 + shift}, ${x2 - Math.sign(dx) * bend} ${y2 + shift}, ${x2} ${y2 + shift}`
      : `M ${x1 + shift} ${y1} C ${x1 + shift} ${y1 + Math.sign(dy) * bend}, ${x2 + shift} ${y2 - Math.sign(dy) * bend}, ${x2 + shift} ${y2}`;
    // 같은 줄에서 화면을 건너뛰는 연결은 화면 위쪽으로 넘어가 중간 화면을 가리지 않는다.
    if (horizontal && Math.abs(dy) < 40 && Math.abs(dx) > NODE_W * 1.5 + 70) {
      const top = Math.max(8, Math.min(fy, ty) - 52);
      path = `M ${fx + NODE_W / 2} ${fy} C ${fx + NODE_W / 2} ${top}, ${tx + NODE_W / 2} ${top}, ${tx + NODE_W / 2} ${ty}`;
    }
    // 다른 열로 올라가거나 내려가는 연결은 두 줄 사이 틈으로 보내고, 가운데를 비켜 도착한다.
    if (!horizontal && Math.abs(dx) > 40) {
      const endX = tx + NODE_W / 2 + (dx > 0 ? -1 : 1) * NODE_W * .3;
      const middle = (y1 + y2) / 2;
      path = `M ${x1} ${y1} C ${x1} ${middle}, ${endX} ${middle}, ${endX} ${y2}`;
    }
    const active = flowFocus && (flowFocus === link.from || flowFocus === link.to);
    return `<path class="flow-link${active ? " active" : ""}${link.to === "plan-drawer" ? " panel-link" : ""}" d="${path}" marker-end="url(#flow-arrow)"><title>${escapeHtml(link.label || "화면 이동")}</title></path>`;
  }).join("");
}
function focusFlowScreen(screenId) {
  flowFocus = screenId;
  document.querySelectorAll(".flow-node").forEach((node) => node.classList.toggle("focused", node.dataset.id === screenId));
  drawLines();
  const node = [...document.querySelectorAll(".flow-node")].find((element) => element.dataset.id === screenId);
  const scroll = $(".flow-scroll");
  if (!node || !scroll) return;
  scroll.scrollTo({ left: (parseFloat(node.style.left) + NODE_W / 2) * flowScale - scroll.clientWidth / 2, top: (parseFloat(node.style.top) + NODE_H / 2) * flowScale - scroll.clientHeight / 2, behavior: "smooth" });
}
function setFlowExpanded(expanded) {
  flowExpanded = expanded;
  document.body.classList.toggle("flow-expanded", expanded);
  const button = $("[data-action='toggle-flow-fullscreen']");
  if (button) {
    button.textContent = expanded ? "전체화면 닫기" : "전체화면";
    button.setAttribute("aria-pressed", String(expanded));
  }
}
function render() {
  nav();
  const route = currentRoute();
  $("#app").innerHTML = ready ? ({ home, lab, wireframe, flow, prototype })[route]() : `<div class="empty-state collab-loading"><div class="empty-icon">⟳</div><h2>공동 작업판에 연결하는 중…</h2><p>작업판 서버가 켜져 있는지 확인해 주세요.</p></div>`;
  document.body.classList.toggle("flow-expanded", ready && route === "flow" && flowExpanded);
  if (ready && route === "flow") $(".zoom-controls")?.insertAdjacentHTML("beforeend", `<button class="zoom-button wide fullscreen-button" type="button" data-action="toggle-flow-fullscreen" aria-pressed="${flowExpanded}">${flowExpanded ? "전체화면 닫기" : "전체화면"}</button>`);
  if (ready && route === "flow") { applyScale(); drawLines(); }
  decoratePresence();
}

function field(label, name, value = "", kind = "input", help = "") {
  const control = kind === "textarea" ? `<textarea name="${name}" rows="4">${escapeHtml(value)}</textarea>` : `<input name="${name}" value="${escapeHtml(value)}" ${name === "title" || name === "projectName" ? "required" : ""} />`;
  return `<label class="form-field"><span>${label}</span>${control}${help ? `<small>${help}</small>` : ""}</label>`;
}
const screenPayload = (source) => ({ title: String(source.title || "").trim(), purpose: String(source.purpose || "").trim(), sections: String(source.sections || "").trim(), actionLabel: String(source.actionLabel || "").trim(), url: validUrl(source.url), status: source.status === "확정" ? "확정" : "작업 중" });
const experimentPayload = (source) => ({ title: String(source.title || "").trim(), question: String(source.question || "").trim(), url: validUrl(source.url), status: ["진행 중", "검토 완료", "보류"].includes(source.status) ? source.status : "진행 중" });
// 편집 창을 연 뒤 내가 바꾼 칸만 보낸다. 같은 항목의 다른 칸을 팀원이 동시에 고쳐도 서로 덮어쓰지 않는다.
const changedFields = (next, before) => Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== before[key]));
function openEditor(kind, item = null) {
  const original = kind === "screen" && item ? screenPayload(item) : kind === "experiment" && item ? experimentPayload(item) : null;
  editContext = { kind, id: item?.id || null, original };
  const titles = { project: "프로젝트 이름", screen: item ? "화면 편집" : "화면 추가", experiment: item ? "실험 편집" : "실험 추가", link: "화면 연결", nickname: "내 이름" };
  $("#editor-title").textContent = titles[kind];
  let html = "";
  if (kind === "project") html = field("프로젝트 이름", "projectName", state.projectName);
  if (kind === "screen") html = field("화면 이름", "title", item?.title || "") + field("이 화면의 목적", "purpose", item?.purpose || "", "textarea") + field("정보 블록", "sections", item?.sections || "", "textarea", "한 줄에 하나씩 적어 주세요.") + field("기본 버튼 문구", "actionLabel", item?.actionLabel || "") + field("실제 화면 URL (선택)", "url", item?.url || "", "input", "URL을 넣으면 프로토타입에서 해당 페이지를 폰에 표시합니다.") + `<label class="form-field"><span>진행 상태</span><select name="status"><option ${item?.status !== "확정" ? "selected" : ""}>작업 중</option><option ${item?.status === "확정" ? "selected" : ""}>확정</option></select></label>`;
  if (kind === "experiment") html = field("실험 이름", "title", item?.title || "") + field("확인할 질문", "question", item?.question || "", "textarea") + field("참고 URL (선택)", "url", item?.url || "") + `<label class="form-field"><span>상태</span><select name="status">${["진행 중", "검토 완료", "보류"].map((status) => `<option ${item?.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label>`;
  if (kind === "link") html = `<label class="form-field"><span>출발 화면</span><select name="from">${state.screens.map((screen) => `<option value="${escapeHtml(screen.id)}">${escapeHtml(screen.title)}</option>`).join("")}</select></label><label class="form-field"><span>도착 화면</span><select name="to">${state.screens.map((screen, index) => `<option value="${escapeHtml(screen.id)}" ${index === 1 ? "selected" : ""}>${escapeHtml(screen.title)}</option>`).join("")}</select></label>${field("버튼 문구", "label", "", "input", "비우면 도착 화면 이름이 표시됩니다.")}`;
  if (kind === "nickname") html = field("팀원에게 보일 이름", "nickname", collab.me.name, "input", "작업판을 함께 보는 사람들에게 이 이름으로 표시됩니다.");
  if (item) html = `<p id="collab-notice" class="collab-notice" role="status" hidden></p>${html}`;
  $("#editor-fields").innerHTML = html;
  $("#editor").showModal();
  $("#editor-fields input, #editor-fields select")?.focus();
  if (item) setEditing(item.id);
}
function closeEditor() {
  if ($("#editor").open) $("#editor").close();
  editContext = null;
  if (collab.editing) setEditing(null);
}
function submitEditor(event) {
  event.preventDefault();
  if (!editContext) return;
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
    } else {
      const index = state.screens.length;
      commit({ type: "screen.create", item: { id: id(), ...payload, x: 60 + (index % 5) * 310, y: 60 + Math.floor(index / 5) * 580 } });
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
  if (kind === "link") {
    if (values.from === values.to) { toast("서로 다른 화면을 연결해 주세요."); return; }
    if (state.links.some((link) => link.from === values.from && link.to === values.to)) { toast("이미 연결된 화면입니다."); return; }
    if (!commit({ type: "link.create", item: { id: id(), from: values.from, to: values.to, label: String(values.label).trim() } })) return;
  }
  closeEditor();
  toast("저장했습니다.");
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
async function importData(file) {
  try {
    const data = normalizeBoard(JSON.parse(await file.text()));
    if (!data) throw new Error("invalid");
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
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action, itemId = target.dataset.id;
  if (action === "edit-project") openEditor("project");
  if (action === "add-screen") openEditor("screen");
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
  if (action === "import") $("#import-file").click();
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
window.addEventListener("hashchange", () => { flowExpanded = false; render(); $("#app").focus(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && flowExpanded && !$("#editor")?.open) setFlowExpanded(false);
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
  dragging.node.style.left = `${Math.max(0, Math.min(5000, dragging.left + (event.clientX - dragging.startX) / flowScale))}px`;
  dragging.node.style.top = `${Math.max(0, Math.min(5000, dragging.top + (event.clientY - dragging.startY) / flowScale))}px`;
  applyScale();
  drawLines();
  // 옮기는 동안에도 팀원 화면에서 카드가 따라 움직인다.
  commit({ type: "screen.move", id: dragging.node.dataset.id, x: parseFloat(dragging.node.style.left), y: parseFloat(dragging.node.style.top) }, { quiet: true, rerender: false });
});
function endDrag() {
  if (panning) { panning.scroll.classList.remove("panning"); panning = null; }
  if (!dragging) return;
  const node = dragging.node, moved = parseFloat(node.style.left) !== dragging.left || parseFloat(node.style.top) !== dragging.top;
  node.classList.remove("dragging");
  dragging = null;
  if (moved) commit({ type: "screen.move", id: node.dataset.id, x: parseFloat(node.style.left), y: parseFloat(node.style.top), final: true }, { quiet: true, rerender: false });
  setEditing(null);
  if (collab.pendingRender) { collab.pendingRender = false; refresh(); }
}
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);

// 처음 들어오면 팀원에게 보일 이름을 정한다.
render();
renderPresence();
connect();
if (!storage.get(NAME_KEY)) openEditor("nickname");
