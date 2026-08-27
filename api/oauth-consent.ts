import type { IncomingMessage, ServerResponse } from "node:http";
import { getEnvironment, getSupabasePublicKey } from "../src/config/env.js";

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export default function handler(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  if (request.method !== "GET") {
    response.writeHead(405, { allow: "GET" }).end();
    return;
  }
  const environment = getEnvironment();
  const config = scriptJson({
    supabaseUrl: environment.SUPABASE_URL,
    supabaseKey: getSupabasePublicKey(environment),
  });
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://esm.sh; connect-src 'self' https://*.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
  response.end(renderOAuthConsentPage(config));
}

export function renderOAuthConsentPage(config: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Authorize StudyMeta</title>
  <style>
    :root{font-family:Inter,system-ui,sans-serif;color:#172033;background:#f6f7fb}*{box-sizing:border-box}body{margin:0}.card{width:min(520px,calc(100% - 32px));margin:64px auto;padding:28px;background:#fff;border:1px solid #dfe3ea;border-radius:16px}h1{margin:0 0 8px}.muted{color:#667085}.stack{display:grid;gap:12px;margin-top:22px}input,button{min-height:44px;padding:10px 12px;border-radius:9px;font:inherit}input{border:1px solid #d0d5dd}button{border:0;background:#3157d5;color:#fff;font-weight:700;cursor:pointer}.secondary{background:#eef2ff;color:#3157d5}.danger{background:#fff1f0;color:#b42318}.hidden{display:none}.status{min-height:22px;margin-top:14px;color:#667085}.error{color:#b42318}.details{padding:14px;background:#f6f7fb;border-radius:10px;white-space:pre-wrap}
  </style>
</head>
<body>
  <main class="card">
    <p class="muted">StudyMeta OAuth 2.1</p>
    <h1>Authorize StudyMeta</h1>
    <p class="muted">Sign in, review the requesting AI client, and approve access to your learner context.</p>
    <section id="login" class="stack hidden">
      <input id="email" type="email" autocomplete="email" placeholder="Email" required>
      <input id="password" type="password" autocomplete="current-password" placeholder="Password" required>
      <button id="signIn">Sign in</button>
      <button id="signUp" class="secondary">Create account</button>
    </section>
    <section id="consent" class="stack hidden">
      <div id="details" class="details"></div>
      <button id="approve">Approve</button>
      <button id="deny" class="danger">Deny</button>
      <button id="signOut" class="secondary">Sign out</button>
    </section>
    <div id="status" class="status">Loading authorization request...</div>
  </main>
  <script type="module">
    import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";
    const config = ${config};
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    const authorizationId = new URLSearchParams(location.search).get("authorization_id");
    const login = document.getElementById("login");
    const consent = document.getElementById("consent");
    const status = document.getElementById("status");
    const details = document.getElementById("details");
    const setStatus = (message, error = false) => { status.textContent = message; status.className = error ? "status error" : "status"; };
    async function showCurrentStep() {
      if (!authorizationId) { setStatus("Missing authorization_id", true); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { login.classList.remove("hidden"); consent.classList.add("hidden"); setStatus("Sign in to continue."); return; }
      login.classList.add("hidden");
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (error) { setStatus(error.message, true); return; }
      if (data?.redirect_url) { location.assign(data.redirect_url); return; }
      details.textContent = [
        "Signed in as: " + (session.user.email ?? session.user.id),
        "Client: " + (data?.client?.name ?? "AI client"),
        "Scopes: " + (data?.scope ?? "openid email profile"),
        "Access: learner profile, domain/skill state, recent evidence, and append-only learning events"
      ].join("\\n");
      consent.classList.remove("hidden");
      setStatus("Review and approve this request.");
    }
    async function credentials() { return { email: document.getElementById("email").value, password: document.getElementById("password").value }; }
    document.getElementById("signIn").onclick = async () => { const { error } = await supabase.auth.signInWithPassword(await credentials()); if (error) setStatus(error.message, true); else await showCurrentStep(); };
    document.getElementById("signUp").onclick = async () => { const { data, error } = await supabase.auth.signUp({ ...(await credentials()), options: { emailRedirectTo: location.href } }); if (error) setStatus(error.message, true); else if (!data.session) setStatus("Check your email to confirm the account, then return here."); else await showCurrentStep(); };
    document.getElementById("approve").onclick = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return showCurrentStep();
      setStatus("Linking learner and approving...");
      const link = await fetch("/api/link-demo-student", { method: "POST", headers: { Authorization: "Bearer " + session.access_token } });
      const linkBody = await link.json();
      if (!link.ok) { setStatus(linkBody.error ?? "Unable to link learner", true); return; }
      const { data, error } = await supabase.auth.oauth.approveAuthorization(authorizationId);
      if (error) { setStatus(error.message, true); return; }
      location.assign(data.redirect_url);
    };
    document.getElementById("deny").onclick = async () => { const { data, error } = await supabase.auth.oauth.denyAuthorization(authorizationId); if (error) setStatus(error.message, true); else location.assign(data.redirect_url); };
    document.getElementById("signOut").onclick = async () => { await supabase.auth.signOut(); await showCurrentStep(); };
    await showCurrentStep();
  </script>
</body>
</html>`;
}
