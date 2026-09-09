# StudyMeta MCP Learner Context UI — 실서비스 통합 핸드오프

## 결정

이번 spike에서 검증한 Learner Context 카드는 **실서비스의 실제 학습 데이터를 보여주는 UI로 재사용 가능**하다. 데모 서버를 실서비스로 승격하지 말고, 카드 HTML을 재사용한 채 인증된 learner-context 결과만 실서비스의 `structuredContent`로 제공한다.

이 문서는 실서비스 구현 담당자를 위한 통합 계약과 검증 결과다. 데모의 가상 데이터, OAuth 우회, 정적 서버를 프로덕션으로 복사하지 않는다.

## 이미 검증된 사실

- ChatGPT 대화에서 `show_studymeta_learner_card` 호출 후 iframe 카드 렌더링 성공
- `structuredContent`가 `ui/notifications/tool-result`으로 전달되어 카드에 반영됨
- 카드의 판단 근거 펼치기/접기 성공
- `ui/message`를 지원하지 않는 호스트에서는 복사 가능한 후속 학습 문구로 fallback됨
- 카드 호출 자체는 읽기 전용이며 Learning Event를 기록하거나 State를 변경하지 않음
- MCP Apps UI resource URI는 호스트 캐시 키다. UI HTML을 바꾸면 URI도 버전업해야 한다.

실제 성공한 UI resource URI는 `ui://studymeta/learner-card-demo-v3`였다. 이는 **데모 전용 URI**이며 실서비스 URI로 사용하지 않는다.

## 이번에 발견한 호환성 규칙

1. `_meta.ui.resourceUri`로 tool과 UI resource를 연결한다.
2. resource MIME type은 `text/html;profile=mcp-app`을 사용한다.
3. UI는 `window.postMessage`의 `ui/notifications/tool-result`를 수신해 `structuredContent`를 렌더링한다.
4. 현재 검증한 ChatGPT 호스트에서는 UI가 `ui/initialize`를 request/response 방식으로 호출하면 `Method not found`가 반환됐다. 이 호출에 의존하지 말고, message listener를 먼저 등록한 뒤 `ui/notifications/initialized` notification과 `ui/notifications/tool-result`를 사용한다.
5. `ui/message`는 feature detection/실패 fallback이 필수다. 제품 이름으로 분기하지 않는다.
6. UI HTML 변경 시 `ui://studymeta/learner-card-vN`처럼 새 URI를 발급하고, 커넥터를 새로 고침 또는 재연결해 최신 resource metadata를 다시 발견시킨다.

## 재사용할 코드

| 대상 | 역할 | 실서비스에서의 처리 |
|---|---|---|
| `src/mcp/learner-card-ui.ts` | 카드 HTML, CSS, bridge listener, 토글, `ui/message` fallback | 재사용 |
| `src/mcp/server.ts` | 기존 인증된 MCP tool/server | 실제 learner context를 카드 입력 계약으로 변환하는 tool을 추가하거나 기존 render tool에 연결 |
| `src/mcp/http-handler.ts` | 기존 `/api/mcp` transport | 기존 OAuth/권한 검증을 그대로 유지 |
| `src/mcp/demo-server.ts` | 정적 `synthetic_demo` 전용 서버 | 재사용하지 않음 |
| `src/mcp/demo-http-handler.ts` | 인증 없는 `/mcp-demo` transport | 재사용하지 않음 |

## 실서비스 데이터 계약

카드는 아래 최소 형태의 `structuredContent`를 읽는다. 이 객체는 서버가 인증된 실제 learner-context에서 **표시용으로 변환**해 반환한다.

```ts
{
  profile_type: "authenticated_learner",
  learner_card: {
    data_label: "현재 학습 상태", // synthetic_demo 금지
    course: "미적분학",
    current_concept: "연쇄법칙",
    states: [
      { label: "개념 이해", value: "확인 필요", description: "최근 관찰이 충분하지 않아요.", tone: "" },
      { label: "절차 숙련", value: "다듬는 중", description: "…", tone: "help" },
      { label: "도움 필요도", value: "조금 높음", description: "…", tone: "help" },
      { label: "State 변화", value: "변화 없음", description: "새 Evidence가 없어요.", tone: "" }
    ],
    scientific_validation_status: "not_assessed" | "under_review" | "supported_in_scope",
    recent_evidence: [
      { source: "chatgpt", evidence: [{ type: "hint_requested" }] }
    ],
    recommendation: "다음엔 힌트 없이 한 단계만 먼저 시도해볼까요?"
  }
}
```

`states`와 `recent_evidence`는 기존 Learner Model 결과에서 만든 **표시용 projection**이다. 카드가 State를 직접 계산하거나 수정하지 않는다.

## 반드시 유지할 안전 경계

- `/api/mcp`의 기존 OAuth, Supabase 사용자 연결, 권한 검사를 우회하지 않는다.
- 요청의 access token으로 식별된 사용자 이외의 learner data를 반환하지 않는다.
- 카드 tool은 `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`로 선언한다.
- 버튼의 `ui/message`는 학습 시작 제안만 전송한다. Learning Event 기록은 실제 풀이 후 기존 Evidence → State 파이프라인에서만 수행한다.
- `intervention_response`와 내부 snake_case State id는 학생 화면에 노출하지 않는다.
- `not_assessed`, `under_review`, `supported_in_scope`는 서로 다른 문구/색으로 표시하되, 데모/실서비스 모두 과학적 검증을 과장하지 않는다.

## 권장 구현 순서

1. 기존 `/api/mcp`의 인증된 learner-context tool과 반환 타입을 확인한다.
2. 그 결과를 위 `learner_card` projection으로 바꾸는 순수 mapper를 만든다.
3. 카드 전용 UI resource URI를 `ui://studymeta/learner-card-v1`처럼 별도로 등록한다.
4. read-only render tool을 추가하거나, 기존 렌더링 목적 tool에 `_meta.ui.resourceUri`를 연결한다.
5. tool result의 `structuredContent`와 사람이 읽을 수 있는 `content`를 함께 반환한다. UI가 렌더링되지 않는 호스트에서도 tool이 유용해야 한다.
6. OAuth를 거친 사용자 A/B로 각각 호출해 데이터 격리가 되는지 검증한다.
7. Secure MCP Tunnel 또는 공개 HTTPS 환경에서 새 resource URI를 연결하고 ChatGPT 인챗 렌더링을 재검증한다. 공개 배포는 별도 승인 전까지 하지 않는다.

## 완료 검증 체크리스트

- [ ] `tools/list`에서 실제 render tool의 `_meta.ui.resourceUri`가 확인된다.
- [ ] `resources/read`가 `text/html;profile=mcp-app` HTML을 반환한다.
- [ ] 인증 없는 `/api/mcp` 요청은 learner data를 반환하지 않는다.
- [ ] 인증된 사용자별로 자신의 learner context만 카드에 표시된다.
- [ ] ChatGPT iframe에서 tool result가 즉시 카드에 반영된다.
- [ ] UI HTML 변경 때 resource URI가 새 버전으로 바뀐다.
- [ ] 모바일 폭에서 가로 스크롤이 없다.
- [ ] 버튼은 State를 직접 수정하거나 Learning Event를 기록하지 않는다.

## 참고

- 검증된 카드 코드: `src/mcp/learner-card-ui.ts`
- 데모 계약 참고: `src/mcp/demo-server.ts`
- 공식 UI 지침: <https://developers.openai.com/plugins/build/chatgpt-ui>
