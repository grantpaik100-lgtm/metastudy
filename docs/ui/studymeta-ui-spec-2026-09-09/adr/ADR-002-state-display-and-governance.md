# ADR-002: State 표시·원문·정정·검증 운영 정책

- 상태: UI 정책 승인; backend/privacy 구현 전 비활성
- 결정일: 2026-09-09
- 적용 대상: State 표시, Session Summary 원문, 관리자 정정, 검증 상태와 운영 모드

## 맥락

UI가 State 숫자를 임의로 해석하거나, 학생 원문을 과도하게 저장하거나, 관리자가 State를 직접 덮어쓰면 StudyMeta의 재현성과 신뢰가 깨진다. 과학적 검증 상태와 서비스 운영 여부도 분리해야 한다. 초기 운영에서 사용할 보수적인 기본값을 고정한다.

## 결정

### 1. 공통 State 표시 계약

모든 State 응답은 최소한 다음을 포함한다.

```json
{
  "value": null,
  "status": "unknown",
  "display_level": "unknown",
  "scale_definition_id": "...",
  "scale_definition_version": "...",
  "evaluated_at": null
}
```

- `value=null`과 `status=unknown`을 함께 사용한다.
- UI는 숫자 임계값을 계산하지 않는다.
- 백엔드의 버전된 scale definition이 `display_level`을 결정한다.
- estimator 계수와 임계값이 확정되기 전에는 임의의 `0~1 → 낮음/중간/높음` 변환을 만들지 않는다.
- `candidate`는 확정값처럼 표현하지 않는다.

### 2. 학생용 문구 사전

아래 문구는 `display_level`에 대응하는 표시 사전이다. 수치 임계값이 아니라 UI 라벨만 확정한다.

| State | 낮거나 확인이 필요한 단계 | 형성 중 단계 | 안정적으로 관찰된 단계 |
|---|---|---|---|
| 개념 이해 | 핵심 개념 확인 필요 | 개념을 형성하는 중 | 개념 이해가 안정적으로 확인됨 |
| 절차 숙련 | 절차 연습 필요 | 절차를 다듬는 중 | 독립적인 절차 수행 확인 |
| 기억 인출 | 복습 권장 | 일부 내용 인출 확인 | 시간이 지난 뒤에도 인출 확인 |
| 전이 가능성 | 새로운 적용은 추가 확인 필요 | 유사한 변형에 적용 중 | 새로운 상황에 적용 확인 |
| 도움 필요도 | 혼자 진행 가능 | 짧은 힌트가 도움됨 | 단계별 지원 권장 |
| 오개념 가능성 | 현재 반복 징후 없음 | 오개념 가능성 확인 필요 | 반복되는 오개념 후보 |
| 추정 신뢰도 | 추정 근거가 제한적 | 일부 근거에서 일관됨 | 여러 근거에서 일관됨 |

공통 상태 문구:

| status | 학생 표시 |
|---|---|
| `unknown` | 아직 판단할 학습 기록이 충분하지 않아요. |
| `candidate` | 추가 학습에서 확인이 필요해요. |
| `estimated` | 버전된 scale definition의 문구 사용 |

`오개념 가능성 낮음`은 실제 반증 Evidence가 있을 때만 `현재 반복 징후 없음`으로 표시한다. 단순히 Evidence가 없으면 `unknown`이다.

`calibration`은 낮음/중간/높음 대신 다음 범주를 사용한다.

- 자기 판단이 실제 수행보다 낮게 나타남
- 자기 판단과 수행이 대체로 일치
- 자기 판단이 실제 수행보다 높게 나타남
- 판단할 정보 부족

`intervention_response`는 학생에게 노출하지 않는다. 관리자 UI에서도 backend scale label을 그대로 사용하며 UI가 효과성을 자체 판정하지 않는다.

### 3. 학생 기본 노출

- 기본 3개: 개념 이해, 절차 숙련, 도움 필요도
- 필요 시 추가: 기억 인출, 오개념 가능성
- 카드당 최대 5개
- 자세히 보기: 전이 가능성, calibration, 추정 신뢰도
- 완전 비공개: intervention response
- 종합점수와 과목 간 합산을 금지한다.

### 4. 원문 보존과 표시

다음은 구현 목표와 fixture 제한값이다. 실제 원문 보존 정책은 아직 활성화되지 않았다.

- 구현 목표: StudyMeta가 Evidence 근거로 수집한 전체 원문 조각은 생성 후 30일
- Session Summary에 표시할 수 있는 인용: 세션당 최대 2개
- 인용 하나의 표시 길이: 공백 포함 최대 160자, 최대 두 문장
- Evidence 객체에는 원문을 복제하지 않고 `source_event_id`와 문자 범위 또는 excerpt reference만 둔다.
- 30일 이후에는 원문을 파기하고 구조화된 관찰 요약, 판정 결과, 버전, 감사 메타데이터만 남긴다.
- 원문이 파기된 뒤 Session Summary는 구조화된 요약으로 대체한다.
- 비밀번호, 인증 토큰, 연락처 등 민감 패턴은 저장 전 제거 또는 차단한다.
- 사용자 정정·삭제 요청과 승인된 삭제는 별도 감사 사건으로 남기되 삭제된 원문을 복원하지 않는다.

30일은 초기 제품의 오류 검토와 개인정보 최소화 사이의 **구현 목표 기본값**이며 법정 보존기간이나 활성 서비스 정책이 아니다. 원문 저장, 만료·삭제, 민감정보 처리, 개인정보 처리방침과 법률 검토 및 설정화가 완료되기 전에는 적용했다고 표시하지 않는다.

### 5. 관리자 정정 승인

- State 값을 관리자가 직접 입력하거나 수정하지 않는다.
- 학생 요청은 `correction_request`로 저장한다.
- `evidence_reviewer`는 후속 RBAC migration으로 도입할 별도 capability다. 구현 전에는 Evidence 유지·정정·무효화와 재계산 승인 UI를 unavailable/disabled로만 표시한다.
- capability가 도입된 뒤의 부여는 UUID 기반으로만 처리하며 이메일 문자열로 판정하지 않는다.
- 개별 학생 정정은 reviewer 1명의 사유 입력으로 승인할 수 있다.
- Evidence 정의, 생성 규칙, State 갱신 규칙, validation status, operation mode의 변경은 작성자 외 관리자 1명의 추가 승인을 요구한다.
- 모든 조작은 이전 값을 덮어쓰지 않고 append-only 이력과 `reviewed_by`, `reason`, `reviewed_at`을 남긴다.
- 재계산은 관리자가 수작업으로 값을 입력하는 것이 아니라 backend calculation run을 생성하는 방식이다.

### 6. 과학적 검증 상태와 운영 모드 정책

과학적 검증 상태 하나만으로 운영 여부를 자동 결정하지 않는다. Evidence 정의(A), 생성 규칙(B), State 갱신 규칙(C)을 각각 평가하고, 가장 보수적인 조건을 적용한다.

| validation status | 기본 허용 모드 | 조건 |
|---|---|---|
| `not_assessed` | 운영 할당 없음 | 상태만으로 자동 배정하지 않음; 명시 승인 뒤에만 `research_only` 등을 설정 |
| `under_review` | 승인된 경우에만 `research_only` 또는 제한 `pilot` | 대상·기간·지표·중단 조건 기록 필요 |
| `supported_in_scope` | `pilot`; 조건 충족 시 `production` | A/B/C 모두 범위 내 지지, 서비스 범위 일치, 승인된 버전 필요 |
| `mixed` | 명시 승인된 `research_only`; 예외적으로 제한 `pilot` | 상충 근거와 안전장치, 명시적 승인 필요 |
| `unsupported_in_scope` | 해당 범위 `disabled` | 연구 기록은 보존 가능하나 해당 범위 State 갱신 금지 |

`production` 허용 조건:

1. A/B/C 모두 `supported_in_scope`
2. population, domain, task type, learning environment가 실제 사용 범위와 일치
3. 생성 규칙 성능과 State 계산 규칙의 승인 기준 충족
4. 봉인된 validation snapshot과 parameter set 존재
5. 두 명의 승인자와 변경 이유 기록

한 조건이라도 충족하지 않으면 자동으로 production으로 승격하지 않는다.

학생 MCP 카드에는 validation status를 기본 노출하지 않는다. 학생이 추정 근거를 요청하면 DB의 claim, scope, limitations를 짧게 변환해 보여준다. 관리자 화면에서는 A/B/C, 출처, 반대 출처, 검토자, 버전과 변경 이력을 모두 표시한다.

## 선택 이유

- UI가 숫자 임계값을 자체 계산하면 과거 결과 재현과 모델 버전 비교가 깨진다.
- 전체 원문을 장기 보유하지 않고 source event와 구조화 요약을 분리하면 검토 가능성과 개인정보 최소화를 함께 달성할 수 있다.
- 관리자 1인 검토는 MVP 운영 속도를 확보하고, 규칙·검증·운영 정책 변경에는 2인 승인을 둬 영향 범위를 통제한다.
- 연구 검증과 서비스 운영을 분리하면 `운영 중=과학적 검증 완료`라는 잘못된 주장을 막는다.

## 결과와 제약

- 24개 Evidence는 기본 `not_assessed`와 operation assignment `null`에서 시작한다.
- 검증되지 않은 규칙으로 계산한 값은 관리자 연구 화면의 candidate로는 볼 수 있으나 학생의 확정 State나 교수전략에 자동 사용하지 않는다.
- 30일 보존은 출시 전 개인정보 검토에서 변경될 수 있다.

## 재검토 조건

- 실제 정정 처리 시간이 운영 병목이 될 때
- 원문 없이 오탐·누락을 검토하기 어렵다는 실증 결과가 있을 때
- 개인정보 처리방침, 법률 또는 연구 동의 범위가 변경될 때
- Evidence 생성 규칙이 사람 판정 대비 충분한 성능을 보일 때
