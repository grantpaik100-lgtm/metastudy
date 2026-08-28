# StudyMeta FKI 「더하기 창업」 IR Deck Guide

## 핵심 원칙

- StudyMeta는 새로운 LLM이나 AI Tutor가 아니라 **Student-owned, Cross-AI Learner Intelligence Layer**다.
- 일반 AI Memory의 존재를 인정하고, **Memory와 Pedagogical Learner State의 차이**를 설명한다.
- 현재 제품 범위는 **Learner State READ → Teaching Context → Adaptive Interaction → Evidence WRITE**다.
- **Evidence → Learner State 자동 업데이트는 아직 구현되지 않았다.**
- 1,172,995건은 학생 수나 학습효과 검증 건수가 아니라 **learning interactions analyzed**다.
- Demo Learner의 0.35 / 0.75 상태는 **Synthetic Demo Learner / Illustrative learner state**다.

## 슬라이드별 핵심 메시지와 발표자 노트

### 1. Cover — One learner model, across every AI.

StudyMeta는 여러 AI에서 발생한 학습 Evidence를 학생 소유의 지속적인 Learner Model로 연결하고, 어떤 AI든 지금 이 학생에게 맞게 가르치도록 Teaching Context를 제공한다.

발표 노트: StudyMeta는 새로운 AI Tutor나 새로운 LLM이 아니다. 여러 AI와 학습 환경에서 생기는 Learning Evidence를 학생 소유의 지속적인 Learner Model로 축적하고, 지금 이 학생에게 맞는 Teaching Context를 만들어 어떤 AI든 일관되게 가르치도록 하는 레이어다. 오늘은 이미 구현한 Read-Adapt-Write 흐름, 117만 건의 학습 상호작용으로 먼저 검토한 Evidence 후보, FKI에서 검증할 세 가지 가설을 보여준다.

### 2. Problem — Memory ≠ Pedagogical Learner State

AI의 일반 기억은 대화와 선호를 이어주지만, 현재 도움의 강도를 결정하는 학습 상태와는 다르다.

발표 노트: ChatGPT와 Claude도 이미 기억 기능을 갖고 있다. 문제는 기억의 부재가 아니다. “단계별 설명을 선호한다”는 일반 기억과, 독립 해결·힌트 의존·인출 가능성을 근거로 지금 어떤 개입을 해야 하는지는 다른 문제다. StudyMeta는 “How should this AI teach this learner, right now?”에 답한다.

### 3. Insight — 좋은 과외는 판단의 연속

관찰 → 기억 → 판단 → 가르치는 방식 변경의 루프가 개인화의 본질이며, 현재 learner intelligence는 플랫폼마다 분리돼 있다.

발표 노트: ALEKS, StudyFetch, YouLearn 등은 learner modeling의 가치를 이미 보여준다. StudyMeta는 student model을 최초라고 주장하지 않는다. 구조적 공백은 학생의 learner intelligence가 한 서비스 안에만 남고, AI를 바꾸면 이동하지 않는다는 데 있다.

### 4. Solution — Student-owned, Cross-AI, Portable

여러 AI의 Evidence를 하나의 Persistent Learner Model에 연결하고 Pedagogical Policy와 Teaching Context로 되돌려준다.

발표 노트: MCP/API는 연결 수단이지 moat가 아니다. 장기 자산은 cross-platform longitudinal learner data, Evidence normalization/ontology, Evidence → State model, integration network다.

### 5. Product — Evidence를 Teaching Context로

행동 Evidence를 현재 핵심 State인 Procedural Mastery와 Help Need로 해석하고 설명 깊이·힌트 수준·scaffolding 정책으로 바꾼다.

발표 노트: 오른쪽 실제 Learner Context Viewer는 Global Profile, Domain State, Skill State, Recent Learning Events를 분리한다. 제품이 단순 prompt wrapper가 아닌 별도 learner intelligence layer임을 보여준다. Retrievability, Transferability, Multimodal Evidence는 future/experimental 범위다.

### 6. Product Demo — Same AI, Same Question, Different Teaching

일반 AI는 좋은 설명을 먼저 제공하고, StudyMeta context가 있는 AI는 먼저 평가하고 관찰하며 도움 수준을 바꾼다.

발표 노트: Without StudyMeta 답변을 공격하지 않는다. 실제 With StudyMeta 데모는 Synthetic Demo Learner의 Procedural Mastery 0.35↓, Help Need 0.75↑를 읽고 Step-by-step·Socratic·Adaptive Scaffolding을 선택한다. STEP 1 선택형 → STEP 2 직접 인출 → STEP 3 독립 적용 → STEP 4 전이 후 Evidence를 WRITE한다. State 자동 업데이트는 아직 구현 전이다.

### 7. Validation — Evidence 후보를 먼저 검토

두 데이터셋의 1,172,995 interactions에서 Procedural Mastery와 Help Need의 핵심 Evidence 후보 관계가 재현됐다.

발표 노트: 이는 Learner Model 전체, 학습효과, 개인화 효능의 검증이 아니다. Retrievability와 Transferability는 단일 플랫폼 partial, Calibration은 미검증, Misconception은 보류다. 학습량/실력 혼입과 관측 이력 왜곡을 발견해 일부 신호를 수정·제외했다. “We rejected unreliable signals instead of forcing positive results.”

### 8. Competition — Where does the Learner Model live?

StudyMeta의 차별점은 learner modeling 자체가 아니라 학생과 함께 이동하는 AI-independent learner intelligence를 목표로 한다는 점이다.

발표 노트: 경쟁지도에서 StudyMeta는 현재 성취가 아닌 **Target Position**이다. ALEKS와 StudyFetch는 learner modeling의 가치를 입증했다. StudyMeta는 그 intelligence가 학생과 함께 이동할 때 추가 가치가 생기는지 검증한다.

### 9. Why Now / Market — 사용은 이미 일상화

AI 학습은 빠르게 보편화되고 있으며, 다음 질문은 학습 과정에서 생긴 learner intelligence의 소유와 이동성이다.

발표 노트: HEPI 2026 기준 영국 학부생 94%가 평가 과제에 GenAI를 사용했다. Grand View Research는 AI in Education 시장을 2026년 $11.4B에서 2033년 $57.2B, CAGR 25.9%로 전망한다. 이 숫자는 StudyMeta pain·WTP·매출을 검증하지 않으며 category growth의 참고치다.

### 10. Business + FKI Validation — 세 가설

B2C college calculus wedge에서 H1 Pain, H2 Value, H3 Portability를 먼저 검증한 뒤 B2B Learner Intelligence API/MCP로 확장한다.

발표 노트: ₩9,900/month는 price hypothesis다. 12주, 20명 exploratory pilot은 학습효과의 통계적 증명이 아니라 usability, pain, behavioral signal, effect direction, preliminary effect size를 확인하고 후속 controlled experiment를 설계하기 위한 것이다.

### 11. Team + Vision — Built to learn before we claim.

팀은 데이터 검증과 실제 MCP 데모까지 만들었고, 증명하지 못한 부분을 명확히 구분하면서 learner intelligence layer로 확장한다.

발표 노트: 백현승은 Learner Model/Product Design/MCP Architecture, 박나연은 UX/UI, 김아현은 Data/Evidence를 맡는다. 현재 proof는 1.17M interactions analyzed, Evidence Matrix, working MCP prototype, actual Read/Adapt/Write demo다. Learning Science/Psychometrics advisor, Production Engineering, B2B Sales는 다음 단계에서 보완한다.

## 숫자 분류

### 확인된 값 또는 현재 구현 사실

- 1,172,995 learning interactions analyzed
  - ASSISTments: 525,534
  - Junyi Academy: 647,461
- Procedural Mastery: 두 데이터셋에서 핵심 Evidence 후보 관계 재현
- Help Need: 두 데이터셋에서 핵심 Evidence 후보 관계 재현
- Retrievability / Transferability: 단일 플랫폼 검토, partial
- Calibration: not yet validated
- Misconception: deferred
- 구현됨: Learner Context READ, Teaching Context generation, Adaptive tutoring interaction, Evidence WRITE
- 미구현: Automatic Evidence → State Update
- 외부 시장 참고치: $11.4B(2026 estimate) → $57.2B(2033 forecast), CAGR 25.9%
- 외부 adoption 참고치: 영국 학부생 94%가 assessed work에 GenAI 사용(HEPI 2026)

### 가설·계획·목표

- ₩9,900/month: **Price hypothesis**
- 12-week validation: 실행 계획
- 20-user exploratory pilot: 초기 탐색 표본 계획
- H1 Pain / H2 Value / H3 Portability: 검증 전 핵심 가설
- 경쟁지도상의 StudyMeta: **Target Position**
- B2B MAU/API usage/enterprise licensing: 향후 검증할 사업모델

## 사용한 외부 출처

- Grand View Research, AI in Education Market: https://www.grandviewresearch.com/industry-analysis/artificial-intelligence-ai-education-market-report
- HEPI, Student Generative AI Survey 2026: https://www.hepi.ac.uk/wp-content/uploads/2026/03/HEPI-Report-199-Gen-AI-Survey-2026.pdf
- OpenAI, ChatGPT Memory: https://openai.com/index/chatgpt-memory-dreaming/
- Anthropic, Claude memory-enabled reflection: https://www.anthropic.com/news/reflect-with-claude
- ALEKS official product description: https://www.aleks.com/index.html
- StudyFetch Learn Engine: https://sso.studyfetch.com/blog/the-learn-engine
- YouLearn official product page: https://www.youlearn.ai/
- Mindgrasp official product page: https://www.mindgrasp.ai/ai-study-tools

## 내부 근거 자료

- `Chain Rule 설명-withmetastudy.pdf`
- `Chain Rule 설명-withoutmetastudy.pdf`
- `metastudypage.pdf`
- `evidencestate종합_최종매트릭스 (1).md`
- `evidencestate검증_ASSISTments_1차.md`
- `evidencestate검증_Junyi_재현성_2차.md`
- `StudyMeta 한경협 「더하기 창업」 지원서 2~7번 최종안.md`
