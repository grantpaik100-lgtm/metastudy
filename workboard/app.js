// Independent workboard UI. Screens are shared by wireframes, the flow map, and the prototype.
// 공동 작업: 클라우드는 공유 DB, 로컬 서버는 data/board.json을 원본으로 사용한다.
// 이 브라우저의 변경은 op 하나씩 서버로 보내고, 서버가 정한 순서의 op를 모든 사람이 똑같이 적용한다.
import { applyOp, blank, normalizeBoard, validUrl } from "./board-ops.js";
import { cloud, identity, apiFetch, connectEvents } from "./transport.js";
import { showMeetings, hideMeetings, startMeetingNotices } from './meetings.js';

const KEY = "workboard-template-v1"; // 공동 작업 전 이 브라우저에만 저장하던 작업판. 서버로 옮길 때만 읽는다.
const NAME_KEY = "workboard-collab-name";
const MIGRATED_KEY = "workboard-collab-migrated";
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const id = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const routeNames = { home: "작업판", todos: "할 일", lab: "실험실", wireframe: "와이어프레임", flow: "흐름도", prototype: "목업 · 프로토타입", spatial: "3D 구조 지도", idea: "기획·아이디어", ux: "UI/UX", mcp: "MCP", backend: "백엔드", chat:'채팅', meetings:'음성회의' };
const routeIcons = { home: "⌂", todos: "☷", lab: "⌁", wireframe: "▦", flow: "⑂", prototype: "▶", spatial: "◇", idea: "↳", ux: "↳", mcp: "↳", backend: "↳", chat:'#', meetings:'◉' };
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
const STAGE_W = 1500, STAGE_H = 1000, SCALE_MIN = .3, SCALE_MAX = 2, SCALE_KEY = "workboard-flow-scale";
const clampScale = (value) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));
let flowScale = (() => { const saved = parseFloat(storage.get(SCALE_KEY)); return Number.isFinite(saved) ? clampScale(saved) : 1; })();
function applyScale() {
  const stage = $("#flow-stage"), canvas = $("#flow-canvas"), label = $("#zoom-level");
  if (!stage || !canvas) return;
  stage.style.transform = `scale(${flowScale})`;
  canvas.style.width = `${STAGE_W * flowScale}px`;
  canvas.style.height = `${STAGE_H * flowScale}px`;
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
  const right = Math.max(...state.screens.map((item) => (Number.isFinite(item.x) ? item.x : 0) + 232));
  const bottom = Math.max(...state.screens.map((item) => (Number.isFinite(item.y) ? item.y : 0) + 160));
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
  me: { name: identity?.name || storage.get(NAME_KEY) || `팀원 ${Math.floor(100 + Math.random() * 900)}`, color: COLORS[Math.floor(Math.random() * COLORS.length)] },
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
    const response = await apiFetch(path, { method: "POST", headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" }, body: JSON.stringify(body), signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.message || "request failed"), { data });
    return data;
  } finally { clearTimeout(timer); }
}
// 변경을 이 화면에 먼저 반영하고 서버로 보낸다. 서버가 거절하면 최신 상태로 다시 맞춘다.
function commit(op, { quiet = false, rerender = true } = {}) {
  if (cloud) {
    if(op.type==='screen.move'&&!op.final) {applyOp(state,op);return true;}
    saveCloud(op,{quiet:quiet&&op.type!=='screen.move'}).catch(()=>resync());return true;
  }
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
async function saveCloud(op,{quiet=false,expectedRev=collab.rev}={}) {
  try {
    const response=await post('/api/op',{client:clientId,op,expectedRev,requestId:crypto.randomUUID()});
    await resync();return response;
  }catch(error){if(!quiet)toast(error.data?.message||error.message);throw error;}
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
    const response = await apiFetch("/api/state", { headers: { "ngrok-skip-browser-warning": "1" } });
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
  const peers = cloud ? [...new Map(Object.entries(collab.peers).map(pair=>[pair[1].userId,pair])).values()] : Object.entries(collab.peers);
  const list = peers.map(([peerId, peer]) => `<span class="collab-chip" style="--collab-color:${escapeHtml(peer.color)}" title="${escapeHtml(peer.name)}${peerId === clientId ? " (나)" : ""}"><b>${escapeHtml(initials(peer.name))}</b><span>${escapeHtml(peer.name)}${peerId === clientId ? " · 나" : ""}</span></span>`).join("");
  $("#collab-presence").innerHTML = `<span class="collab-status ${collab.online ? "online" : "offline"}"><i></i>${collab.online ? `${peers.length}명 접속 중` : "연결 끊김 · 다시 연결 중"}</span><span class="collab-chips">${list}</span><button class="ghost-button collab-rename" data-action="rename">이름 바꾸기</button>`;
  if(cloud) $(".collab-rename").outerHTML='<a class="ghost-button" href="/account.html">계정 · AI 연결</a>';
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
  const source = connectEvents(`/api/events?${params}`);
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
  const route = location.hash.replace(/^#/, "").split("/")[0];
  return routeNames[route] ? route : "home";
}
function nav() {
  const active = currentRoute();
  $("#nav").innerHTML = Object.entries(routeNames).map(([route, label]) => `${route==='chat'?'<div class="meeting-nav-label">회의</div>':''}<a href="#${route}" class="nav-item ${["idea","ux","mcp","backend"].includes(route)?"nav-subitem":""} ${active === route ? "active" : ""}" ${active === route ? 'aria-current="page"' : ""}><span class="nav-icon">${routeIcons[route]}</span><span>${label}</span>${route === "home" ? "" : '<span class="nav-arrow">↗</span>'}</a>`).join("");
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
  ${aiGuide()}`;
}
function todos() {
  return `${pageHeader("PLAN / NEXT", "할 일", "큰 방향을 정하고, 하나씩 실행할 수 있는 목표로 나누는 공간이에요.")}
  <ol class="todo-hierarchy" aria-label="할 일을 정리할 순서">
    <li><span class="todo-level">01 / PHASE</span><strong>Phase</strong><p>지금 집중할 단계</p></li>
    <li><span class="todo-level">02 / GOAL</span><strong>큰 목표</strong><p>이 단계에서 이루려는 결과</p></li>
    <li><span class="todo-level">03 / TASK</span><strong>작은 목표</strong><p>결과를 위해 하나씩 해낼 일</p></li>
  </ol>
  <section class="todo-board" aria-labelledby="todo-list-title">
    <div class="todo-board-head"><h2 id="todo-list-title">할 일 목록</h2><span>비어 있음</span></div>
    <div class="todo-empty"><div class="todo-empty-mark" aria-hidden="true">☷</div><h3>첫 목표를 기다리고 있어요.</h3><p>Phase와 큰 목표를 정한 뒤,<br>작은 목표들을 차례로 나눠 담을 공간이에요.</p></div>
  </section>`;
}
function aiGuide() {
  if(cloud) return `<section id="ai-guide" class="ai-guide"><div class="section-title"><div><span class="eyebrow">AI COLLABORATION</span><h2>대화에서 결정하고, 작업판에 남겨요.</h2></div><span>평소 사용하는 AI와 연결합니다</span></div><div class="ai-guide-grid"><div class="ai-guide-main"><div class="ai-guide-icon">✦</div><h3>지금 쓰는 AI에 작업판을 연결하세요.</h3><p>AI와 아이디어를 검토한 뒤 “이 결정을 작업판에 반영해줘”라고 요청하세요. 연결된 AI가 관련 노드와 선을 읽고, 요청한 내용을 저장합니다.</p><a class="primary-button" href="/account.html">내 계정에서 AI 연결 →</a><small>각자 본인의 작업판 계정으로 연결해 주세요.</small></div><div class="ai-steps"><div><b>01</b><span><strong>한 번 연결하기</strong><small>계정 화면의 MCP 주소를 AI 앱에 등록하고 접근을 승인합니다.</small></span></div><div><b>02</b><span><strong>대화에서 변경 요청</strong><small>담당자, 후속 과제, 노드와 연결을 어떻게 바꿀지 알려주세요.</small></span></div><div><b>03</b><span><strong>함께 확인하기</strong><small>저장한 내용은 팀원들의 작업판에 반영되고 수정자와 변경 이력이 남습니다.</small></span></div></div></div><p class="ai-guide-note">작업판은 공유 저장소에 보관됩니다. 작업판을 열어 둔 컴퓨터가 없어도 다른 팀원이 접속할 수 있어요. AI가 작업판에 남긴 결정은 3D 구조 지도와 계정 화면의 변경 이력에서 확인하세요.</p></section>`;
  return `<section id="ai-guide" class="ai-guide"><div class="section-title"><div><span class="eyebrow">AI COLLABORATION</span><h2>AI와 함께 쓰는 방법</h2></div><span>AI 대화는 평소 사용하는 도구에서 진행합니다</span></div><div class="ai-guide-grid"><div class="ai-guide-main"><div class="ai-guide-icon">✦</div><h3>작업판의 현재 상태를 AI에게 건네세요.</h3><p>AI가 실험 가설, 화면 구성, 연결을 제안하거나 JSON을 수정하도록 요청할 수 있습니다. 이 버튼은 현재 작업판 데이터와 형식을 요청문에 담아 복사합니다.</p><button class="primary-button" data-action="copy-ai-prompt">AI 요청문 복사 →</button><small>클립보드에만 복사됩니다. 원하는 AI 대화창에 직접 붙여 넣으세요.</small></div><div class="ai-steps"><div><b>01</b><span><strong>복사해 AI에게 전달</strong><small>프로젝트 목표와 원하는 작업을 요청문에 덧붙입니다.</small></span></div><div><b>02</b><span><strong>결과를 검토</strong><small>화면 이름, 연결, 문구를 확인하고 JSON으로 저장합니다.</small></span></div><div><b>03</b><span><strong>불러와 직접 눌러보기</strong><small>상단 불러오기로 반영하고 흐름도와 프로토타입을 확인합니다.</small></span></div></div></div><p class="ai-guide-note">작업판의 디자인·기능 자체를 바꾸려면 이 폴더를 AI 코딩 도구에서 열고 원하는 변경을 요청하세요. 작업판 데이터는 서버를 켠 컴퓨터의 <b>data/board.json</b>에 저장되고, 접속한 모든 팀원에게 실시간으로 반영됩니다. AI에게 건넬 때는 <b>내보내기</b>나 AI 요청문 복사를 사용하세요.</p></section>`;
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
function phoneContent(screen, interactive = false) {
  if (Array.isArray(screen.drawing?.shapes) && screen.drawing.shapes.length) {
    const colors = { accent: '#d7f4f1', soft: '#f1f4f7', dark: '#29384b', line: '#ffffff' };
    const height = Math.max(650, ...screen.drawing.shapes.map(s => (Number(s.y) || 0) + (Number(s.h) || 0) + 20));
    const shapes = screen.drawing.shapes.map(s => {
      const x=Number(s.x)||0,y=Number(s.y)||0,w=Number(s.w)||0,h=Number(s.h)||0;
      let result = s.type === 'rect' ? `<rect x="${x}" y="${y}" width="${Math.max(0,w)}" height="${Math.max(0,h)}" rx="${s.round?7:0}" fill="${colors[s.tone]||'#fff'}" stroke="#d9e3e6"/>` : s.type === 'ellipse' ? `<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${Math.abs(w/2)}" ry="${Math.abs(h/2)}" fill="#eff6ff" stroke="#a9b8c8"/>` : ['line','arrow'].includes(s.type) ? `<path d="M ${x} ${y} l ${w} ${h}" stroke="#8da2b5" fill="none"/>` : '';
      if(s.text) result += `<text x="${x+4}" y="${y+(s.type==='text'?16:h/2+5)}" font-size="${s.size==='s'?11:s.size==='l'?17:14}" fill="${s.tone==='dark'?'#fff':'#29384b'}">${escapeHtml(s.text)}</text>`;
      return result;
    }).join('');
    const next = interactive ? state.links.filter(l => l.from===screen.id).map(l => `<button class="phone-cta" data-action="go-screen" data-id="${escapeHtml(l.to)}">${escapeHtml(l.label||'다음 화면')} →</button>`).join('') : '';
    return `<div class="phone-frame"><div class="phone-screen" style="overflow:auto"><svg viewBox="0 0 375 ${height}" role="img" aria-label="${escapeHtml(screen.title)}" style="display:block;width:100%">${shapes}</svg>${next}</div></div>`;
  }
  const blocks = sectionLines(screen);
  const links = state.links.filter((link) => link.from === screen.id).map((link) => ({ link, target: state.screens.find((item) => item.id === link.to) })).filter((entry) => entry.target);
  return `<div class="phone-frame"><div class="phone-island"></div><div class="phone-screen"><div class="phone-top"><span>9:41</span><span>●●● ▰</span></div><div class="phone-body"><div class="phone-kicker">${escapeHtml(state.projectName)}</div><h3>${escapeHtml(screen.title)}</h3><p class="phone-purpose">${escapeHtml(screen.purpose || "이 화면의 목적을 적어 주세요.")}</p><div class="wire-blocks">${blocks.length ? blocks.map((block, index) => `<div class="wire-block"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(block)}</div>`).join("") : `<div class="wire-placeholder">+ 정보 블록을 추가해 주세요</div>`}</div></div><div class="phone-footer">${interactive && links.length ? links.map(({ link, target }) => `<button class="phone-cta" data-action="go-screen" data-id="${escapeHtml(target.id)}">${escapeHtml(link.label || target.title)} →</button>`).join("") : `<div class="phone-cta muted">${escapeHtml(screen.actionLabel || "주요 버튼")}</div>`}</div></div><div class="phone-home"></div></div>`;
}
function wireframe() {
  const button = `<button class="primary-button" data-action="add-screen">+ 화면 추가</button>`;
  return `${pageHeader("ROOM 02 / STRUCTURE", "와이어프레임", "화면별 목적과 정보의 순서를 잡습니다. 이 목록이 흐름도와 프로토타입의 공통 원본입니다.", button)}
  ${state.screens.length ? `<div class="wire-grid">${state.screens.map((screen, index) => `<article class="wire-card" data-presence-id="${escapeHtml(screen.id)}"><div class="wire-heading"><span class="index-label">SCREEN ${String(index + 1).padStart(2, "0")}</span><span class="status ${screen.status === "확정" ? "done" : "in-progress"}">${escapeHtml(screen.status)}</span></div>${phoneContent(screen)}<div class="wire-meta"><h2>${escapeHtml(screen.title)}</h2><p>${escapeHtml(screen.purpose || "목적 미입력")}</p><div class="card-actions"><button data-action="edit-screen" data-id="${escapeHtml(screen.id)}">편집</button><button data-action="delete-screen" data-id="${escapeHtml(screen.id)}">삭제</button></div></div></article>`).join("")}</div>` : empty("▦", "아직 화면이 없습니다", "첫 화면을 추가하면 흐름도와 프로토타입에도 자동으로 나타납니다.", "add-screen", "+ 첫 화면 추가")}`;
}
function flow() {
  const button = `<div class="intro-buttons"><button class="outline-button" data-action="add-screen">+ 화면</button><button class="primary-button" data-action="add-link" ${state.screens.length < 2 ? "disabled" : ""}>+ 연결</button></div>`;
  return `${pageHeader("ROOM 03 / CONNECT", "흐름도", "화면 간 이동을 연결하고 카드를 드래그해 전체 구조를 살펴봅니다.", button)}
  ${state.screens.length ? `<div class="flow-toolbar"><span>카드 드래그 = 위치 이동 · 트랙패드 핀치 = 확대·축소</span><div class="zoom-controls"><button class="zoom-button" type="button" data-action="zoom-out" aria-label="축소">−</button><span id="zoom-level" aria-live="polite">100%</span><button class="zoom-button" type="button" data-action="zoom-in" aria-label="확대">+</button><button class="zoom-button wide" type="button" data-action="zoom-fit">전체 맞춤</button></div></div><div class="flow-scroll"><div class="flow-canvas" id="flow-canvas"><div class="flow-stage" id="flow-stage"><svg id="flow-lines" class="flow-lines" aria-hidden="true"></svg>${state.screens.map((screen, index) => `<div class="flow-node" data-id="${escapeHtml(screen.id)}" data-presence-id="${escapeHtml(screen.id)}" style="left:${Number.isFinite(screen.x) ? screen.x : 60 + (index % 4) * 290}px;top:${Number.isFinite(screen.y) ? screen.y : 80 + Math.floor(index / 4) * 210}px"><div class="flow-node-head"><span>▦ SCREEN ${String(index + 1).padStart(2, "0")}</span><span>⠿</span></div><h3>${escapeHtml(screen.title)}</h3><p>${escapeHtml(screen.purpose || "화면 목적 미입력")}</p><button data-action="edit-screen" data-id="${escapeHtml(screen.id)}">화면 편집 ↗</button></div>`).join("")}</div></div></div><div class="flow-list"><div class="section-title small"><div><span class="eyebrow">CONNECTIONS</span><h2>화면 연결</h2></div><span>${state.links.length}개</span></div>${state.links.length ? state.links.map((link) => { const from = state.screens.find((item) => item.id === link.from); const to = state.screens.find((item) => item.id === link.to); return `<div class="link-row"><span>${escapeHtml(from?.title || "삭제된 화면")} <strong>→</strong> ${escapeHtml(to?.title || "삭제된 화면")}</span><span>${escapeHtml(link.label || "이동")}</span><button data-action="delete-link" data-id="${escapeHtml(link.id)}" aria-label="연결 삭제">×</button></div>`; }).join("") : `<p class="subtle">연결을 추가하면 여기와 프로토타입에 이동 경로가 나타납니다.</p>`}</div>` : empty("⑂", "연결할 화면이 없습니다", "와이어프레임에서 화면을 먼저 추가하세요.", "add-screen", "+ 첫 화면 추가")}`;
}
function prototype() {
  if (!state.screens.length) return `${pageHeader("ROOM 04 / EXPERIENCE", "목업 · 프로토타입", "화면을 폰 프레임에서 눌러보며 동선을 확인합니다.")}${empty("▶", "아직 눌러볼 화면이 없습니다", "와이어프레임에서 화면을 추가하면 이곳에서 바로 확인할 수 있습니다.", "add-screen", "+ 첫 화면 추가")}`;
  if (!state.screens.some((item) => item.id === selectedScreen)) selectedScreen = state.screens[0].id;
  const screen = state.screens.find((item) => item.id === selectedScreen);
  const url = validUrl(screen.url);
  return `${pageHeader("ROOM 04 / EXPERIENCE", "목업 · 프로토타입", "왼쪽에서 화면을 고르거나 폰 안의 이동 버튼을 눌러 실제 흐름처럼 확인하세요.")}
  <div class="prototype-layout"><aside class="screen-rail"><div class="rail-heading"><span class="eyebrow">SCREENS</span><strong>${state.screens.length}개 화면</strong></div>${state.screens.map((item, index) => `<button class="rail-item ${item.id === screen.id ? "selected" : ""}" data-action="go-screen" data-id="${escapeHtml(item.id)}" data-presence-id="${escapeHtml(item.id)}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(item.title)}</strong><i>↗</i></button>`).join("")}<div class="rail-note">흐름도에서 연결한 화면은 폰 안의 버튼으로 이동할 수 있습니다.</div></aside><div class="preview-area"><div class="preview-toolbar"><span class="live-dot"></span><span>${url ? "실제 화면 미리보기" : "와이어프레임 목업"}</span><span class="spacer"></span>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">새 탭에서 열기 ↗</a>` : `<button data-action="edit-screen" data-id="${escapeHtml(screen.id)}">이 화면 편집 ↗</button>`}</div><div class="preview-center">${url ? `<div class="phone-frame live-phone"><div class="phone-island"></div><iframe title="${escapeHtml(screen.title)} 미리보기" src="${escapeHtml(url)}"></iframe><div class="phone-home"></div></div>` : phoneContent(screen, true)}<div class="preview-caption"><strong>${escapeHtml(screen.title)}</strong><p>${escapeHtml(screen.purpose || "화면 목적 미입력")}</p>${url ? "<small>외부 사이트는 임베드를 차단할 수 있습니다. 이 경우 새 탭에서 여세요.</small>" : ""}</div></div></div></div>`;
}
function drawLines() {
  const svg = $("#flow-lines");
  if (!svg) return;
  svg.setAttribute("viewBox", "0 0 1500 1000");
  svg.innerHTML = state.links.map((link) => {
    const from = [...document.querySelectorAll(".flow-node")].find((node) => node.dataset.id === link.from);
    const to = [...document.querySelectorAll(".flow-node")].find((node) => node.dataset.id === link.to);
    if (!from || !to) return "";
    const x1 = parseFloat(from.style.left) + 232, y1 = parseFloat(from.style.top) + 74;
    const x2 = parseFloat(to.style.left), y2 = parseFloat(to.style.top) + 74;
    const bend = Math.max(65, Math.abs(x2 - x1) * .48);
    return `<path d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}" fill="none" stroke="#8879d4" stroke-width="2.5"/><circle cx="${x2}" cy="${y2}" r="5" fill="#8879d4"/>`;
  }).join("");
}
function render() {
  nav();
  const route = currentRoute();
  if(ready&&['chat','meetings'].includes(route)){$('#app').hidden=true;showMeetings(route,location.hash.split('/')[1]);return;}
  $('#app').hidden=false;hideMeetings();
  if (ready && ['spatial','idea','ux','mcp','backend'].includes(route)) {
    const selection=location.hash.split('/')[1]||'';
    const src='./spatial.html?embed=1'+(route==='spatial'?'':'&plane='+route)+(selection?'&selected='+encodeURIComponent(decodeURIComponent(selection)):'');
    if ($('#spatial-frame')?.getAttribute('src')!==src) $('#app').innerHTML='<iframe id="spatial-frame" title="'+escapeHtml(routeNames[route])+'" src="'+escapeHtml(src)+'" style="width:100%;height:calc(100vh - 140px);min-height:900px;border:0;border-radius:16px"></iframe>';
    return;
  }
  $("#app").innerHTML = ready ? ({ home, todos, lab, wireframe, flow, prototype })[route]() : `<div class="empty-state collab-loading"><div class="empty-icon">⟳</div><h2>공동 작업판에 연결하는 중…</h2><p>${cloud ? "공유 작업판을 불러오고 있어요. 연결이 지연되면 잠시 후 새로고침해주세요." : "작업판 서버가 켜져 있는지 확인해 주세요."}</p></div>`;
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
  editContext = { kind, id: item?.id || null, original, rev: collab.rev };
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
async function submitEditor(event) {
  event.preventDefault();
  if (!editContext) return;
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  const kind = editContext.kind;
  if(cloud&&kind!=='nickname') {
    let op;
    if(kind==='project') {const projectName=String(values.projectName||'').trim();if(!projectName)return;op={type:'project',projectName};}
    if(kind==='screen'||kind==='experiment') {
      const payload=kind==='screen'?screenPayload(values):experimentPayload(values);
      if(!payload.title)return;
      if(values.url&&!payload.url){toast('올바른 화면 주소를 입력해주세요.');return;}
      op=editContext.id?{type:kind+'.update',id:editContext.id,fields:changedFields(payload,editContext.original)}:{type:kind+'.create',item:{id:id(),...payload}};
    }
    if(kind==='link')op={type:'link.create',item:{id:id(),...values}};
    if(!op)return;
    const submit=event.submitter;submit.disabled=true;
    try{await saveCloud(op,{expectedRev:editContext.rev});closeEditor();toast('공유 작업판에 저장했습니다.');}
    catch{const notice=$('#collab-notice');if(notice){notice.hidden=false;notice.textContent='저장하지 못했어요. 현재 초안은 그대로 남아 있습니다. 취소 후 최신 내용을 열어 확인해주세요.';}}
    finally{submit.disabled=false;}return;
  }
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
      commit({ type: "screen.create", item: { id: id(), ...payload, x: 60 + (index % 4) * 290, y: 80 + Math.floor(index / 4) * 210 } });
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
  let data;
  try {
    data = normalizeBoard(JSON.parse(await file.text()));
    if (!data) throw new Error("invalid");
  } catch { toast("작업판 JSON 파일을 읽을 수 없습니다."); return; }
  finally { $("#import-file").value = ""; }
  const backup = cloud ? "이전 상태는 변경 이력에 보관됩니다." : "바꾸기 직전 상태는 서버의 data/backups/에 자동으로 백업됩니다.";
  if (!confirm(`접속한 모든 팀원의 작업판이 선택한 파일 내용으로 바뀝니다. ${backup} 계속할까요?`)) return;
  try {
    selectedScreen = null;
    if (cloud) { await saveCloud({ type: "replace", board: data }); toast("작업판을 불러왔습니다."); }
    else if (commit({ type: "replace", board: data })) toast("작업판을 불러왔습니다.");
  } catch { /* saveCloud가 저장 실패 이유를 표시한다. */ }
}
async function remove(kind, itemId) {
  const label = kind === "screen" ? "화면과 연결" : kind === "experiment" ? "실험" : "연결";
  if (!confirm(`${label}을 삭제할까요? 모든 팀원의 작업판에서 함께 삭제됩니다.`)) return;
  try {
    if (cloud) { await saveCloud({ type: `${kind}.delete`, id: itemId }); toast("삭제했습니다."); }
    else if (commit({ type: `${kind}.delete`, id: itemId })) toast("삭제했습니다.");
  } catch { /* saveCloud가 저장 실패 이유를 표시한다. */ }
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
  if (action === "close-dialog") closeEditor();
  if (action === "rename") openEditor("nickname");
  if (action === "export") exportData();
  if (action === "import") $("#import-file").click();
  if (action === "copy-ai-prompt") copyAiPrompt();
  if (action === "zoom-in") setScale(flowScale * 1.2);
  if (action === "zoom-out") setScale(flowScale / 1.2);
  if (action === "zoom-fit") fitScale();
  if (action === "ai-guide") { location.hash = "#home"; setTimeout(() => $("#ai-guide")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }
});
$("#editor-form").addEventListener("submit", submitEditor);
$("#editor").addEventListener("close", () => { editContext = null; if (collab.editing) setEditing(null); }); // Esc로 닫아도 편집 중 표시를 지운다.
$("#import-file").addEventListener("change", (event) => { if (event.target.files[0]) importData(event.target.files[0]); });
window.addEventListener("hashchange", () => { render(); $("#app").focus(); });
startMeetingNotices();

document.addEventListener("wheel", (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(".flow-scroll")) return;
  event.preventDefault();
  setScale(flowScale * Math.exp(-event.deltaY * .01), { x: event.clientX, y: event.clientY });
}, { passive: false });

let dragging = null;
document.addEventListener("pointerdown", (event) => {
  const node = event.target.closest(".flow-node");
  if (!node || event.target.closest("button")) return;
  dragging = { node, startX: event.clientX, startY: event.clientY, left: parseFloat(node.style.left), top: parseFloat(node.style.top) };
  node.setPointerCapture(event.pointerId);
  node.classList.add("dragging");
  setEditing(node.dataset.id, "move");
});
document.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  dragging.node.style.left = `${Math.max(10, Math.min(1245, dragging.left + (event.clientX - dragging.startX) / flowScale))}px`;
  dragging.node.style.top = `${Math.max(10, Math.min(800, dragging.top + (event.clientY - dragging.startY) / flowScale))}px`;
  drawLines();
  // 옮기는 동안에도 팀원 화면에서 카드가 따라 움직인다.
  commit({ type: "screen.move", id: dragging.node.dataset.id, x: parseFloat(dragging.node.style.left), y: parseFloat(dragging.node.style.top) }, { quiet: true, rerender: false });
});
function endDrag() {
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
if (!cloud && !storage.get(NAME_KEY)) openEditor("nickname");
