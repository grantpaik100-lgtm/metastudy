# StudyMeta vs Tutor MCP

검토일: 2026-09-04

비교 대상: [ArnaudGuiovanna/tutor-mcp](https://github.com/ArnaudGuiovanna/tutor-mcp), commit `677c76f`, README 기준 v0.5.0 alpha

## 결론

Tutor MCP는 여러 LLM을 하나의 학습 런타임에 연결하고, 그 런타임이 커리큘럼·학습 세션·다음 활동·복습 일정·평가·숙련도·오개념·메타인지·감사 로그를 관리하는 완성형 Intelligent Tutoring System에 가깝다.

StudyMeta는 같은 제품을 더 작게 재구현하는 방향으로 가면 안 된다. StudyMeta의 독립적인 제품 가치는 서로 다른 AI·학습앱·LMS에서 생성된 행동을 공통 Evidence로 정규화하고, 근거·신뢰도·버전을 보존한 학생 소유 Learner State를 다시 여러 AI에 제공하는 데 있다.

따라서 경쟁 구도는 다음처럼 정리한다.

- Tutor MCP: 자체 adaptive-learning runtime 안에서 학습 전체를 orchestration
- StudyMeta: 기존 학습환경을 교체하지 않고 그 사이의 learner intelligence를 수집·검증·이식

## 기능 비교

| 영역 | Tutor MCP | StudyMeta 현재 | 결정 |
|---|---|---|---|
| Cross-LLM 연결 | Remote MCP, 여러 LLM client | Remote MCP, OAuth/RLS | 유지 |
| 학습자 자동 식별 | 자체 OAuth learner | Supabase OAuth + `get_my_learner_context` | 유지 |
| 본인 기반 write | learner-scoped mutation tools | `record_my_learning_event` | 이번에 보충 |
| Raw Event/Evidence 분리 | Interaction/assessment/evidence 구조 | `learning_events` + `derived_evidence` | 이번에 보충 |
| Evidence provenance | 평가·rubric·audit 정보 | extractor/version/confidence/definition/missing reason | 이번에 보충 |
| 중복 write 방지 | mutation 전반 idempotency key | Event idempotency key | 이번에 보충 |
| 자동 State 갱신 | BKT/FSRS/IRT/PFA 등 실시간 갱신 | Procedural BKT baseline + Help Need beta baseline | 이번에 보충, 파일럿 보정 전 탐색형 |
| 불확실성 처리 | evidence gates, uncertainty, high-stakes gate | 최소 근거량, 출처별 confidence gate, withheld | 이번에 보충 |
| 다음 활동 선택 | `get_next_activity` regulation pipeline | State→Teaching Policy와 scaffold path | 현재 차별화 범위에 충분, 활동 scheduler는 후속 |
| 세션 수명주기 | start/close/session memory | 최근 Event 기반, 명시적 session 없음 | P1 후보 |
| 평가 무결성 | assessment prepare/submit/cancel | 구조화 Event만 존재 | P1 후보 |
| 복습 스케줄 | FSRS + alert engine | 없음 | Retrievability 검증 뒤 P2 |
| 오개념·전이·메타인지 | 전용 도구와 상태 | 실험/보류 | 검증 전 자동화하지 않음 |
| Curriculum graph | KST prerequisite graph | skill 단위만 존재 | LMS/기업 PoC 요구가 확인될 때 도입 |
| Audit/replay | pedagogical snapshot + replay | Event provenance와 State supporting IDs | 다음 P1 후보 |

## 이번 구현에서 닫은 핵심 공백

1. `record_my_learning_event`
   - AI가 `student_id`를 묻거나 전달하지 않고 OAuth로 연결된 본인 Event를 기록한다.
2. Cross-platform source
   - `external_ai`, `ai_tutor`, `learning_app`, `lms`를 지원하고 실제 공급자는 `source_provider`로 남긴다.
3. Event integrity
   - `idempotency_key`, `problem_id`, 시작·종료 시각을 지원한다.
4. Versioned Evidence
   - extractor, extractor version, definition version, confidence, missing reason을 별도 Evidence row로 보존한다.
5. Conservative closed loop
   - Procedural Mastery와 Help Need만 자동 계산한다.
   - 최소 3개 관찰과 effective sample size 2 이상을 요구한다.
   - 구조화 입력은 confidence 0.70, Camera는 0.90 미만이면 State 반영을 보류한다.
   - Retrievability, Transferability, Calibration, Misconception은 갱신하지 않는다.
6. Explainable State contract
   - 값, confidence, evidence count, effective sample size, model version, supporting event IDs, limitation을 함께 반환한다.
   - Production 기본 조회는 MVP State의 검증 상태와 verified 값만 노출한다.

## 그대로 따라 하지 않은 기능

Tutor MCP의 45개 도구를 복제하지 않았다. 특히 FSRS 복습 일정, IRT ability, PFA, KST curriculum graph, affect, motivational alert, Discord nudge는 StudyMeta의 현재 검증 범위를 넘는다. 이 기능을 근거 없이 추가하면 제출 자료에서 강조한 “검증된 것과 아직 모르는 것을 분리한다”는 원칙을 훼손한다.

## 발표자료에 미치는 영향

기존 경쟁 슬라이드에서 “cross-AI student-owned learner intelligence의 뚜렷한 상용 리더를 확인하지 못했다”는 표현은 그대로 쓰기 어렵다. Tutor MCP는 alpha·오픈소스이지만, persistent learner state와 cross-LLM tutoring을 명시적으로 제공하는 직접 인접 사례다.

발표에서는 경쟁 부재보다 경계 차이를 설명해야 한다.

> Tutor MCP가 하나의 튜터 런타임 안에서 무엇을 공부할지 결정한다면, StudyMeta는 학생이 이미 사용하는 여러 AI·학습환경을 교체하지 않고 그 사이의 학습 Evidence를 검증 가능한 공통 상태로 연결합니다.

## 다음 우선순위

1. 평가 시도와 채점 근거를 먼저 고정하는 assessment contract
2. 학습 session ID와 시작/종료 기록으로 context reuse 및 time-to-independence 측정
3. State 변경 전후와 정책 선택 이유를 남기는 pedagogical audit snapshot
4. 파일럿 데이터로 BKT/Help Need parameter 보정 및 confidence calibration
5. Retrievability 재현 후에만 복습 일정 기능 검토
