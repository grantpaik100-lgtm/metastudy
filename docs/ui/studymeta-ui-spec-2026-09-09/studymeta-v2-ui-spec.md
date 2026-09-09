# StudyMeta v2 UI 통합 명세

- 버전: 1.0
- 작성일: 2026-09-09
- 상태: 구현 기준안
- 제품 정의: 외부 AI용 Learner Model 학습 관제탑

## 1. 목표

StudyMeta는 ChatGPT·Claude 등 외부 AI에서 진행된 학습을 `Learning Event → Evidence → State`로 처리한다. 학생 웹은 자신의 학습 상태와 기록을 관리하고, 관리자 웹은 State 변화·미변화·검증·정정을 분석한다. MCP/In-chat UI는 학습 순간에 필요한 확인과 선택만 제공한다.

학생 웹 안에 별도의 문제풀이 화면을 만들지 않는다.

## 2. 사용자와 권한

### 학생

- 회원가입 후 기본 학생 역할
- 자신의 learner data만 조회
- 자신의 정정 요청 생성
- State, Evidence 판정, 관리자 역할 직접 수정 금지

### 관리자

- 승인된 UUID 기반 관리자 역할
- 학생 목록과 State·Evidence·변경/미변경 로그 조회
- 향후 별도 `evidence_reviewer` capability가 구현된 경우에만 Evidence 정정·무효화와 재계산 승인
- State 값 직접 입력 금지

### 공통 불변 조건

- Raw Input이 State를 직접 바꾸지 않는다.
- 하나의 Input에서 여러 Evidence가 생성될 수 있다.
- Evidence가 없는 State는 유지한다.
- 과목·State 종합점수를 만들지 않는다.
- scientific validation, AI confidence, operation mode를 서로 혼동하지 않는다.

## 3. 시각 디자인

ADR-001의 Academic Navy를 사용한다.

- 짙은 남색 브랜드·탐색 영역
- 옅은 아이보리 페이지 배경
- 흰색 정보 카드
- 밝은 파랑 주요 행동
- outline SVG 아이콘
- 기본 말투 `calm_coach`
- 학생/관리자 웹 밝은 테마, MCP UI host light/dark 대응

## 4. 학생 웹

### 4.1 탐색

```text
홈
학습 상태
학습 기록
연결 및 내 정보
```

### 4.2 홈

표시:

- 현재 과목·개념
- 마지막 학습 시각
- 외부 AI 연결 상태
- 이어갈 수 있는 세션
- 핵심 State 3개
- 최근 State 변화와 변화 없음
- 최근 Session Summary
- 다음 학습 제안 1개

행동:

- AI에서 학습 이어가기
- 최근 세션 보기
- 학습 상태 보기
- 연결 관리

### 4.3 학습 상태

탐색 구조:

```text
도메인 → 과목 → 개념 → State
```

기본 노출:

- 개념 이해
- 절차 숙련
- 도움 필요도

조건부 노출:

- 기억 인출
- 오개념 가능성

상세:

- 전이 가능성
- 자기 판단 정확도(calibration)
- State 추정 신뢰도

비노출:

- intervention response

각 State 카드:

- 학생용 한국어 라벨
- 현재 표시 단계와 status
- 마지막 평가 시각
- 최근 변경/유지
- Evidence 수
- 짧은 설명
- 근거 보기
- 이 추정이 이상해요

`unknown`은 `아직 판단할 학습 기록이 충분하지 않아요.`로 표시한다.

### 4.4 근거 보기

- 구조화된 Evidence 요약
- 발생 세션과 외부 AI
- 연결된 State
- 변경 여부와 미변경 이유
- 계산 시각과 rule version
- validation은 기본 비노출, 학생이 추정 방식을 요청한 경우 DB claim/scope/limitations 기반 짧은 설명

### 4.5 학습 기록

- 세션 날짜, 과목·개념, 외부 AI
- 정상 종료·중단·자동 종료 상태
- 학습 활동 수
- Evidence 수
- 변경 State 수와 미변경 State 수
- 구조화된 Session Summary
- 기간·과목·개념·AI·변경 여부 필터

### 4.6 정정

학생 선택:

- 추정이 너무 높음
- 추정이 너무 낮음
- 다른 개념에 연결됨
- Evidence 판정이 잘못됨
- 판단하기 어려움

정정 상태:

- 접수
- 검토 중
- Evidence 유지/정정/무효화
- 재계산 대기
- 재계산 완료
- 변경 없음

정정 요청은 State를 직접 덮어쓰지 않는다.

### 4.7 연결 및 내 정보

- 외부 AI 연결 상태와 최근 동기화
- 연결·재연결·연결 해제
- 데이터 접근 범위
- 등록 과목과 활성 과목
- 말투 preset
- 데이터 열람·정정·삭제 요청

구현되지 않은 삭제 기능을 작동하는 버튼처럼 표시하지 않는다.

## 5. 관리자 웹

### 5.1 탐색

```text
관리자 홈
학생
State 로그
검증 관리
시스템 상태
```

### 5.2 관리자 홈

요약:

- 전체/최근 활동 학생 수
- 열린 세션 수
- State 변경/미변경 평가 수
- 정정 요청, 재계산 대기, 처리 실패 수
- not assessed/under review 규칙 수

주의:

- 처리 실패
- 검토 대기 정정
- unsupported 규칙의 운영 사용 시도
- snapshot 없는 계산
- 오래 종료되지 않은 세션
- provisional concept

학생 평균 점수나 순위를 만들지 않는다.

### 5.3 학생 목록과 상세

목록:

- 학생 식별 정보
- 등록 과목과 현재 개념
- 마지막 활동
- 최근 State 변화
- 미해결 정정
- 세션·계정 상태

상세 탭:

```text
요약 | 현재 State | 학습 타임라인 | Evidence | 정정 요청 | 계산 정보
```

### 5.4 State 로그

변경 로그:

- 학생, 개념, State
- 이전/새 값과 표시 단계
- 변화 방향
- Evidence reference
- rule/parameter/model version
- calculation run과 validation snapshot
- 변경 시각

미변경 로그:

- 현재 값
- 미변경 이유
- Evidence 존재 여부
- 규칙 활성 여부
- 재계산 필요 여부

미변경 이유:

- 관련 Evidence 없음
- 최소 Evidence 미충족
- 입력 무효화 또는 삭제
- State 연결 규칙 없음
- 규칙 비활성화
- 운영 정책 차단
- 이전 결과와 동일
- 재계산 대기

### 5.5 검증 관리

24개 Evidence 각각에 대해 다음 세 층을 분리한다.

- A: Evidence 정의
- B: Evidence 생성 규칙
- C: Evidence → State 갱신 규칙

표시:

- validation status
- claim과 scope
- supporting/contradicting/study refs
- limitations
- reviewer와 시각
- 평가 버전과 변경 이력
- operation mode

검증 정보 변경은 ADR-002의 승인 정책을 따른다.

### 5.6 시스템 상태

- 처리 실패와 재시도
- 재계산 대기
- model/rule/parameter set version
- validation snapshot
- API와 MCP 연결 상태

관리자는 재처리를 요청할 수 있으나 State 값을 직접 입력하지 않는다.

## 6. MCP/In-chat UI

MCP UI는 하나의 거대한 대시보드가 아니라 상황별 작은 카드로 제공한다. UI가 없는 호스트에서도 tool의 text content만으로 동일 작업을 수행할 수 있어야 한다.

### 6.1 Learner Context 표시 시점

1. 새 세션 시작
2. 이전 세션 재개
3. 과목·개념의 큰 전환
4. State의 의미 있는 재계산

### 6.2 학습 시작 카드

- 과목·현재 개념
- 마지막 세션
- 핵심 State 3개, 필요 시 최대 5개
- 최근 Evidence 요약
- 추천 학습 방식
- Context 갱신 시각

행동:

- 이전 세션 이어가기
- 이전 세션을 종료하고 새로 시작
- 다른 개념 선택

문체 예:

> 이전 학습 내용을 불러왔습니다. 연쇄법칙 학습을 이어서 진행할 수 있습니다.

### 6.3 도움 방식

다음 다섯 개로 확정한다.

1. 힌트만 주세요
2. 개념부터 설명해 주세요
3. 질문으로 이끌어 주세요
4. 먼저 혼자 풀어볼게요
5. 비슷한 예시를 보여주세요

선택은 teaching preference이며 State를 즉시 변경하지 않는다.

### 6.4 불확실한 개념 질문

일반 문구 `어떤 개념을 이어서 학습할까요?`를 사용하지 않는다. 학생의 실제 표현과 불확실한 이유를 포함한다.

예:

> 말씀하신 ‘아까 그 미분 방법’이 어떤 방법인지 제가 정확히 이해하지 못했어요. 연쇄법칙과 곱의 미분법 중 어느 쪽을 다시 보고 싶으신가요?

후보에는 한 줄 설명을 붙이고 2~3개로 제한한다.

### 6.5 개념 전환 알림

확신 높음:

> 방금까지 연쇄법칙을 살펴봤고, 현재 대화는 음함수 미분으로 이어지고 있습니다. 지금부터의 학습 기록은 새 개념으로 구분하겠습니다.

행동:

- 이대로 계속하기
- 개념 바로잡기

승인을 기다리지 않는 알림이다. 이전/새 개념, 감지 시각, source events, confidence, rule/model version, 사용자 정정과 최종 결과를 append-only 로그로 남긴다.

확신 낮음일 때만 명시적 개념 선택을 요청한다. 목록에 없는 개념은 provisional concept로 기록한다.

### 6.6 State 근거와 피드백

근거 카드:

- 구조화된 학습 행동
- Evidence 분류
- 연결 State
- 변경·미변경 결과와 이유
- rule version

피드백:

- 이 추정이 맞아요
- 너무 높게 추정됐어요
- 너무 낮게 추정됐어요
- 다른 개념이에요
- Evidence 판정이 잘못됐어요

피드백은 correction request이며 관리자 검토와 backend 재계산을 거친다.

### 6.7 Session Summary

지원되는 backend가 생성한 세션 요약을 표시한다. 중단 시 자동 저장·draft 생성은 후속 backend 기능이며 UI가 성공한 것처럼 표시하지 않는다.

```text
SESSION SUMMARY
├─ 세션 정보: 과목 · 개념 · 시간 · 종료 상태
├─ 학습 활동: 풀이 · 힌트 · 수정 횟수
├─ 분석 흐름
│  Learning Event → Evidence → State 결과
├─ State 결과
│  변경 · 유지 · 판단 보류와 이유
├─ synthetic fixture에서만 가능한 근거 발언
│  최대 2개, 각 160자/2문장 이하 (실제 원문 보존은 아직 미구현)
└─ Next step: 다음 행동 1개
```

중단 안내:

> 여기까지의 학습 기록은 자동 저장했습니다. 다음에 이어서 진행하거나 현재 기록을 요약할 수 있습니다.

### 6.8 `ui/message` fallback

자동 메시지 전송을 먼저 시도한다. 지원하지 않거나 실패하면 동일한 문구와 복사 버튼을 제공한다. 전송 성공 전에는 세션이나 State가 변경된 것처럼 표시하지 않는다.

## 7. 로딩·빈 상태·오류

- 데이터 로딩: spinner보다 skeleton 우선
- unknown State: 빈 그래프 대신 설명 문구
- 연결 끊김: 재연결과 마지막 성공 시각 표시
- 계산 중: 이전 값을 유지하고 `재계산 중` 상태 표시
- tool/UI 미지원: text content와 복사 fallback
- 오류 메시지에 token, 이메일, Supabase 원문 오류를 포함하지 않는다.

## 8. 반응형과 접근성

- 767px 이하 테이블을 카드로 전환
- 의미 있는 조작은 button 사용
- 키보드 focus-visible 제공
- 동적 결과는 적절한 live region 사용
- 색 외에 라벨·아이콘으로 상태 구분
- `prefers-reduced-motion` 존중
- 모바일 가로 스크롤 없음

## 9. 성능·토큰

ADR-003을 따른다.

- 매 메시지 MCP 호출 금지
- 세션 시작 compact context
- context version과 delta
- 모델에 필요한 State/Evidence만 전달
- UI 상세와 model-visible context 분리
- Event 저장과 State 비동기 계산 분리
- latency, cache, token estimate 계측

## 10. 구현 순서

### UI-0: 명세와 mock contract

- 이 문서를 v2 작업 브랜치에 인수
- 표시용 DTO와 mock data 고정
- demo/synthetic 라벨 명시

### UI-1: MCP 핵심 시안

- Learner Context 카드
- 구조화된 Session Summary
- host light/dark
- UI 미지원 fallback

### UI-2: 학생 웹

- 홈
- 학습 상태
- 학습 기록과 Session Summary
- 연결·말투 설정

### UI-3: 관리자 웹

- 학생 목록·상세
- State 변경/미변경 로그
- 검증 matrix
- 정정 검토·재계산 승인

### UI-4: 실제 v2 API 연결

- Stage 2B user-scoped/admin RPC 사용
- 실제 사용자 A/B 격리
- 로딩·오류·권한 실패

### UI-5: 전체 검증

- 모바일
- 접근성
- MCP host 호환
- 성능·토큰 계측
- 회귀 테스트

## 11. 완료 기준

- 학생은 자신의 데이터만 본다.
- 관리자는 허용된 분석만 본다.
- 학생 UI에 내부 snake_case와 intervention response가 노출되지 않는다.
- unknown, unchanged, decrease가 구분된다.
- State 직접 수정 기능이 없다.
- 관리자 정정은 Evidence 이력과 재계산 run을 남긴다.
- Session Summary가 구조도로 표시된다.
- MCP UI 미지원 환경에서도 핵심 기능을 사용할 수 있다.
- 색만으로 상태를 전달하지 않는다.
- 모바일 가로 스크롤이 없다.
- 기존 Evidence 24, State 9, Scenario 9를 변경하지 않는다.
