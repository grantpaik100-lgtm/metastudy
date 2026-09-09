# StudyMeta v2 Stage 3 — Learning Event와 Evidence 파이프라인

이 문서는 Stage 3A Event 접수와 Stage 3B Evidence 파생 경계를 설명한다. 운영 Supabase에는 적용하지 않았고, 공식 generation rule도 등록하지 않았다.

## 3A — Event 접수

외부 body는 `LearningEventCommandSchema`로 strict 검증한다. `learner_id`, actor role, Evidence, State, validation assessment, operational mode 같은 권한·파생 필드는 명령에 들어갈 수 없다. JWT 검증 이후 별도로 만든 `LearningEventAuthContext`만 intake service에 전달하며, DB 함수는 Auth 사용자의 learner/활성 역할과 connection 소유·활성 상태를 다시 검사한다.

`connection_scope`는 body나 호출자가 정하지 않는다. connection이 없으면 검증된 Auth UUID에서 `auth-user:<uuid>`, connection이 있으면 소유권을 확인한 뒤 `connection:<uuid>`로 DB가 결정한다. 외부 provider Event ID에는 활성 connection이 필요하다. 학생 OAuth로 외부 AI가 행동할 때 actor를 student/agent 중 무엇으로 볼지는 미결정이므로 해당 조합은 application service에서 `actor_policy_unresolved`로 fail-closed한다.

검증된 명령은 `studymeta.learning-event.canonical-json.v1` envelope에서 object key를 정렬해 직렬화하고 서버 Node runtime에서 SHA-256을 계산한다. transport 재시도 키인 `idempotency_key`는 provider가 같은 Event를 다른 요청 키로 재전송해도 payload identity가 유지되도록 hash 대상에서 제외하며, 전체 정규화 command는 별도 JSONB로 보존한다. `server_record_learning_event`는 service-role 전용이다. 브라우저/일반 authenticated 사용자는 내부 schema나 이 RPC를 직접 호출할 수 없다.

DB 함수는 learner + connection scope + idempotency key와 provider external Event ID 각각에 transaction advisory lock을 잡는다. 기존 Event의 payload hash가 같으면 원 receipt를, 다르면 machine-readable conflict를 반환한다. 새 Event는 `learning_events`, `event_source_refs`, `event_attempts`, `event_targets`, 첫 `derive_evidence` outbox를 한 transaction에서 쓴다. 참조 소유권 FK가 하나라도 실패하면 전부 rollback된다. target 배열의 첫 항목은 저장 구조의 `primary`, 이후 항목은 `supporting` 역할로 보존한다.

Event body는 UPDATE하지 않는다. correction은 `correction_of_event_id`를 가진 별도 Event다. receipt는 `event_id`, `recorded_at`, `duplicate`, `processing_status`만 포함하고 Evidence/State 변경을 주장하지 않는다.

## 3B — Evidence worker

production 기본 registry는 버전된 빈 registry다. 테스트 rule은 테스트 코드와 폐기용 DB fixture에만 있으며 운영 migration은 Evidence definition, generation rule, validation assessment/snapshot, operation assignment를 한 건도 삽입하지 않는다.

worker policy는 다음 값을 호출자가 명시적으로 주입한다.

- policy version
- lease milliseconds
- max attempts
- retry delay milliseconds
- 허용할 operational mode 목록

claim RPC는 `FOR UPDATE SKIP LOCKED`로 한 job만 점유하고 lease owner/time과 attempt count를 기록한다. 이때 worker policy version과 허용 operational mode 목록도 derivation run에 고정한다. completion은 manifest의 정책 정보가 claim 당시 기록과 정확히 같은지 확인하므로 완료 시점에 허용 모드를 바꿔 제출할 수 없다. 만료 lease는 재점유할 수 있고, max attempts에 도달하면 dead-letter로 전이한다. failure RPC는 현재 lease owner와 policy version을 확인한 뒤 retryable failed 또는 dead-letter로 전이한다.

worker는 exact rule/definition version과 assessment/snapshot ID, 그리고 실제 선택한 definition/rule operation assignment ID가 묶인 rule만 실행한다. output은 `EvidenceInstanceSchema`로 검증하고 learner, run, Event, source Event, basis ref, attempt, target, observation group, provenance, observation confidence/method 쌍이 입력과 일치하는지 확인한다.

completion manifest에는 derivation policy version, 허용 operational mode 목록, Evidence별 mode와 두 assignment ID를 기록한다. `derivation_runs`에도 policy version과 허용 mode를 보존하고, `derived_evidence`에는 definition assignment ID, generation-rule assignment ID, 실제 mode를 보존한다. DB는 전달된 정확한 assignment ID를 조회해 subject kind/ID/version, 현재 유효 기간, `derive` 권한, disabled 여부를 검사한다. definition과 rule assignment의 mode는 서로 같아야 하고 worker policy 허용 mode에 포함되어야 하며, 코드 객체가 선언한 mode만으로 승인하지 않는다. assignment 슬롯을 서로 바꾸거나 동일 subject의 다른 assignment로 모호하게 대체할 수 없다.

Evidence 본문, `evidence_source_events`, `evidence_basis_refs`, `evidence_attempts`, `evidence_targets`, derivation run result manifest, outbox 완료는 한 transaction이다. completion hash가 같은 재호출은 기존 완료를 반환하고, 다른 hash는 conflict다. 중간 오류는 부분 Evidence를 남기지 않는다.

승인된 rule이 없으면 Event와 outbox 이력은 보존하고 Evidence 0개로 run을 완료하며 `no_authorized_generation_rule`을 result manifest와 outbox error-code 필드에 남긴다. Stage 3은 `state_estimates`, `state_evaluations`, `state_heads`를 쓰거나 State updater를 호출하지 않는다.

## 보안·격리

- 새 write/worker RPC는 `studymeta_api`의 service-role 전용 `SECURITY DEFINER` 함수다.
- 모든 함수는 `search_path = pg_catalog`이며 anon/authenticated에는 EXECUTE가 없다.
- 서버는 검증된 JWT로 AuthContext를 만든 뒤 elevated repository를 별도 사용해야 한다.
- legacy `src/domain/contracts.ts`, `src/services/learning-event-service.ts`, `src/services/learner-state-updater.ts`, `src/services/default-services.ts`와 연결하지 않았다.
- MCP tool/UI 등록은 통합 단계로 미뤘다.

## 아직 결정하지 않은 항목

다음은 구현하거나 기본값을 만들지 않았다: 24개 Evidence별 실제 생성 조건, 공식 rule의 운영 허용 범위, prompt/judge/artifact digest, 과학적 검증 결과와 출처, 학생 메시지·답안 원문 및 보존 기간, 세션 timeout 기본값, 외부 AI actor 분류, provisional Concept 자동 승인, 수학 CSV import, Evidence→State 수식·가중치·임계값·감쇠·충돌 정책, State 계산과 Teaching Policy.

## 검증

`tests/v2/event-evidence-runtime.sql`은 Stage 1 → 2A → 2B → 3 migration을 PostgreSQL 15.19 폐기용 DB에 적용한다. 두 독립 DB 연결로 Event duplicate 경쟁과 worker lease 경쟁을 실행하고, conflict, cross-learner rollback, retry/dead-letter, no-rule 보류, Evidence transaction rollback과 completion 재시도를 검사한다.

```powershell
.\scripts\run-postgres-runtime.ps1 -SqlFile tests/v2/event-evidence-runtime.sql
```
