# MCP 연동 붙이는 법 (팀원용)

`service-prototype.html`은 원래 localStorage만 쓰는 정적 목업이었다. 이제
실제 MCP 서버(StudyMeta 백엔드)에서 학습자 컨텍스트를 읽어와 화면에 반영하는
코드가 추가됐다 — 지금 이 저장소만으로는 **연결 정보가 없어 동작하지 않는다**.
이 문서는 MCP 서버를 담당하는 팀원이 무엇을 채워야 연결이 되는지 정리한 것이다.

## 왜 프론트엔드가 MCP를 직접 부르지 못하나

MCP 툴(`get_learner_context` 등)은 **MCP 클라이언트만** 호출할 수 있다. Claude
같은 MCP 클라이언트 안에서는 되지만, 브라우저에서 실행되는 평범한 JS는 MCP
클라이언트가 아니라서 직접 호출할 방법이 없다. 그래서 다음과 같은 구조로
나눴다.

```
브라우저(service-prototype.html)
   │  fetch("/api/learner-context?...")
   ▼
api/learner-context.js   (Vercel 서버리스 함수 = 우리 쪽 백엔드)
   │  callMcpTool("get_learner_context", ...)
   ▼
lib/mcp-client.js        (MCP 클라이언트, 여기서만 MCP 서버에 접속한다)
   │  MCP_SERVER_URL + MCP_API_KEY
   ▼
StudyMeta MCP 서버 (팀원이 관리하는 실제 백엔드)
```

`lib/learner-mapping.js`는 MCP가 돌려주는 0~1 연속값(예: `conceptual_mastery:
0.85`)을 화면이 쓰는 정성적 값(`"up"`/`"down"`/`"neutral"`)으로 바꾼다.
**원점수는 서버 밖으로 나가지 않는다** — design.md가 학생 화면에 점수를
그대로 보여주지 않기로 정했기 때문이다(12번 결정).

## 팀원이 확인해서 채워야 할 것

`.env.example`을 복사해 `.env`로 만들고(커밋 금지, `.gitignore`에 이미 등록됨)
아래 항목을 채운다. 로컬 개발에는 `.env`, 실제 배포에는 Vercel 프로젝트의
**Settings → Environment Variables**에 같은 값을 넣는다.

| 변수 | 무엇을 채우나 | 확인 방법 |
|---|---|---|
| `MCP_SERVER_URL` | StudyMeta MCP 서버의 엔드포인트 URL | MCP 서버를 배포한 팀원에게 직접 문의 |
| `MCP_API_KEY` | 서버-서버 인증 토큰 | 아래 "인증 방식 확인" 참고 |
| `MCP_TRANSPORT` | `streamable-http`(기본값) 또는 `sse` | MCP 서버가 어떤 전송 방식을 노출하는지 확인 |

### 인증 방식 확인 (가장 중요)

지금 `lib/mcp-client.js`는 **정적 Bearer 토큰**(`Authorization: Bearer
<MCP_API_KEY>`)을 가정하고 짰다. 이건 흔한 서버-서버 인증 패턴이라 기본값으로
넣었을 뿐, 실제 StudyMeta MCP 서버가 이 방식을 지원하는지는 이 코드를 작성한
쪽에서 확인할 수 없었다. 팀원에게 다음을 물어봐야 한다.

- MCP 서버가 **정적 서비스 토큰**을 발급해주는가? → 그 토큰을 `MCP_API_KEY`에
  넣으면 지금 코드가 그대로 동작한다.
- 아니면 **사람 사용자의 OAuth 인가**만 지원하는가? → 이 경우 지금 방식(고정
  토큰 하나로 서버가 대신 호출)은 안 맞는다. Claude 세션이 쓰는 것과 같은
  OAuth 흐름을 백엔드가 대신 수행하려면 client-credentials 방식이나 별도
  서비스 계정이 필요하다 — `lib/mcp-client.js`의 `buildTransport()`를
  다시 설계해야 한다.

### 그 외 확인할 것

- **student_id 매핑**: 지금은 로그인이 없어서 고정 데모 계정
  (`00000000-0000-4000-8000-000000000001`, `MCP_DEMO_STUDENT_ID` 상수,
  `service-prototype.html`에 있음)으로만 연동을 시연한다. 실제 로그인이
  붙으면 이 상수 대신 로그인한 학생의 진짜 `student_id`를 써야 한다.
- **domain / skill_id 값의 형식**: 지금 확인된 값은 `domain: "calculus"`,
  `skill_id: "chain-rule"`(둘 다 소문자 kebab-case)이다. 다른 과목·스킬도
  같은 규칙인지, 아니면 자료 분석 단계에서 이 id를 어떻게 만들어야 하는지는
  아직 정해지지 않았다 — 자료 업로드 → 스킬 추출 로직과 함께 다시 설계해야
  한다(design.md 14번 참고).

## 로컬에서 테스트하기

Vercel CLI 로그인 없이 테스트할 수 있는 간단한 개발 서버가 있다.

```bash
npm install
cp .env.example .env   # 값 채우기
npm run dev             # http://localhost:3000
```

`.env`를 채우지 않고 실행해도 서버는 뜬다 — 이때 `/api/learner-context`는
502를 반환하고, 화면은 미리 넣어둔 예시 값을 그대로 보여준다(콘솔에 안내
로그만 남고 화면은 깨지지 않는다). 값을 채운 뒤 새로고침하면 실제 데이터로
바뀌는지 확인할 수 있다.

Vercel의 실제 서버리스 런타임과 더 가깝게 테스트하려면 `npm run vercel-dev`
(Vercel CLI 로그인 필요)를 쓴다.

## 배포

이 저장소는 이미 Vercel에 연결되어 있다(README 참고). `package.json`과
`api/` 폴더가 생겼으니 Vercel이 자동으로 Node.js 서버리스 함수로 인식한다.
**Vercel 프로젝트 설정에 위 환경변수 3개를 추가한 뒤 배포**하면 된다 —
코드 쪽에서 추가로 할 일은 없다.

## 지금 이 연동이 실제로 하는 일 / 하지 않는 일

- **하는 일**: 온보딩에서 "예시 과목으로 먼저 둘러보기"를 누르면, 그 예시의
  미적분학 › Chain Rule 스킬 하나가 백그라운드로 `/api/learner-context`를
  불러 실제 MCP 학습자 컨텍스트로 자기 자신을 덮어쓴다. 화면 A의 스킬 카드,
  화면 B의 "최근 학습 기록"이 그 실제 값을 보여준다.
- **하지 않는 일**: 학생이 직접 등록한 과목/스킬은 아직 MCP에 연결돼 있지
  않다(그 스킬들에는 `mcpDomain`/`mcpSkillId`가 없다 — 자료 분석이 실제
  개념 id를 MCP 쪽 `domain`/`skill_id`와 어떻게 맞출지 아직 정해지지
  않았기 때문). 그리고 **쓰기(`record_learning_event`)는 이 백엔드에서
  다루지 않는다** — design.md 16번 결정대로, 학습 기록은 연결된 프론티어
  모델 앱(Claude, ChatGPT 등)이 자신의 MCP 연결로 직접 남긴다. 이 홈은
  읽기 전용이다.
