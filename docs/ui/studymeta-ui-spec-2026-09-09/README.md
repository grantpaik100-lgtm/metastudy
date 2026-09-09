# StudyMeta v2 UI 결정 패키지

- 작성일: 2026-09-09
- 상태: UI-0 계약 기준 확정
- 목적: 메인 구현 대화에 전달할 학생 웹·관리자 웹·MCP/In-chat UI 명세와 ADR 제공
- 코드 변경: UI-0 표시 계약과 synthetic fixture 포함

## 문서 목록

1. [ADR-001 — Academic Navy UI·UX 기본값](./adr/ADR-001-academic-navy-ui-defaults.md)
2. [ADR-002 — State 표시·원문·정정·검증 운영 정책](./adr/ADR-002-state-display-and-governance.md)
3. [ADR-003 — MCP Context 속도·토큰 정책](./adr/ADR-003-mcp-context-performance-and-token-policy.md)
4. [StudyMeta v2 UI 통합 명세](./studymeta-v2-ui-spec.md)
5. [메인 대화 전달 요약](./main-thread-handoff.md)
6. `src/v2/ui/contracts.ts` — backend projection을 표시하는 UI-0 Zod 계약
7. `src/v2/ui/mock/fixtures.ts` — `synthetic_ui_mock`으로 명시된 fixture

## 적용 기준

- 이 패키지는 외부 AI를 실제 학습 공간으로 사용하고 StudyMeta를 Learner Model 관제탑으로 사용하는 v2 UI 기준이다.
- 기존 연구 데모 `index.html`의 Evidence 24개, State 9개, Scenario 9개를 변경하지 않는다.
- 예전 학생 서비스 A/B/C 프로토타입을 그대로 확장하는 명세가 아니다.
- 실제 구현 브랜치는 Stage 2B 체크포인트 `bce4fc265197518036f9ae9417d840578c2f6130`에서 분기한다.
- 기존 MCP UI spike의 인증 우회·가상 데이터·데모 서버는 가져오지 않는다. 검증된 카드 HTML과 호환성 규칙만 인수한다.
- 2026-09-09 승인 결정: `not_assessed`의 초기 operation assignment는 `null`이며 자동
  `research_only`가 아니다. 30일 원문 보존은 법률·개인정보 검토와 설정화 전의 구현 목표일 뿐 활성 정책이 아니다.
- UI-0 계약은 학생 기본 State를 개념 이해·절차 숙련·도움 필요도 3개로 고정하고,
  Session Summary의 Event → Evidence → State 참조 무결성을 검증한다. 관리자 projection은
  별도 계약으로 `intervention_response`를 표시할 수 있으나 `state_confidence`는 독립 State가 아니다.
- 학생 카드/MCP Context는 기본 3개와 필요 시 기억 인출·오개념 가능성만 표시한다.
  전이 가능성·자기 판단 정확도는 학생 상세 계약에서만 다룬다. 관리자 A/B/C 행은 foundation과
  같은 validation status별 scope·근거·reviewer 경계를 유지한다.

## 확정과 보류

이 문서에서 `결정`으로 표시한 항목은 첫 구현의 기본값이다. 다음은 의도적으로 별도 검증 대상으로 남는다.

- State 숫자 임계값과 estimator 계수
- 실제 Supabase staging의 Auth/JWT/PostgREST 통합
- 한국 개인정보보호법 및 서비스 약관에 대한 출시 전 법률 검토
- 과학적 검증 결과 자체와 검토 책임자 지정
