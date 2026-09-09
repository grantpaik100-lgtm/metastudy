import { z } from "zod";
import { LearnerContextDisplaySchema, SessionSummaryDisplaySchema, type LearnerContextDisplay, type SessionSummaryDisplay } from "../ui/contracts.js";

export const V2_IN_CHAT_RESOURCE_URI = "ui://studymeta/v2/learner-context-and-session-summary";
export const V2_IN_CHAT_MIME_TYPE = "text/html;profile=mcp-app";
export const V2_IN_CHAT_FALLBACK_PREFIX = "STUDYMETA_V2_IN_CHAT_DATA:";
export const V2_IN_CHAT_RESOURCE_METADATA = {
  title: "StudyMeta v2 learner context and session summary",
  description: "Contract-rendered MCP/In-chat UI. UI-1 uses explicitly labeled synthetic mock data only.",
  mimeType: V2_IN_CHAT_MIME_TYPE,
  _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [], frameDomains: [] } } },
} as const;

export type InChatUiDisplay = { learner_context: LearnerContextDisplay; session_summary: SessionSummaryDisplay };
export const InChatUiDisplaySchema = z.object({
  learner_context: LearnerContextDisplaySchema,
  session_summary: SessionSummaryDisplaySchema,
}).strict();

export function parseInChatUiDisplay(value: unknown): InChatUiDisplay | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const parsed = InChatUiDisplaySchema.safeParse(source);
  return parsed.success ? parsed.data : null;
}

export function inChatUiFallbackText(display: InChatUiDisplay): string {
  const context = display.learner_context;
  const session = display.session_summary;
  const stateLines = context.states.map((state) => `- ${state.display_label}: ${state.display_text} (${state.result_outcome === "changed" ? "변경" : state.result_outcome === "pending" ? "판단 보류" : "변화 없음"}; ${state.result_reason_label})`);
  const resultLines = session.state_results.map((state) => `- ${state.display_label}: ${state.outcome === "changed" ? "변경" : state.outcome === "pending" ? "판단 보류" : state.outcome === "withheld" ? "보류" : "변화 없음"}; ${state.reason_label}`);
  const flow = session.events.map((event) => {
    const evidence = session.evidence.filter((item) => item.event_id === event.event_id).map((item) => item.label).join(", ");
    return `- 학습 활동: ${event.label} → 관찰: ${evidence || "없음"}`;
  });
  return [
    "StudyMeta v2 학습 맥락 (가상 UI 예시 데이터 — 실제 학습 판단이 아닙니다)",
    `${context.subject_label} · ${context.concept_label} · 갱신 ${context.context_updated_at}`,
    "핵심 상태:", ...stateLines,
    `추천 학습 방식: ${context.recommendation_label}`,
    "세션 요약:", `종료 상태: ${session.end_status}`,
    ...flow, "State 결과:", ...resultLines,
    ...session.excerpts.map((excerpt) => `가상 예시 인용: ${excerpt}`),
    `다음 행동: ${session.next_actions[0]?.label ?? "없음"} (현재 사용할 수 없음)`,
    "실제 세션·State는 이 도구 결과만으로 변경되지 않습니다.",
    "",
    `${V2_IN_CHAT_FALLBACK_PREFIX}${JSON.stringify(display)}`,
  ].join("\n");
}

/** Browser-independent resource; it receives only contract-shaped projections. */
export function getV2InChatUiHtml(): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>StudyMeta 학습 맥락</title><style>
  :root{color-scheme:light dark;--bg:#f7f6f2;--card:#fff;--ink:#0b1f3a;--muted:#52657c;--line:#d7deea;--blue:#1769d1;--blue-soft:#eaf3ff;--orange:#c66b16;--orange-soft:#fff3e6;--navy-soft:#e9eef6;--focus:#1769d1;--shadow:0 8px 24px rgba(11,31,58,.08)}
  @media(prefers-color-scheme:dark){:root{--bg:#111b2b;--card:#17263a;--ink:#f3f7fc;--muted:#c2cfdf;--line:#3a4d67;--blue:#82b9ff;--blue-soft:#193a62;--orange:#ffc17d;--orange-soft:#4d3217;--navy-soft:#263c59;--shadow:none}}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}.shell{max-width:760px;margin:auto;padding:16px}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:18px;margin-bottom:14px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.05em;color:var(--muted);margin:0 0 6px}.title-row{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}h1,h2,h3,p{margin-top:0}h1{font-size:20px;line-height:1.3;margin-bottom:4px}h2{font-size:16px;margin-bottom:12px}h3{font-size:13px;margin-bottom:4px}.mock{display:inline-flex;align-items:center;white-space:nowrap;border:1px solid var(--blue);background:var(--blue-soft);color:var(--ink);font-size:12px;padding:3px 8px;border-radius:999px}.updated{color:var(--muted);font-size:12px;margin:0}.states{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:16px 0}.state{border:1px solid var(--line);border-radius:10px;padding:10px}.state-label{font-weight:700}.state-status{display:block;color:var(--muted);font-size:12px;margin-top:4px}.reason{color:var(--muted);font-size:12px;margin:6px 0 0}.recommendation{border-left:3px solid var(--blue);background:var(--blue-soft);padding:10px 12px;margin:0}.flow{display:grid;grid-template-columns:1fr 24px 1fr 24px 1fr;align-items:center;gap:4px}.node{min-height:76px;border:1px solid var(--line);border-radius:10px;padding:9px;background:var(--card)}.event{border-color:var(--blue);background:var(--blue-soft)}.evidence{border-color:var(--orange);background:var(--orange-soft)}.state-node{border-color:var(--ink);background:var(--navy-soft)}.arrow{text-align:center;color:var(--muted);font-weight:bold}.results{display:grid;gap:8px;margin-top:12px}.result{border-left:3px solid var(--line);padding-left:10px}.outcome{font-weight:700}.excerpt{background:var(--bg);border-radius:8px;padding:9px;margin:8px 0;color:var(--muted);font-size:13px}.unavailable{margin:14px 0 8px;color:var(--muted);font-size:13px}button{font:inherit;border-radius:10px;border:1px solid var(--line);padding:9px 12px;background:var(--card);color:var(--ink);cursor:pointer}button:disabled{opacity:.62;cursor:not-allowed}button:focus-visible{outline:3px solid var(--focus);outline-offset:2px}.fallback{margin-top:8px}.fallback[hidden]{display:none}.copy{background:var(--blue);color:white;border-color:var(--blue)}.live{min-height:1.5em;color:var(--muted);font-size:13px;margin:8px 0 0}@media(max-width:520px){.shell{padding:10px}.card{padding:14px}.title-row{display:block}.mock{margin-top:8px}.states{grid-template-columns:1fr}.flow{grid-template-columns:1fr}.arrow{transform:rotate(90deg);padding:2px}.node{min-height:0}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
  html,body{max-width:100%;overflow-x:hidden}.shell,.card,.state,.node{min-width:0}h1,h2,h3,p{overflow-wrap:anywhere}
  </style></head><body><main class="shell" aria-live="polite"><section class="card" aria-labelledby="context-title"><div class="title-row"><div><p class="eyebrow">LEARNER CONTEXT</p><h1 id="context-title">학습 맥락을 불러오는 중</h1><p class="updated" id="updated"></p></div><span class="mock">가상 UI 예시 데이터</span></div><div class="states" id="states"></div><p class="recommendation" id="recommendation"></p><p class="unavailable">실제 backend 연결 전이라 세션 시작과 State 변경은 사용할 수 없습니다.</p><button disabled aria-disabled="true" id="next-action"></button><div class="fallback" id="fallback"><p class="unavailable">이 호스트는 대화 요청을 보낼 수 없을 수 있습니다. 아래와 같은 문구를 직접 대화에 입력할 수 있어요.</p><button class="copy" id="copy" type="button">요청 문구 복사</button></div><p class="live" id="live" aria-live="polite"></p></section><section class="card" aria-labelledby="summary-title"><p class="eyebrow">SESSION SUMMARY</p><h2 id="summary-title">구조화된 세션 요약</h2><p class="updated" id="session-meta"></p><div class="flow" id="flow"></div><div class="results" id="results"></div><div id="excerpts"></div><p class="recommendation" id="summary-next"></p></section></main><script>(()=>{const prefix=${JSON.stringify(V2_IN_CHAT_FALLBACK_PREFIX)},by=id=>document.getElementById(id),outcome=v=>v==='changed'?'변경':v==='pending'?'판단 보류':v==='withheld'?'보류':'변화 없음';let fallbackMessage='StudyMeta 학습을 이어서 진행해 주세요.';function parse(v){if(!v||typeof v!=='object'||Array.isArray(v)||!v.learner_context||!v.session_summary)return null;return v}function fromText(text){const at=typeof text==='string'?text.indexOf(prefix):-1;if(at<0)return null;try{return parse(JSON.parse(text.slice(at+prefix.length)))}catch{return null}}function content(v){if(v&&v.structuredContent)return parse(v.structuredContent);if(v&&typeof v.text==='string')return fromText(v.text);if(v&&Array.isArray(v.content)){for(const x of v.content){const found=content(x);if(found)return found}}return parse(v)}function layout(){document.documentElement.dataset.layoutWidth=document.documentElement.scrollWidth+'/'+document.documentElement.clientWidth}function render(raw){const data=content(raw);if(!data){by('context-title').textContent='표시할 학습 맥락이 없습니다';by('live').textContent='계약에 맞는 결과를 받으면 이 카드에 표시합니다.';layout();return}const c=data.learner_context,s=data.session_summary;by('context-title').textContent=c.subject_label+' · '+c.concept_label;by('updated').textContent='맥락 갱신: '+c.context_updated_at;by('states').replaceChildren(...c.states.map(x=>{const el=document.createElement('article');el.className='state';el.innerHTML='<div class="state-label"></div><span class="state-status"></span><p class="reason"></p>';el.children[0].textContent=x.display_label;el.children[1].textContent=x.display_text;el.children[2].textContent=outcome(x.result_outcome)+' · '+x.result_reason_label;return el}));by('recommendation').textContent='추천 학습 방식: '+c.recommendation_label;by('next-action').textContent=c.next_action.label+' (현재 사용할 수 없음)';fallbackMessage='다음 학습에서 '+c.recommendation_label;by('session-meta').textContent=s.subject_label+' · '+s.concept_label+' · '+(s.end_status==='completed'?'정상 종료':s.end_status==='interrupted'?'중단됨':'자동 종료');const event=s.events[0],evidence=s.evidence.filter(x=>x.event_id===event?.event_id);const nodes=[['event','학습 활동',event?.label||'없음'],['evidence','관찰',evidence.map(x=>x.label).join(', ')||'없음'],['state-node','State 결과',s.state_results.map(x=>x.display_label).join(', ')||'없음']];const flow=[];nodes.forEach((n,i)=>{const el=document.createElement('div');el.className='node '+n[0];el.innerHTML='<h3></h3><p></p>';el.children[0].textContent=n[1];el.children[1].textContent=n[2];flow.push(el);if(i<nodes.length-1){const arrow=document.createElement('div');arrow.className='arrow';arrow.textContent='→';flow.push(arrow)}});by('flow').replaceChildren(...flow);by('results').replaceChildren(...s.state_results.map(x=>{const el=document.createElement('div');el.className='result';el.innerHTML='<span class="outcome"></span><span class="reason"></span>';el.children[0].textContent=x.display_label+' · '+outcome(x.outcome)+' ';el.children[1].textContent=x.reason_label;return el}));by('excerpts').replaceChildren(...s.excerpts.map(x=>{const el=document.createElement('p');el.className='excerpt';el.textContent='가상 예시 인용: '+x;return el}));const next=s.next_actions[0];by('summary-next').textContent='다음 행동: '+(next?next.label+' (현재 사용할 수 없음)':'없음');layout()}by('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(fallbackMessage);by('live').textContent='요청 문구를 복사했습니다.'}catch{by('live').textContent='복사를 지원하지 않는 환경입니다. 요청 문구: '+fallbackMessage}});window.addEventListener('message',e=>{const m=e.data||{};if(m.method==='ui/notifications/tool-result')render(m.params);if(m.method==='ui/notifications/host-context-changed'){const v=m.params?.styles?.variables;if(v)Object.entries(v).forEach(([k,val])=>typeof val==='string'&&document.documentElement.style.setProperty(k,val))}});render(window.__STUDYMETA_V2_PREVIEW_CONTENT__||null)})();</script></body></html>`;
}
