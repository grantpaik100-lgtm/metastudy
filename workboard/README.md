# 작업판(workboard) — 계획 → 학습 → 정리 흐름

로컬 작업판 도구에 넣어 쓰는 파일입니다. 작업판 도구 전체(`index.html`, `styles.css`,
`server.mjs`, `board-ops.js`)는 이 저장소에 없고, 여기에는 **바뀐 파일만** 있습니다.

| 파일 | 내용 |
|---|---|
| `workboard-project.json` | 폰 앱 버전 작업판. 화면 10개 · 연결 15개 · 실험 5개 |
| `workboard-project.chatgpt.json` | 같은 10개 화면을 ChatGPT(MCP) 대화 화면으로 바꾼 작업판. 실험 7개 |
| `app.js` | 작업판 앱. 폰 목업, ChatGPT 위젯 목업, 편집 창의 블록 추가 버튼, 흐름도 연결선 배치 규칙 |

## 적용 방법

1. 작업판 폴더의 `app.js`를 이 폴더의 `app.js`로 교체합니다.
2. 서버를 켠 뒤 상단 **불러오기**로 `workboard-project.json`(폰 앱) 또는
   `workboard-project.chatgpt.json`(ChatGPT)을 선택합니다.
   (또는 `node server.mjs --seed workboard-project.json`) 바꾸기 직전 작업판은
   서버의 `data/backups/`에 자동 백업됩니다.

## ChatGPT(MCP) 위젯 목업 만들기

와이어프레임에서 **+ ChatGPT 화면**을 누르거나 화면 **편집** 창을 열면, 정보 블록 아래에
**ChatGPT 블록 추가** 버튼과 실시간 미리보기가 있습니다. 버튼을 누르면 커서 위치에 블록이 들어갑니다.
정보 블록에 아래 머리표가 한 줄이라도 있으면 그 화면은 폰 목업 대신 ChatGPT 대화 화면으로 그려집니다
(와이어프레임 · 흐름도 · 프로토타입 모두).

```text
[사용자] 미적분 중간고사 10월 21일이야        ← 사용자 말풍선
[도구] StudyMeta 사용 중                      ← 도구 호출 표시
[AI] 할 일을 정리했어요.                       ← ChatGPT 답변
[inline] 할 일 체크리스트                      ← 위젯 시작: inline · carousel · fullscreen · pip
- [x] 극한의 정의 복습 | AI 제안               ← 항목 | 배지  ([ ] [x] = 체크박스)
-- 한 단계 아래 항목                            ← 위계
[버튼] 학습 시작 | 수정하기                     ← 바로 위 위젯의 버튼
```

| 위젯 | 그려지는 모습 | 설계 경고(주황) |
|---|---|---|
| Inline 카드 | 대화 속 카드 | 버튼 3개 이상, 항목 7개 이상 또는 위계가 깊을 때 |
| Inline 캐러셀 | 옆으로 넘기는 카드 묶음, 카드마다 첫 버튼 | 카드 3개 미만 · 8개 초과, 버튼 2개 이상 |
| Fullscreen | 대화를 덮는 전체 화면, 입력창은 유지 | 한 화면에 2개 이상 |
| PiP | 대화 위에 떠 있는 작은 창 | 한 화면에 2개 이상 |

`board-ops.js`와 서버는 바꾸지 않았습니다. 블록은 기존 정보 블록(sections) 문자열에 들어가므로
팀원과 실시간으로 함께 고칠 수 있고, AI 요청문 복사에도 이 형식 설명이 포함됩니다.

## 흐름

```text
[계획] 입력 → (PDF 있으면) 자료 분석 → 할 일 체크리스트 (AI 제안 / 내가 추가 구분)
[학습] 범위 선택(단원·개념) → 학습 진행 ⇄ 계획 열람(상시) → 마무리 감지 → 정리하기
                                      ↑ 조금 더 공부하기 ─────────┘
[정리] 구조화(위계 + 이해 체크) → 상태 보기 ⇄ 근거 보기(State · Evidence)
       ├ 체크 안 한 항목 다시 보기 → 학습 진행
       └ 체크리스트에 반영 → 할 일 체크리스트
```

## 러너 모델과 맞춘 부분

- 정리 1의 이해 체크박스는 Evidence `perceived_understanding`('이해했다'는 응답)으로만 기록하고
  State를 직접 바꾸지 않습니다 (Raw Input ≠ State Update).
- 정리 2의 숫자는 `intervention_response` State가 아니라 도움 관련 관찰(힌트 요청 · 힌트 받고
  해결 · 설명 듣고 해결)의 개수입니다. `intervention_response`는 AGENTS.md / design.md 8-2에서
  학생 비노출로 정해져 있어, 이 State를 숫자로 보여줄지는 실험 `exp-intervention-number`로 남겼습니다.
- 근거 화면은 학생용 라벨만 쓰고, 변화 없는 상태는 '변화 없음'으로 표시합니다.
- 합산 점수는 만들지 않습니다.
