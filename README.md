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

## 구조

- `index.html`: HTML, CSS, Vanilla JavaScript가 모두 포함된 배포 파일 (Learner Model 파이프라인 데모)
- `AGENTS.md`: **작업 지침** — 러너 모델 보존 규칙, 확정된 설계 결정, 코딩 규칙. 이 저장소에서 작업하기 전에 먼저 읽으세요
- `design.md`: 학생용 UI 설계 문서 (과목 대시보드/즉시 피드백/학습 플래너)
- `student-ui-prototype.html`: `design.md` 기준 화면 A/B/C 와이어프레임 프로토타입
- `md/`: 로컬 연구 노트이며 공개 저장소에는 업로드하지 않음
