import assert from "node:assert/strict";
import test from "node:test";
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
