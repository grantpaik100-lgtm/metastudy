# StudyMeta IR 시장조사 자료

> 조사일: 2026년 9월 7일
> 용도: IR 피칭 "시장조사 & 경쟁 비교" 파트(1분 30초) 근거자료
> 관련 문서: `IR_PITCH_STRUCTURE.md`

**⚠️ 인용 시 주의**: 아래 수치는 웹 검색을 통해 수집했으며, 각 항목에 출처 링크를 표기했습니다.
다만 이 환경의 네트워크 정책상 일부 원문 페이지(교육부·KDI·SPRi·anthropic.com·openai.com 등)에
직접 접근이 차단되어 **검색 결과 요약을 통해 확인한 수치**가 포함되어 있습니다.
발표 슬라이드에 넣기 전 [§9 검증 체크리스트](#9-발표-전-검증-체크리스트)의 항목은 원문을 직접 확인하세요.

---

## 1. 한 장 요약 (슬라이드에 그대로 쓸 수 있는 5개 숫자)

| # | 숫자 | 의미 | 출처 |
|---|---|---|---|
| 1 | **233만 명** | 국내 대학 학부 재적학생(일반대 183.8만 + 전문대 49.4만), 우리의 1차 타깃 모수 | [교육부·KEDI 2025 교육기본통계](https://eiec.kdi.re.kr/policy/materialView.do?num=270346) |
| 2 | **대학생 92%** | AI 도구를 학습에 사용 중 — 시장은 이미 형성됨, 문제는 "어떻게 쓰느냐" | [AI매터스](https://aimatters.co.kr/news-report/ai-report/31315/) |
| 3 | **45.9%** | AI 사용 대학생 중 사고력·창의력 저하를 우려 — StudyMeta의 문제의식과 정확히 일치 | [AI매터스](https://aimatters.co.kr/news-report/ai-report/31315/) |
| 4 | **-39%** | Chegg 2025년 매출 감소율(전년 $617.6M → $376.9M), AI가 기존 학습보조 시장을 파괴 중 | [CNBC](https://www.cnbc.com/2025/10/27/chegg-slashes-45percent-of-workforce-blames-new-realities-of-ai.html) |
| 5 | **10,000개+** | 운영 중인 공개 MCP 서버 수(2026) — 우리가 올라탈 표준이 이미 산업 표준이 됨 | [Digital Applied MCP 통계](https://www.digitalapplied.com/blog/mcp-adoption-statistics-2026-model-context-protocol) |

**핵심 메시지 한 줄**:
> "대학생 92%가 이미 AI로 공부하지만, 그중 절반이 '이렇게 공부해도 되나' 불안해합니다.
> 시장은 이미 있고, 비어 있는 건 **학습자를 기억하는 계층**입니다."

---

## 2. 시장 규모 (TAM / SAM / SOM)

### 2-1. Bottom-up 산정 (권장 — 발표에 이걸 쓰세요)

| 구분 | 산정 | 규모 | 근거 |
|---|---|---|---|
| **TAM** | 국내 대학 재적학생 268.3만 명 × 연 11.9만 원(월 9,900원) | **약 3,190억 원/년** | 재적학생: 학부 233.2만 + 대학원 35.2만 |
| **SAM** | 학부생 233.2만 × 30%(전공 학습 부담이 높고 유료 전환 가능한 계열·학년) × 연 11.9만 원 | **약 830억 원/년** | AI 정기 사용률 85.5%를 상한으로 두고 보수적으로 30% 적용 |
| **SOM (3년)** | SAM의 1~2% 침투 | **약 8억~17억 원/년** | B2C 기준. B2B 대학 라이선스 별도 |
| **SOM + B2B** | 대학 10곳 × 연 2,000만~5,000만 원 | **+2억~5억 원/년** | 정부 AI 교육 지원사업 예산이 실제 지불 여력 (§5-4) |

> ⚠️ 위 SAM/SOM의 **비율 가정(30%, 1~2%)은 우리 팀의 가정**입니다. 슬라이드에는
> "가정: 유료 전환 가능 세그먼트 30%"처럼 가정임을 명시하세요. 심사위원이 가장 많이 파고드는 지점입니다.

**계산 근거 상세**:
- 2025년 국내 고등교육기관 재적학생 **301만 6,724명** (전년 대비 +9,482명, +0.3%)
  - 일반대학 183만 7,620명 / 전문대학 49만 4,057명 / 대학원 35만 1,774명 / 교육대학 1만 3,999명 / 기타 31만 9,274명
  - 고등교육기관 421개교 (일반대 189, 교대 10, 전문대 130, 대학원대 44, 기타 48)
  - 기준일 2025.4.1, 조사 주체 교육부·한국교육개발원(KEDI)
  - 출처: [KDI 경제교육·정보센터](https://eiec.kdi.re.kr/policy/materialView.do?num=270346) · [국회도서관 국가전략포털](https://nsp.nanet.go.kr/plan/subject/detail.do?newReportChk=list&nationalPlanControlNo=PLAN0000056345) · [대한민국교육신문](https://www.kedupress.com/news/article.html?no=311729) · [교육플러스](https://www.edpl.co.kr/news/articleView.html?idxno=17976)
  - 원자료: [고등교육통계조사 (KEDI)](https://hi.kedi.re.kr/) · [교육부 교육통계](https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=351&boardSeq=102240&lev=0&s=moe&m=0310&opType=N)
- 학부 타깃 모수 = 일반대학 183.8만 + 전문대학 49.4만 = **233.2만 명**

### 2-2. Top-down 참고치 (보조 지표로만)

| 시장 | 규모 | 연도 | CAGR | 출처 |
|---|---|---|---|---|
| 국내 에듀테크 | 7조 3,257억 원 → **9조 9,833억 원** | 2021 → 2025 | 8.5% | [전자신문](https://www.etnews.com/20220630000153) · [SPRi 소프트웨어정책연구소](https://spri.kr/posts/view/22938?code=data_all&study_type=industry_trend) |
| 국내 에듀테크 | **10조 원 돌파 전망** | 2026 | — | [전자신문](https://www.etnews.com/20220630000153) |
| 한국 개인화 학습 | $1.0B → **$2.4B** | 2025 → 2033 | 11.2% | [Verified Market Reports](https://www.verifiedmarketreports.com/product/personalized-learning-market/) |
| 글로벌 AI 튜터 | $3.55B → **$6.45B** | 2025 → 2030 | — | [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/ai-tutors-market) |
| 글로벌 AI in Education | $5.50B → **$70.55B** | 2025 → 2035 | 29.07% | [SNS Insider](https://www.snsinsider.com/reports/ai-in-education-market-8289) |
| 글로벌 AI in Education | — | 2025→2030 | **31.2%** | [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/ai-in-education-market) |
| **APAC** AI in Education | $2,282.9M → **$18,214.1M** | 2025 → 2033 | 28.1% | [Grand View Research](https://www.grandviewresearch.com/horizon/outlook/ai-in-education-market/asia-pacific) |
| APAC AI 튜터링 점유율 | 글로벌 **38.2%** (약 $2.5B), 최대 지역 | 2025 | — | [Grand View Research](https://www.grandviewresearch.com/industry-analysis/ai-tutors-market-report) |

> ⚠️ **Top-down 수치는 조사기관마다 편차가 매우 큽니다.** 글로벌 AI 튜터 2030년 전망만 해도
> $6.45B ~ $31.5B로 5배 차이가 납니다([Mordor](https://www.mordorintelligence.com/industry-reports/ai-tutors-market) vs
> [기타 조사기관](https://marketintelo.com/report/ai-tutoring-market)).
> 슬라이드에는 **하나의 출처만 골라 명시**하고, "○○ 기준"이라고 표기하세요.
> 여러 숫자를 섞어 쓰면 심사위원이 신뢰도를 의심합니다.

---

## 3. 수요 근거 — 대학생은 이미 AI로 공부하고 있다

### 3-1. 국내

| 지표 | 수치 | 출처 |
|---|---|---|
| 대학생 AI 도구 사용률 | **92%** | [AI매터스](https://aimatters.co.kr/news-report/ai-report/31315/) |
| 대학생 중 ChatGPT 사용 비중 | **92.4%** | [AI매터스](https://aimatters.co.kr/news-report/ai-report/31315/) |
| "AI로 공부한다" 응답 | **86%** | [교수신문](https://www.kyosu.net/news/articleView.html?idxno=147129) |
| 주 2회 이상 정기 활용 | **85.5%** | [AI매터스](https://aimatters.co.kr/news-report/ai-report/31315/) |
| 사고력·창의력 저하 우려 | **45.9%** | [AI매터스](https://aimatters.co.kr/news-report/ai-report/31315/) |
| 국내 전체 생성형 AI 이용률 | **74~78%** (ChatGPT 1위) | [SBS Biz](https://biz.sbs.co.kr/article/20000314202) · [전자신문 2025.12](https://www.etnews.com/20251218000167) |
| Z세대 AI 탐색 적극성 | 59.5%가 신규 AI 도구를 능동적으로 탐색 | [대학내일20대연구소 (2025.8.13)](https://www.20slab.org/Archives/38951) |

### 3-2. 해외

| 지표 | 수치 | 출처 |
|---|---|---|
| 미국 대학생 주 1회 이상 ChatGPT 사용 | **62%** | [BrowserCat](https://www.browsercat.com/post/chatgpt-usage-statistics-2020-2025) |
| 글로벌 학생 coursework에 ChatGPT 사용 | **66%** | [BrowserCat](https://www.browsercat.com/post/chatgpt-usage-statistics-2020-2025) |
| 영국 학부생 AI 사용 (n=1,041) | **92%** (전년 66%) | [Programs.com](https://programs.com/resources/students-using-ai/) |
| 미국 18~24세 ChatGPT 사용 | 약 **1/3** | [BestColleges](https://www.bestcolleges.com/news/students-embrace-chatgpt/) |

### 3-3. 결정적 근거: Anthropic 대학생 사용 실태 보고서 (2025.4)

- **57만 4,000건**의 익명 대학생 대화 분석
- 학생의 Claude 사용은 4가지 패턴: **직접 문제해결 / 직접 결과물 생성 / 협업적 문제해결 / 협업적 결과물 생성**
- **콘텐츠 생성·개선이 전체의 약 40%** — 즉 대부분이 "답을 받는" 용도
- 컴퓨터공학 전공이 대화의 **36.8%** 차지 (실제 학위 비중 5.4% 대비 과대표집) → 전공별 편중 존재
- 출처: [Anthropic Education Report](https://anthropic.com/news/anthropic-education-report-how-university-students-use-claude) · [EdTech Innovation Hub 요약](https://www.edtechinnovationhub.com/news/anthropic-analyzes-how-university-educators-use-claude-across-academic-tasks)

> **이 보고서를 문제의식 슬라이드에 쓰세요.**
> "대학생 AI 대화의 40%가 답을 받는 데 쓰이고, 45.9%가 그래서 불안해합니다.
> AI는 매 대화를 0에서 시작하기 때문입니다."

### 3-4. 플랫폼도 같은 문제를 인정했다 (우리 문제의식의 제3자 검증)

- **OpenAI Study Mode 출시 (2025.7.29)**: ChatGPT를 "답변 기계"에서 "학습 파트너"로 바꾸기 위한 기능.
  소크라테스식 질문·단계적 힌트·스캐폴딩 제공.
  OpenAI 자체가 *"ChatGPT가 가르치도록 프롬프트되면 학업 성취를 크게 개선하지만, 단순 답변 기계로 쓰이면 학습을 저해한다"*고 명시.
  - 출처: [OpenAI 공식](https://openai.com/index/chatgpt-study-mode/) · [CNBC](https://www.cnbc.com/2025/07/29/openai-announces-new-study-mode-product-for-students-.html) · [Inside Higher Ed](https://www.insidehighered.com/news/tech-innovation/artificial-intelligence/2025/08/07/understanding-value-learning-fuels-chatgpts)
- **Anthropic Learning Mode**: 동일한 문제의식으로 소크라테스식 질문 모드 도입.

> **발표 시 활용**: "OpenAI와 Anthropic 모두 이 문제를 인정하고 기능을 냈습니다.
> 다만 두 기능 모두 **학생을 기억하지 못합니다** — 매 세션이 0에서 시작합니다. 거기가 우리 자리입니다."

---

## 4. Why Now — 지금이어야 하는 4가지 이유

### 4-1. MCP가 산업 표준이 되었다

| 시점 | 사건 |
|---|---|
| 2024.11 | Anthropic이 MCP 공개 |
| 2025.3 | **OpenAI 공식 채택** (ChatGPT 데스크톱 앱 포함 전 제품) |
| 2025.4 | **Google**, Gemini 모델·SDK에 내장 |
| 2025.5 | **Microsoft**, Build에서 Copilot Studio 등에 통합 |
| 2025.7 | **AWS**, Bedrock AgentCore에 지원 추가 |
| 2025.12.9 | Anthropic이 MCP를 **Linux Foundation 산하 Agentic AI Foundation(AAIF)**에 기증. Anthropic·Block·OpenAI 공동 창립, AWS·Google·Microsoft·Cloudflare·Bloomberg 플래티넘 멤버 |
| 2026.3 | **월 9,700만 SDK 다운로드** (출시 시 10만), **공개 MCP 서버 10,000개+** 운영 중 |

- 출처: [Wikipedia: Model Context Protocol](https://en.wikipedia.org/wiki/Model_Context_Protocol) · [Digital Applied MCP 통계 2026](https://www.digitalapplied.com/blog/mcp-adoption-statistics-2026-model-context-protocol) · [Pento: A Year of MCP](https://www.pento.ai/blog/a-year-of-mcp-2025-review) · [Tech Insider](https://tech-insider.org/ie/model-context-protocol-mcp-update-2026/)

> **발표 문장**: "8개월 만에 경쟁하는 4개 플랫폼 벤더가 모두 채택했고, 이제는 Linux Foundation이 관리합니다.
> 우리는 특정 AI에 베팅하는 게 아니라, 모든 AI가 쓰는 규격 위에 섭니다."

### 4-2. 유통 채널이 열렸다

- ChatGPT 주간 활성 사용자: 2025.10 **8억 명** → 2026.2 **9억 명** → 2026.7 **10억 명 근접**
- ChatGPT 앱 월간 활성 사용자 **10억 명 돌파** (2026.6, 역사상 최단)
- 출처: [Index.dev](https://www.index.dev/blog/chatgpt-statistics) · [Demandsage](https://www.demandsage.com/chatgpt-statistics/) · [Exploding Topics](https://explodingtopics.com/blog/chatgpt-users)

> MCP 서버는 별도 앱 설치·마케팅 없이 이 사용자 기반에 직접 붙습니다. **CAC 구조가 다릅니다.**

### 4-3. "AI 메모리 레이어"가 독립된 시장 카테고리가 되었다 ★ 우리 포지셔닝의 핵심 근거

| 사실 | 출처 |
|---|---|
| Mem0 **$24.5M 조달**, 분기 1.86억 API 호출 처리 | [Value Add VC](https://valueaddvc.com/blog/the-ai-memory-problem-how-startups-are-solving-for-persistent-context) |
| Mem0·Letta·Zep 등 persistent memory layer 스타트업군 형성 | [Value Add VC](https://valueaddvc.com/blog/the-ai-memory-problem-how-startups-are-solving-for-persistent-context) |
| 엔터프라이즈 AI 에이전트 실패의 **65%가 context drift** (모델 성능 아님) | [Mem0: State of AI Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026) |
| Google, 2026.1 Gemini 개인화 메모리 통합 → 2026.3 'Personal Intelligence' 전 계정 배포 | [Contrary Research](https://research.contrary.com/report/privacy-and-identity-in-the-age-of-ai-memory) |
| ChatGPT, 계정당 **10,000개 이상** 메모리 항목 저장 (2026.3) | [Contrary Research](https://research.contrary.com/report/privacy-and-identity-in-the-age-of-ai-memory) |

> **발표 문장**: "범용 AI 메모리는 이미 시장이 됐고 투자도 받고 있습니다.
> 그런데 **학습(learning)에 특화된 메모리** — 무엇을 알고, 무엇을 헷갈리고, 언제 잊는지를
> 구조화해서 저장하는 계층은 아직 비어 있습니다. StudyMeta의 3계층 Learner Context가 그것입니다."

### 4-4. 정부 예산이 대학 AI 교육에 집중되고 있다 (= B2B 지불 여력)

| 사업 | 규모 | 출처 |
|---|---|---|
| 2026 대학 AI 기본교육과정 개발 지원 | 20개 대학, **교당 3억 원**, 2년 | [KDI](https://eiec.kdi.re.kr/policy/materialView.do?num=277232) · [더연합타임즈](https://www.theuniontimes.co.kr/2119566) |
| 전문대 AI·디지털 전환 | 35곳 선정, **총 240억 원** | [뉴스1](https://www.news1.kr/society/education/6160949) · [교육부](https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=105277&lev=0&s=moe&m=020402&opType=N) |
| 과기정통부 AI중심대학 2026 | 총 **255억 원**, 10개교, 대학당 연 30억 원 내외 | [AX Planable](https://axplanable.com/m/581) |
| 교육부 2026 예산 — 대학생 AI 기본교육 | **신규 88억 원** | [Focus NJN 정책분석](https://focusnjn.com/article/1065591818096765) |
| 교육부 2026 예산 — AI 거점대학 | **신규 300억 원** | [Focus NJN 정책분석](https://focusnjn.com/article/1065591818096765) |
| AI 융합형 교육실 | 118개교, **총 167억 원** | [서울경제](https://www.sedaily.com/article/20052648) |

**선도 사례 — 서울대**: 2025년 6월부터 교수·학생·직원 **전 구성원 대상 ChatGPT Edu 전면 도입**,
'AI Native Campus' 전환 선언, OpenAI와 연구협력 확대, 타 대학과 경험 공유 계획.
- 출처: [서울대 보도자료](https://www.snu.ac.kr/snunow/press?md=v&bbsidx=170942) · [한국대학신문](https://news.unn.net/news/articleView.html?idxno=593027) · [대학지성](https://www.unipress.co.kr/news/articleView.html?idxno=14663)

> **B2B 논리**: 대학은 이미 AI 도구에 예산을 쓰고 있습니다. 하지만 **학생이 무엇을 배웠는지 남지 않습니다.**
> StudyMeta는 대학이 이미 산 ChatGPT Edu 위에 얹는 학습 데이터 계층입니다. 대체가 아니라 보완입니다.

---

## 5. 경쟁 환경

### 5-1. 국내 경쟁사

| 기업 | 2024 매출 | 성장률 | 사용자 | 주력 시장 | 출처 |
|---|---|---|---|---|---|
| **매스프레소(콴다)** | **242억 원** | +42% (전년 170억) | 누적 가입 **9,200만**, MAU **800만** | K-12 수학 (풀이 검색 + 1:1 과외 + 베트남 학원) | [아웃스탠딩](https://outstanding.kr/press/1131/20250411) · [와우테일](https://wowtale.net/2025/04/11/239695/) · [더에이아이](https://www.newstheai.com/news/articleView.html?idxno=7608) |
| **소크라에이아이(구 뤼이드/산타)** | **201억 원** | +161% (전년 77억) | — | 어학 (토익·토플), 2025.9.1 사명 변경, 해외 철수 후 국내 집중 | [바이라인네트워크](https://byline.network/2025/04/30-381/) · [뉴스1](https://www.news1.kr/industry/sb-founded/5769503) · [딜사이트](https://dealsite.co.kr/articles/129631) |

- 콴다 영업손실 194억 원(전년 대비 -20%) — [와우테일](https://wowtale.net/2025/04/11/239695/)
- 콴다 매출 추이: 2020년 5억 → 2021년 21억 → 2022년 107억 → 2023년 170억 → 2024년 242억

> **핵심 인사이트**: 국내 1·2위 에듀테크 모두 **K-12 또는 어학**이 주력입니다.
> **대학 전공 학습은 두 회사 모두 건드리지 않는 영역**입니다. 이게 우리가 들어갈 틈입니다.
> (단, 뒤집어 말하면 "왜 아무도 안 하는가?"라는 질문에 답할 준비가 필요합니다 — §7 리스크 참조)

### 5-2. 글로벌 — Chegg의 붕괴가 말해주는 것

| 지표 | 수치 |
|---|---|
| 2025년 매출 | **$376.9M** (2024년 $617.6M 대비 **-39%**) |
| Q2 2025 매출 | $105.1M (전년 동기 대비 1/3 이상 감소) |
| 2025년 감원 | 5월 248명(22%) + 10월 388명(45%), 2024.6 이후 누적 **1,396명** |
| 주가 | 고점 대비 **-99%** |
| 회사 측 원인 진단 | "AI의 새로운 현실"과 Google AI 요약으로 인한 트래픽 감소 (2025.2 Google 상대 소송 제기) |

- 출처: [CNBC](https://www.cnbc.com/2025/10/27/chegg-slashes-45percent-of-workforce-blames-new-realities-of-ai.html) · [Forbes](https://www.forbes.com/sites/petercohan/2025/10/29/chegg-stock-down-99-learn-whether-ai-45-layoffs-make-chgg-a-buy/) · [Higher Ed Dive](https://www.highereddive.com/news/chegg-layoffs-strategic-alternatives-google-ai/804192/)

> **발표 문장**: "Chegg는 '학생에게 답을 파는 사업'이었고, AI가 그걸 공짜로 만들면서 2년 만에 무너졌습니다.
> **답은 이제 상품이 아닙니다.** 남는 가치는 '이 학생이 무엇을 아는가'라는 데이터입니다."

### 5-3. 글로벌 AI 학습 도구 신흥 주자

| 서비스 | 규모 | 조달 | 비고 | 출처 |
|---|---|---|---|---|
| **StudyFetch** | 600만+ 학생 | Series A **$11.5M** (2025 중반, Owl Ventures 주도, College Board 참여) | 2026 중반 유럽·아시아 확장 계획 | [Signal Base](https://www.trysignalbase.com/news/funding/studyfetch-secures-10m-funding-to-revolutionize-student-learning-with-ai-powered-study-tools) · [Crunchbase](https://www.crunchbase.com/organization/studyfetch) |
| **Turbo AI** (구 TurboLearn) | 500만 사용자, 누적 매출 **$13M**, 팀 10명 | 외부 조달 **$750K**뿐, 계속 흑자 | 자료 → 노트/퀴즈 자동 변환 | [Let's Data Science](https://letsdatascience.com/news/founders-scale-ai-study-app-to-13m-revenue-41e281e9) |
| **Khanmigo** (Khan Academy) | 70만 사용자 | — | 비영리, K-12 중심 | [Value Add VC](https://valueaddvc.com/blog/ai-tutors-are-here-how-duolingo-khan-academy-and-startups-are-personalizing-education) |
| **NotebookLM** (Google) | — | — | **무료**. 2026.4 교육 기능 확대, 2026.8 미국 대학생 12개월 AI Pro 무료 제공(140개국은 AI Plus) | [Google Workspace Updates](https://workspaceupdates.googleblog.com/2026/04/expanded-notebooklm-capabilities-for-Education-Plus-and-Teaching-and-Learning-add-on-customers.html) · [Glasp](https://glasp.co/articles/notebooklm-2026) |
| **Duolingo** | 2025 매출 약 **$1.04B** (+38.7%) | 상장사 | AI 개인화 성공 사례 | [Value Add VC](https://valueaddvc.com/blog/ai-tutors-are-here-how-duolingo-khan-academy-and-startups-are-personalizing-education) |

### 5-4. 투자 환경

| 지표 | 수치 | 출처 |
|---|---|---|
| 2025년 AI 교육 스타트업 조달액 | **$4.2B** — 전체 에듀테크 VC의 **62%** | [Value Add VC](https://valueaddvc.com/blog/ai-tutors-are-here-how-duolingo-khan-academy-and-startups-are-personalizing-education) |
| 글로벌 에듀테크 유니콘 | 14개사, 합산 가치 **$34.2B** | [New Market Pitch](https://newmarketpitch.com/blogs/news/edtech-top-startups-valuation) |
| Preply 밸류에이션 | **$1.2B** (2026.1, 최신 유니콘) | [New Market Pitch](https://newmarketpitch.com/blogs/news/edtech-market-update) |
| Coursera + Udemy 합병 | 약 **$2.5B** 규모 (2025.12), 합산 매출 $1.5B | [New Market Pitch](https://newmarketpitch.com/blogs/news/edtech-market-update) |
| **국내** 에듀테크 투자금 | 2023년 831억 → 2024년 1,194억 → **2025년 592억 원** | [StartupRecipe](https://startuprecipe.co.kr/archives/invest-newsletter/5815605) |

> ⚠️ **양날의 검**: 글로벌 AI 교육 투자는 뜨겁지만(**전체 에듀테크 VC의 62%**),
> 국내 에듀테크 투자는 2025년에 전년 대비 **절반으로 축소**됐습니다.
> 심사위원이 이 점을 물을 수 있으니, "그래서 국내 B2C만으로 가지 않고 MCP 기반 글로벌 배포 + B2B 대학 채널을 병행한다"는
> 답을 준비하세요.

---

## 6. 경쟁 포지셔닝 매트릭스 (슬라이드용)

| 기능 / 특성 | **StudyMeta** | 콴다 | 소크라에이아이(산타) | NotebookLM | ChatGPT Study Mode | StudyFetch |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| 대학 **전공** 학습 대상 | ✅ | ❌ (K-12) | ❌ (어학) | ⭕ | ⭕ | ⭕ |
| 학생이 과목을 **직접 등록** | ✅ | ❌ | ❌ | ⭕ | ⭕ | ⭕ |
| 업로드 자료에서 개념 추출 | ✅ | ❌ | ❌ | ✅ | ⭕ | ✅ |
| **시험일 기준 학습 플래너** | ✅ | ❌ | ⭕ | ❌ | ❌ | ❌ |
| **세션을 넘어 지속되는 학습자 상태** | ✅ | ⭕ | ✅ | ❌ | ❌ | ❌ |
| 상태 기반 **차등 교수 전략** | ✅ | ❌ | ✅ | ❌ | ⭕ | ❌ |
| **외부 AI에 개방** (MCP) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 점수로 합산하지 않는 스킬별 추적 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

범례: ✅ 핵심 제공 / ⭕ 부분적 또는 간접 제공 / ❌ 미제공

> **이 표의 마지막 두 행이 발표의 승부처입니다.**
> 다른 모든 서비스는 자기 앱 안에 학습 데이터를 가둡니다.
> StudyMeta만 **어떤 AI든 읽고 쓸 수 있는 개방형 학습자 상태 계층**입니다.

---

## 7. 리스크 및 예상 질문 대응

| # | 리스크 | 심사위원 질문 형태 | 준비된 답변 |
|---|---|---|---|
| 1 | **플랫폼 리스크** — OpenAI Study Mode, Google NotebookLM이 직접 진입 | "ChatGPT가 이거 그냥 만들면 끝 아닌가요?" | 두 기능 모두 **세션 간 학습자 상태를 구조화해 유지하지 않습니다**. 그리고 우리는 그들과 경쟁하지 않고 **그 위에 붙습니다** — MCP는 OpenAI도 채택한 규격입니다. 플랫폼이 강해질수록 우리 유통망이 커집니다. |
| 2 | **무료 대안** — NotebookLM 무료, 대학생 12개월 AI Pro 무료 배포 | "무료 도구가 있는데 왜 돈을 내죠?" | 무료 도구는 **자료를 요약**합니다. 우리는 **학생을 기억**합니다. 시험 3주 전 계획과 지난주 틀린 이유를 이어주는 건 요약 도구가 하지 않는 일입니다. |
| 3 | **국내 에듀테크 투자 위축** (2025년 592억, 전년 대비 -50%) | "시장이 식은 것 아닌가요?" | 식은 건 **콘텐츠·플랫폼형 에듀테크**입니다. AI 교육은 2025년 글로벌 VC의 **62%**($4.2B)를 가져갔습니다. 우리는 후자 카테고리입니다. |
| 4 | **대학생 B2C 유료화 미검증** — 국내 1·2위 모두 K-12/어학이 주 수익원 | "왜 아무도 대학 전공을 안 하죠?" | 지금까지는 **과목 수가 무한해서 콘텐츠를 미리 만들 수 없었기** 때문입니다. 프론티어 모델이 자료를 직접 분석하게 되면서 처음으로 가능해졌습니다 — 그래서 **지금**입니다. |
| 5 | **데이터 신뢰성** — 학습자 상태 추정의 정확도 | "State가 틀리면요?" | 그래서 **합산 점수를 만들지 않습니다.** 관측된 Evidence와 State를 분리 저장하고, 추정 신뢰도를 함께 기록합니다. 틀릴 수 있음을 설계에 반영한 구조입니다. |

---

## 8. 가격 벤치마크 (수익화 슬라이드 보조 자료)

| 서비스 | 가격 | 출처 |
|---|---|---|
| 콴다과외 (중·고 1:1) | **월 10만 원대**, 2과목 이상 시 과목당 월 2만 원 할인 | [콴다과외 요금](https://tutor.qanda.ai/price) |
| 초·중·고 사교육 참여학생 1인 월평균 | **60만 4,000원** (2024년, +2%) | [문화일보](https://www.munhwa.com/article/11574187) · [경향신문](https://www.khan.co.kr/article/202603121200011) |
| 초·중·고 사교육비 총액 | **27조 5,000억 원** (2024년, -5.7%) | [경향신문](https://www.khan.co.kr/article/202603121200011) |

> **가격 논리**: 오프라인 1:1 과외 월 10만 원대 대비, StudyMeta 월 9,900원은 **1/10 수준**입니다.
> "과외 한 달 값으로 1년"이라는 프레이밍이 슬라이드에서 잘 먹힙니다.
> ⚠️ 단, 위 사교육비 통계는 **초·중·고 대상**입니다. 대학생 학습 지출 공식 통계는 찾지 못했으므로
> 대학생 수치인 것처럼 인용하지 마세요. 필요하면 자체 설문으로 보완하세요.

---

## 9. 발표 전 검증 체크리스트

원문 접근이 차단되어 **검색 결과 요약으로만 확인한 수치**입니다. 슬라이드에 넣기 전 직접 확인하세요.

- [ ] **대학생 92% AI 사용 / 45.9% 우려** — [AI매터스 기사](https://aimatters.co.kr/news-report/ai-report/31315/) 원문에서 **조사 주체·표본 수·조사 시점** 확인 (가장 중요. 표본이 작으면 인용 강도를 낮추세요)
- [ ] **대학생 86% AI로 공부** — [교수신문](https://www.kyosu.net/news/articleView.html?idxno=147129) 원문의 조사 출처 확인
- [ ] **고등교육 재적학생 301만 6,724명** — [교육부 원자료](https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=351&boardSeq=102240&lev=0&s=moe&m=0310&opType=N) 또는 [KEDI 고등교육통계](https://hi.kedi.re.kr/)에서 확인. **2026년 통계가 발표되었는지도 함께 확인** (매년 8~9월 발표)
- [ ] **국내 에듀테크 9조 9,833억 원(2025)** — 2022년 전자신문 기사의 **전망치**입니다. 2025~2026년 실측치가 나왔는지 [SPRi](https://spri.kr/posts/view/22938?code=data_all&study_type=industry_trend)에서 재확인
- [ ] **글로벌 AI 튜터 시장** — 조사기관 하나를 골라 확정하고, 슬라이드에 기관명 명시
- [ ] **Anthropic 교육 보고서 세부 수치** — [원문](https://anthropic.com/news/anthropic-education-report-how-university-students-use-claude)에서 40% / 36.8% 수치 재확인
- [ ] **국내 에듀테크 투자금 592억(2025)** — [StartupRecipe](https://startuprecipe.co.kr/archives/invest-newsletter/5815605) 원문에서 집계 기준 확인
- [ ] 모든 인용에 **기준 연도** 병기 (예: "2025년 기준")

---

## 10. 슬라이드 구성안 (1분 30초)

시장조사 파트는 **슬라이드 2장**을 권장합니다.

### 슬라이드 1 — 시장 (40초)
- 상단: **233만 명** (국내 대학 학부생) — 큰 글씨 한 개
- 중단: TAM 3,190억 / SAM 830억 / SOM 8~17억 (3단 막대 또는 동심원)
- 하단 캡션: "출처: 교육부·KEDI 2025 교육기본통계 / 가정: 월 9,900원, 유료 전환 가능 세그먼트 30%"

### 슬라이드 2 — 경쟁 & 타이밍 (50초)
- 상단 좌: **경쟁 매트릭스** (§6 표를 5개 열로 축약 — StudyMeta / 콴다 / 산타 / NotebookLM / ChatGPT)
- 상단 우: **Chegg -39%** 한 줄 + "답은 더 이상 상품이 아니다"
- 하단: Why Now 타임라인 한 줄 — `MCP 공개(2024.11) → 4대 플랫폼 채택(2025) → Linux Foundation 이관(2025.12) → 서버 1만 개(2026)`

> 40초 + 50초 = 90초. 리허설에서 넘치면 **슬라이드 1의 Top-down 시장 수치를 먼저 버리세요** (Bottom-up만 남김).

---

## 부록: 전체 출처 목록

### 국내 통계·정책
- [KDI 경제교육·정보센터 — 2025년 교육기본통계 조사 결과 발표](https://eiec.kdi.re.kr/policy/materialView.do?num=270346)
- [국회도서관 국가전략포털 — 2025년 교육기본통계 주요 내용](https://nsp.nanet.go.kr/plan/subject/detail.do?newReportChk=list&nationalPlanControlNo=PLAN0000056345)
- [교육부 — 교육 통계 및 정보화](https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=351&boardSeq=102240&lev=0&s=moe&m=0310&opType=N)
- [한국교육개발원 고등교육통계조사](https://hi.kedi.re.kr/)
- [교육플러스 — 2025 교육 통계](https://www.edpl.co.kr/news/articleView.html?idxno=17976)
- [대한민국교육신문 — 2025년 교육기본통계 조사 결과](https://www.kedupress.com/news/article.html?no=311729)
- [KDI — 2026년 대학 AI 기본교육과정 개발 지원사업 선정 공고](https://eiec.kdi.re.kr/policy/materialView.do?num=277232)
- [교육부 — 전문대학 거점 지역 AI 인재 양성](https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=105277&lev=0&s=moe&m=020402&opType=N)
- [뉴스1 — 교육부, AI·디지털 전환 전문대 35곳 선정, 240억 투입](https://www.news1.kr/society/education/6160949)
- [서울경제 — 교육부, 167억 투입 AI 융합형 교육실 지원](https://www.sedaily.com/article/20052648)
- [AX Planable — 과기정통부 2026년 AI중심대학 공고](https://axplanable.com/m/581)
- [Focus NJN — 2026 교육부 정책분석](https://focusnjn.com/article/1065591818096765)
- [더연합타임즈 — 2026년 대학 AI 기본교육 사업 출범식](https://www.theuniontimes.co.kr/2119566)

### 국내 시장·투자
- [SPRi 소프트웨어정책연구소 — 에듀테크 산업 동향 및 시사점](https://spri.kr/posts/view/22938?code=data_all&study_type=industry_trend)
- [전자신문 — 국내 에듀테크 시장 2025년 10조원 규모 성장 전망](https://www.etnews.com/20220630000153)
- [전자신문 — 국내 소비자 4명 중 3명 AI 사용 (2025.12)](https://www.etnews.com/20251218000167)
- [StartupRecipe — 에듀테크 스타트업 투자 뉴스레터](https://startuprecipe.co.kr/archives/invest-newsletter/5815605)

### 대학생 AI 사용 실태
- [AI매터스 — 한국 대학생 92%가 챗GPT 사용한다](https://aimatters.co.kr/news-report/ai-report/31315/)
- [교수신문 — 대학생 86%, AI로 공부한다](https://www.kyosu.net/news/articleView.html?idxno=147129)
- [SBS Biz — 국내 생성형 AI 이용률 78%, 1위 챗GPT](https://biz.sbs.co.kr/article/20000314202)
- [대학내일20대연구소 — Z세대가 보는 AI: 기대와 의심 사이 (2025.8.13)](https://www.20slab.org/Archives/38951)
- [Pew Research Center — 학업에 ChatGPT 사용하는 청소년 비율 2배 증가](https://www.pewresearch.org/short-reads/2025/01/15/about-a-quarter-of-us-teens-have-used-chatgpt-for-schoolwork-double-the-share-in-2023/)
- [BestColleges — 18~24세 3명 중 1명 ChatGPT 사용](https://www.bestcolleges.com/news/students-embrace-chatgpt/)
- [BrowserCat — ChatGPT 학생 사용 통계 2020–2025](https://www.browsercat.com/post/chatgpt-usage-statistics-2020-2025)
- [Programs.com — 학생 92%가 AI 사용](https://programs.com/resources/students-using-ai/)
- [Anthropic — 대학생의 Claude 사용 실태 보고서](https://anthropic.com/news/anthropic-education-report-how-university-students-use-claude)
- [EdTech Innovation Hub — Anthropic 교육 보고서 분석](https://www.edtechinnovationhub.com/news/anthropic-analyzes-how-university-educators-use-claude-across-academic-tasks)

### 플랫폼 동향
- [OpenAI — Introducing study mode](https://openai.com/index/chatgpt-study-mode/)
- [CNBC — OpenAI, 학생용 study mode 발표 (2025.7.29)](https://www.cnbc.com/2025/07/29/openai-announces-new-study-mode-product-for-students-.html)
- [Inside Higher Ed — Study Mode의 학습 가치](https://www.insidehighered.com/news/tech-innovation/artificial-intelligence/2025/08/07/understanding-value-learning-fuels-chatgpts)
- [Google Workspace Updates — NotebookLM 교육 기능 확대 (2026.4)](https://workspaceupdates.googleblog.com/2026/04/expanded-notebooklm-capabilities-for-Education-Plus-and-Teaching-and-Learning-add-on-customers.html)
- [Glasp — NotebookLM 2026 가이드](https://glasp.co/articles/notebooklm-2026)
- [서울대 보도자료 — AI Native Campus 전환](https://www.snu.ac.kr/snunow/press?md=v&bbsidx=170942)
- [한국대학신문 — 서울대 ChatGPT Edu 전면 도입](https://news.unn.net/news/articleView.html?idxno=593027)
- [대학지성 In&Out — 서울대 AI Native Campus](https://www.unipress.co.kr/news/articleView.html?idxno=14663)

### MCP / AI 메모리
- [Wikipedia — Model Context Protocol](https://en.wikipedia.org/wiki/Model_Context_Protocol)
- [Digital Applied — MCP 채택 통계 2026](https://www.digitalapplied.com/blog/mcp-adoption-statistics-2026-model-context-protocol)
- [Pento — A Year of MCP: 내부 실험에서 산업 표준까지](https://www.pento.ai/blog/a-year-of-mcp-2025-review)
- [Tech Insider — MCP 서버 1만 개 돌파](https://tech-insider.org/ie/model-context-protocol-mcp-update-2026/)
- [Mem0 — State of AI Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- [Value Add VC — AI 메모리 문제와 persistent context 스타트업](https://valueaddvc.com/blog/the-ai-memory-problem-how-startups-are-solving-for-persistent-context)
- [Contrary Research — Privacy & Identity in the Age of AI Memory](https://research.contrary.com/report/privacy-and-identity-in-the-age-of-ai-memory)
- [Index.dev — ChatGPT 통계 2026](https://www.index.dev/blog/chatgpt-statistics)
- [Demandsage — ChatGPT 통계 (2026.9)](https://www.demandsage.com/chatgpt-statistics/)
- [Exploding Topics — ChatGPT 사용자 수](https://explodingtopics.com/blog/chatgpt-users)

### 경쟁사
- [아웃스탠딩 — 매스프레소 2024 매출 242억, 역대 최대](https://outstanding.kr/press/1131/20250411)
- [와우테일 — 콴다 2024 매출 242억, 영업손실 194억](https://wowtale.net/2025/04/11/239695/)
- [더에이아이 — 콴다 매출 242억 돌파](https://www.newstheai.com/news/articleView.html?idxno=7608)
- [더벨 — 매스프레소 200억 매출 돌파](https://m.thebell.co.kr/m/newsview.asp?newskey=202503251409357920108940)
- [콴다과외 요금 안내](https://tutor.qanda.ai/price)
- [바이라인네트워크 — 뤼이드 2024 매출 201억, 161% 상승](https://byline.network/2025/04/30-381/)
- [뉴스1 — 뤼이드 2024 매출 201억](https://www.news1.kr/industry/sb-founded/5769503)
- [딜사이트 — 산타토익 뤼이드, 해외 접고 국내 집중](https://dealsite.co.kr/articles/129631)
- [CNBC — Chegg, 인력 45% 감축](https://www.cnbc.com/2025/10/27/chegg-slashes-45percent-of-workforce-blames-new-realities-of-ai.html)
- [Forbes — Chegg 주가 99% 하락](https://www.forbes.com/sites/petercohan/2025/10/29/chegg-stock-down-99-learn-whether-ai-45-layoffs-make-chgg-a-buy/)
- [Higher Ed Dive — Chegg 감원과 AI](https://www.highereddive.com/news/chegg-layoffs-strategic-alternatives-google-ai/804192/)
- [Signal Base — StudyFetch $10M+ 조달](https://www.trysignalbase.com/news/funding/studyfetch-secures-10m-funding-to-revolutionize-student-learning-with-ai-powered-study-tools)
- [Crunchbase — StudyFetch](https://www.crunchbase.com/organization/studyfetch)
- [Let's Data Science — Turbo AI $13M 매출 성장](https://letsdatascience.com/news/founders-scale-ai-study-app-to-13m-revenue-41e281e9)
- [Value Add VC — Duolingo, Khan Academy, AI 튜터 스타트업](https://valueaddvc.com/blog/ai-tutors-are-here-how-duolingo-khan-academy-and-startups-are-personalizing-education)
- [New Market Pitch — 에듀테크 시장 업데이트 (2026 Q1)](https://newmarketpitch.com/blogs/news/edtech-market-update)
- [New Market Pitch — 밸류에이션 기준 상위 에듀테크 스타트업](https://newmarketpitch.com/blogs/news/edtech-top-startups-valuation)

### 글로벌 시장 규모
- [Mordor Intelligence — AI Tutors Market](https://www.mordorintelligence.com/industry-reports/ai-tutors-market)
- [Mordor Intelligence — AI in Education Market](https://www.mordorintelligence.com/industry-reports/ai-in-education-market)
- [Grand View Research — AI Tutors Market Report](https://www.grandviewresearch.com/industry-analysis/ai-tutors-market-report)
- [Grand View Research — Asia Pacific AI in Education Market](https://www.grandviewresearch.com/horizon/outlook/ai-in-education-market/asia-pacific)
- [SNS Insider — AI in Education Market](https://www.snsinsider.com/reports/ai-in-education-market-8289)
- [Verified Market Reports — Personalized Learning Market](https://www.verifiedmarketreports.com/product/personalized-learning-market/)
- [IMARC Group — South Korea EdTech Market](https://www.imarcgroup.com/south-korea-edtech-market)

### 사교육비 참고
- [문화일보 — 학원비 월 60만원이 평균](https://www.munhwa.com/article/11574187)
- [경향신문 — 사교육비 지출 5년 만에 감소](https://www.khan.co.kr/article/202603121200011)
- [통계청 초중고사교육비조사 통계정보보고서](https://www.k-stat.go.kr/comb100/file-download?fileDnKey=gqY9ZtMdB8R4Batxkocj4dFWxzgcjgTQZb6bUdBMes8%3D)

### 학습 효과 이론 (문제의식 보강용)
- [Education Next — Two-Sigma Tutoring: Separating Science Fiction from Science Fact (2025)](https://www.educationnext.org/two-sigma-tutoring-separating-science-fiction-from-science-fact/)
- [Nintil — Bloom's two sigma problem 체계적 문헌 검토](https://nintil.com/bloom-sigma/)
- [arXiv — AI tutoring can safely and effectively support students: An exploratory RCT in UK classrooms](https://arxiv.org/pdf/2512.23633)

> 참고: Bloom의 2 시그마(1984)는 자주 인용되지만, 최근 메타분석은 인간 튜터링의 실제 효과크기를
> **0.36 SD**(교사 자격 보유 시 0.59 SD) 수준으로 보고합니다. **"AI로 2시그마 달성"** 같은 표현은
> 학계 배경이 있는 심사위원에게 역효과가 나므로 쓰지 마세요.
