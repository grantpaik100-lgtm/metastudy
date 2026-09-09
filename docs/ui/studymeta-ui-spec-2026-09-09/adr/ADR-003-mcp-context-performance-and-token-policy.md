# ADR-003: MCP Context 속도·토큰 정책

- 상태: Accepted as architecture constraint; implementation scheduled later
- 결정일: 2026-09-09
- 적용 대상: MCP learner context 읽기, UI structured content, Learning Event 기록, State 재계산

## 맥락

외부 AI가 매 메시지마다 전체 Learner Context와 과거 이력을 요청하면 응답 지연, 토큰 낭비, 중복 DB 조회가 발생한다. StudyMeta 때문에 학습 대화가 눈에 띄게 느려지면 제품의 핵심 가치가 훼손된다. 기능 구현과 별개로 호출 정책과 토큰 예산을 아키텍처 제약으로 고정한다.

## 결정

### 1. 전체 Context 조회 시점

전체 Learner Context는 다음 시점에만 조회한다.

1. 새로운 학습 세션 시작
2. 이전 세션 이어가기
3. 과목 또는 개념이 크게 변경
4. State가 의미 있게 재계산

네 번째 시점에서도 가능하면 전체가 아니라 변경분을 우선한다.

### 2. MCP 호출 시점

MCP 호출을 허용하는 기본 사건:

- 세션 시작 또는 재개
- 개념 전환
- 정답·오답·힌트·자기수정 등 중요한 학습 행동
- 문제 또는 의미 있는 활동 단위 종료
- 세션 종료
- 사용자가 근거나 State를 명시적으로 요청
- 관리자 정정과 재계산 완료

단순 설명, 짧은 확인 질문, 동일 맥락의 매 대화 턴에는 호출하지 않는다.

### 3. AI에 전달하는 최소 Context

자동 전달 허용:

- 현재 과목·개념과 hierarchy version
- 현재 세션 ID와 상태
- 학생 노출 핵심 State 최대 5개
- 최근 Evidence 요약 최대 5개
- 도움 방식과 말투 preference
- 한 개의 teaching recommendation
- context version과 생성 시각

자동 전달 금지:

- 전체 대화 원문
- 전체 학습 이력
- 논문 목록과 검증 이력 전체
- 관리자 감사 정보
- 다른 학생 정보
- 내부 이메일, access token, secret key
- 사용하지 않는 State와 intervention detail

### 4. 토큰 예산

| payload | 목표 | 상한 |
|---|---:|---:|
| 세션 시작 model-visible context | 600 tokens | 900 tokens |
| 개념·State 변경 delta | 150 tokens | 300 tokens |
| 사용자 요청형 상세 근거 | 1,000 tokens | 1,500 tokens |

- 상한을 넘으면 오래된 Evidence부터 제거하고 구조화 요약으로 축약한다.
- UI에서만 필요한 상세 자료는 `structuredContent`로 분리하고 모델에게 반복 전달하지 않는다.
- 필드 이름은 안정적인 짧은 계약을 사용하되 의미를 잃는 불명확한 축약어는 사용하지 않는다.

### 5. 버전과 delta

Context는 다음 envelope을 사용한다.

```json
{
  "context_version": 12,
  "generated_at": "2026-09-09T12:00:00Z",
  "scope": {
    "domain_id": "math",
    "concept_id": "chain_rule"
  },
  "changes_since": 11,
  "states": [],
  "recent_evidence": []
}
```

- 클라이언트가 최신 version을 가지고 있으면 delta만 반환한다.
- 변화가 없으면 `not_modified`를 반환하고 동일 payload를 재전송하지 않는다.
- 정정, Evidence 무효화, State 재계산, 개념 전환 시 해당 사용자·세션·개념 cache를 무효화한다.

### 6. 캐시 격리

- cache key는 최소 `authenticated_user_id + learner_id + session_id + domain/concept + context_version`을 포함한다.
- access token 자체를 cache key, 로그 또는 payload에 넣지 않는다.
- 사용자 A의 cache를 사용자 B에게 반환할 수 없는 테스트를 둔다.
- 권한 변경과 연결 해제 시 즉시 cache를 폐기한다.

### 7. 쓰기와 계산

- Learning Event 수신은 빠르게 내구성 있게 저장한다.
- Evidence 생성과 State 계산은 문제 완료·세션 checkpoint에서 묶어서 처리할 수 있다.
- State 재계산이 AI의 현재 답변을 불필요하게 막지 않도록 비동기 run을 허용한다.
- 사용자가 즉시 결과를 요청한 경우에만 완료 상태를 기다리거나 진행 상태를 반환한다.
- 중복 요청은 idempotency key로 한 번만 처리한다.

### 8. 성능 예산

초기 측정 목표:

- warm cache learner context 서버 처리 p95: 150ms 이하
- uncached learner context 서버 처리 p95: 500ms 이하
- 일반 네트워크에서 MCP tool end-to-end p95: 1초 이하
- Learning Event 접수 응답 p95: 500ms 이하
- State 재계산은 비동기 처리 가능하며 대화 응답을 기본 차단하지 않음

이는 보장 수치가 아니라 staging에서 계측할 예산이다. 측정 없이 달성했다고 표시하지 않는다.

### 9. 관측성

개인정보와 원문 없이 다음을 기록한다.

- tool name
- latency
- cache hit/miss
- input/output token estimate
- context version
- payload byte size
- timeout/error category
- calculation run ID

## 선택 이유

- 세션 시작 시 한 번의 compact context는 AI가 학생을 이해하는 데 필요한 기준을 제공한다.
- delta와 on-demand detail은 반복 토큰과 DB 조회를 줄인다.
- UI용 상세 정보와 모델용 정보의 분리는 화면 품질을 유지하면서 모델 입력을 최소화한다.
- 비동기 State 계산은 학습 대화와 분석 파이프라인의 지연을 분리한다.
- 사용자별 cache key와 무효화 규칙은 속도 최적화가 데이터 격리를 깨뜨리지 않게 한다.

## 결과와 제약

- 모든 MCP tool은 큰 객체를 습관적으로 반환할 수 없다.
- context mapper, token/byte budget test, latency telemetry가 필요하다.
- 실제 목표치는 staging과 파일럿의 p95 측정 후 변경할 수 있다.

## 재검토 조건

- p95가 목표를 지속적으로 초과할 때
- 주요 AI 호스트의 MCP Apps 전달 방식 또는 token accounting이 변경될 때
- compact context 때문에 교수전략 품질이 낮아진다는 평가 결과가 있을 때
- context cache가 사용자 정정 반영을 지연시키는 사례가 발생할 때
