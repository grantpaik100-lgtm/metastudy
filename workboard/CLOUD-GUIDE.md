# 공동 작업판과 AI 연결

작업판: https://studymeta-workboard.vercel.app/#spatial

MCP 주소: https://studymeta-workboard.vercel.app/mcp

## 로그인과 공동 사용

WORKSPACE 메뉴의 **할 일**(`/#todos`)은 Phase → 큰 목표 → 작은 목표를 정리할 빈 공간이다.
현재는 메뉴와 빈 화면만 제공하며 목표 생성·편집·저장 및 할 일 전용 MCP 기능은 아직 추가하지 않았다.

관리자가 생성한 세 계정으로 로그인한다. 이메일은 필요 없다. 각자의 초기 비밀번호는
관리자 PC의 `workboard/private/로그인-안내.txt`에만 있으며 첫 로그인 후 변경한다.
비밀번호를 변경하면 이전 로그인과 AI 연결은 해제된다. 공개 회원가입은 제공하지 않는다.

화면과 AI는 같은 공유 DB를 읽고 쓴다. 화면은 활성 상태에서 약 2.5초마다 변경을 확인하며,
백그라운드에서는 10초 간격이다. 접속자 표시는 약 15초 간격이며 45초간 소식이 없으면 사라진다.
변경이 없으면 전체 보드 대신 버전만 확인한다. 오프라인 편집은 지원하지 않는다.

담당자와 수정자는 별개다. 수정자는 로그인 계정으로 서버가 지정하고, AI 편집은 `이름 · AI`로
표시한다. 노드/선의 동일 버전 충돌은 거절하며 화면 편집 초안은 유지한다. 기존 화면 편집은
작업판 버전이 달라지면 저장을 거절하므로 최신 내용을 확인한 뒤 다시 편집한다.

## 기존 AI에 연결

원격 Streamable HTTP MCP와 OAuth를 지원하는 앱에 위 MCP 주소를 등록한다.
작업판 계정으로 로그인하고, 요청하는 앱과 접근 범위를 확인한 뒤 승인한다.
AI 앱의 계정/요금제/관리자 정책에 따른 외부 MCP 지원 여부는 별도로 확인한다.

Codex CLI 예시:

```powershell
codex mcp add studymeta-workboard --url https://studymeta-workboard.vercel.app/mcp --oauth-resource https://studymeta-workboard.vercel.app/mcp
codex mcp login studymeta-workboard
```

등록 방식 선택을 지원하는 최신 CLI에서 필요한 경우 `--oauth-client-registration dcr`를 사용한다.
현재 서버는 DCR(public client) + PKCE S256을 제공한다. CIMD는 제공하지 않는다.
등록 시 로그인까지 끝났다면 다시 로그인할 필요는 없다. 이미 열린 대화에 새 도구가 나타나지
않으면 Codex를 다시 열거나 새 대화에서 연결된 MCP 도구를 확인한다. 다른 팀원은 각자의
AI 앱에서 같은 MCP 주소를 등록하고 본인 작업판 계정으로 승인한다.

Bearer 토큰 방식의 클라이언트는 작업판의 **계정 · AI 연결**에서 개인 연결 토큰을 생성한다.
토큰은 생성 시 한 번만 표시하고 DB에는 해시만 저장한다. 유효기간은 90일이다.
`Authorization: Bearer <토큰>`으로 전달한다. 계정 화면에서 언제든 해당 연결을 끊을 수 있다.
토큰을 채팅·Git·공유 문서에 붙이지 않는다.

| MCP 도구 | 동작 |
|---|---|
| `get_workboard` | 네 면과 연결, 지정 항목·연결 관계·버전 조회. `includeScreens`로 기존 화면도 조회 |
| `search_workboard` | 제목·설명·담당자·후속 과제·기능 영역 검색 |
| `update_workboard` | 노드·선·화면 추가/수정. 여러 변경은 하나의 트랜잭션으로 저장 |
| `get_workboard_history` | 작성자·AI 여부·시각·변경 이유와 작업 내용 조회 |

예: “자유학습 노드의 후속 과제에 자료 없는 시작 흐름 검토를 추가해줘.”
AI는 먼저 해당 항목을 읽고 `expectedVersion`과 새 `requestId` UUID로 수정한다.
같은 요청의 네트워크 재시도에는 동일 UUID와 동일 내용을 보낸다. 다른 변경에는 새 UUID를 사용한다.
MCP는 노드·선 삭제나 작업판 전체 교체를 제공하지 않는다. 코드·PR·실제 배포를 변경하지 않으며
사용자가 확정한 내용과 근거만 작업판에 기록한다.

## 저장과 인증

- 별도 Vercel 프로젝트의 `api/gateway.js`가 웹과 MCP 요청을 처리한다. 외부 AI 모델을 호출하지 않는다.
- 기존 Supabase 프로젝트 안에 전용 `workboard_*` 테이블을 사용한다. 학습자 테이블과 기존 Auth 설정은 변경하지 않는다.
- 각 테이블에 RLS를 켜고 `anon`/`authenticated`의 직접 접근을 차단한다. 서비스 키는 서버 환경변수에만 둔다.
- 비밀번호는 개별 salt의 scrypt 해시, 웹/AI 토큰과 인증 코드는 SHA-256 해시로 저장한다.
- 웹은 HttpOnly/Secure/SameSite 쿠키와 동일 출처 요청 검증을 사용한다. 로그인과 인증 요청 횟수를 제한한다.
- OAuth는 정확한 콜백·resource·scope·PKCE 검증, 5분짜리 일회용 코드, 1시간 접근 토큰,
  30일 회전 갱신 토큰을 사용한다. 갱신 토큰 재사용 시 같은 연결의 토큰을 해제한다.
- 저장 트랜잭션은 보드 행을 잠그고 버전을 검사한다. 별도 항목의 동시 변경은 재조회 후 병합한다.
- 변경 이력에는 수정한 항목의 전후 값을 보존한다. 전체 가져오기를 할 때만 전후 전체 보드를 보존한다.
- 각 항목 화면의 이력은 최근 50건이다. 전체 공동 변경 이력은 DB에 별도로 남는다.

## 운영과 재배포

1. `cloud/schema.sql`, `cloud/meetings.sql`, `cloud/profiles.sql`을 순서대로 대상 Supabase SQL 편집기에서 실행한다. 전용 테이블·함수·회의 파일 저장소만 생성/갱신한다.
2. `.env.example`을 `.env.local`로 복사하고 값을 로컬에서 입력한다.
3. 최초에만 `node cloud/provision.mjs`로 세 계정과 보드를 만든다. 기존 계정/보드는 덮어쓰지 않는다.
4. Vercel 프로젝트의 루트는 이 `workboard/` 디렉터리다. 서버용 환경변수는
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKBOARD_URL`, `WORKBOARD_BOARD_ID`다.
   `WORKBOARD_USERNAMES`는 로컬 계정 생성용이며 배포 환경에 필요 없다.
5. `node test-cloud.mjs`, `node test-spatial.mjs`, `node test-profiles.mjs`를 실행하고 `vercel deploy --prod`로 배포한다. 프로필 검증은 별도 계정과 작업판에서 이미지 저장·권한·실제 통화·공유 화면·퇴장 경쟁 상황을 확인하고 정리한다.

배포 파일에는 명시한 `cloud/assets.mjs`의 화면·스타일·스크립트·음성인식 실행 파일와 서버 코드만 포함된다. `private/`, `.env*`, `data/`, 테스트 결과,
초기 작업판 JSON과 SQL 파일은 공개 정적 자산에서 제외한다. Git 자동 배포는 연결하지 않는다.
이 저장소의 학습자 데모 및 다른 Vercel 프로젝트에 영향을 주지 않기 위한 분리다.

로컬에서 클라우드 데이터를 확인하려면 `.env.local`의 `WORKBOARD_URL`을 로컬 주소로 맞춘 뒤
`node cloud/local.mjs`를 실행한다. 호스트별 세션은 공유하지 않는다. 운영 URL 설정은 배포 환경과 맞아야 한다.

## 검증

`test-cloud.mjs`는 실제 DB 안에 고유 ID의 임시 보드·계정만 만들고 종료 시 그 ID만 정리한다.
운영 보드와 세 실제 계정은 수정하지 않는다. 검증 항목은 비인증 차단, 첫 비밀번호 변경,
CSRF, 동시 수정, 중복 요청, OAuth/PKCE/코드 재사용, 토큰 갱신·해제, MCP 읽기/쓰기,
두 브라우저의 동기화와 초안 보존, 모바일 넘침 및 런타임 오류다.

참고: [MCP 인증 규격](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization),
[Codex MCP 설정](https://learn.chatgpt.com/docs/extend/mcp?surface=cli),
[OpenAI MCP 인증](https://developers.openai.com/plugins/build/auth).


회의 기능의 운영 설정, 30일 보관 정책과 MCP 도구는 [MEETINGS-GUIDE.md](./MEETINGS-GUIDE.md)를 참고하세요. 일일 정리 예약에는 서버 환경변수 `CRON_SECRET`이 추가로 필요합니다.
