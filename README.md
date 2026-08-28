# StudyMeta Learner Model

StudyMeta Learner Model v0.1의 Evidence → Student State 업데이트 구조를 살펴보는 단일 페이지 인터랙티브 데모입니다.

## 실행

별도 설치 없이 `index.html`을 브라우저에서 열면 됩니다.

## 수정 후 배포

```bash
git add index.html
git commit -m "Update learner model demo"
git push
```

Vercel에서 이 GitHub 저장소의 `main` 브랜치를 연결하면, 이후 `git push`마다 자동으로 새 버전이 배포됩니다.

## MCP 백엔드 실행 (선택)

`service-prototype.html`이 실제 MCP 학습자 컨텍스트를 읽어오게 하려면 별도
백엔드를 로컬에서 띄워야 합니다. 연결 정보를 채우는 방법은 `MCP_INTEGRATION.md`
를 먼저 읽어주세요.

```bash
npm install
cp .env.example .env   # 값 채우기
npm run dev             # http://localhost:3000
```

값을 채우지 않아도 서버는 뜨고, 화면은 정적 예시 값을 그대로 보여줍니다.

## 구조

- `index.html`: HTML, CSS, Vanilla JavaScript가 모두 포함된 배포 파일 (Learner Model 파이프라인 데모)
- `AGENTS.md`: **작업 지침** — 러너 모델 보존 규칙, 확정된 설계 결정, 코딩 규칙. 이 저장소에서 작업하기 전에 먼저 읽으세요
- `design.md`: 학생용 UI 설계 문서 (과목 대시보드/즉시 피드백/학습 플래너)
- `service-prototype.html`: 전체 서비스 프로토타입. 가입 → 온보딩(기본 정보 / 과목·자료·시험 등록 / 자료 분석 / 학습 연결 / 플래너 초안) → 화면 A·B·C까지 흐름 전체를 담은 단일 파일. 학습(문제 풀이)은 홈이 아니라 MCP로 연결된 Claude·ChatGPT 같은 프론티어 모델 앱에서 이루어지고, 홈은 학습 현황·최근 기록·플래너만 보여줌. 대학생과 기업 직무교육 학습자가 실제로 써볼 수 있는 화면으로 만들어 리뷰 전용 UI와 이모지는 없음. 예시 과목(미적분학 › Chain Rule)은 아래 MCP 백엔드가 배포되어 있으면 실제 학습자 컨텍스트로, 아니면 정적 예시 값으로 표시됨
- `api/`, `lib/`, `scripts/`, `package.json`: `service-prototype.html`이 MCP 서버의 실제 학습자 컨텍스트를 읽어오는 Vercel 서버리스 백엔드. 연결 정보를 채우는 방법은 `MCP_INTEGRATION.md` 참고
- `MCP_INTEGRATION.md`: **MCP 연동 담당 팀원이 읽어야 할 문서** — 채워야 할 환경변수, 확인해야 할 인증 방식, 로컬 실행법
- `md/`: 로컬 연구 노트이며 공개 저장소에는 업로드하지 않음
