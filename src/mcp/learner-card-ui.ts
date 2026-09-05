export const LEARNER_CARD_RESOURCE_URI = "ui://studymeta/learner-card";
export const LEARNER_CARD_MIME_TYPE = "text/html;profile=mcp-app";

/**
 * A self-contained MCP App view. It normally reads structuredContent carried
 * by ui/notifications/tool-result and, for hosts that strip that field, a
 * display-only fallback embedded in the text result. It never writes learner
 * state or persists learner data in browser storage.
 */
export function getLearnerCardHtml(): string {
  return String.raw`<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>StudyMeta 학습 카드</title>
    <style>
      :root {
        color-scheme: light dark;
        --page: var(--color-background-primary, #f7f8fa);
        --surface: var(--color-background-primary, #ffffff);
        --surface-soft: var(--color-background-secondary, #f4f7fb);
        --line: var(--color-border-secondary, #dde3ea);
        --line-strong: var(--color-border-primary, #c4ced9);
        --text: var(--color-text-primary, #17212b);
        --muted: var(--color-text-secondary, #5e6b78);
        --muted-light: var(--color-text-tertiary, #7c8793);
        --blue: #2d6cdf;
        --blue-dark: #1f54b5;
        --blue-soft: #eaf2ff;
        --blue-line: #c9dcff;
        --green: #16794c;
        --green-soft: #e9f8ef;
        --amber: #9a6511;
        --amber-soft: #fff5df;
        --red: #b33434;
        --red-soft: #fff0f0;
        --radius-lg: 18px;
        --radius-md: 12px;
        --shadow: 0 10px 28px rgba(23, 33, 43, .08);
        --font: var(--font-sans, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      }

      * { box-sizing: border-box; }
      html, body { margin: 0; min-width: 0; background: transparent; color: var(--text); font-family: var(--font); }
      button { font: inherit; }
      .card { width: min(100%, 680px); margin: 0 auto; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow); }
      .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 20px 16px; border-bottom: 1px solid var(--line); }
      .brand { display: flex; align-items: center; gap: 9px; font-weight: 760; letter-spacing: -.02em; }
      .brand-dot { width: 10px; height: 10px; border-radius: 999px; background: var(--blue); box-shadow: 0 0 0 4px var(--blue-soft); }
      .context { margin-top: 7px; color: var(--muted); font-size: 14px; line-height: 1.45; }
      .tag { flex: 0 0 auto; border: 1px solid var(--blue-line); border-radius: 999px; padding: 5px 9px; background: var(--blue-soft); color: var(--blue-dark); font-size: 12px; font-weight: 700; white-space: nowrap; }
      .tag.real { border-color: #cfe8d8; background: var(--green-soft); color: var(--green); }
      .body { padding: 20px; }
      h1 { margin: 0 0 13px; font-size: 18px; line-height: 1.3; letter-spacing: -.02em; }
      .state-list { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--line); }
      .state-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--line); }
      .state-name { font-size: 14px; font-weight: 700; }
      .state-description { margin-top: 4px; color: var(--muted); font-size: 13px; line-height: 1.45; }
      .badge { display: inline-flex; align-items: center; justify-content: center; min-height: 27px; border: 1px solid var(--line); border-radius: 999px; padding: 4px 9px; background: var(--surface-soft); color: var(--muted); font-size: 12px; font-weight: 700; white-space: nowrap; }
      .badge.help { border-color: #f0d7a3; background: var(--amber-soft); color: var(--amber); }
      .badge.good { border-color: #cfe8d8; background: var(--green-soft); color: var(--green); }
      .recommendation { margin-top: 18px; padding: 14px 15px; border: 1px solid var(--blue-line); border-radius: var(--radius-md); background: var(--blue-soft); }
      .recommendation-label { color: var(--blue-dark); font-size: 12px; font-weight: 800; }
      .recommendation p { margin: 5px 0 0; font-size: 14px; line-height: 1.55; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
      .button { min-height: 39px; border: 1px solid var(--line-strong); border-radius: 10px; padding: 8px 12px; background: var(--surface); color: var(--text); cursor: pointer; font-size: 13px; font-weight: 700; }
      .button.primary { border-color: var(--blue); background: var(--blue); color: #fff; }
      .button:hover { border-color: var(--blue); }
      .button.primary:hover { background: var(--blue-dark); }
      .button:focus-visible { outline: 3px solid color-mix(in srgb, var(--blue) 42%, transparent); outline-offset: 2px; }
      .live { min-height: 19px; margin: 10px 0 0; color: var(--muted); font-size: 12px; }
      .details { margin-top: 15px; border-top: 1px solid var(--line); padding-top: 15px; }
      .details[hidden] { display: none; }
      .details h2 { margin: 0 0 10px; font-size: 14px; }
      .details-list { margin: 0; padding-left: 18px; color: var(--muted); font-size: 13px; line-height: 1.6; }
      .empty { color: var(--muted); font-size: 14px; line-height: 1.55; }
      .footer { padding: 12px 20px 16px; color: var(--muted-light); font-size: 11px; line-height: 1.45; }
      @media (max-width: 640px) {
        .header, .body { padding-left: 16px; padding-right: 16px; }
        .footer { padding-left: 16px; padding-right: 16px; }
        .state-row { align-items: start; }
        .actions { display: grid; grid-template-columns: 1fr; }
        .button { width: 100%; }
      }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
    </style>
  </head>
  <body>
    <main class="card" aria-label="StudyMeta 학습 상태 카드">
      <header class="header">
        <div>
          <div class="brand"><span class="brand-dot" aria-hidden="true"></span>StudyMeta</div>
          <div id="context" class="context">학습 상태를 불러오는 중이에요.</div>
        </div>
        <span id="profile-tag" class="tag">학습 상태</span>
      </header>
      <section class="body" aria-live="polite">
        <h1>오늘의 학습 상태</h1>
        <ul id="state-list" class="state-list"></ul>
        <div id="recommendation" class="recommendation" hidden>
          <div class="recommendation-label">다음 추천</div>
          <p id="recommendation-text"></p>
        </div>
        <div class="actions" aria-label="학습 시작 방식">
          <button id="independent" class="button primary" type="button">혼자 풀어보기</button>
          <button id="hint" class="button" type="button">힌트 받기</button>
          <button id="why" class="button" type="button" aria-expanded="false" aria-controls="details">왜 이렇게 판단했나요?</button>
        </div>
        <p id="live" class="live" aria-live="polite"></p>
        <section id="details" class="details" hidden aria-label="판단 근거 상세">
          <h2>최근 관찰과 판단 근거</h2>
          <ul id="details-list" class="details-list"></ul>
        </section>
      </section>
      <footer class="footer">상태는 관찰된 Evidence를 바탕으로 판단되며, 이 카드의 버튼은 학습을 시작할 뿐 Evidence를 기록하지 않아요.</footer>
    </main>
    <script>
      (function () {
        "use strict";
        var protocolVersion = "2026-01-26";
        var nextId = 1;
        var latestContent = null;
        var detailsOpen = false;
        var fallbackPrefix = "STUDYMETA_LEARNER_CARD_DATA:";
        var context = document.getElementById("context");
        var profileTag = document.getElementById("profile-tag");
        var stateList = document.getElementById("state-list");
        var recommendation = document.getElementById("recommendation");
        var recommendationText = document.getElementById("recommendation-text");
        var details = document.getElementById("details");
        var detailsList = document.getElementById("details-list");
        var whyButton = document.getElementById("why");
        var live = document.getElementById("live");

        function text(value) { return value === null || value === undefined ? "" : String(value); }
        function record(value) {
          return value && typeof value === "object" && !Array.isArray(value) ? value : null;
        }
        function fallbackData(content) {
          var blocks = Array.isArray(content) ? content : [];
          for (var index = 0; index < blocks.length; index += 1) {
            var block = blocks[index];
            if (!block || block.type !== "text" || typeof block.text !== "string") continue;
            var prefixIndex = block.text.indexOf(fallbackPrefix);
            if (prefixIndex < 0) continue;
            try {
              var parsed = JSON.parse(block.text.slice(prefixIndex + fallbackPrefix.length).trim());
              if (record(parsed)) return parsed;
            } catch (_) {
              // Keep the regular loading state when a host altered text content.
            }
          }
          return null;
        }
        function toolResultData(params) {
          if (!params) return null;
          if (record(params.structuredContent)) return params.structuredContent;
          var result = record(params.result);
          return fallbackData(params.content) || (result && fallbackData(result.content));
        }
        function cleanLabel(value) {
          return text(value).replace(/[_-]+/g, " ").replace(/\b\w/g, function (character) { return character.toUpperCase(); });
        }
        function domainLabel(value) { return value === "calculus" ? "미적분" : cleanLabel(value); }
        function sourceLabel(value) {
          var labels = { chatgpt: "ChatGPT", claude: "Claude", manual: "직접 기록", quiz: "퀴즈", camera: "이미지 분석", lms: "학습 시스템", learning_app: "학습 앱", ai_tutor: "AI 튜터", external_ai: "외부 AI" };
          return labels[value] || "학습 기록";
        }
        function evidenceLabel(value) {
          var labels = { correct: "정답 수행", incorrect: "오답 수행", partial_success: "부분 수행", independent_success: "힌트 없는 수행", hint_requested: "힌트 요청", hint_used: "힌트 사용", success_after_hint: "힌트 후 수행", success_after_explanation: "설명 후 수행", first_error: "첫 오류", repeated_error: "반복 오류", misconception_candidate: "오개념 가능성", self_correction: "자기 수정", immediate_retrieval_success: "즉시 회상", delayed_retrieval_success: "나중 회상", delayed_retrieval_failure: "나중 회상 어려움", relearning: "재학습", novel_application_success: "새 문제 적용", novel_application_failure: "새 문제 적용 어려움", confidence_report: "자신감 보고", perceived_understanding: "이해도 보고", perceived_difficulty: "난이도 보고", error_awareness: "오류 인식", response_time: "응답 시간", stuck_duration: "막힌 시간", attempt_count: "시도 횟수", retry_count: "다시 시도" };
          return labels[value] || "기록된 학습 관찰";
        }
        function stateText(type, value) {
          if (value === null || value === undefined) return { badge: "변화 없음", description: "현재 이 상태를 바꿀 만한 관찰이 아직 충분하지 않아요.", tone: "" };
          if (type === "procedural") {
            if (value < 0.5) return { badge: "보완 중", description: "풀이 절차를 한 단계씩 연습해보면 좋아요.", tone: "help" };
            if (value < 0.75) return { badge: "다듬는 중", description: "혼자서 절차를 이어가는 연습을 해볼 수 있어요.", tone: "" };
            return { badge: "안정적", description: "기본 절차를 비교적 안정적으로 이어가고 있어요.", tone: "good" };
          }
          if (value > 0.6) return { badge: "조금 높음", description: "처음에는 작은 단서와 함께 시작하는 편이 도움이 될 수 있어요.", tone: "help" };
          if (value > 0.35) return { badge: "살펴보는 중", description: "필요할 때만 짧은 힌트를 받아보면 좋아요.", tone: "" };
          return { badge: "낮음", description: "혼자 먼저 시도해볼 준비가 되어 있어요.", tone: "good" };
        }
        function addRow(name, description, badge, tone) {
          var item = document.createElement("li");
          item.className = "state-row";
          var copy = document.createElement("div");
          var nameElement = document.createElement("div");
          nameElement.className = "state-name";
          nameElement.textContent = name;
          var descriptionElement = document.createElement("div");
          descriptionElement.className = "state-description";
          descriptionElement.textContent = description;
          copy.append(nameElement, descriptionElement);
          var badgeElement = document.createElement("span");
          badgeElement.className = "badge" + (tone ? " " + tone : "");
          badgeElement.textContent = badge;
          item.append(copy, badgeElement);
          stateList.append(item);
        }
        function recommendationFor(data, skill) {
          var policy = data.interaction_policy || data.pedagogical_policy || {};
          if (policy.initial_scaffold === "independent_solution") return "힌트 없이 문제의 구조부터 찾아볼까요?";
          if (policy.initial_scaffold === "guided_short_answer") return "다음 단계가 무엇인지 먼저 짧게 떠올려볼까요?";
          if (skill && skill.help_need !== null && skill.help_need !== undefined && skill.help_need > 0.6) return "처음에는 작은 선택지로 문제의 구조를 함께 찾아볼까요?";
          return "문제의 구조를 한 단계씩 살펴보며 시작해볼까요?";
        }
        function renderDetails(data, skill) {
          detailsList.replaceChildren();
          var recentEvidence = Array.isArray(data.recent_evidence) ? data.recent_evidence : [];
          if (recentEvidence.length === 0) {
            var empty = document.createElement("li");
            empty.textContent = "최근 관찰 기록이 아직 없어요. 실제 문제 풀이가 끝난 뒤 관찰된 결과만 기록돼요.";
            detailsList.append(empty);
          } else {
            recentEvidence.slice(0, 4).forEach(function (event) {
              var item = document.createElement("li");
              var evidence = Array.isArray(event.evidence) ? event.evidence.map(function (entry) { return evidenceLabel(entry.type); }).filter(Boolean) : [];
              item.textContent = sourceLabel(event.source) + "의 최근 기록" + (evidence.length ? ": " + evidence.join(", ") : "");
              detailsList.append(item);
            });
          }
          if (skill && skill.state_confidence !== null && skill.state_confidence !== undefined) {
            var confidence = document.createElement("li");
            confidence.textContent = "현재 판단의 신뢰도 정보가 있어요. 관찰이 늘어나면 함께 다시 살펴볼 수 있어요.";
            detailsList.append(confidence);
          }
          if (skill && skill.transferability !== null && skill.transferability !== undefined) {
            var transfer = document.createElement("li");
            transfer.textContent = "새로운 형태의 문제에 적용하는 신호는 자세히 보기에서만 참고해요.";
            detailsList.append(transfer);
          }
          if (data.domain_state && data.domain_state.calibration) {
            var calibration = document.createElement("li");
            calibration.textContent = "학습 뒤에는 스스로의 이해 정도도 함께 점검해볼 수 있어요.";
            detailsList.append(calibration);
          }
        }
        function render(data) {
          latestContent = data || null;
          stateList.replaceChildren();
          if (!data) {
            context.textContent = "학습 상태를 불러오는 중이에요.";
            addRow("학습 상태", "도구 결과를 받으면 현재 학습 맥락을 보여드릴게요.", "대기 중", "");
            recommendation.hidden = true;
            renderDetails({}, null);
            return;
          }
          var skill = data.skill_state || data.learner_state || (Array.isArray(data.skill_states) ? data.skill_states[0] : null);
          var domain = skill && skill.domain ? domainLabel(skill.domain) : (data.resolved_domain ? domainLabel(data.resolved_domain) : "학습 과목");
          var skillName = skill && skill.skill_name ? skill.skill_name : "현재 학습 개념";
          context.textContent = domain + " · " + skillName;
          var synthetic = data.profile_type === "synthetic_demo" || (data.learner_profile_metadata && data.learner_profile_metadata.is_real_user_data === false);
          profileTag.textContent = synthetic ? "Synthetic Demo" : "실제 학습 데이터";
          profileTag.className = "tag" + (synthetic ? "" : " real");
          var procedure = stateText("procedural", skill ? skill.procedural_mastery : null);
          addRow("절차 숙련", procedure.description, procedure.badge, procedure.tone);
          var help = stateText("help", skill ? skill.help_need : null);
          addRow("도움 필요도", help.description, help.badge, help.tone);
          var estimates = Array.isArray(data.state_estimates) ? data.state_estimates : [];
          var primaryEstimate = estimates.find(function (estimate) { return estimate.state_type === "procedural_mastery"; }) || estimates.find(function (estimate) { return estimate.state_type === "help_need"; });
          var observationCount = primaryEstimate && typeof primaryEstimate.evidence_count === "number" ? primaryEstimate.evidence_count : (Array.isArray(data.recent_evidence) ? data.recent_evidence.length : 0);
          var evidenceDescription = observationCount > 0 ? "최근 관찰 " + observationCount + "건을 바탕으로 현재 상태를 살펴보고 있어요." : "아직 충분한 관찰이 없어 기존 상태를 그대로 두고 있어요.";
          addRow("최근 판단 근거", evidenceDescription, observationCount > 0 ? "관찰 있음" : "변화 없음", observationCount > 0 ? "good" : "");
          recommendation.hidden = false;
          recommendationText.textContent = recommendationFor(data, skill);
          renderDetails(data, skill);
          if (!detailsOpen) details.hidden = true;
          whyButton.setAttribute("aria-expanded", String(detailsOpen));
        }
        function sendRequest(method, params) {
          if (window.parent === window) return Promise.reject(new Error("이 미리보기는 호스트 연결 없이 실행 중이에요."));
          var id = nextId++;
          return new Promise(function (resolve, reject) {
            function listener(event) {
              var data = event.data;
              if (!data || data.id !== id) return;
              window.removeEventListener("message", listener);
              if (data.error) reject(new Error(data.error.message || "호스트 요청이 거절되었어요."));
              else resolve(data.result || {});
            }
            window.addEventListener("message", listener);
            window.parent.postMessage({ jsonrpc: "2.0", id: id, method: method, params: params }, "*");
          });
        }
        function sendNotification(method, params) {
          if (window.parent !== window) window.parent.postMessage({ jsonrpc: "2.0", method: method, params: params }, "*");
        }
        function notifySizeChanged() {
          var root = document.documentElement;
          sendNotification("ui/notifications/size-changed", {
            width: Math.ceil(Math.max(root.scrollWidth, document.body.scrollWidth)),
            height: Math.ceil(Math.max(root.scrollHeight, document.body.scrollHeight))
          });
        }
        function sendFollowUp(message) {
          live.textContent = "학습 시작 요청을 전달하는 중이에요.";
          sendRequest("ui/message", { role: "user", content: { type: "text", text: message } })
            .then(function () { live.textContent = "학습 시작 요청을 대화에 전달했어요. 실제 풀이가 끝난 뒤에만 관찰 결과가 기록돼요."; })
            .catch(function () { live.textContent = "이 호스트에서는 카드에서 대화 요청을 보낼 수 없어요. 아래 문장을 대화에 입력해 주세요: " + message; });
        }
        whyButton.addEventListener("click", function () {
          detailsOpen = !detailsOpen;
          details.hidden = !detailsOpen;
          whyButton.setAttribute("aria-expanded", String(detailsOpen));
          whyButton.setAttribute("aria-pressed", String(detailsOpen));
          notifySizeChanged();
        });
        document.getElementById("independent").addEventListener("click", function () {
          sendFollowUp("힌트 없이 다음 학습 문제를 시작해 주세요. 문제의 구조를 먼저 스스로 찾아볼 수 있게 한 단계만 제안해 주세요.");
        });
        document.getElementById("hint").addEventListener("click", function () {
          sendFollowUp("현재 학습 개념에서 첫 단계 힌트만 제공해 주세요. 정답이나 완성된 풀이를 바로 보여주지 말아 주세요.");
        });
        window.addEventListener("message", function (event) {
          var message = event.data || {};
          if (message.method === "ui/notifications/tool-result") render(toolResultData(message.params));
          if (message.method === "ui/notifications/tool-cancelled") live.textContent = "도구 실행이 취소되었어요. 다시 시도해 주세요.";
          if (message.method === "ui/notifications/host-context-changed") {
            var variables = message.params && message.params.styles && message.params.styles.variables;
            if (variables) Object.keys(variables).forEach(function (name) { if (variables[name]) document.documentElement.style.setProperty(name, variables[name]); });
          }
        });
        if (window.ResizeObserver && window.parent !== window) {
          new ResizeObserver(notifySizeChanged).observe(document.documentElement);
        }
        render(window.__STUDYMETA_PREVIEW_CONTENT__ || null);
        if (window.parent !== window) {
          sendRequest("ui/initialize", { protocolVersion: protocolVersion, clientInfo: { name: "studymeta-learner-card", version: "0.1.0" }, appCapabilities: { availableDisplayModes: ["inline"] } })
            .then(function () {
              sendNotification("ui/notifications/initialized", {});
              // Some hosts ignore a ResizeObserver's first callback until the
              // view handshake completes. Send a post-handshake measurement so
              // the inline iframe is never left at zero height.
              notifySizeChanged();
            })
            .catch(function () { live.textContent = "이 호스트는 MCP Apps UI 연결을 아직 지원하지 않을 수 있어요."; });
        }
      })();
    </script>
  </body>
</html>`;
}

export function getLearnerCardPreviewContent(): Record<string, unknown> {
  return {
    student: { display_name: "Demo Student" },
    resolved_domain: "calculus",
    profile_type: "synthetic_demo",
    learner_profile_metadata: {
      profile_type: "synthetic_demo",
      label: "Synthetic Demo Learner · Illustrative State",
      is_real_user_data: false,
    },
    skill_state: {
      domain: "calculus",
      skill_id: "chain_rule",
      skill_name: "Chain Rule",
      conceptual_mastery: 0.85,
      procedural_mastery: 0.35,
      retrievability: 0.3,
      transferability: 0.2,
      help_need: 0.75,
      misconceptions: [],
      state_confidence: 0.8,
      updated_at: new Date(0).toISOString(),
    },
    recent_evidence: [],
    state_estimates: [],
    domain_state: { domain: "calculus", calibration: null },
    interaction_policy: { initial_scaffold: "multiple_choice" },
  };
}
