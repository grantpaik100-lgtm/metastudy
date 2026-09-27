// 작업판 데이터 규칙. 브라우저(app.js)와 공동 작업 서버(server.mjs)가 같은 파일을 쓴다.
// 모든 변경은 작은 op 하나로 표현하고, 서버가 정한 순서대로 모든 사람에게 같은 op를 적용한다.
export const blank = () => ({ version: 1, projectName: "새 프로젝트", screens: [], experiments: [], links: [] });
export const SCREEN_STATUS = ["작업 중", "확정"];
export const EXPERIMENT_STATUS = ["진행 중", "검토 완료", "보류"];
export const DRAW_FRAMES = ["phone", "web", "chatgpt", "chatgpt-web"];
export const DRAW_TYPES = ["rect", "ellipse", "line", "arrow", "text", "image"];
export const DRAW_TONES = ["line", "soft", "accent", "dark", "brand"];
export const DRAW_MAX_SHAPES = 400;

export const validUrl = (raw) => {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (value.startsWith("./")) return value;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
};

const text = (value, max) => String(value ?? "").slice(0, max);
const isId = (value) => typeof value === "string" && value.length > 0 && value.length <= 120;
const position = (value) => { const number = Number(value); return Number.isFinite(number) ? Math.min(5000, Math.max(0, number)) : undefined; };

// 그리기 도구로 만든 그림. 알려진 도형 종류와 값만 남기고, 좌표는 적당한 범위로 자른다.
const coordinate = (value, limit) => { const number = Number(value); return Number.isFinite(number) ? Math.min(limit, Math.max(-limit, Math.round(number * 10) / 10)) : 0; };
export function drawingField(value) {
  const source = value && typeof value === "object" ? value : {};
  const shapes = (Array.isArray(source.shapes) ? source.shapes : []).filter((shape) => shape && DRAW_TYPES.includes(shape.type)).slice(0, DRAW_MAX_SHAPES);
  return {
    frame: DRAW_FRAMES.includes(source.frame) ? source.frame : DRAW_FRAMES[0],
    shapes: shapes.map((shape, index) => ({
      id: typeof shape.id === "string" && /^[\w-]{1,60}$/.test(shape.id) ? shape.id : `shape-${index}`,
      type: shape.type,
      x: coordinate(shape.x, 5000), y: coordinate(shape.y, 5000), w: coordinate(shape.w, 5000), h: coordinate(shape.h, 5000),
      text: text(shape.text, 300),
      tone: DRAW_TONES.includes(shape.tone) ? shape.tone : DRAW_TONES[0],
      // 글자 크기: 작게/보통/크게(s·m·l) 또는 8~120px 숫자
      size: ["s", "m", "l"].includes(shape.size) ? shape.size : Number.isFinite(Number(shape.size)) && shape.size !== "" && shape.size !== null ? Math.min(120, Math.max(8, Math.round(Number(shape.size)))) : "m",
      round: shape.round === true,
    })),
  };
}
// 와이어프레임 카드와 실험실 가설에 팀원이 남기는 코멘트. screen.update · experiment.update로는 바뀌지 않고
// comment.* op로만 더하고 지운다. 가설 코멘트에는 남길 때의 찬반(stance)이 붙을 수 있다.
const COMMENT_MAX = 200;
export const VOTE_VALUES = ["agree", "disagree"];
const VOTE_MAX = 100;
const colorField = (value) => (/^#[0-9a-f]{6}$/i.test(String(value)) ? value : "#7c6cd8");
// 실험실 가설의 코멘트와 찬반은 익명이다. 보내는 쪽이 이름을 넣어도 여기서 지우고, 서버도 누가 보냈는지 알리지 않는다.
export const ANONYMOUS = "익명";
const ANONYMOUS_COLOR = "#6b7280";
export const isAnonymousOp = (op) => op?.type === "vote.set" || (typeof op?.type === "string" && op.type.startsWith("comment.") && isId(op.experimentId));
const anonymize = (comment) => (comment ? { ...comment, by: ANONYMOUS, color: ANONYMOUS_COLOR } : null);
function commentFields(source = {}) {
  const body = text(source.text, 1000).trim();
  if (!isId(source.id) || !body) return null;
  return {
    id: source.id,
    text: body,
    by: text(source.by, 20).trim() || "팀원",
    color: colorField(source.color),
    at: text(source.at, 40),
    resolved: source.resolved === true,
    ...(VOTE_VALUES.includes(source.stance) ? { stance: source.stance } : {}),
  };
}
const commentList = (list) => (Array.isArray(list) ? list.map(commentFields).filter(Boolean).slice(-COMMENT_MAX) : []);
// 실험실 가설의 찬반. 팀원(브라우저)마다 가설 하나에 한 표이고, id는 그 브라우저가 가설마다 따로 만든 무작위 id다.
// 이름 · 색은 저장하지 않는다.
function voteFields(source = {}) {
  if (!isId(source.id) || !VOTE_VALUES.includes(source.value)) return null;
  return { id: source.id, value: source.value };
}
function voteList(list) {
  const byVoter = new Map();
  for (const vote of Array.isArray(list) ? list.map(voteFields).filter(Boolean) : []) { byVoter.delete(vote.id); byVoter.set(vote.id, vote); }
  return [...byVoter.values()].slice(-VOTE_MAX);
}
const feedback = (item) => ({
  ...(Array.isArray(item.comments) && item.comments.length ? { comments: commentList(item.comments).map(anonymize) } : {}),
  ...(Array.isArray(item.votes) && item.votes.length ? { votes: voteList(item.votes) } : {}),
});
function screenFields(source = {}) {
  const out = {};
  if ("title" in source) out.title = text(source.title, 200).trim();
  if ("purpose" in source) out.purpose = text(source.purpose, 2000);
  if ("sections" in source) out.sections = text(source.sections, 5000);
  if ("actionLabel" in source) out.actionLabel = text(source.actionLabel, 200);
  if ("url" in source) out.url = validUrl(text(source.url, 2000));
  if ("status" in source) out.status = SCREEN_STATUS.includes(source.status) ? source.status : SCREEN_STATUS[0];
  if ("drawing" in source) out.drawing = drawingField(source.drawing);
  for (const axis of ["x", "y"]) if (axis in source && position(source[axis]) !== undefined) out[axis] = position(source[axis]);
  return out;
}
function experimentFields(source = {}) {
  const out = {};
  if ("title" in source) out.title = text(source.title, 200).trim();
  if ("question" in source) out.question = text(source.question, 2000);
  if ("url" in source) out.url = validUrl(text(source.url, 2000));
  if ("status" in source) out.status = EXPERIMENT_STATUS.includes(source.status) ? source.status : EXPERIMENT_STATUS[0];
  return out;
}

// 가져오기 파일이나 서버 저장 파일을 검사하고, 알려진 필드만 남긴다. 올바르지 않으면 null.
export function normalizeBoard(data) {
  if (data?.version !== 1 || typeof data.projectName !== "string" || !Array.isArray(data.screens) || !Array.isArray(data.experiments) || !Array.isArray(data.links)) return null;
  if (data.screens.some((item) => !item || !isId(item.id) || typeof item.title !== "string")) return null;
  if (data.experiments.some((item) => !item || !isId(item.id) || typeof item.title !== "string")) return null;
  const screenIds = new Set(data.screens.map((item) => item.id));
  if (screenIds.size !== data.screens.length) return null;
  if (new Set(data.experiments.map((item) => item.id)).size !== data.experiments.length) return null;
  if (data.links.some((link) => !link || !isId(link.id) || !screenIds.has(link.from) || !screenIds.has(link.to))) return null;
  return {
    version: 1,
    projectName: text(data.projectName, 200).trim() || "새 프로젝트",
    screens: data.screens.map((item) => ({ id: item.id, title: "", purpose: "", sections: "", actionLabel: "", url: "", status: SCREEN_STATUS[0], ...screenFields(item), ...(Array.isArray(item.comments) && item.comments.length ? { comments: commentList(item.comments) } : {}) })),
    experiments: data.experiments.map((item) => ({ id: item.id, title: "", question: "", url: "", status: EXPERIMENT_STATUS[0], ...experimentFields(item), ...feedback(item) })),
    links: data.links.map((link) => ({ id: link.id, from: link.from, to: link.to, label: text(link.label, 200) })),
  };
}

const fail = (error, message) => ({ error, message });
const MISSING = () => fail("missing", "다른 팀원이 삭제한 항목이에요. 최신 내용으로 맞췄습니다.");
const INVALID = () => fail("invalid", "잘못된 요청입니다.");

// op를 board에 적용한다(board를 직접 바꾼다).
// trusted: 서버가 이미 승인해 순서를 정한 op를 받아 적용할 때. 이미 있는 항목 생성은 덮어쓰기로,
// 없는 항목 수정은 무시로 처리해서 같은 op를 두 번 받아도 모두의 결과가 같아지게 한다.
export function applyOp(board, op, { trusted = false } = {}) {
  if (!op || typeof op.type !== "string") return INVALID();
  const collection = op.type.startsWith("screen.") ? "screens" : op.type.startsWith("experiment.") ? "experiments" : op.type.startsWith("link.") ? "links" : null;
  const list = collection && board[collection];
  const find = (itemId) => list.find((item) => item.id === itemId);

  // 코멘트는 화면(screenId) 또는 실험실 가설(experimentId)에 단다.
  if (op.type.startsWith("comment.")) {
    const onExperiment = isId(op.experimentId);
    const where = onExperiment ? { experimentId: op.experimentId } : { screenId: op.screenId };
    const target = onExperiment ? board.experiments.find((item) => item.id === op.experimentId) : isId(op.screenId) && board.screens.find((item) => item.id === op.screenId);
    if (!target) return trusted ? { ok: true, op } : MISSING();
    target.comments ||= [];
    if (op.type === "comment.add") {
      const comment = onExperiment ? anonymize(commentFields(op.item)) : commentFields(op.item);
      if (!comment) return INVALID();
      if (!target.comments.some((item) => item.id === comment.id)) target.comments.push(comment);
      if (target.comments.length > COMMENT_MAX) target.comments.splice(0, target.comments.length - COMMENT_MAX);
      return { ok: true, op: { type: op.type, ...where, item: comment } };
    }
    if (!isId(op.id)) return INVALID();
    if (op.type === "comment.delete") {
      target.comments = target.comments.filter((item) => item.id !== op.id);
      return { ok: true, op: { type: op.type, ...where, id: op.id } };
    }
    if (op.type === "comment.resolve") {
      const comment = target.comments.find((item) => item.id === op.id);
      if (comment) comment.resolved = op.resolved === true;
      return { ok: true, op: { type: op.type, ...where, id: op.id, resolved: op.resolved === true } };
    }
    return INVALID();
  }
  // 가설 찬반: 같은 투표자의 이전 표를 지우고 새 표를 넣는다. value가 없으면 표를 거둔다.
  if (op.type === "vote.set") {
    const experiment = isId(op.experimentId) && board.experiments.find((item) => item.id === op.experimentId);
    if (!experiment) return trusted ? { ok: true, op } : MISSING();
    if (!isId(op.vote?.id)) return INVALID();
    const vote = voteFields(op.vote);
    experiment.votes = (experiment.votes || []).filter((item) => item.id !== op.vote.id);
    if (vote) experiment.votes.push(vote);
    if (experiment.votes.length > VOTE_MAX) experiment.votes.splice(0, experiment.votes.length - VOTE_MAX);
    return { ok: true, op: { type: op.type, experimentId: op.experimentId, vote: vote || { id: op.vote.id } } };
  }
  switch (op.type) {
    case "project": {
      const projectName = text(op.projectName, 200).trim();
      if (!projectName) return INVALID();
      board.projectName = projectName;
      return { ok: true, op: { type: "project", projectName } };
    }
    case "replace": {
      const next = normalizeBoard(op.board);
      if (!next) return fail("invalid", "작업판 JSON 파일을 읽을 수 없습니다.");
      Object.assign(board, next);
      return { ok: true, op: { type: "replace", board: next } };
    }
    case "screen.create":
    case "experiment.create": {
      const isScreen = op.type === "screen.create";
      const fields = isScreen ? screenFields(op.item) : experimentFields(op.item);
      if (!isId(op.item?.id) || !fields.title) return INVALID();
      const existing = find(op.item.id);
      if (existing && !trusted) return INVALID();
      if (existing) Object.assign(existing, fields);
      else list.push(isScreen
        ? { id: op.item.id, title: "", purpose: "", sections: "", actionLabel: "", url: "", status: SCREEN_STATUS[0], x: 60, y: 80, ...fields }
        : { id: op.item.id, title: "", question: "", url: "", status: EXPERIMENT_STATUS[0], ...fields });
      return { ok: true, op: { type: op.type, item: { id: op.item.id, ...fields } } };
    }
    case "screen.update":
    case "experiment.update": {
      if (!isId(op.id)) return INVALID();
      const fields = op.type === "screen.update" ? screenFields(op.fields) : experimentFields(op.fields);
      if ("title" in fields && !fields.title) return INVALID();
      const existing = find(op.id);
      if (!existing) return trusted ? { ok: true, op } : MISSING();
      Object.assign(existing, fields);
      return { ok: true, op: { type: op.type, id: op.id, fields } };
    }
    case "screen.move": {
      const x = position(op.x), y = position(op.y);
      if (!isId(op.id) || x === undefined || y === undefined) return INVALID();
      const existing = find(op.id);
      if (!existing) return trusted ? { ok: true, op } : MISSING();
      existing.x = x;
      existing.y = y;
      return { ok: true, op: { type: "screen.move", id: op.id, x, y, final: op.final === true } };
    }
    case "screen.delete":
    case "experiment.delete":
    case "link.delete": {
      if (!isId(op.id)) return INVALID();
      board[collection] = list.filter((item) => item.id !== op.id);
      if (op.type === "screen.delete") board.links = board.links.filter((link) => link.from !== op.id && link.to !== op.id);
      return { ok: true, op: { type: op.type, id: op.id } };
    }
    case "link.create": {
      const item = op.item;
      if (!isId(item?.id) || !isId(item.from) || !isId(item.to)) return INVALID();
      const link = { id: item.id, from: item.from, to: item.to, label: text(item.label, 200).trim() };
      const hasScreens = board.screens.some((screen) => screen.id === link.from) && board.screens.some((screen) => screen.id === link.to);
      if (trusted) {
        if (hasScreens && !find(link.id)) list.push(link);
        return { ok: true, op: { type: "link.create", item: link } };
      }
      if (!hasScreens) return MISSING();
      if (link.from === link.to) return fail("invalid", "서로 다른 화면을 연결해 주세요.");
      if (find(link.id)) return INVALID();
      if (list.some((existing) => existing.from === link.from && existing.to === link.to)) return fail("duplicate", "이미 연결된 화면입니다.");
      list.push(link);
      return { ok: true, op: { type: "link.create", item: link } };
    }
    default:
      return INVALID();
  }
}
