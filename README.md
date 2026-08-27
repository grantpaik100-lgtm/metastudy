# StudyMeta MCP Skeleton

외부 AI가 StudyMeta의 3계층 Learner Context를 읽고 학습 Event/Evidence를 다시 기록할 수 있게 하는 최소 End-to-End MCP 서버입니다.

```text
External AI
  → StudyMeta MCP
    → Application services
      → Supabase
```

MCP는 Student Model 계산 엔진이 아닙니다. 현재 구현은 저장된 State를 읽고 Event를 기록할 뿐, State를 자동으로 변경하지 않습니다.

## 프로젝트 구조

```text
api/
  mcp.ts                         Vercel Streamable HTTP MCP endpoint
  learner-context.ts             Viewer 전용 read endpoint
src/
  domain/                         Zod 입출력 계약과 오류
  mcp/                            MCP tool 및 HTTP handler
  repositories/                  Supabase repository
  services/                      Context/Event service와 no-op updater hook
  http.ts                        로컬 Streamable HTTP 서버
  stdio.ts                       로컬 stdio 서버
supabase/
  migrations/                    5개 테이블 schema
  seed.sql                       Demo Student seed
tests/
  mcp.integration.test.ts        실제 MCP client 호출 테스트
index.html                       기존 Learner Model 연구 데모
viewer.html                      Supabase Learner Context 검증 Viewer
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

### `get_learner_context`

입력:

```json
{
  "student_id": "00000000-0000-4000-8000-000000000001",
  "domain": "calculus",
  "skill_id": "chain_rule"
}
```

출력에는 다음이 함께 포함됩니다.

- `learner_profile`
- `domain_state`
- `skill_state` 또는 domain의 `skill_states`
- `recent_evidence`
- rule-based placeholder인 `teaching_context`

`skill_id`를 생략하면 특정 Skill 하나 대신 해당 Domain의 Skill State 목록을 반환합니다.

### `record_learning_event`

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

출력:

```json
{
  "success": true,
  "event_id": "...",
  "recorded_at": "..."
}
```

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
5. Event 기록 후에도 no-op updater가 Skill State를 변경하지 않는지
6. 동일한 계약이 Streamable HTTP에서 호출되는지

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

현재 skeleton에는 사용자 인증/OAuth가 없습니다. 공개 배포 전에 MCP endpoint 인증과 학생별 접근 제어를 추가해야 합니다.

## Placeholder와 다음 연결점

- `src/services/learner-state-updater.ts`의 `NoOpLearnerStateUpdater`는 의도적인 placeholder입니다.
- Student Model 팀은 `LearnerStateUpdater.process(event)` 구현체를 제공하고 service container에 주입하면 됩니다.
- MCP tool, Supabase repository, Viewer 안에는 Evidence → State 계산 규칙을 넣지 않습니다.
- `teaching_context`의 규칙도 `src/services/teaching-context.ts`로 분리되어 있어 향후 Policy Engine으로 교체할 수 있습니다.
