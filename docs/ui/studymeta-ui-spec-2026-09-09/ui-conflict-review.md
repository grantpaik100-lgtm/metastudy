# StudyMeta v2 UI 인수·충돌 검토

- 검토일: 2026-09-09
- 기준 커밋: `bce4fc265197518036f9ae9417d840578c2f6130`
- 기준 브랜치: `codex/studymeta-v2-ui-spec`
- 범위: 문서 인수와 계약 차이 분석만 수행. UI·API·migration 구현 없음.

## 1. 판정

UI 패키지는 StudyMeta를 외부 AI용 Learner Model 관제탑으로 정의하며, 학생 웹·관리자 웹·MCP UI의 방향을 일관되게 설명한다. 다만 현재 저장소의 legacy `design.md`/`AGENTS.md`와 v2 백엔드 계약 사이에 충돌하거나 아직 구현되지 않은 요구가 있다.

따라서 이 패키지는 **시각·기능 기준안으로 인수 가능**하지만, 곧바로 전체를 실제 API에 연결할 수 있는 상태는 아니다. 아래 우선 결정과 표시용 DTO/mock contract는 2026-09-09에 승인·고정되었다.

## 2. 그대로 채택 가능한 결정

- 주 사용자는 전공 공부 중인 대학생이다.
- 실제 문제풀이는 ChatGPT·Claude 등 외부 AI에서 진행하며 학생 웹에 별도 문제풀이 화면을 만들지 않는다.
- 데이터 흐름은 `Learning Event → Evidence → State`이고 UI는 State를 직접 계산하거나 수정하지 않는다.
- 학생 기본 State는 개념 이해·절차 숙련·도움 필요도 3개, 상황에 따라 기억 인출·오개념 가능성을 더해 최대 5개다.
- `intervention_response`는 학생에게 노출하지 않는다.
- 종합점수, 과목 간 합산, 학생 순위를 만들지 않는다.
- `unknown`, `candidate`, `estimated`, 변경 없음, 판단 보류를 구분한다.
- 학생에게 scientific validation을 기본 노출하지 않고, 관리자에게 A/B/C 검증 층과 operation mode를 분리해 보여준다.
- MCP UI는 작은 상황별 카드와 text fallback을 제공하며, demo 인증 우회와 synthetic data를 실서비스에 가져오지 않는다.
- Academic Navy 시각 토큰, 접근성, 모바일 카드 전환, reduced motion 원칙은 현재 기술 구조와 양립한다.
- 매 메시지마다 전체 MCP Context를 요청하지 않고 version/delta/cache/token budget을 적용한다는 성능 방향은 타당하다.

## 3. 문서 우선순위 충돌

### 3.1 legacy `design.md`와 v2 제품 정의

`design.md` v0.5는 A/B/C 화면, 자체 문제풀이, 즉시 피드백, 학습 플래너를 전제로 한다. 새 v2 명세는 외부 AI가 학습 공간이고 학생 웹은 상태·기록·연결을 관리하는 관제탑이라고 정의한다.

두 문서를 동시에 구현 기준으로 사용할 수 없다. 권장 우선순위는 다음과 같다.

1. `index.html`의 Evidence 24·State 9·Scenario 9는 기준 데이터로 계속 보존한다.
2. legacy `service-prototype.html`과 `design.md` v0.5는 과거 prototype 기록으로 보존한다.
3. 새 v2 학생·관리자·MCP UI에는 이번 UI 패키지를 적용한다.
4. 사용자 승인 후 `AGENTS.md`와 `design.md`에 이 세대 구분을 명시해야 한다.

현재 `AGENTS.md`는 `design.md`의 결정을 뒤집지 말라고 하므로, 이 우선순위를 문서에 반영하기 전에는 구현 에이전트가 상충된 지시를 받게 된다.

### 3.2 Session Summary 구조도

legacy 결정은 Evidence-State 연결선 다이어그램을 금지하지만 새 명세는 세션별 `Event → Evidence → State` 구조도를 요구한다. 이는 다음처럼 범위를 나누면 양립할 수 있다.

- 금지: 전체 Evidence Dictionary와 모든 State를 연결한 복잡한 전역 다이어그램
- 허용: 한 세션에서 실제로 발생한 Event·Evidence·State 결과만 보여주는 짧은 감사 흐름

이 예외는 구현 전에 명시적으로 승인·문서화해야 한다.

### 3.3 단일 HTML 규칙과 v2 TypeScript 구조

`AGENTS.md`는 새 prototype을 단일 HTML·Vanilla JS·npm 의존성 없음으로 제한한다. 현재 v2는 TypeScript, npm, Supabase, MCP SDK 기반이다. 권장 분리는 다음과 같다.

- legacy `index.html`과 `service-prototype.html`: 기존 단일 HTML 원칙 유지
- v2 web/MCP UI: 현재 TypeScript build와 정적 asset 구조 사용
- 외부 CDN과 불필요한 신규 runtime 의존성은 계속 금지

이 분리도 `AGENTS.md` 개정 전에는 확정된 저장소 규칙이 아니다.

## 4. State 표시 계약 차이

### 4.1 표시용 DTO가 현재 RPC보다 넓다

새 UI 명세는 `display_level`, `scale_definition_id/version`, `evaluated_at`, 변화 방향과 학생용 설명을 요구한다. 현재 Stage 2B의 State RPC는 status/value/estimate confidence/evidence count/observation count/as-of 중심의 최소 projection만 반환한다.

UI가 숫자를 보고 `낮음/중간/높음`을 계산하면 안 되므로, 실제 연결 전에 backend 표시 projection이 다음을 제공해야 한다.

- backend가 결정한 `display_level`
- exact scale definition ID/version
- 학생용 label/description 또는 버전된 표시 사전 키
- `changed | unchanged | withheld | pending` 결과
- State 의미를 반영한 방향. 특히 `help_need`는 감소가 긍정적일 수 있으므로 숫자 증감만으로 색을 정하지 않는다.

UI-0 mock contract에는 이 필드를 포함할 수 있지만 `mock`임을 명시해야 한다.

### 4.2 `state_confidence` 표현

v2 foundation은 `state_confidence`를 독립 State 행이 아닌 호환용 metadata ID로 남기고 실제 신뢰도는 각 estimate의 `estimate_confidence`로 저장한다. UI의 ‘추정 신뢰도’는 별도 State 조회가 아니라 현재 estimate metadata에서 만들어야 한다.

### 4.3 State 계산 미구현

scale label·estimator 계수·임계값과 Stage 4 계산은 아직 없다. 따라서 실제 값처럼 보이는 mock 숫자나 단계는 금지하고 `unknown/candidate/demo`를 명확히 표시해야 한다.

## 5. 검증 상태와 운영 모드 충돌

ADR-002는 `not_assessed → research_only`를 기본 허용처럼 설명하고 마지막에 24개 Evidence가 `not_assessed/research_only`로 시작한다고 적는다. 그러나 v2 foundation의 확정 계약은 다음과 같다.

- 24개 Evidence의 validation은 모두 `not_assessed`
- operation assignment는 모두 `null`
- `research_only`조차 자동 배정하지 않음
- validation status에서 operation mode를 자동 도출하지 않음

따라서 UI 문서의 표는 **자동 매핑이 아닌 승인 정책 제안**으로 해석해야 한다. 초기 표시는 `not_assessed + 운영 할당 없음`이어야 하며, 승인된 operation assignment가 생긴 뒤에만 `research_only/pilot/production/disabled`를 표시해야 한다.

## 6. 권한·정정 기능 차이

### 6.1 `evidence_reviewer` capability

현재 DB 역할은 `student`, `admin`, `validation_reviewer`, `release_manager`다. UI 명세의 `evidence_reviewer` capability는 존재하지 않는다. `validation_reviewer`는 과학적 검증 검토와 의미가 겹칠 수 있으므로 자동으로 같은 권한으로 취급하면 안 된다.

권장안은 후속 RBAC migration에서 개별 Evidence 검토용 `evidence_reviewer` capability를 별도로 정의하는 것이다. 그 전에는 관리자 UI의 Evidence 승인·무효화 버튼을 실제 동작으로 제공하지 않는다.

### 6.2 1인·2인 승인 규칙

개별 정정 1인 승인, 규칙·검증·운영 변경 2인 승인은 현재 DB workflow로 구현되지 않았다. UI에는 정책 설명 또는 disabled/mock 상태로만 표시하고 실제 승인 완료처럼 보이게 하면 안 된다.

### 6.3 정정과 재계산 API

foundation에는 correction/review/calculation 테이블이 있지만 Stage 2B 공개 RPC에는 정정 요청 생성, Evidence review, 재계산 요청 API가 없다. 실제 버튼 연결 전에 최소 권한 RPC와 append-only 감사 테스트가 필요하다.

## 7. 개인정보·원문 정책 차이

ADR-002는 원문 30일 보존과 세션당 인용 2개·각 160자를 MVP 기본값으로 정한다. 현재 foundation은 `retention_policy_id`와 `expires_at` 좌표만 제공하고 실제 보존·파기 서비스는 없다. Stage 3도 원문을 저장하지 않고 opaque reference/hash만 쓰는 방향이다.

따라서 30일은 목표 정책 또는 설정 기본값으로는 인수할 수 있지만, 다음이 구현·검토되기 전에는 작동 중이라고 표시할 수 없다.

- 원문 저장 전 민감정보 제거
- 보존 정책 registry와 만료 작업
- 삭제·비식별화와 감사 이벤트
- 법률·개인정보 처리방침 검토
- 만료된 인용의 summary 대체 처리

현재 UI mock에서는 실제 학생 원문 대신 명백한 synthetic excerpt만 사용할 수 있다.

## 8. 현재 Stage 2B API로 가능한 화면

| UI 요구 | 현재 지원 | 비고 |
|---|---|---|
| 본인 identity | 가능 | `get_my_identity` |
| 본인 learner summary | 가능 | `get_my_learner_summary` |
| 본인 current State | 부분 가능 | 표시 단계·scale projection 보완 필요 |
| 본인 State 변경/미변경 log | 부분 가능 | `get_my_recent_state_log`; 학생용 문구 mapper 필요 |
| 관리자 학생 목록 | 가능 | `admin_list_students` |
| 관리자 current State | 부분 가능 | 표시 DTO 보완 필요 |
| 관리자 변경/미변경 log | 가능 | 기존 최소 projection 범위 |
| Evidence 상세·원문 | 불가 | 의도적으로 공개하지 않음 |
| validation A/B/C matrix | 불가 | 관리자 전용 최소 RPC 필요 |
| 정정 생성·검토 | 불가 | 후속 write/review RPC 필요 |
| Session Summary | 불가 | 테이블만 있고 생성·조회 서비스/RPC 없음 |
| 연결 관리 | 불가 | connections는 private |
| 과목·활성 과목 관리 | 불가 | course offering/catalog 계약 미완성 |
| 말투 preset 저장 | 불가 | preference 계약·저장 없음 |
| 시스템 처리 상태 | 불가 | 관리자 최소 projection 필요 |

## 9. MCP UI spike와의 호환성

재사용 가능:

- learner card HTML/CSS와 tool-result bridge
- `structuredContent` rendering
- `ui/message` feature detection 및 복사 fallback
- resource URI versioning
- host light/dark 대응

재사용 금지:

- demo server와 인증 없는 `/mcp-demo`
- `synthetic_demo`를 실사용 데이터처럼 반환하는 경로
- 인증 우회와 고정된 demo learner

추가 차이:

- spike 카드에는 `scientific_validation_status`가 보였지만 새 학생 정책은 기본 비노출이다. production mapper는 기본 카드에서 이를 제거하고 사용자가 근거를 요청할 때만 제한된 설명을 제공해야 한다.
- spike는 읽기 전용 learner card 한 장을 검증했다. 세션 이어가기, 도움 방식, 개념 전환, 정정, Session Summary는 별도 tool/resource와 backend 계약이 필요하다.

## 10. 성능 정책 구현 차이

ADR-003의 context version/delta/cache/token budget/latency telemetry는 아직 구현되지 않았다. 현재 API를 호출할 때 UI가 임의 version을 만들거나 cache hit처럼 표시하면 안 된다.

Stage 3의 Event 저장과 비동기 Evidence outbox는 성능 방향과 호환되지만, 별도 Stage 3 브랜치에 있고 이 UI 문서 브랜치에는 포함되지 않았다. 이후 통합 시 정확한 체크포인트 커밋을 병합해야 한다.

## 11. 승인된 우선 결정과 UI-0 반영

1. 새 v2 UI에는 이 패키지가 legacy `design.md`보다 우선한다. legacy artifact는 보존한다.
2. 세션별 실제 audit 흐름 `Event → Evidence → State`는 허용하고 전역 Dictionary 그래프는 계속 금지한다.
3. v2 UI에는 TypeScript build를 허용하고 단일 HTML 규칙은 legacy prototype에만 유지한다.
4. `not_assessed`의 초기 operation assignment는 `null`이다. `research_only`는 명시 승인 뒤에만 설정한다.
5. `evidence_reviewer`는 기존 역할에 자동 매핑하지 않는 별도 미래 capability다.
6. 30일 원문 보존은 법률·개인정보 검토와 설정화가 완료되기 전 활성화하지 않는 구현 목표다.
7. State display level, direction, label은 UI 계산값이 아니라 backend projection이다.

UI-0는 `src/v2/ui/contracts.ts`와 `src/v2/ui/mock/fixtures.ts`에서 이 결정을 타입으로 고정한다. fixture는 모두 `synthetic_ui_mock` provenance를 가지며 live 응답으로 사용할 수 없다.

## 12. 권장 구현 순서

1. 승인된 7개 결정을 UI ADR 및 legacy 경계 문서에 반영한다. **완료**
2. 표시용 State DTO와 mock contract를 고정한다. **완료**
3. MCP Learner Context와 구조화 Session Summary를 mock adapter로 제작한다.
4. 학생 웹을 mock adapter로 제작한다.
5. 관리자 웹은 기존 Stage 2B 지원 화면부터 만들고 미지원 기능은 disabled/mock으로 구분한다.
6. 필요한 backend DTO/RPC를 Sol High 작업으로 별도 구현한다.
7. Stage 3 체크포인트를 통합한 뒤 Event 접수 상태를 연결한다.
8. 승인된 staging에서 실제 JWT/PostgREST/user A-B 격리를 검증한다.

## 13. 현재 브랜치 영향

- 새 UI worktree와 브랜치에서 문서와 UI-0 TypeScript/Zod 계약을 추가했다.
- HTML/CSS 렌더링, API, migration은 변경하지 않았다.
- `index.html`과 `service-prototype.html`, Stage 1/2A/2B migration은 변경하지 않았다.
- `design.md`와 `AGENTS.md`에는 legacy/v2 세대 경계만 최소로 명시했다.
- UI spike와 Stage 3 worktree를 수정하거나 병합하지 않았다.
- 커밋·푸시·main 병합·배포·원격 Supabase 작업은 수행하지 않았다.
