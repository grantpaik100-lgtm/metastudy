# StudyMeta 학생용 피드백 UI 설계 (v0.1)

> `index.html`의 Learner Model 데모(Evidence → Student State → Teaching Decision)는
> **설계자/연구자용** 화면이다. 이 문서는 같은 엔진(러너 모델)을 **학생에게 직접 노출되는 화면**으로
> 어떻게 번역할지 정의한다. 리서치 근거는 `md/ui-research.md` 참고.

---

## 1. 배경 및 목적

- 러너 모델(Evidence 추출 → State 업데이트 → Teaching Decision 산출) 로직은 그대로 유지한다.
- 다만 `misconception_candidate`, `state_confidence` 같은 내부 변수명·Evidence/State 딕셔너리
  원문은 **개발자 전용 개념**이며, 학생에게는 그대로 노출하지 않는다.
- 목적: 학생이 문제를 풀 때마다 "내가 지금 뭘 잘하고 있고, 다음에 뭘 하면 좋을지"를
  **1~2문장 + 카드 UI**로 즉시 이해할 수 있게 한다.

## 2. 이번 범위(Scope) 결정 사항

| 항목 | 결정 |
|---|---|
| 주 사용자 | 학생 (교사/연구자용 화면은 이번 범위 아님) |
| 스케일 | **문제 풀이 직후 즉시 피드백 화면 1개**만 설계. 여러 스킬을 모아 보는 개인 대시보드(Khan Academy 타일형, ALEKS 파이형)는 이번 범위 제외 — 추후 별도 문서 |
| 시간축 | Retrievability 등 시간에 따라 변하는 State도 **망각곡선 그래프 없이**, 다른 State와 동일한 카드/문구 방식으로 표현. 시계열 시각화는 이번 범위 제외 |
| Evidence-State 관계 노출 | 기본은 **자연어 설명 문장 1~2줄**로 대체하고, 원한다면 "자세히 보기"로 **색상 강조된 Evidence/State 카드**까지 펼쳐볼 수 있는 **옵트인 확장** 구조 (연결선 다이어그램은 만들지 않음) |

## 3. 핵심 시나리오

학생이 문제를 하나 풀고 제출한다 → 정답/오답 판정과 함께, 이번 풀이에서 관찰된 Evidence로 인해
바뀐 Student State를 학생 눈높이 언어로 보여주고, 다음에 뭘 하면 좋을지 하나의 명확한 제안으로
마무리한다. (`index.html`의 9개 시나리오가 이 화면의 콘텐츠 소스가 된다.)

## 4. 화면 구조 (Screen Anatomy)

한 화면에 위에서 아래로 4개 블록. 기본 노출은 1~3번, 4번은 접힌 상태(옵트인).

```
┌─────────────────────────────────────────┐
│ ① 결과 배너                                │
│   정답/오답 아이콘 + 한 줄 반응 문구           │
├─────────────────────────────────────────┤
│ ② 이번에 달라진 점 (최대 2~3장 카드)          │
│   [카드] 아이콘 + 친화적 State 문구 + 방향    │
├─────────────────────────────────────────┤
│ ③ 다음 추천 행동 (Teaching Decision)        │
│   강조 카드 1개, 명령이 아닌 제안 톤           │
├─────────────────────────────────────────┤
│ ▾ 자세히 보기 (기본 접힘, 옵트인)             │
│   - 감지된 Evidence 칩(색상 강조)            │
│   - 관련 State 카드 전체(색상 강조)           │
└─────────────────────────────────────────┘
```

- **① 결과 배너**: 정답/오답을 즉각적·감정적으로 전달 (Duolingo류 초록/빨강 배너 패턴).
- **② 상태 변화 카드**: `index.html`의 `stateUpdates` 중 변화가 있는 항목만, 최대 2~3장만 우선순위로
  노출한다(전부 나열하면 정보 과다). 우선순위 기준: `state_confidence`처럼 메타적인 항목보다
  `conceptual_mastery`, `procedural_mastery`, `misconception`처럼 학생이 체감할 수 있는 항목을 우선.
- **③ 다음 추천 행동**: `decisionTitle`/`decision`을 학생에게 말하듯 1인칭 유도형으로 재작성한다
  (교사 지시문이 아니라 학생에게 건네는 제안).
- **④ 자세히 보기**: 펼치면 지금 데모의 Evidence Dictionary/Student State 패턴(하이라이트 카드)을
  그대로 재사용하되, **원본 코드(`code` 태그의 snake_case id)는 학생 화면에 노출하지 않고** 사람이
  읽는 라벨/설명만 보여준다.

## 5. 콘텐츠 매핑: 내부 개념 → 학생 문구

### 5-1. Evidence → 학생 노출 라벨 (자세히 보기에서만 노출)

| 카테고리 | 내부 id | 학생 라벨 |
|---|---|---|
| PERFORMANCE | correct | 정답 |
| | incorrect | 오답 |
| | partial_success | 부분적으로 맞음 |
| ASSISTANCE | independent_success | 혼자 힘으로 해결 |
| | hint_requested | 힌트 요청 |
| | success_after_hint | 힌트 받고 해결 |
| | success_after_explanation | 설명 듣고 해결 |
| ERROR | first_error | 첫 실수 |
| | repeated_error | 반복되는 실수 |
| | misconception_candidate | 헷갈리는 개념 후보 |
| | self_correction | 스스로 수정함 |
| MEMORY/RETRIEVAL | immediate_retrieval_success | 바로 기억해 냄 |
| | delayed_retrieval_success | 시간이 지나도 기억함 |
| | delayed_retrieval_failure | 시간이 지나 잊어버림 |
| | relearning | 다시 배우는 중 |
| TRANSFER | novel_application_success | 새로운 문제에 응용 성공 |
| | novel_application_failure | 새로운 문제에 응용 실패 |
| METACOGNITION | confidence_report | 확신 정도 응답 |
| | perceived_understanding | "이해했다"는 응답 |
| | perceived_difficulty | 체감 난이도 응답 |
| | error_awareness | 실수를 스스로 알아챔 |
| PROCESS | response_time | 풀이 소요 시간 |
| | stuck_duration | 막힌 시간 |
| | attempt_count | 시도 횟수 |

### 5-2. State → 학생 노출 문구 (카드 ②의 기본 문구 템플릿)

| 내부 id | 학생 문구(변화 있을 때) |
|---|---|
| conceptual_mastery | "개념 이해가 [좋아지고/약해지고] 있어요" |
| procedural_mastery | "풀이 과정이 [능숙해지고/서툴러지고] 있어요" |
| retrievability | "이 내용을 [잘 기억하고/까먹기 시작했고] 있어요" |
| transferability | "다른 문제에도 잘 [적용하고/적용하기 어려워하고] 있어요" |
| help_need | "필요한 도움이 [줄고/늘고] 있어요" |
| misconception | "헷갈리는 부분이 [있는 것 같아요/줄고 있어요]" |
| state_confidence | *(학생 화면 기본 미노출 — 내부 신뢰도 지표. 자세히 보기에서만 "확신도" 라벨로 노출)* |
| calibration | *(자세히 보기 전용)* "스스로 예상한 것과 실제 결과를 비교해볼게요" |
| intervention_response | *(자세히 보기 전용)* "이 힌트 방식이 잘 맞고 있어요" |

> `state_confidence`처럼 학생 행동을 직접 지시하지 않는 메타 지표는 기본 화면(②)에 카드로
> 만들지 않는다. "자세히 보기"에서만 선택적으로 확인 가능.

### 5-3. Teaching Decision → 학생 제안 문구 톤

- 지시형(교사용) 대신 **제안형·1인칭 유도형**으로 재작성.
  - 예) "개입을 줄이고 독립 수행을 확인" → "다음엔 힌트 없이 한번 도전해볼까요?"
  - 예) "간격 회상 연습을 우선" → "잠깐 다시 떠올려볼 시간이에요."
- Khanmigo 스타일 원칙 적용: **정답/결론을 대신 말해주지 않고, 다음 행동을 부드럽게 제안**한다.

## 6. 인터랙션 패턴

- **기본 노출 최소화 + 옵트인 확장(progressive disclosure)**: 화면 로드 시 ①②③만 보이고,
  ④는 "자세히 보기" 토글로 펼친다. (XAI 패턴의 "근거는 인접 배치, 접었다 펼 수 있게"를 반영)
- ④를 펼쳤을 때만 `index.html`의 색상 강조(`is-active`) 패턴을 재사용 — 감지된 Evidence 칩과
  관련 State 카드에 파란색 강조. 다만 코드/`code` 태그는 제거하고 라벨+설명만 표시.
- 연결선 다이어그램(Evidence↔State를 선으로 잇는 관계도)은 만들지 않는다 — 학생 화면에서
  기대 효과 대비 복잡도가 높다고 판단.

## 7. 비주얼 가이드

- `index.html`의 디자인 토큰(색상 변수, radius, shadow)을 그대로 재사용해 톤을 통일한다.
  - `--blue`(강조/제안), `--green`(정답/긍정 변화), `--amber`(주의/헷갈림), `--red`(오답)를
    결과 배너·State 카드 방향(↑/↓) 표시에 활용.
- 카드형 레이아웃(`.section-card`, `.state-item` 스타일)을 계승하되, 학생 화면에서는
  타이포를 더 크게(가독성), 카드 수를 최소화(2~3장)한다.

## 8. 이번 범위에서 제외한 것 (Out of scope)

- 여러 스킬/여러 세션을 모아 보는 개인 대시보드 화면 (Khan Academy 타일형 / ALEKS 파이형)
- Retrievability 등의 시계열/망각곡선 그래프
- Evidence-State 관계를 잇는 hover 연결선 다이어그램
- 교사/연구자용 다중 학생 비교 대시보드 (원래 `index.html`이 담당하는 영역과는 별개로 유지)

## 9. 다음 단계

1. 위 콘텐츠 매핑 표를 바탕으로 정답/오답 각 1개 시나리오의 실제 와이어프레임(HTML) 초안 제작.
2. "자세히 보기" 확장 인터랙션을 `index.html`의 기존 JS 패턴(scenario 선택 로직) 재사용해 프로토타이핑.
3. 추후(2단계)에 개인 대시보드·시계열 시각화가 필요해지면 별도 `design-dashboard.md`로 분리.
