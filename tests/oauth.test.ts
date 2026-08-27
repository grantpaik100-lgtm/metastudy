import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { renderOAuthConsentPage } from "../api/oauth-consent.js";
import {
  AuthenticationError,
  buildProtectedResourceMetadata,
  extractBearerToken,
} from "../src/auth/oauth.js";

test("OAuth protected resource metadata points ChatGPT to Supabase Auth", () => {
  assert.deepEqual(
    buildProtectedResourceMetadata(
      "https://metastudy.example.com/path",
      "https://project.supabase.co/rest/v1",
    ),
    {
      resource: "https://metastudy.example.com/api/mcp",
      authorization_servers: ["https://project.supabase.co/auth/v1"],
      scopes_supported: ["openid", "email", "profile"],
      resource_documentation: "https://metastudy.example.com/viewer.html",
    },
  );
});

test("Bearer token parsing rejects missing and malformed authorization", () => {
  assert.equal(extractBearerToken("Bearer token-value"), "token-value");
  assert.throws(() => extractBearerToken(undefined), AuthenticationError);
  assert.throws(() => extractBearerToken("Basic abc"), AuthenticationError);
});

test("OAuth consent page emits parseable browser JavaScript", () => {
  const html = renderOAuthConsentPage(
    JSON.stringify({
      supabaseUrl: "https://project.supabase.co",
      supabaseKey: "publishable-key",
    }),
  );
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);

  const transpiled = ts.transpileModule(script, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });
  const errors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.deepEqual(errors, []);
});
