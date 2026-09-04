# StudyMeta MCP

외부 AI가 StudyMeta의 3계층 Learner Context를 읽고 학습 Event/Evidence를 다시 기록하며, 검증된 MVP State를 보수적으로 갱신할 수 있게 하는 End-to-End MCP 서버입니다.

```text
External AI
  → StudyMeta MCP
    → Application services
      → Supabase
```

MCP transport와 Learner Model 계산은 서비스 계층에서 분리되어 있습니다. 현재 기준선 updater는 `procedural_mastery`와 `help_need`만 갱신하며, 최소 3개 관찰·유효 표본 2 이상·출처별 신뢰도 기준을 통과하지 못한 Evidence는 Raw Event로 보존하되 State에는 반영하지 않습니다. 이 기준선은 제품 학습효과를 증명하는 모델이 아니라 파일럿에서 보정할 버전된 출발점입니다.

## 프로젝트 구조

```text
api/
  mcp.ts                         Vercel Streamable HTTP MCP endpoint
  learner-context.ts             Viewer 전용 read endpoint
docs/
  openai-plugin-submission.md    OpenAI Plugin 제출·검수 기준
  tutor-mcp-comparison.md        Tutor MCP 기능 비교와 StudyMeta 범위 결정
src/
  domain/                         Zod 입출력 계약과 오류
  mcp/                            MCP tool 및 HTTP handler
  repositories/                  Supabase repository
  services/                      Context/Event service와 confidence-gated State updater
  http.ts                        로컬 Streamable HTTP 서버
  stdio.ts                       로컬 stdio 서버
supabase/
  migrations/                    Raw Event, Derived Evidence, State Estimate schema
  seed.sql                       Demo Student seed
tests/
  mcp.integration.test.ts        실제 MCP client 호출 테스트
index.html                       기존 Learner Model 연구 데모
service-prototype.html           가입부터 화면 A/B/C까지의 전체 서비스 프로토타입
viewer.html                      Supabase Learner Context 검증 Viewer
deliverables/                    제출용 IR Deck 및 발표 가이드
design.md                        학생용 UI 설계 문서
AGENTS.md                        저장소 작업 및 Learner Model 보존 지침
md/                              공개 저장소에서 제외되는 로컬 연구 노트
```

## Student Model 데이터 계층

```text
Global Learner Profile → student_profiles
Domain State           → domain_states
Skill State            → learner_states
Learning Event         → learning_events
Student identity       → students
```

Preference는 측정된 Intervention Effectiveness와 동일하게 취급하지 않습니다. 전자는 `student_profiles`, 후자는 `domain_states.intervention_response`에 저장합니다.

## Supabase 설정

1. Supabase 프로젝트를 생성합니다.
2. `supabase/migrations/202608260001_init_studymeta_mcp.sql`을 SQL Editor에서 실행합니다.
3. `supabase/seed.sql`을 실행합니다.
4. `.env.example`을 `.env`로 복사하고 값을 입력합니다.

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
OAUTH_ALLOWED_EMAILS=you@example.com
PORT=3000
```

`SUPABASE_SERVICE_ROLE_KEY`는 브라우저 코드에 넣으면 안 됩니다. Viewer는 서버의 `/api/learner-context`를 통해서만 데이터를 읽습니다. 모든 테이블은 RLS가 활성화되어 있으며 MVP에는 공개 anon policy가 없습니다.

Demo Student ID:

```text
00000000-0000-4000-8000-000000000001
```

## 설치와 실행

```bash
npm install
npm run dev:http
```

원격 MCP endpoint:

```text
http://127.0.0.1:3000/mcp
```

Health check:

```text
http://127.0.0.1:3000/health
```

stdio transport가 필요한 로컬 host에서는 다음을 사용합니다.

```bash
npm run dev:stdio
```

## MCP 도구

### `get_my_learner_context`

OAuth로 로그인한 사용자의 `student_auth_links`를 통해 학생을 자동 식별합니다. `student_id`를 입력하지 않습니다. `domain`을 생략하면 가장 최근에 업데이트된 학습 과목을 선택합니다.

입력 예시:

```json
{}
```

과목이나 Skill이 명시된 경우에만 전달합니다.

```json
{
  "domain": "calculus",
  "skill_id": "chain_rule",
  "demo_mode": false,
  "learner_profile_type": "stored"
}
```

`demo_mode`의 기본값은 `false`입니다. `true`여도 교육 정책은 바뀌지 않고,
StudyMeta 배너·주요 State·선택된 Strategy·Step 라벨을 표시하라는 display 지침만
활성화됩니다. `learner_profile_type`은 별도 옵션이며 `synthetic`을 선택하면 반환 데이터가
`Demo Learner · Synthetic Profile · Illustrative State`로 명시됩니다.

현재 IR 배포는 `vercel.json`에서 `STUDYMETA_DEMO_MODE=true`와
`STUDYMETA_LEARNER_PROFILE_TYPE=synthetic_demo`를 명시적으로 설정합니다. 라이브 MCP에서
옵션을 생략하면 Demo/Synthetic이 적용되지만, 코드와 다른 환경의 기본값은 여전히
Production/Stored입니다. 요청에 `demo_mode: false`, `learner_profile_type: "stored"`를
전달하면 배포 환경에서도 Production 동작을 직접 확인할 수 있습니다.

Synthetic state는 환경변수만으로 모든 사용자에게 적용되지 않습니다. 다음 조건을 모두
만족할 때만 `profile_type: "synthetic_demo"`와 `demo_scenario: "chain_rule_ir"`가 반환됩니다.

- `demo_mode=true`
- `student_id`가 `DEMO_STUDENT_ID`와 일치
- `domain=calculus`
- `skill_id=chain_rule`
- 요청 또는 서버 설정의 profile type이 `synthetic_demo` (`synthetic`은 legacy alias)

`chain_rule_ir` 응답에는 `first_turn_contract.exact_response_template`이 포함됩니다. 연결된
AI는 첫 tutoring turn에서 이 template만 실행하고, `ㄱ/ㄴ/ㄷ` 입력 요청 뒤 즉시 멈춰야
합니다. 이 deterministic scenario는 일반 State → Policy engine과 별도 파일에 있으며
Production tutoring에는 적용되지 않습니다.

### `get_learner_context`

입력:

```json
{
  "student_id": "00000000-0000-4000-8000-000000000001",
  "domain": "calculus",
  "skill_id": "chain_rule",
  "demo_mode": true,
  "learner_profile_type": "synthetic"
}
```

출력에는 다음이 함께 포함됩니다.

- `learner_profile`
- `domain_state`
- `skill_state` 또는 domain의 `skill_states`
- `recent_evidence`
- 바로 실행 가능한 `teaching_context.executable_instructions`
- State에서 생성된 `interaction_policy` (success/failure scaffold 경로 포함)
- 표현만 제어하는 `display`
- stored/synthetic을 구분하는 `learner_profile_metadata`
- `state_signals` (`retrievability`/`transferability`는 experimental로 표시)
- 자동 State 갱신 여부를 명시하는 `evidence_writeback`
- 명시적 `profile_type`, `learner_state`, `pedagogical_policy`
- IR 전용 `demo_scenario`, `first_turn_contract`
- State별 값·신뢰도·근거량·상태·모델 버전인 `state_estimates`

`skill_id`를 생략하면 특정 Skill 하나 대신 해당 Domain의 Skill State 목록을 반환합니다.
Production 기본 응답에서는 MVP State의 검증 상태와 검증된 값만 노출합니다. `include_experimental_states=true`를 명시해야 Retrievability·Transferability 등 실험 필드가 포함됩니다. Synthetic IR Demo는 예외적으로 illustrative 표기와 함께 실험 필드를 보여줍니다. Event는 사용자 OAuth 권한으로 기록하지만, State 추정 결과는 서버 전용 키로만 저장됩니다.

### `record_my_learning_event`

OAuth로 연결된 학습자를 자동 식별해 `student_id` 없이 학습 Event를 기록하는 기본 write-back 도구입니다. `idempotency_key`를 함께 보내면 전송 재시도 중 같은 이벤트가 중복 저장되거나 State에 두 번 반영되는 것을 막습니다.

Evidence에는 다음 provenance를 함께 저장할 수 있습니다.

- `extractor`, `extractor_version`
- `extractor_confidence`
- `definition_version`
- `missing_reason`

`source`는 ChatGPT·Claude뿐 아니라 `external_ai`, `ai_tutor`, `learning_app`, `lms`, `camera`, `quiz`, `manual`을 지원하며 실제 공급자명은 `source_provider`에 기록합니다. 문제 식별자와 시작·종료 시각도 선택적으로 저장할 수 있습니다.

### `record_learning_event`

명시적인 `student_id`를 받는 legacy/scoped write입니다. 인증된 일반 학습 흐름에서는 `record_my_learning_event`를 우선 사용합니다.

입력:

```json
{
  "student_id": "00000000-0000-4000-8000-000000000001",
  "domain": "calculus",
  "skill_id": "chain_rule",
  "source": "claude",
  "event_type": "problem_attempt",
  "raw_event": {
    "description": "Student solved a Chain Rule problem without a hint."
  },
  "evidence": [
    {
      "type": "correct",
      "value": true,
      "extractor_confidence": 1.0
    },
    {
      "type": "independent_success",
      "value": true,
      "extractor_confidence": 0.95
    }
  ]
}
```

`event_type`을 생략하면 `observation`을 사용합니다. `occurred_at`도 선택적으로 전달할 수 있으며 생략 시 서버 시간이 적용됩니다.

Evidence의 `value`와 `extractor_confidence`는 서로 다른 의미입니다. 예를 들어
`independent_success`는 `value: false`처럼 관찰 결과를 저장하고, `extractor_confidence: 0.95`는
그 관찰을 추출한 신뢰도만 나타냅니다. `correct`, `hint_used`, `retry_count`가 함께 전달되면
서버는 독립 성공을 “정답 + 힌트 없음 + 재시도 0회”로 정합성 검사합니다.

출력:

```json
{
  "success": true,
  "event_id": "...",
  "recorded_at": "...",
  "duplicate": false,
  "state_update": {
    "status": "updated | insufficient_evidence | withheld | disabled",
    "updated_states": [],
    "excluded_evidence": [],
    "message": "..."
  }
}
```

## 안전한 State 업데이트 기준선

- Procedural Mastery: 독립 성공을 우선 사용하는 confidence-weighted BKT 기준선
- Help Need: 관찰된 힌트 사용을 사용하는 empirical-Bayes 기준선
- 최소 관찰 3개 및 effective sample size 2 이상에서만 `verified`
- 구조화 입력은 Evidence confidence 0.70 이상, Camera 입력은 0.90 이상만 자동 반영
- 낮은 신뢰도, `missing_reason`, 지원하지 않는 값 형식은 Raw Event/Derived Evidence에는 남지만 State에서는 `withheld`
- Retrievability, Transferability, Calibration, Misconception은 자동 갱신하지 않음
- State마다 confidence, evidence_count, effective_sample_size, model_version, supporting_event_ids, limitation을 별도 저장

Supabase에서는 `learning_events`를 불변 Raw Event로 유지하고, trigger가 `derived_evidence`에 버전된 Evidence를 분리합니다. `learner_state_estimates`가 State별 근거와 상태를 보관하며, `learner_states`는 호환성을 위한 최신 verified 값만 materialize합니다.

## 테스트

```bash
npm test
npm run build
```

통합 테스트는 공식 MCP client로 다음을 검증합니다.

1. 두 Tool이 등록되는지
2. Demo Student의 3계층 Context가 반환되는지
3. Event가 기록되는지
4. 재조회 시 최근 Evidence에 나타나는지
5. 관찰이 부족할 때 Skill State가 변경되지 않는지
6. 동일한 계약이 Streamable HTTP에서 호출되는지
7. Production/Demo가 같은 adaptive policy를 공유하고 display만 다른지
8. Synthetic profile 표시와 성공/실패 scaffold 경로가 정확한지
9. 충분한 신뢰 Evidence에서 두 MVP State만 갱신되는지
10. 낮은 신뢰 Camera Evidence가 보존되지만 State에서는 보류되는지
11. idempotency key 재시도가 중복 Event와 중복 State update를 만들지 않는지

실제 Supabase 저장 검증에는 유효한 `.env`가 필요합니다.

## Viewer

Vercel 배포 후 다음 경로에서 개발/검증용 Viewer를 열 수 있습니다.

```text
/viewer.html
```

Viewer는 Global Profile, Domain State, Skill State와 최근 Raw Event/Evidence를 표시합니다. 제품용 인증, 그래프, 채팅, Camera UI는 포함하지 않습니다.

## Vercel 배포

현재 저장소를 Vercel 프로젝트에 연결하고 다음 환경변수를 Project Settings에 추가합니다.

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

배포된 MCP URL은 다음 형태입니다.

```text
https://YOUR_SITE.vercel.app/api/mcp
```

ChatGPT/Codex OAuth connection also requires Supabase Authentication > OAuth Server
to be enabled with dynamic client registration. Set the Supabase Site URL to the
production site and the authorization path to `/oauth/consent`, then run
`supabase/migrations/202608270002_oauth_student_access.sql`.

The MCP endpoint returns an RFC 9728 protected-resource challenge when no bearer
token is provided. Supabase Auth performs OAuth 2.1 authorization-code + PKCE,
and authenticated MCP database calls use the user's token so RLS limits access
to the linked learner. `OAUTH_ALLOWED_EMAILS` controls which accounts may claim
the seeded Demo Student during this MVP flow.

OAuth 연결과 RLS는 구현되어 있습니다. 운영 배포 전에는 새 Evidence/State migration 적용, reviewer 계정 연결, 환경변수와 권한을 다시 검증해야 합니다.

## 모델 확장 연결점

- `src/services/learner-state-updater.ts`는 보수적인 MVP 기준선과 비활성화용 `NoOpLearnerStateUpdater`를 함께 제공합니다.
- 파일럿에서 보정한 모델은 `LearnerStateUpdater.process(event)` 계약을 유지한 채 교체할 수 있습니다.
- MCP tool, Supabase repository, Viewer 안에는 Evidence → State 계산 규칙을 넣지 않습니다.
- State → Pedagogical Policy는 `src/services/teaching-context.ts`의 `buildTeachingPlan`에서 생성합니다.
- Production/Demo는 이 함수를 공유하며, `display`와 실행 지침의 노출 방식만 달라집니다.
- Synthetic fixture는 `src/services/synthetic-learner.ts`에 분리되어 있고 tutoring 문구를 포함하지 않습니다.
- Deterministic IR scenario와 첫 턴 계약은 `src/services/demo-scenarios.ts`에 분리되어 있습니다.
