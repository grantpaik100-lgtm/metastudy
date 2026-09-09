import { z } from "zod";
import { LearnerContextDisplaySchema, SessionSummaryDisplaySchema, type LearnerContextDisplay, type SessionSummaryDisplay } from "../ui/contracts.js";

// MCP Apps hosts cache resource HTML by URI. Bump after material UI changes.
export const V2_IN_CHAT_RESOURCE_URI = "ui://studymeta/v2/learner-context-and-session-summary-v3";
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
function getV2InChatUiBaseHtml(): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>StudyMeta 학습 맥락</title><style>
  :root{color-scheme:light dark;--canvas:#f4f6f9;--surface:#ffffff;--surface-subtle:#f8fafc;--navy:#0b1f3a;--navy-2:#163a63;--ink:#172235;--muted:#667085;--muted-2:#8a97a8;--line:#dce2ea;--line-soft:#e9edf3;--blue:#3478d4;--blue-soft:#edf5ff;--teal:#0f766e;--teal-soft:#e8f7f4;--amber:#a96216;--amber-soft:#fff6e8;--violet:#6655c7;--violet-soft:#f1efff;--focus:#3478d4;--shadow:0 16px 44px rgba(11,31,58,.10);--shadow-soft:0 4px 16px rgba(11,31,58,.06)}
  @media(prefers-color-scheme:dark){:root{--canvas:#0f1826;--surface:#172438;--surface-subtle:#1d2c42;--navy:#eef5ff;--navy-2:#cfe2ff;--ink:#f4f7fb;--muted:#b8c4d4;--muted-2:#8fa0b5;--line:#35475f;--line-soft:#2c3c52;--blue:#82b9ff;--blue-soft:#193b61;--teal:#6dd6ca;--teal-soft:#173f3d;--amber:#ffc47d;--amber-soft:#4a341d;--violet:#b7adff;--violet-soft:#302d59;--shadow:none;--shadow-soft:none}}
  *{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:transparent;color:var(--ink);font:14px/1.55 Pretendard,"Noto Sans KR","Apple SD Gothic Neo","Segoe UI",system-ui,sans-serif}.shell{max-width:760px;margin:auto;padding:10px}.app{min-width:0;overflow:hidden;background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow)}h1,h2,h3,p{margin-top:0;overflow-wrap:anywhere}.hero{position:relative;overflow:hidden;padding:20px 22px 18px;color:#fff;background:linear-gradient(135deg,#0b1f3a 0%,#163a63 58%,#1d4f83 100%)}.hero:after{content:"";position:absolute;width:220px;height:220px;right:-86px;top:-118px;border:1px solid rgba(255,255,255,.16);border-radius:50%;box-shadow:0 0 0 28px rgba(255,255,255,.035),0 0 0 56px rgba(255,255,255,.025)}.brand-row,.hero-main{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px}.brand{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.14em}.brand-mark{display:grid;place-items:center;width:25px;height:25px;border:1px solid rgba(255,255,255,.36);border-radius:8px;background:rgba(255,255,255,.12)}.brand-mark svg{width:15px;height:15px}.mock{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border:1px solid rgba(255,255,255,.26);background:rgba(255,255,255,.1);color:#fff;font-size:10px;font-weight:700;padding:4px 8px;border-radius:999px}.mock-dot{width:6px;height:6px;border-radius:50%;background:#ffd18d;box-shadow:0 0 0 3px rgba(255,209,141,.16)}.hero-main{align-items:flex-end;margin-top:20px}.eyebrow{margin:0 0 5px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.12em}.hero .eyebrow{color:#bcd3ef}.hero h1{margin:0;font-size:23px;line-height:1.25;letter-spacing:-.025em}.hero-subject{font-weight:500;color:#d9e8f8}.hero-separator{padding:0 5px;color:#7da7d2}.updated{margin:5px 0 0;color:#c1d4e9;font-size:11px;font-variant-numeric:tabular-nums}.context{padding:20px 22px}.section-kicker{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.section-kicker h2{margin:0;font-size:15px;letter-spacing:-.015em}.section-note{color:var(--muted);font-size:11px}.states{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.state{position:relative;min-width:0;min-height:126px;padding:13px;border:1px solid var(--line-soft);border-radius:14px;background:var(--surface-subtle);transition:border-color 160ms ease,background 160ms ease}.state:hover{border-color:var(--line)}.state-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.state-index{color:var(--muted-2);font-size:10px;font-weight:800;font-variant-numeric:tabular-nums}.state-label{font-size:13px;font-weight:800}.state-status{display:block;margin-top:11px;color:var(--ink);font-size:12px;line-height:1.45}.state-meta{display:flex;align-items:flex-start;gap:6px;margin:8px 0 0;color:var(--muted);font-size:10px;line-height:1.4}.state-dot{flex:0 0 auto;width:6px;height:6px;margin-top:4px;border-radius:50%;background:var(--muted-2)}.state[data-outcome="changed"] .state-dot{background:var(--teal)}.state[data-outcome="pending"] .state-dot{background:var(--amber)}.coach{display:grid;grid-template-columns:34px 1fr;gap:11px;align-items:center;margin-top:12px;padding:12px 13px;border:1px solid #cfe2fa;border-radius:14px;background:linear-gradient(135deg,var(--blue-soft),var(--surface))}.coach-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:var(--navy);color:var(--surface)}.coach-icon svg{width:18px;height:18px}.coach-label{margin:0;color:var(--blue);font-size:10px;font-weight:800;letter-spacing:.08em}.recommendation{margin:2px 0 0;font-size:13px;font-weight:650}.action-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}.unavailable{margin:0;color:var(--muted);font-size:10px}.actions{display:flex;gap:7px;flex:0 0 auto}button{font:inherit;border-radius:10px;border:1px solid var(--line);padding:8px 11px;background:var(--surface);color:var(--ink);cursor:pointer;transition:background 160ms ease,border-color 160ms ease}button:disabled{cursor:not-allowed;color:var(--muted);background:var(--surface-subtle)}button:focus-visible{outline:3px solid var(--focus);outline-offset:2px}.copy{color:var(--blue);border-color:#bfd5f1;background:var(--blue-soft);font-size:11px;font-weight:700}.next-button{font-size:11px}.fallback-copy{display:none}.live{min-height:0;margin:6px 0 0;color:var(--muted);font-size:11px}.summary{padding:19px 22px 21px;border-top:1px solid var(--line-soft);background:linear-gradient(180deg,var(--surface-subtle),var(--surface))}.summary-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}.summary h2{margin:0;font-size:17px;letter-spacing:-.02em}.session-meta{margin:4px 0 0;color:var(--muted);font-size:11px}.session-status{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border:1px solid var(--line);border-radius:999px;padding:4px 8px;color:var(--muted);background:var(--surface);font-size:10px;font-weight:700}.session-status:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--amber)}.flow{display:grid;grid-template-columns:1fr 20px 1fr 20px 1fr;align-items:stretch;gap:4px}.node{position:relative;min-width:0;min-height:92px;padding:11px 11px 10px;border:1px solid var(--line);border-radius:13px;background:var(--surface);box-shadow:var(--shadow-soft)}.node-step{display:block;margin-bottom:10px;color:var(--muted-2);font-size:9px;font-weight:800;letter-spacing:.1em}.node h3{margin:0 0 4px;font-size:12px}.node p{margin:0;color:var(--muted);font-size:11px;line-height:1.4}.event{border-top:3px solid var(--blue)}.evidence{border-top:3px solid var(--amber)}.state-node{border-top:3px solid var(--navy-2)}.arrow{display:grid;place-items:center;color:var(--muted-2)}.arrow svg{width:14px;height:14px}.results{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.result{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:5px 9px;background:var(--surface);font-size:10px}.result-dot{width:6px;height:6px;border-radius:50%;background:var(--muted-2)}.result[data-outcome="changed"] .result-dot{background:var(--teal)}.result[data-outcome="pending"] .result-dot{background:var(--amber)}.outcome{font-weight:800}.result-reason{color:var(--muted)}.excerpt{position:relative;margin:12px 0 0;padding:11px 12px 11px 31px;border-radius:12px;background:var(--violet-soft);color:var(--muted);font-size:11px}.excerpt:before{content:"\\201C";position:absolute;left:11px;top:4px;color:var(--violet);font:700 25px/1 Georgia,serif}.next-step{display:flex;align-items:center;gap:10px;margin:12px 0 0;padding:11px 12px;border-radius:12px;background:var(--navy);color:var(--surface);font-size:11px}.next-step-label{flex:0 0 auto;color:#a9c6e6;font-size:9px;font-weight:800;letter-spacing:.1em}.next-step-text{font-weight:650}@media(prefers-color-scheme:dark){.hero{color:#fff;background:linear-gradient(135deg,#0c1c31,#183a60)}.coach{border-color:#2f5075}.coach-icon,.next-step{background:#0c1c31;color:#fff}.next-step-label{color:#8fb4dc}}@media(max-width:560px){.shell{padding:6px}.app{border-radius:16px}.hero,.context,.summary{padding-left:15px;padding-right:15px}.hero-main{align-items:flex-start}.hero h1{font-size:20px}.mock{max-width:150px;white-space:normal;text-align:right}.states{grid-template-columns:1fr}.state{min-height:0}.action-bar{align-items:flex-start;flex-direction:column}.actions{width:100%}.actions button{flex:1}.flow{grid-template-columns:1fr}.arrow{height:18px;transform:rotate(90deg)}.node{min-height:0}.summary-head{align-items:flex-start}.result{border-radius:11px}.result-reason{display:none}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
  </style></head><body><main class="shell" aria-live="polite"><article class="app"><header class="hero"><div class="brand-row"><div class="brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7.5 12 4l7 3.5-7 3.5-7-3.5Z" stroke="currentColor" stroke-width="1.8"/><path d="M7.5 10v4.6c2.8 2 6.2 2 9 0V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span><span>STUDYMETA</span></div><span class="mock"><span class="mock-dot"></span>가상 UI 예시 데이터</span></div><div class="hero-main"><div><p class="eyebrow">LEARNER CONTEXT</p><h1 id="context-title"><span id="subject-title">학습 맥락</span><span class="hero-separator">/</span><span id="concept-title">불러오는 중</span></h1><p class="updated" id="updated"></p></div></div></header><section class="context" aria-labelledby="state-title"><div class="section-kicker"><h2 id="state-title">지금 확인된 학습 상태</h2><span class="section-note">근거가 없으면 유지됩니다</span></div><div class="states" id="states"></div><div class="coach"><span class="coach-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3v3M5.64 5.64l2.12 2.12M3 12h3m12 0h3M7 17h10M9 21h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8.5 13.5a5 5 0 1 1 7 0c-.9.8-1.4 1.6-1.5 2.5h-4c-.1-.9-.6-1.7-1.5-2.5Z" stroke="currentColor" stroke-width="1.8"/></svg></span><div><p class="coach-label">NEXT LEARNING MODE</p><p class="recommendation" id="recommendation"></p></div></div><div class="action-bar"><p class="unavailable">데모에서는 실제 세션과 State를 변경하지 않습니다.</p><div class="actions"><button class="copy" id="copy" type="button">요청 문구 복사</button><button class="next-button" disabled aria-disabled="true" id="next-action"></button></div></div><div class="fallback-copy" id="fallback" aria-hidden="true"></div><p class="live" id="live" aria-live="polite"></p></section><section class="summary" aria-labelledby="summary-title"><div class="summary-head"><div><p class="eyebrow">SESSION SUMMARY</p><h2 id="summary-title">학습이 어떻게 기록됐는지</h2><p class="session-meta" id="session-meta"></p></div><span class="session-status" id="session-status">불러오는 중</span></div><div class="flow" id="flow"></div><div class="results" id="results"></div><div id="excerpts"></div><p class="next-step" id="summary-next"><span class="next-step-label">NEXT STEP</span><span class="next-step-text"></span></p></section></article></main><script>(()=>{const prefix=${JSON.stringify(V2_IN_CHAT_FALLBACK_PREFIX)},by=id=>document.getElementById(id),outcome=v=>v==='changed'?'변경':v==='pending'?'판단 보류':v==='withheld'?'보류':'변화 없음',status=v=>v==='completed'?'정상 종료':v==='interrupted'?'중단됨':'자동 종료',formatDate=v=>{try{return new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v))}catch{return v}};let fallbackMessage='StudyMeta 학습을 이어서 진행해 주세요.';function parse(v){if(!v||typeof v!=='object'||Array.isArray(v)||!v.learner_context||!v.session_summary)return null;return v}function fromText(text){const at=typeof text==='string'?text.indexOf(prefix):-1;if(at<0)return null;try{return parse(JSON.parse(text.slice(at+prefix.length)))}catch{return null}}function content(v){if(v&&v.structuredContent)return parse(v.structuredContent);if(v&&typeof v.text==='string')return fromText(v.text);if(v&&Array.isArray(v.content)){for(const x of v.content){const found=content(x);if(found)return found}}return parse(v)}function layout(){document.documentElement.dataset.layoutWidth=document.documentElement.scrollWidth+'/'+document.documentElement.clientWidth}function render(raw){const data=content(raw);if(!data){by('subject-title').textContent='표시할 학습 맥락이 없습니다';by('concept-title').textContent='';by('live').textContent='계약에 맞는 결과를 받으면 이 카드에 표시합니다.';layout();return}const c=data.learner_context,s=data.session_summary;by('subject-title').textContent=c.subject_label;by('concept-title').textContent=c.concept_label;by('updated').textContent=formatDate(c.context_updated_at)+' 기준으로 업데이트';by('states').replaceChildren(...c.states.map((x,i)=>{const el=document.createElement('article');el.className='state';el.dataset.outcome=x.result_outcome;el.innerHTML='<div class="state-top"><span class="state-label"></span><span class="state-index"></span></div><span class="state-status"></span><p class="state-meta"><span class="state-dot"></span><span class="state-reason"></span></p>';el.querySelector('.state-label').textContent=x.display_label;el.querySelector('.state-index').textContent=String(i+1).padStart(2,'0');el.querySelector('.state-status').textContent=x.display_text;el.querySelector('.state-reason').textContent=outcome(x.result_outcome)+' · '+x.result_reason_label;return el}));by('recommendation').textContent=c.recommendation_label;by('next-action').textContent=c.next_action.label;fallbackMessage='다음 학습에서 '+c.recommendation_label;by('session-meta').textContent=s.subject_label+' · '+s.concept_label;by('session-status').textContent=status(s.end_status);const event=s.events[0],evidence=s.evidence.filter(x=>x.event_id===event?.event_id),nodes=[['event','01 · LEARNING EVENT','학습 활동',event?.label||'없음'],['evidence','02 · EVIDENCE','관찰 근거',evidence.map(x=>x.label).join(', ')||'없음'],['state-node','03 · STATE','상태 결과',s.state_results.map(x=>x.display_label).join(', ')||'없음']],arrowSvg='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',flow=[];nodes.forEach((n,i)=>{const el=document.createElement('div');el.className='node '+n[0];el.innerHTML='<span class="node-step"></span><h3></h3><p></p>';el.children[0].textContent=n[1];el.children[1].textContent=n[2];el.children[2].textContent=n[3];flow.push(el);if(i<nodes.length-1){const arrow=document.createElement('div');arrow.className='arrow';arrow.innerHTML=arrowSvg;flow.push(arrow)}});by('flow').replaceChildren(...flow);by('results').replaceChildren(...s.state_results.map(x=>{const el=document.createElement('div');el.className='result';el.dataset.outcome=x.outcome;el.innerHTML='<span class="result-dot"></span><span class="outcome"></span><span class="result-reason"></span>';el.children[1].textContent=x.display_label+' · '+outcome(x.outcome);el.children[2].textContent=x.reason_label;return el}));by('excerpts').replaceChildren(...s.excerpts.map(x=>{const el=document.createElement('p');el.className='excerpt';el.textContent=x;return el}));const next=s.next_actions[0];by('summary-next').querySelector('.next-step-text').textContent=next?next.label+' · 데모에서는 실행되지 않음':'제안 없음';layout()}by('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(fallbackMessage);by('live').textContent='요청 문구를 복사했습니다.'}catch{by('live').textContent='복사를 지원하지 않는 환경입니다. 요청 문구: '+fallbackMessage}});window.addEventListener('message',e=>{const m=e.data||{};if(m.method==='ui/notifications/tool-result')render(m.params);if(m.method==='ui/notifications/host-context-changed'){const v=m.params?.styles?.variables;if(v)Object.entries(v).forEach(([k,val])=>typeof val==='string'&&document.documentElement.style.setProperty(k,val))}});render(window.__STUDYMETA_V2_PREVIEW_CONTENT__||null)})();</script></body></html>`;
}

/**
 * Kept outside the renderer template so the message listener in the base UI is
 * registered before ready/measurement notifications are emitted.
 */
const HOST_HANDSHAKE_SCRIPT = String.raw`<script>
  (() => {
    if (window.parent === window) return;
    const protocolVersion = "2026-01-26";
    let nextId = 1;
    const notify = (method, params) => window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
    const notifySizeChanged = () => {
      const root = document.documentElement;
      notify("ui/notifications/size-changed", {
        width: Math.ceil(Math.max(root.scrollWidth, document.body.scrollWidth)),
        height: Math.ceil(Math.max(root.scrollHeight, document.body.scrollHeight)),
      });
    };
    const ready = () => {
      notify("ui/notifications/initialized", {});
      // Kept for hosts that implemented the older notification alias.
      notify("notifications/initialized", {});
      if (window.ResizeObserver) new ResizeObserver(notifySizeChanged).observe(document.documentElement);
      notifySizeChanged();
      requestAnimationFrame(notifySizeChanged);
    };
    const request = (method, params) => new Promise((resolve, reject) => {
      const id = nextId++;
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", receive);
        reject(new Error("MCP Apps lifecycle handshake timed out"));
      }, 1500);
      const receive = (event) => {
        const message = event.data;
        if (!message || message.id !== id) return;
        window.clearTimeout(timeout);
        window.removeEventListener("message", receive);
        if (message.error) reject(new Error(message.error.message || "Host rejected lifecycle handshake"));
        else resolve(message.result || {});
      };
      window.addEventListener("message", receive);
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
    });
    // The renderer listener was installed by the preceding script. Strict MCP
    // Apps hosts require this request before making the iframe visible.
    request("ui/initialize", {
      protocolVersion,
      appInfo: { name: "studymeta-v2-in-chat-ui", version: "0.3.0" },
      appCapabilities: { availableDisplayModes: ["inline"] },
    }).then((result) => {
      // Some hosts return the initial tool result only with initialize.
      const toolResult = result && typeof result === "object" && result.toolResult ? result.toolResult : result;
      if (toolResult && Object.keys(toolResult).length) {
        window.postMessage({ method: "ui/notifications/tool-result", params: toolResult }, "*");
      }
      ready();
    }).catch(() => {
      // Older ChatGPT hosts can return Method not found. Remain renderable via
      // notification delivery and publish the same ready/size fallback.
      ready();
    });
  })();
</script>`;

export function getV2InChatUiHtml(): string {
  return getV2InChatUiBaseHtml().replace("</body>", `${HOST_HANDSHAKE_SCRIPT}</body>`);
}
