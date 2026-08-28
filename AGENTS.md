# AGENTS.md — StudyMeta 저장소 작업 지침

이 저장소에서 작업하는 에이전트(및 사람)를 위한 규칙입니다.
목표는 **`index.html`의 Learner Model을 손상시키지 않으면서** `design.md`의 UI 설계를
프로토타입으로 구현하는 것입니다.

---

## 0. 가장 중요한 규칙 3가지

1. **`index.html`의 러너 모델은 원본 그대로 보존한다.** Evidence/State 딕셔너리와 9개
   시나리오는 이 프로젝트의 기준 데이터다. 새 화면을 만든다고 이 파일을 고치지 않는다.
2. **새 프로토타입은 별도 파일로 만든다.** `index.html`을 수정해서 서비스 프로토타입으로
   바꾸지 않는다. `index.html`은 Vercel에 배포 중인 연구자용 모델 데모로 계속 남는다.
3. **`design.md`에 확정된 결정은 다시 뒤집지 않는다.** 바꿔야 할 이유가 생기면 임의로
   바꾸지 말고 사용자에게 먼저 확인한다.

---

## 1. 저장소 구조

| 파일 | 역할 | 수정 가능? |
|---|---|---|
| `index.html` | **Learner Model 파이프라인 데모** (연구자/설계자용). Evidence → State → Teaching Decision 구조를 시나리오로 탐색. Vercel 배포 중 | ⚠️ 러너 모델 데이터·로직은 **수정 금지**. 그 외 스타일 수정도 사용자 승인 후에만 |
| `design.md` | 학생용 UI 설계 문서 (화면 A/B/C + 온보딩). 결정 사항의 단일 출처 | ✅ 새 결정이 나오면 버전을 올려 갱신 |
| `student-ui-prototype.html` | `design.md` 기준 화면 A/B/C 와이어프레임 | ✅ |
| `README.md` | 저장소 개요 | ✅ 파일 추가/삭제 시 구조 목록 갱신 |
| `md/` | 로컬 연구 노트 (`.gitignore` 처리, 공개 저장소에 올리지 않음) | ✅ 단, 커밋되지 않음 |
| `AGENTS.md` | 이 문서 | ✅ |

---

## 2. 보존해야 할 Learner Model (`index.html`)

### 2-1. 절대 변경 금지 대상

`index.html` 안의 아래 세 상수는 **값도, 키 이름도, 순서도 바꾸지 않는다**:

- `evidenceTypes` — 7개 카테고리 / 24개 Evidence
- `stateTypes` — 3개 그룹 / 9개 State
- `scenarios` — 9개 시나리오

새 화면에서 이 데이터가 필요하면 **복사해서 쓰되, 원본 id를 그대로 유지**한다.
id를 임의로 바꾸거나 항목을 추가·삭제하지 않는다.

### 2-2. Evidence Dictionary (7 카테고리 · 24 항목)

| 카테고리 | Evidence id |
|---|---|
| PERFORMANCE | `correct`, `incorrect`, `partial_success` |
| ASSISTANCE | `independent_success`, `hint_requested`, `success_after_hint`, `success_after_explanation` |
| ERROR | `first_error`, `repeated_error`, `misconception_candidate`, `self_correction` |
| MEMORY / RETRIEVAL | `immediate_retrieval_success`, `delayed_retrieval_success`, `delayed_retrieval_failure`, `relearning` |
| TRANSFER | `novel_application_success`, `novel_application_failure` |
| METACOGNITION | `confidence_report`, `perceived_understanding`, `perceived_difficulty`, `error_awareness` |
| PROCESS | `response_time`, `stuck_duration`, `attempt_count` |

### 2-3. Student State (3 그룹 · 9 항목)

| 그룹 | State id |
|---|---|
| STUDENT × SKILL | `conceptual_mastery`, `procedural_mastery`, `retrievability`, `transferability`, `help_need`, `misconception`, `state_confidence` |
| STUDENT × DOMAIN | `calibration` |
| STUDENT × DOMAIN × INTERVENTION | `intervention_response` |

### 2-4. Scenario (9개)

각 시나리오는 `{ id, title, rawInput, evidence[], stateUpdates{}, explanation, decisionTitle, decision }`
구조를 가진다. 시나리오 id 목록:

`independent-correct`, `perceived-understanding`, `hint-success`, `hint-self-correction`,
`repeated-error`, `delayed-success`, `delayed-failure`, `novel-application`,
`overconfident-incorrect`

새 화면에서 콘텐츠가 필요하면 **이 9개를 소스로 쓴다**. 임의로 새 시나리오를 지어내지 않는다
(필요하면 사용자에게 먼저 확인).

### 2-5. 모델의 3원칙 (UI가 깨뜨리면 안 되는 것)

1. **Raw Input ≠ State Update** — 입력은 Evidence를 거쳐서만 State를 변경한다.
   원본 입력이 직접 State를 바꾸는 UI를 만들지 않는다.
2. **하나의 Input → 여러 Evidence** — 한 관찰에서 성과·도움·오류 Evidence가 함께 생길 수 있다.
   Evidence를 1개만 표시하도록 강제하지 않는다.
3. **Evidence가 없는 State는 유지** — 모든 Evidence가 모든 State를 바꾸지는 않는다.
   변화 없는 State를 "0" 또는 "하락"으로 표시하지 않는다. "변화 없음"으로 둔다.

---

## 3. 새 프로토타입을 만들 때

### 3-1. 데이터 재사용 방식

- `evidenceTypes` / `stateTypes` / `scenarios`를 새 파일에 복사해 쓴다. 원본 id를 유지하되,
  화면에는 `design.md` 8-1 / 8-2 표의 **학생용 한국어 라벨**로 변환해서 보여준다.
- `scenario.stateUpdates`의 방향 표기(`↑` / `↓` 포함 여부)로 상승/하락/중립을 판정한다.
  이 판정 로직을 바꾸지 않는다.

### 3-2. 학생 노출 규칙

| 대상 | 학생 화면 노출 |
|---|---|
| snake_case 내부 id (`conceptual_mastery` 등) | ❌ 노출 금지. 반드시 한국어 라벨로 변환 |
| `intervention_response` | ❌ 완전 비노출 (내부 튜닝 전용) |
| `state_confidence` | ⚠️ 기본 화면 미노출. "자세히 보기"에서만 |
| `transferability`, `calibration` | ⚠️ "자세히 보기" 전용 |
| 나머지 SKILL State | ✅ 카드/배지로 노출 |

- Teaching Decision은 **지시형이 아니라 제안형**으로 쓴다.
  (예: "개입을 줄이고 독립 수행을 확인" → "다음엔 힌트 없이 한번 도전해볼까요?")
- 정답을 대신 말해주지 않고 다음 행동을 제안하는 톤을 유지한다.

### 3-3. `design.md` 확정 사항 (임의 변경 금지)

아래는 사용자와 합의된 결정이다. 다시 제안하거나 되돌리지 않는다:

- **주 사용자**: 전공 공부 중인 대학생 (교사/연구자용 화면 아님)
- **화면 구성**: A(과목별 학습 현황) / B(즉시 피드백) / C(학습 플래너) + 온보딩
- **과목**: 프리셋 선택이 아니라 학생이 직접 등록
- **학습자료 업로드**: 스킵 가능 (필수 아님)
- **시험 일정**: 과목당 여러 개 등록 가능
- **온보딩 진단 테스트**: 없음 (자료 분석 + 실제 문제풀이로 State를 채움)
- **학습 플래너**: 드래그로 일정 재배치 가능
- **집계 로직 없음**: State끼리, 과목끼리 합산해 종합 점수를 만들지 않는다
- **시계열/망각곡선 그래프 없음**: 배지와 짧은 문구로만 표현
- **Evidence-State 연결선 다이어그램 없음**: 색상 강조와 설명 문장으로 대체
- **배지 우선순위**: 확인 필요 > 도움이 필요해요 > 복습 추천 (카드당 최대 2개)

---

## 4. 코딩 규칙

- **단일 HTML 파일**: HTML + CSS + Vanilla JS를 한 파일에 담는다. 빌드 도구, npm,
  프레임워크, 외부 CDN 의존성을 추가하지 않는다 (`index.html`과 동일한 방식).
- **디자인 토큰**: `index.html`의 CSS 변수를 그대로 재사용해 톤을 통일한다.

  ```
  --page --surface --surface-soft --line --line-strong
  --text --muted --muted-light
  --blue --blue-dark --blue-soft --blue-line
  --green --green-soft  --amber --amber-soft  --red --red-soft
  --radius-lg --radius-md --shadow
  ```

  토큰을 추가해야 하면 같은 네이밍 규칙을 따른다 (예: `--green-line`, `--red-line`).
- **UI 언어**: 한국어. 학생에게 말 걸듯 부드러운 존댓말.
- **접근성**: 의미 있는 요소는 `<button>`을 쓴다(`div` + onclick 금지).
  토글 상태는 `aria-pressed`, 동적 영역은 `aria-live`로 알린다.
  `:focus-visible` 스타일을 남긴다.
- **반응형**: 모바일(≤640px)에서도 가로 스크롤 없이 동작해야 한다.
- **`prefers-reduced-motion`** 존중 (`index.html`에 이미 패턴 있음).

---

## 5. 작업 흐름

1. **브랜치**: `main`에 직접 커밋하지 않는다. 작업용 브랜치에서 작업하고 푸시한다.
2. **검증**: HTML 프로토타입을 만들면 헤드리스 브라우저로 주요 인터랙션을 클릭해
   콘솔/런타임 오류가 없는지 확인한 뒤 커밋한다.

   ```bash
   NODE_PATH=/opt/node22/lib/node_modules node -e "..."  # playwright, chromium은 설치되어 있음
   ```

   Chromium 경로: `/opt/pw-browsers/chromium` (`playwright install` 실행 불필요)
3. **`index.html` 회귀 확인**: 러너 모델 관련 파일을 건드렸다면 아래로 개수를 검증한다.
   Evidence 24 / State 9 / Scenario 9가 유지되어야 한다.
4. **커밋**: 무엇을 왜 바꿨는지 쓴다. 모델 식별자(모델명)는 커밋 메시지나 코드에 넣지 않는다.
5. **병합**: `main` 병합은 **사용자 승인 후에** 한다.

---

## 6. 작업 전/후 체크리스트

작업을 마치기 전에 확인:

- [ ] `index.html`의 `evidenceTypes` / `stateTypes` / `scenarios`를 수정하지 않았다
- [ ] 새 화면은 별도 파일에 만들었다
- [ ] 학생 화면에 snake_case 내부 id가 노출되지 않는다
- [ ] `intervention_response`가 학생 화면에 노출되지 않는다
- [ ] 변화 없는 State를 "하락"이나 "0"으로 표시하지 않는다
- [ ] `design.md`의 확정 사항(3-3)을 임의로 바꾸지 않았다
- [ ] 외부 의존성(CDN, npm 패키지)을 추가하지 않았다
- [ ] 헤드리스 브라우저로 오류 없이 동작하는 것을 확인했다
- [ ] 모바일 폭에서 가로 스크롤이 생기지 않는다
- [ ] 파일을 추가/삭제했다면 `README.md`의 구조 목록을 갱신했다
