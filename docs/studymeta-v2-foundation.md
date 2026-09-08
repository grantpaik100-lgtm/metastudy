# StudyMeta v2 공통 데이터 기반

이 문서는 1단계 구현의 코드·DB 경계다. 인증 흐름, Evidence 추출, State 계산, UI, 기존 데이터 이관은 아직 연결하지 않았다.

## 계약 위치

- `src/v2/contracts/common.ts`: UUID, 시각, null/unknown, SourceRef
- `facts.ts`: declared/inferred/catalog assertion과 effective selection
- `knowledge.ts`: Domain/Concept/Skill과 복수 학습 대상
- `learning-event.ts`: 외부에서 받는 관찰 전용 Event 명령과 서버 저장 Event
- `evidence.ts`: 24개 유형, 정의, 생성 규칙 참조, 파생 Evidence와 review
- `state.ts`: 세 종류의 StateTarget, 불변 estimate, evaluation
- `parameters.ts`: 버전된 parameter set의 schema/payload와 canonical artifact digest
- `scientific-validation.ts`: 정의/추출/갱신 검증 평가와 별도 운영 모드
- `sessions.ts`: Session/Episode/FocusProposal/Intervention/Summary
- `processing.ts`: 정정·review, 재현 입력 manifest, outbox 작업
- `learner-model-definitions.ts`: `index.html`에서 보존한 Evidence 24개와 State 9개의 초기 정의

초기 정의의 과학적 검증은 모두 `not_assessed`다. 운영 모드와 operation assignment는 승인 전이므로 `null`이다. `research_only`를 포함한 어떤 운영 모드도 검증 상태에서 자동 결정하지 않는다. 이 자료는 migration에서 자동 삽입하지 않으며 후속 release 절차가 명시적으로 적용해야 한다.

## DB 저장 경계

신규 migration은 별도 `studymeta_v2` 스키마를 만든다. 기존 public 테이블과 migration은 수정하지 않는다. 브라우저 역할 `anon`과 `authenticated`에는 schema/table 권한과 RLS policy를 부여하지 않는다. 따라서 후속 애플리케이션은 제한된 backend DB 역할과 서버에서 검증한 AuthContext를 사용해야 한다.

소유자 객체는 가능한 곳에서 `(learner_id, id)` 복합키로 참조한다. 세션·시도·Event·Evidence·State를 다른 학생 객체와 연결하면 FK가 거절한다. JSONB로 보존한 배열은 단독으로 소유권을 증명하지 않으므로, 계산에 쓰는 Event↔SourceRef, Event↔Attempt, Evidence↔Event/Attempt/Target, Estimate↔Evidence는 연결 테이블을 사용한다.

Event 접수 서비스의 transaction은 다음을 한 번에 수행해야 한다.

1. 인증 주체로 learner와 connection scope를 결정한다.
2. 정규화 입력의 payload hash를 계산한다.
3. `(learner, connection_scope, idempotency_key)`의 기존 Event를 확인하고, 원 제공자 ID가 있으면 `(learner, connection, external_event_id)` 중복도 확인한다.
4. 같은 hash면 기존 receipt를 반환하고, 다른 hash면 conflict로 반환한다.
5. 새 요청이면 `learning_events`와 첫 `outbox_jobs` 행을 동일 transaction에서 INSERT하고 commit한다.

DB unique 제약이 경쟁 요청의 마지막 방어선이다. unique 위반은 서비스가 기존 payload hash를 다시 읽어 duplicate/conflict로 구분해야 한다. 본 단계에는 해당 application service가 없다.

State 계산은 새 `state_estimates` 행과 `state_evaluations` 행을 추가하고 `state_heads`를 revision 조건으로 전환해야 한다. 과거 estimate 본문을 UPDATE하지 않는다. `production`과 `shadow` head는 분리하지만, `channel=production` 자체는 운영 승인을 뜻하지 않는다. 운영 정책 버전과 모드는 함께 있거나 함께 없어야 한다. `state_confidence`는 사전 호환용 ID로만 남고 독립 State 행을 만들 수 없으며, 각 estimate의 `estimate_confidence`와 산출법으로 기록한다. DB는 State 종류와 knowledge/domain/intervention 대상 조합도 검사한다. 정정도 원본을 덮어쓰지 않고 request/review/새 Event 또는 새 Evidence/estimate를 연결한다.

Event의 session/episode는 JSON 좌표 외에 소유자 복합 FK로도 저장한다. 재현 입력은 `input_manifest_items`에 순서대로 저장하며 Event·SourceRef·Evidence·review마다 같은 learner의 실제 행을 가리키는 복합 FK를 요구한다. `input_hash`는 동일성 검사 보조값일 뿐 이 항목들을 대체하지 않는다.

## 검토 보완 계약

### 과학적 검증

`supported_in_scope`, `mixed`, `unsupported_in_scope`는 population, domain, task type, learning environment 네 범위를 모두 비어 있지 않은 문자열로 명시해야 한다. `supported_in_scope`는 supporting source 또는 study record가 필요하고, `mixed`는 지지 근거와 반대 근거가 모두 필요하며, `unsupported_in_scope`는 반대 근거가 필요하다. `under_review`는 진행 중인 검토를 추적할 source/study 참조 또는 limitation을 적어도 하나 요구한다. 초기 `not_assessed`는 네 범위가 null이고 출처·연구·검사 항목이 비어 있으며 reviewer/review time이 없는 형태만 허용한다.

DB의 `research_sources`와 `study_records`는 참조 대상의 존재만 보장하며 migration은 실제 논문이나 연구 결과를 넣지 않는다. TypeScript 구조 검사와 SQL 제약은 참고문헌의 존재·적용 범위 표기·검토 이력의 완결성을 검사할 뿐, 논문의 품질이나 주장의 과학적 타당성을 입증하지 않는다.

각 `validation_assessment`는 `subject_kind`에 따라 Evidence definition, generation rule, State update rule 중 실제로 존재하는 정확한 ID/version만 가리킬 수 있다. 변경 계보도 같은 subject/claim/scope의 더 이른 assessment version으로만 이어진다. `derived_evidence`는 정의 평가와 생성 규칙 평가를 서로 바꿔 넣을 수 없고, 두 평가가 모두 자신이 참조한 봉인 snapshot에 포함되어야 한다. State estimate도 정확한 State update rule 평가와 그 평가가 포함된 봉인 snapshot을 명시한다.

### StateTarget과 추정값

knowledge target은 concept ID/version 또는 skill ID/version 중 선언한 한 쌍만 허용한다. intervention target도 `scope_level`이 domain이면 concept/skill 좌표를 금지하고, concept 또는 skill이면 해당 ID/version 한 쌍만 허용한다. `state_targets_logical_unique_idx`는 PostgreSQL의 `NULLS NOT DISTINCT`를 사용해 learner, target kind, domain, scope와 Concept/Skill/Intervention 버전 좌표가 같은 논리 대상을 중복 생성하지 못하게 한다.

초기 unknown은 `unknown_reason=initial`, null value, 근거/계산 참조 없음, 0 counts다. 근거 철회·삭제로 입력 사용 불가·재계산 대기의 unknown은 이전 estimate, 완전한 재계산 참조와 limitation을 요구해 초기 unknown과 구별한다. `not_applicable`은 unknown reason 없이 별도 상태로 남는다.

`estimated`와 `candidate`는 null이 아닌 값, 그 값을 해석할 versioned scale definition, 하나 이상의 채택 Evidence와 observation group, 정확한 State update rule, 완료된 calculation run, 봉인된 input manifest, 일치하는 input hash, 봉인된 validation snapshot을 요구한다. `evidence_count`는 채택한 `estimate_evidence` 행 수와 같고 `observation_count`는 그 근거들의 중복 제거한 `observation_group_id` 수와 같아야 봉인된다. 최소 표본의 수나 estimator 계수·임계값은 이 기반에서 정하지 않았다.

run과 manifest는 `(learner_id, calculation_run_id, input_manifest_id)` 복합 FK로 묶인다. estimate 생성 trigger는 run이 completed인지, manifest와 snapshot이 봉인됐는지, manifest의 hash/model/parameter set과 estimate가 일치하는지, 정확한 rule ID/version이 manifest artifact 목록에 포함됐는지 검사한다. 이후 계산 서비스는 같은 transaction에서 이 조건을 다시 확인하고 estimate/evaluation/head 전환을 원자적으로 처리해야 한다.

parameter set은 `(parameter_set_id, parameter_set_version)` 복합키와 schema, payload, canonical artifact digest를 가진 불변 정의다. State update rule, input manifest, State estimate는 ID/version을 모두 null로 두거나 모두 채워야 하며, 계산된 estimate에서는 세 참조가 정확히 일치해야 한다. 이 구조는 재현 식별자만 고정하며 실제 계수나 임계값을 제공하지 않는다.

State evaluation은 channel을 명시하고 before/after/candidate estimate를 learner, target, state type, channel 복합 FK로 묶는다. 또한 `(learner_id, run_id, input_manifest_id)`가 동일 calculation run의 조합이어야 하므로 다른 계산의 manifest나 estimate를 섞을 수 없다.

### 재현 자료 봉인

validation snapshot, input manifest, State estimate는 항상 `sealed_at=null`인 draft로 INSERT한다. 구성 항목을 작성한 뒤 `sealed_at`만 한 번 설정해 봉인한다. 봉인 뒤에는 본문이나 `validation_snapshot_items`, `input_manifest_items`, `estimate_evidence`를 일반 INSERT/UPDATE/DELETE로 바꿀 수 없다. 다른 구성이 필요하면 새 snapshot, manifest, estimate ID를 생성한다. head는 봉인된 estimate만 가리킬 수 있다.

이 보호는 개인정보 삭제를 영구 금지하려는 장치가 아니다. 상위 객체의 승인된 삭제 transaction이 실행하는 FK cascade는 가능하도록 남겼지만, 승인 주체·감사 범위·비식별화·`unavailable_due_to_deletion` 전파를 수행하는 삭제 서비스 자체는 이번 단계에 구현하지 않았다. 일반 애플리케이션 역할에 직접 삭제 권한을 주어 이 경계를 우회해서는 안 된다.

## 불변 기록과 삭제

학습 Event, Evidence, 검증 평가 등은 일반 UPDATE를 trigger로 거절한다. estimate/manifest/snapshot은 구성 작성 뒤 봉인 전환만 허용하고 이후 변경을 거절한다. 이것은 개인정보 삭제를 금지한다는 뜻이 아니다. 후속 삭제 정책은 권한이 제한된 별도 서비스 transaction에서 원문·파생 데이터·캐시·색인을 범위별로 삭제 또는 비식별화해야 한다. 현재는 보존 기간과 삭제 범위가 미확정이므로 삭제 함수를 제공하지 않는다.

`SourceRef`의 content_ref와 availability를 분리했다. 해시는 동일성 확인용일 뿐 과거 원문이나 계산 입력을 복원하지 않는다. `input_manifests`는 실제 Event/Evidence/review/규칙·평가·시점 참조를 보존한다.

## 이번 단계에서 최소 테이블로 둔 관계

목표·시험·학교·전공·개설과목·교재·문제의 전체 카탈로그는 아직 별도 테이블로 확장하지 않았다. Event의 좌표 JSONB와 버전 참조를 받을 계약만 만들었다. 실제 카탈로그 import·승인 책임·공유 콘텐츠 권한이 정해지기 전에 불완전한 계층을 확정 DB로 만들지 않기 위해서다.

Domain/Concept/Skill은 State와 target 계약을 고정하는 데 필요한 최소 정의 테이블만 만들었다. provisional Concept를 공식 승인하지 않으며 수학 CSV를 자동 import하지 않는다. 개입 유형의 공식 사전도 다음 단계의 운영 정책 전까지 문자열+버전 참조로 남긴다.

## 다음 단계의 의무

- 클라이언트 body의 learner/role을 신뢰하지 않고 서버 AuthContext로 주입한다.
- `LearningEventCommandSchema`의 strict 입력을 사용하며 Evidence나 State 필드를 받지 않는다.
- 저장 Event와 outbox를 한 transaction으로 처리한다.
- 연결 테이블을 통하지 않은 JSON ID를 계산 근거로 바로 사용하지 않는다.
- 과학적 검증 평가와 운영 모드, 관찰 confidence와 State confidence를 합치지 않는다.
- rule/definition/assessment는 정확한 버전을 참조하고 최신판으로 암묵 치환하지 않는다.
- draft 구성은 계산에 사용하지 않고, snapshot → manifest → calculation run → estimate/근거 집합 순서로 봉인 및 검증한다.
- 근거가 철회되거나 삭제되어 사용할 수 없으면 기존 값을 조용히 유지하지 말고 head를 stale로 표시한 뒤 구분된 unknown/evaluation 사유를 남긴다.
- 미확정 계수·임계값·보존 기간·24시간 종료값·관리자 이메일을 코드 상수로 만들지 않는다.

로컬 테스트 DB가 없는 경우 `npm run test:v2`는 계약과 SQL의 정적 구조만 확인한다. 실제 PostgreSQL migration 적용, FK 거절, RLS 역할 검증을 완료한 것으로 간주하면 안 된다.

PostgreSQL 15 이상 폐기용 DB에서는 `auth.users(id uuid primary key)` stub과 `anon`, `authenticated` 역할을 준비하고 신규 migration을 적용한 뒤 다음으로 런타임 무결성을 재현할 수 있다. SQL fixture 전체는 transaction rollback되며 운영 DB에서 실행하면 안 된다.

```bash
psql -v ON_ERROR_STOP=1 -d DISPOSABLE_DB -f supabase/migrations/202609080001_studymeta_v2_foundation.sql
psql -v ON_ERROR_STOP=1 -d DISPOSABLE_DB -f tests/v2/foundation-runtime.sql
psql -v ON_ERROR_STOP=1 -d DISPOSABLE_DB -c "set role anon; select count(*) from studymeta_v2.learners;"
psql -v ON_ERROR_STOP=1 -d DISPOSABLE_DB -c "set role authenticated; select count(*) from studymeta_v2.learners;"
```

마지막 두 명령은 private-by-default 경계를 확인하기 위해 권한 오류로 종료되어야 한다.
