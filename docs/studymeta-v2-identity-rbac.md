# StudyMeta v2 Stage 2A — 개인 계정·역할·RLS

## 범위와 보안 경계

이 단계는 Supabase Auth 사용자와 `studymeta_v2.learners`를 1:1로 연결하고, 역할 이력과
읽기 전용 RLS 및 관리자 조회 계약을 추가한다. 로그인 UI, MCP OAuth, 운영 Supabase 연결,
State 계산 규칙, 검증 평가 수정 권한은 포함하지 않는다.

`202609090001_studymeta_v2_identity_rbac.sql`은 실제 관리자 식별자나 이메일을 포함하지
않는다. 관리자 지정은 서버 전용 `provision_admin_role(target_uuid, grantor_uuid, reason)`을
사용한다. `service_role`만 실행할 수 있고 `anon`/`authenticated`에는 실행 권한이 없다.
역할명은 함수 내부에서 `admin`으로 고정되므로 호출자가 다른 역할을 주입할 수 없다.

## 계정과 역할 수명주기

`auth.users` INSERT trigger는 같은 트랜잭션 안에서 다음 작업을 수행한다.

1. `learners.auth_user_id` unique 제약과 `ON CONFLICT DO NOTHING`으로 learner를 생성한다.
2. 활성 역할 partial unique index와 동일한 conflict target으로 기본 `student` 역할을 만든다.
3. 어느 단계라도 실패하면 auth 사용자 INSERT와 함께 롤백된다.

Migration 적용 전에 존재하던 auth 사용자도 같은 규칙으로 backfill한다. `admin`은 별도의
활성 역할이므로 `student`와 동시에 존재할 수 있다. `validation_reviewer`와
`release_manager`는 기존 역할 의미를 그대로 유지하며 `admin` 권한으로 해석하지 않는다.

활성 역할은 `(auth_user_id, role) WHERE revoked_at IS NULL`에서 유일하다. 철회는
`revoke_admin_role`이 `revoked_at`, `revoked_by`, `revocation_reason`을 한 번만 채운다.
grant 행은 삭제하거나 복구할 수 없으므로 누가, 언제, 왜 부여·철회했는지 남는다.

## 테이블 분류

| 분류 | 테이블 | Stage 2A 브라우저 접근 |
|---|---|---|
| 신원·역할 | `learners`, `account_roles` | learner 본인 `SELECT`만 허용. 역할 테이블 직접 접근 없음 |
| learner-owned 직접 조회 | `sessions`, `learning_events`, `derived_evidence`, `state_targets`, `state_estimates`, `state_heads`, `state_evaluations` | 본인 행 `SELECT`만 허용 |
| learner-owned 서버 전용 | `connections`, `episodes`, `learning_attempts`, `source_refs`, `fact_assertions`, `fact_selections`, `event_source_refs`, `event_attempts`, `event_targets`, `event_reviews`, `evidence_source_events`, `evidence_attempts`, `evidence_targets`, `evidence_reviews`, `estimate_evidence`, `correction_requests`, `correction_reviews`, `focus_proposals`, `intervention_instances`, `session_summaries` | FORCE RLS, 브라우저 권한·정책 없음 |
| 전역 사전(읽기 가능) | `domains`, `concepts`, `skills`, `evidence_definitions`, `state_definitions`, `scale_definitions` | 인증 계정 `SELECT` |
| 전역 규칙·파라미터 | `generation_rules`, `parameter_sets`, `state_update_rules`, `state_rule_generation_rules` | FORCE RLS, 브라우저 권한·정책 없음 |
| 검증·운영 관리 | `research_sources`, `study_records`, `validation_assessments`, `validation_snapshots`, `validation_snapshot_items`, `operation_assignments` | FORCE RLS, 브라우저 권한·정책 없음 |
| 내부 처리·outbox | `outbox_jobs`, `derivation_runs`, `input_manifests`, `input_manifest_items`, `calculation_runs` | FORCE RLS, 브라우저 권한·정책 없음 |
| 관리자 조회용 | base table 없음. 아래 4개 RPC가 projection 제공 | 활성 `admin`만 함수 내부 검사 후 조회 |

“브라우저 권한·정책 없음”은 FORCE RLS를 켠 채 `authenticated` table privilege와 허용
policy를 모두 두지 않은 fail-closed 상태다. 반대로 본인 조회 테이블은 `SELECT` privilege와 owner policy가 모두 있어야 정상
접근된다. 학생과 admin 어느 쪽에도 `INSERT`/`UPDATE`/`DELETE`는 부여하지 않는다.

## RLS 정책표

| 대상 | 정책 | 조건 | 허용 동작 |
|---|---|---|---|
| `learners` | `learner_self_select` | `auth_user_id = auth.uid()` | 본인 `SELECT` |
| `sessions` | `sessions_self_select` | `learner_id = current_learner_id()` | 본인 `SELECT` |
| `learning_events` | `learning_events_self_select` | 동일 | 본인 `SELECT` |
| `derived_evidence` | `derived_evidence_self_select` | 동일 | 본인 `SELECT` |
| `state_targets` | `state_targets_self_select` | 동일 | 본인 `SELECT` |
| `state_estimates` | `state_estimates_self_select` | 동일 | 본인 `SELECT` |
| `state_heads` | `state_heads_self_select` | 동일 | 본인 `SELECT` |
| `state_evaluations` | `state_evaluations_self_select` | 동일 | 본인 `SELECT` |
| 전역 읽기 사전 6개 | `<table>_authenticated_select` | `true`, role=`authenticated` | 인증 계정 `SELECT` |

`current_learner_id()`는 입력 인자를 받지 않고 `auth.uid()`만 사용한다.
`is_active_admin()`도 호출자가 role이나 사용자 UUID를 전달할 수 없으며, 오직 현재 JWT의
`auth.uid()`와 `revoked_at IS NULL`인 `admin` 행을 확인한다. 두 함수와 관리자 RPC는 고정
`search_path = pg_catalog`을 사용한다. 역할 확인 함수가 base table RLS를 재귀 호출하지
않도록 `SECURITY DEFINER`로 분리했고 기본 `PUBLIC` 실행 권한을 제거했다.

## 관리자 조회 계약

Base table에 admin 정책을 추가하면 `auth_user_id`, Learning Event `observation`, Evidence의
상세 provenance와 source 참조까지 열릴 수 있다. 따라서 아래 최소 projection RPC를
선택했다.

### A. `admin_list_students`

가입 시각+learner UUID keyset cursor, 보관 포함 여부, 1~100개 limit을 받는다. 반환 필드는
`learner_id`, 표시 이름, 가입일, 보관 여부, 최근 학습 시각, 현재 production State 수,
확인 필요 State 수뿐이다. 확인 필요 수는 계산 규칙이 아니라 저장된 `StateHead.freshness`
가 stale/pending이거나 현재 estimate status가 unknown/candidate인 구조적 표시 카운트다.

### B. `admin_list_state_change_log`

learner, State type, decision, 시각+evaluation UUID cursor로 필터링한다. 반환값은 State target,
before/after/candidate estimate의 최소 snapshot, decision, changed fields, reason codes,
processing status, validation snapshot UUID, calculation run UUID, 발생 시각이다. 원문
`observation`, `source_refs`, source payload는 반환하지 않는다.

### 현재값. `admin_list_current_states`

learner UUID를 필수로 받고 해당 학생의 production `StateHead`와 최소 estimate snapshot을
반환한다. State type+target UUID keyset cursor와 1~100개 limit을 사용한다. Evidence 본문과
원문 Event는 포함하지 않는다.

### C. `admin_list_non_change_log`

decision을 `unchanged`, `withheld`, `disabled`로 고정한다. 기존 reason code를 변경하지 않고
인식된 코드만 `insufficient_evidence`, `validation_policy`, `calculation_held`로 분류한다.
알 수 없는 코드는 의미를 추측하지 않고 `unclassified`로 반환한다.

TypeScript 응답·필터·keyset page 계약은 `src/v2/contracts/identity-rbac.ts`에 있다.

## 운영 시 provisioning

운영자는 이메일을 migration이나 저장소에 넣지 않는다. 서버 전용 운영 도구가 Supabase
Admin API로 이메일을 UUID로 해석한 뒤, 비밀 service-role credential을 서버 메모리에서만
사용해 다음과 같은 parameterized RPC를 호출한다. 로그에는 이메일과 credential을 남기지
않고 target UUID, grantor UUID, 사유 및 DB 결과만 기록한다.

```sql
select studymeta_v2.provision_admin_role(:target_auth_user_id, :grantor_auth_user_id, :reason);
```

`true`는 새 active grant 생성, `false`는 같은 active admin grant가 이미 있어 아무 것도
바꾸지 않았다는 뜻이다. 철회도 동일한 서버 경계에서 `revoke_admin_role`을 호출한다.

## 검증 범위

`tests/v2/identity-rbac-runtime.sql`은 폐기 가능한 PostgreSQL 15+에서 최소 `auth.users`,
`auth.uid()`, Supabase 역할을 모사한다. 실제 migration 문법, trigger 원자성, GRANT/REVOKE,
RLS, RPC, 역할 철회, 트랜잭션 롤백을 실행한다. 이 테스트는 Supabase JWT 검증, API Gateway,
PostgREST exposed-schema 설정 또는 운영 service-role credential 보관을 검증하지 않는다.
