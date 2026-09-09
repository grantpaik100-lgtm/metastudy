# 메인 대화 전달 요약

## 결과

StudyMeta v2 UI의 기능, 시각 기본값, State 표시, 관리자 정정, 검증 운영, MCP 속도·토큰 정책을 확정했다. 다음 구현은 Stage 2B 체크포인트에서 새 UI 브랜치/worktree를 만들어 진행한다.

기준 커밋:

```text
bce4fc265197518036f9ae9417d840578c2f6130
```

## 인수할 문서

- `README.md`
- `adr/ADR-001-academic-navy-ui-defaults.md`
- `adr/ADR-002-state-display-and-governance.md`
- `adr/ADR-003-mcp-context-performance-and-token-policy.md`
- `studymeta-v2-ui-spec.md`

원본 위치:

```text
C:\Users\user\Desktop\metastudy\deliverables\studymeta-ui-spec-2026-09-09
```

## 핵심 결정

- Academic Navy: 짙은 남색 + 옅은 아이보리 + 흰색 카드
- 기본 말투: 차분한 학습 코치, 과도한 구어체 제거
- 말투 preset: concise/calm_coach/supportive
- State 기본 3개, 상황에 따라 최대 5개
- Session Summary: 글 중심이 아니라 Event → Evidence → State 구조도
- 학생에게 scientific validation 기본 비노출
- 관리자는 A/B/C validation과 operation mode를 분리해 확인
- 학생 정정은 Evidence reviewer 검토 후 backend 재계산
- 원문 30일은 법률·개인정보 검토와 설정화 전의 구현 목표이며 활성 정책이 아님; synthetic summary 인용은 최대 2개·각 160자
- MCP 전체 Context는 세션 시작·재개·큰 개념 전환·의미 있는 재계산 시점에만
- 매 메시지 MCP 호출 금지, version/delta/cache/token budget 적용

## UI 작업 주의

- 기존 MCP UI spike의 learner card 표현과 호환성 규칙은 재사용할 수 있다.
- `demo-server`, 인증 없는 `/mcp-demo`, synthetic data를 실서비스로 복사하지 않는다.
- 실제 UI는 Stage 2B의 인증된 gateway와 user-scoped RPC를 사용한다.
- 처음에는 mock adapter로 시각 UI를 만들 수 있지만 mock임을 명시한다.
- `index.html`과 기존 24 Evidence/9 State/9 Scenario를 수정하지 않는다.
- main 병합과 배포는 별도 승인 전 수행하지 않는다.

## 메인 대화의 다음 행동

1. 문서 인수와 UI-0 표시 계약 확정
2. UI-1 MCP Learner Context + 구조화 Session Summary 구현
4. 학생 웹과 관리자 웹을 mock contract로 병렬 구현
5. 실제 v2 API는 UI가 안정된 뒤 연결
