# 작업판(workboard) — 계획 → 학습 → 정리 흐름

로컬 작업판 도구에 넣어 쓰는 파일입니다. 작업판 도구 전체(`index.html`, `styles.css`,
`server.mjs`, `board-ops.js`)는 이 저장소에 없고, 여기에는 **바뀐 파일만** 있습니다.

| 파일 | 내용 |
|---|---|
| `workboard-project.json` | 새 작업판 데이터. 화면 10개 · 연결 15개 · 실험 5개 |
| `app.js` | 작업판 앱. 새 화면 10개의 폰 목업과 흐름도 연결선 배치 규칙을 바꿈 |

## 적용 방법

1. 작업판 폴더의 `app.js`를 이 폴더의 `app.js`로 교체합니다.
2. 서버를 켠 뒤 상단 **불러오기**로 `workboard-project.json`을 선택합니다.
   (또는 `node server.mjs --seed workboard-project.json`) 바꾸기 직전 작업판은
   서버의 `data/backups/`에 자동 백업됩니다.

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
