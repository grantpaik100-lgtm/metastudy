# StudyMeta v2 Stage 2B — Supabase gateway runbook

이 문서는 `studymeta_v2` 내부 저장 스키마를 공개하지 않고 Supabase Auth와
PostgREST를 연결하는 운영 경계를 설명합니다. 이 변경에서는 어떤 원격 Supabase에도
접속하거나 migration/관리자 역할을 적용하지 않았습니다.

## 기존 인증 감사 결과

- `src/auth/oauth.ts`는 사용자 JWT를 검사할 때 `SUPABASE_SERVICE_ROLE_KEY`로 Auth
  client를 만들었습니다. `getUser(jwt)` 자체는 공식 검증 경로였지만 사용자 검증에
  elevated key가 불필요하게 결합돼 있었습니다.
- `api/learner-context.ts`는 Bearer 인증 없이 `getDefaultServices()`를 사용해 secret-key
  repository로 일반 learner context를 조회했습니다.
- 인증된 MCP repository는 publishable key와 사용자 access token으로 읽으면서 같은
  repository 객체 안에 service-role State writer도 주입했습니다. user-scoped와
  elevated 책임이 한 객체에 혼합돼 있었습니다.
- Stage 2A는 `studymeta_v2` 테이블에 authenticated `SELECT`와 RLS를 부여했으므로,
  브라우저에서 쓰려면 내부 스키마 전체를 PostgREST Exposed schemas에 넣어야 하는
  구조였습니다. Stage 2B는 전용 RPC facade로 이 요구를 없앱니다.
- `OAUTH_ALLOWED_EMAILS`는 legacy Demo Student claim endpoint만 제한합니다. v2
  `account_roles`의 권한 근거가 아니며 관리자 여부를 판정하거나 부여하지 않습니다.

## 인증 및 client 분리

사용자 access token은 `SUPABASE_PUBLISHABLE_KEY`(legacy fallback:
`SUPABASE_ANON_KEY`)로 만든 Auth client의 `auth.getUser(jwt)`에 전달합니다. 따라서
단순 payload decode가 아니라 Supabase Auth가 서명, 만료, 프로젝트 issuer와 사용자
존재를 검증합니다. 반환된 `user.id`도 UUID 형식을 통과해야 합니다. 실패 응답은 token,
이메일 또는 Supabase 원문 오류를 노출하지 않습니다.

- User-scoped client: publishable key + 원래 요청의 access token. `studymeta_api`로
  schema를 고정하고 RLS/호출자 확인을 그대로 적용합니다.
- Elevated client: `SUPABASE_SECRET_KEY` 전용. 새 설정은 이 값을 우선하고
  `SUPABASE_SERVICE_ROLE_KEY`는 migration 기간의 legacy fallback일 뿐입니다. Auth
  사전 감사, 관리자 provisioning, 서버 State 계산처럼 제한된 서버 작업에만 별도
  repository로 사용하고 일반 learner 조회에는 사용하지 않습니다.

`api/learner-context.ts`도 이제 Bearer 인증 후 user-scoped repository의
`getMyContext()`만 호출합니다. 클라이언트가 임의 `student_id`를 선택하지 않습니다.

## Data API 공개 표면

Supabase Dashboard의 **Project Settings → Data API → Exposed schemas**에서
`studymeta_api`를 추가합니다. v2 용도로 `studymeta_v2`를 추가하면 안 됩니다. 기존 v1이
`public` Data API를 사용하는 동안에는 `public` 제거 여부를 별도 migration으로
결정하고, v2 client는 항상 `studymeta_api`를 명시합니다.

authenticated에 허용되는 RPC는 다음뿐입니다.

- 학생: `get_my_identity`, `get_my_learner_summary`, `get_my_current_states`,
  `get_my_recent_state_log`
- 관리자 JWT: `admin_list_students`, `admin_list_current_states`,
  `admin_list_state_change_log`, `admin_list_non_change_log`

anon에는 schema `USAGE`, 함수 `EXECUTE`, table `SELECT`가 없습니다. API schema에는
base table/view가 없고, 모든 함수는 `SECURITY DEFINER`, `search_path = pg_catalog`,
호출자 검사를 사용합니다. 관리자 결과에는 원문 학습 관찰, source payload, 메시지가
포함되지 않습니다. TypeScript는 Stage 2A Zod 계약으로 모든 row를 재검사하고 다른
형태는 fail-closed 처리합니다.

서버 전용 `server_audit_auth_users`와 `server_provision_admin_roles`는 secret key가
매핑되는 `service_role`만 실행할 수 있습니다. 브라우저 authenticated에는 권한이 없습니다.

Stage 2A가 RLS 검증을 위해 `authenticated`에 부여했던 `studymeta_v2` schema/table/function
권한은 Stage 2B migration에서 명시적으로 회수합니다. RLS 자체는 내부 방어 계층으로
유지하지만, Data API의 v2 공개 표면은 `studymeta_api` RPC로만 제한됩니다.

## 로컬 PostgreSQL 런타임 검증

`tests/v2/supabase-gateway-runtime.sql`은 Supabase에 접속하지 않고 PostgreSQL 15+의
새 폐기용 DB에서 Stage 1 → Stage 2A → Stage 2B migration을 순서대로 적용합니다.
`auth.users`, `auth.uid()`, `auth.role()`과 Supabase DB 역할의 최소 fixture만 만들고,
다음 경계를 실제 SQL 권한과 transaction으로 검사합니다.

- anon 차단, authenticated의 내부 base table 차단, API 함수별 `EXECUTE` 권한
- 학생 본인 데이터 격리와 관리자/서버 RPC 차단
- 관리자 조회 범위와 원문 관찰 필드 비노출
- service-role 전용 감사/provisioning, 부분 실패 전체 rollback, 재실행 안전성
- 고정 `search_path`와 공격자 schema의 동명 객체를 이용한 우회 차단

Windows portable PostgreSQL 검증은 다음 명령으로 실행합니다. runner는 Windows TEMP 아래
고유한 디렉터리와 현재 사용하지 않는 loopback 포트를 만들고, 자신이 시작한 서버만
종료한 뒤 디렉터리를 정리합니다. `psql`은 `ON_ERROR_STOP=1`로 실행됩니다.

```powershell
.\scripts\run-postgres-runtime.ps1
.\scripts\run-postgres-runtime.ps1 -SqlFile tests/v2/identity-rbac-runtime.sql
```

이 검증으로 SQL 문법, 함수/trigger 생성, grant/revoke, RLS·호출자 검사, 데이터 격리,
transaction 원자성을 확인할 수 있습니다. PostgREST schema cache와 Dashboard exposed-schema
반영, 실제 Supabase Auth/JWT 및 publishable/secret key, 네트워크 RPC는 staging에서 별도로
검증해야 합니다.

## migration 전 Auth 사용자 감사

Stage 2A는 기존 `auth.users`를 learner/student로 backfill하므로 먼저
`scripts/audit-supabase-auth-users.sql`을 Supabase SQL Editor에서 실행합니다. 파일의 빈
배열에 관리자 후보 이메일을 로컬에서만 넣고 저장하거나 커밋하지 않습니다. 쿼리는
읽기 전용이며 다음 형식을 반환합니다.

```json
{
  "total_auth_users": 0,
  "already_linked_count": 0,
  "already_active_student_count": 0,
  "expected_new_learner_count": 0,
  "expected_new_student_role_count": 0,
  "identity_conflict_count": 0,
  "active_student_role_conflict_count": 0,
  "admin_targets": [{ "target": 1, "match_count": 1 }],
  "read_only": true
}
```

Stage 2B가 이미 설치된 staging에서는 `npm run audit:supabase-auth`도 같은 종류의
read-only 확인에 쓸 수 있습니다. 기본 출력에는 전체 이메일이 없고 target 번호와
match count만 나옵니다. 이 작업에서는 staging/무운영 데이터/사용자 승인 조건이
확인되지 않아 두 도구 모두 원격 실행하지 않았습니다.

## 관리자 3계정 provisioning

세 이메일, 승인 사유, 승인자 Auth UUID를 shell의 일회성 환경변수 또는 비공개 로컬
환경파일로 설정합니다. 실제 값은 Git에 넣지 않습니다.

```powershell
$env:STUDYMETA_ADMIN_EMAILS='first@local,second@local,third@local'
$env:STUDYMETA_ADMIN_GRANT_REASON='승인 티켓 또는 변경 사유'
$env:STUDYMETA_ADMIN_GRANTED_BY='00000000-0000-0000-0000-000000000000'
npm run provision:admins
```

기본 실행은 dry-run입니다. 모든 이메일이 `auth.users`에서 정확히 한 명과 매칭되고
UUID가 유효해야 plan을 표시합니다. 0명, 여러 명, 중복 입력이면 어떤 변경도 하기 전에
전체 실패합니다. 출력은 target 번호와 UUID만 사용하고 전체 이메일/secret은 출력하지
않습니다.

승인된 staging에서 dry-run 결과를 검토한 뒤에만 다음처럼 적용합니다.

```powershell
npm run provision:admins -- --apply
```

한 번의 `server_provision_admin_roles` RPC가 모든 UUID를 검증한 다음 Stage 2A의
`provision_admin_role()`을 같은 transaction에서 호출합니다. 중간 오류는 전체 RPC를
rollback하고 재실행은 기존 active grant에 대해 `newly_granted=false`를 반환합니다.
감사 기록에는 대상 UUID, `granted_by`, 사유와 시각이 보존됩니다.

첫 관리자는 운영 책임자가 소유한 기존 Auth UUID를 `STUDYMETA_ADMIN_GRANTED_BY`로
명시해 bootstrap합니다. Stage 2A 함수는 grantor가 존재하는 Auth 사용자임을 검증하며,
누가 bootstrap을 승인했는지는 외부 변경 티켓과 DB 감사 행을 함께 보존합니다. 임의
계정이나 이메일을 만들지 않습니다.

## schema cache와 key 회전

migration 직후 RPC가 “schema cache에서 함수를 찾을 수 없음”으로 실패하면 먼저 client가
`studymeta_api` schema를 명시했는지, Dashboard Exposed schemas에 추가됐는지 확인합니다.
그 다음 SQL Editor에서 `NOTIFY pgrst, 'reload schema';`를 실행하고 재시도합니다.

publishable key 유출은 해당 key를 Dashboard에서 폐기하고 새 key로 공개 client 설정을
교체합니다. secret key 유출은 즉시 해당 secret을 폐기·재발급하고 모든 서버 secret
store를 교체한 뒤 접근 로그와 관리자 감사 기록을 검토합니다. legacy
service-role key를 쓰고 있었다면 새 secret key로 전환하고 legacy key도 비활성화합니다.

## staging 검증 체크리스트와 중단 조건

다음이 모두 확인돼야 원격 접속 또는 migration을 진행할 수 있습니다.

- 프로젝트 소유자와 project ref가 staging임을 확인했다.
- 운영 데이터가 없거나 승인된 비식별 fixture만 있음을 확인했다.
- 사용자가 원격 검증과 정확한 migration 범위를 승인했다.
- pre-migration Auth 감사의 총계/backfill 예상/충돌/관리자 3계정 match가 검토됐다.
- 적용 범위가 Stage 1 → Stage 2A → Stage 2B migration 순서임을 확인했다.
- `studymeta_v2`가 Exposed schemas에 없고 `studymeta_api`만 v2 facade로 추가된다.
- 학생/타학생/admin/anon JWT 시나리오와 raw-field 부재를 disposable 계정으로 검증한다.

프로젝트 환경이 불명확하거나, 운영 데이터가 있거나, 감사 수치가 예상과 다르거나,
관리자 이메일 match가 1이 아니거나, migration 범위 승인이 없으면 즉시 중단합니다.
