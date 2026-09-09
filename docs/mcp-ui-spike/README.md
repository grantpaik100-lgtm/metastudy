# StudyMeta MCP UI 독립 렌더링 스파이크

기준: `da4a3b5dd359c8c2a836e1625b535c90a279a984` · 브랜치: `codex/studymeta-mcp-ui-spike`

## 범위

`/mcp-demo`(로컬) 및 `/api/mcp-demo`(배포 환경)에는 읽기 전용
`show_studymeta_learner_card`와 `ui://studymeta/learner-card-demo-v3`만 등록된다.
OAuth, Supabase, 실제 학생 데이터, Learning Event 기록, Evidence → State 계산은 사용하지
않는다. 결과는 항상 명시적인 `synthetic_demo` 가상 데이터다.

## 실행

```powershell
npm ci
npm run build
npm run dev:http
```

독립 미리보기: `public/learner-card-preview.html`

로컬 MCP endpoint: `http://127.0.0.1:3000/mcp-demo`

## MCP Inspector CLI 검증 명령

```powershell
npx -y @modelcontextprotocol/inspector --cli --server-url http://127.0.0.1:3000/mcp-demo --transport http --method tools/list --app-info --format json
npx -y @modelcontextprotocol/inspector --cli --server-url http://127.0.0.1:3000/mcp-demo --transport http --method resources/read --uri ui://studymeta/learner-card-demo-v3 --format json
npx -y @modelcontextprotocol/inspector --cli --server-url http://127.0.0.1:3000/mcp-demo --transport http --method tools/call --tool-name show_studymeta_learner_card --tool-args-json '{}' --format json
```

확인 결과:

- tool metadata: `ui://studymeta/learner-card-demo-v3`, `text/html;profile=mcp-app`, inline app
- resource: HTML 반환 성공
- call: `synthetic_demo`, 미적분학/연쇄법칙, `under_review`, 힌트 요청·힌트 후 성공 Evidence 반환 성공

## 캡처

- `learner-card-desktop.png`
- `learner-card-mobile-verified.png`

## ChatGPT 연결 상태

Secure MCP Tunnel을 통해 ChatGPT 개발자 모드 커넥터에 연결해 실제 호출을 수행했다.
ChatGPT는 도구, UI resource, sandbox iframe을 발견하고, `structuredContent`를
`ui/notifications/tool-result`로 카드에 전달해 인챗 렌더링했다.

- 성공: transport, 인증 없는 데모 연결, tools/list, resources/read, tools/call, iframe 렌더링,
  `structuredContent` 반영, 판단 근거 토글
- `ui/message`: 현재 검증 호스트에서 지원하지 않아 feature-detected fallback으로 복사 가능한
  후속 학습 문구를 표시함
- 호환성: UI는 request/response `ui/initialize`에 의존하지 않고, message listener를 먼저
  등록한 뒤 `ui/notifications/initialized`와 `ui/notifications/tool-result`를 사용함
- UI HTML을 바꾸면 MCP Apps host cache를 피하기 위해 resource URI도 새 버전으로 바꿔야 함

공개 배포는 하지 않았다. 로컬에서 같은 연결을 다시 만들 때는 다음 순서로 실행한다.

```powershell
npm run dev:http
# Secure MCP Tunnel UI에서 만든 tunnel id와 runtime API key를 현재 셸에만 제공
tunnel-client init --profile studymeta-mcp-ui-spike --tunnel-id <tunnel_id> --mcp-server-url http://127.0.0.1:3000/mcp-demo
tunnel-client doctor --profile studymeta-mcp-ui-spike
tunnel-client run --profile studymeta-mcp-ui-spike
```

보고서용 독립 렌더링 이미지 경로:

- `docs/mcp-ui-spike/learner-card-desktop.png`
- `docs/mcp-ui-spike/learner-card-mobile-verified.png`
