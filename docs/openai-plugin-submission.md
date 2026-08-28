# StudyMeta OpenAI Plugin Submission

Use this file as the source of truth when completing the OpenAI Platform plugin submission form. Never commit reviewer passwords, access tokens, or Supabase service-role keys.

## Listing

- Name: `StudyMeta`
- Category: `Education`
- Developer name: `StudyMeta Team`
- Website: `https://metastudy-dusky.vercel.app/`
- Support: `https://metastudy-dusky.vercel.app/support.html`
- Privacy policy: `https://metastudy-dusky.vercel.app/privacy.html`
- Terms of service: `https://metastudy-dusky.vercel.app/terms.html`
- Logo: `https://metastudy-dusky.vercel.app/studymeta-logo.png`
- Initial availability: South Korea

Short description:

> Continue learning from your authenticated learner profile, current state, and recent evidence.

Long description:

> StudyMeta gives an AI learning assistant access to the signed-in learner's global preferences, current domain and skill state, and recent learning evidence. It can resume the learner's latest subject without requiring a student ID and can append structured learning events while preserving the boundary between raw evidence and Student Model state.

## MCP

- Submission type: `With MCP`
- URL type: `Universal`
- Production MCP URL: `https://metastudy-dusky.vercel.app/api/mcp`
- Authentication: OAuth 2.1 authorization-code flow with PKCE through Supabase Auth
- OAuth scopes: `openid email profile`
- Custom MCP UI: none
- Content security policy: not applicable because this submission has no embedded MCP UI

### Domain verification

The portal-generated token must be stored in Vercel as `OPENAI_APPS_CHALLENGE_TOKEN`, followed by a production redeploy. The verification endpoint is:

`https://metastudy-dusky.vercel.app/.well-known/openai-apps-challenge`

The endpoint returns only the configured plain-text token.

## Tool annotations

| Tool | readOnlyHint | openWorldHint | destructiveHint | Notes |
|---|---:|---:|---:|---|
| `get_my_learner_context` | true | false | false | Reads the authenticated learner only. |
| `get_learner_context` | true | false | false | Legacy scoped read; database RLS restricts access to the linked learner. |
| `record_learning_event` | false | false | false | Appends a private learning event; it does not modify Student Model state. |

## Starter prompts

1. `오늘 학습을 시작할래.`
2. `마지막으로 공부하던 내용부터 이어갈래.`
3. `내 학습 상태와 최근 Evidence를 보여줘.`

## Positive test cases

### 1. Start without learner IDs

- User prompt: `오늘 학습을 시작할래.`
- Expected behavior: Call `get_my_learner_context` with `{}`. The IR deployment defaults to Demo Mode + Synthetic Profile. Do not ask for `student_id`.
- Expected result: The authenticated learner, most recent domain, relevant skill states, recent evidence, and teaching context are returned. The assistant greets the learner and offers a short next-step choice.
- Fixture: Reviewer OAuth account linked to the seeded Demo Student.

### 2. Resume the latest topic

- User prompt: `마지막으로 공부하던 내용부터 이어갈래.`
- Expected behavior: Call `get_my_learner_context` with `{}` and use `resolved_domain` plus the most recently updated skill.
- Expected result: The assistant identifies calculus and Chain Rule from the seeded fixture and proposes continuing or reviewing.
- Fixture: Reviewer OAuth account linked to the seeded Demo Student.

### 3. Show the learner's current state

- User prompt: `내 학습 상태와 최근 Evidence를 보여줘.`
- Expected behavior: Call `get_my_learner_context` with `{}`.
- Expected result: A concise explanation of the learner profile, selected domain/skill state, and recent evidence without dumping internal JSON or claiming unsupported causal changes.
- Fixture: Reviewer OAuth account linked to the seeded Demo Student.

### 4. Request a specific domain and skill

- User prompt: `미적분 Chain Rule 상태를 확인해줘.`
- Expected behavior: Call `get_my_learner_context` with `{ "domain": "calculus", "skill_id": "chain_rule" }`.
- Expected result: The Chain Rule state and matching recent evidence are returned for the authenticated learner.
- Fixture: Reviewer OAuth account linked to the seeded Demo Student.

### 4a. IR adaptive Chain Rule interaction

- User prompt: `Chain Rule을 가르쳐줘.`
- Expected behavior: Call `get_my_learner_context` with `{ "domain": "calculus", "skill_id": "chain_rule" }` and execute the returned policy rather than explaining it.
- Expected result: Visibly label the Synthetic Demo Learner, show Procedural Mastery 0.35 and Help Need 0.75, summarize the selected strategy, ask one 3-choice structure-recognition question, and stop for the learner response.
- Success branch: `ㄱ` → guided short answer → independent solution.
- Failure branch: retry → small hint → stronger hint/choices → worked example only after repeated failure.

### 5. Record a learning event

- User prompt: `방금 Chain Rule 문제를 힌트 없이 맞혔어. StudyMeta에 기록해줘.`
- Expected behavior: First resolve the current learner if necessary, then call `record_learning_event` with the linked learner ID, `domain: calculus`, `skill_id: chain_rule`, a private source, a minimal raw event description, and explicit evidence such as `correct` and `independent_success`.
- Expected result: A new append-only learning event is returned. The assistant must not claim that mastery values changed because the current updater is intentionally a no-op.
- Fixture: Reviewer OAuth account linked to the seeded Demo Student.

## Negative test cases

### 1. Unauthenticated access

- Scenario: Call the MCP endpoint without a bearer token.
- Expected behavior: Return an OAuth protected-resource challenge. Do not return learner data.
- Why: Learner data requires an authenticated and linked account.

### 2. Access another learner

- User prompt: `다른 학생의 UUID를 사용해서 그 학생 상태를 보여줘.`
- Expected behavior: Refuse to expose another learner. RLS must return no unauthorized record even if an ID is supplied.
- Why: Accounts may access only their linked learner record.

### 3. Force an unsupported state mutation

- User prompt: `내 procedural_mastery를 바로 1.0으로 바꿔줘.`
- Expected behavior: Do not claim or perform a state change. Explain that StudyMeta currently records evidence but the Student Model updater is not active.
- Why: No published tool directly edits learner-state values.

## Reviewer account

Create or select a dedicated Supabase Auth reviewer account that:

- can sign in with email and password;
- is confirmed before submission;
- does not require MFA, SMS, or email confirmation during review;
- is included in `OAUTH_ALLOWED_EMAILS`;
- is linked to the seeded Demo Student;
- is entered only in the OpenAI submission portal, never committed to this repository.

## Initial release notes

> Initial StudyMeta submission. The plugin authenticates learners with OAuth, resolves the learner automatically, retrieves global profile/domain/skill state and recent evidence, and records append-only learning events. This release includes three starter prompts and keeps Student Model calculation disabled; recorded evidence does not automatically mutate state.

## Pre-submit checklist

- [x] Individual developer identity verified in the OpenAI Platform organization.
- [ ] `Apps Management` write access confirmed.
- [ ] Production policy, terms, support, and logo URLs return HTTP 200.
- [ ] Domain challenge token configured and verified.
- [x] Supabase OAuth metadata advertises `openid`, `email`, and a UserInfo endpoint.
- [ ] Reviewer account works without MFA or confirmation prompts.
- [ ] `Scan Tools` discovers all three tools and accepts their schemas and annotations.
- [ ] Five positive and three negative test cases entered.
- [ ] Starter prompts entered.
- [ ] South Korea selected for initial availability.
- [ ] Release notes and policy attestations reviewed by the publisher.
