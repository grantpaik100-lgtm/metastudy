import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AuthenticationError,
  verifyUserAccessToken,
} from "../../src/auth/oauth.js";
import {
  createUserScopedSupabaseClient,
} from "../../src/supabase/clients.js";
import { StudyMetaDataApi } from "../../src/supabase/studymeta-api.js";

const userId = "00000000-0000-4000-8000-000000000001";
const timestamp = "2026-09-09T00:00:00.000Z";

test("JWT verification uses a publishable-key Auth client and rejects invalid users", async () => {
  const calls: Array<{ url: string; key: string; jwt: string }> = [];
  const user = await verifyUserAccessToken("signed-user-token", {
    supabaseUrl: "https://project.supabase.co",
    publishableKey: "publishable-key",
    createAuthClient: (url, key) => ({
      auth: {
        getUser: async (jwt: string) => {
          calls.push({ url, key, jwt });
          return { data: { user: { id: userId } }, error: null };
        },
      },
    }),
  });

  assert.equal(user.id, userId);
  assert.deepEqual(calls, [{
    url: "https://project.supabase.co",
    key: "publishable-key",
    jwt: "signed-user-token",
  }]);

  for (const result of [
    { data: { user: null }, error: { message: "expired" } },
    { data: { user: { id: "not-a-uuid" } }, error: null },
  ]) {
    await assert.rejects(
      verifyUserAccessToken("private-token", {
        supabaseUrl: "https://project.supabase.co",
        publishableKey: "publishable-key",
        createAuthClient: () => ({ auth: { getUser: async () => result } }),
      }),
      (error: unknown) =>
        error instanceof AuthenticationError &&
        !error.message.includes("private-token"),
    );
  }
});

test("user-scoped client pins studymeta_api and forwards the same access token", () => {
  const calls: unknown[][] = [];
  createUserScopedSupabaseClient(
    "https://project.supabase.co",
    "publishable-key",
    "user-access-token",
    ((...args: unknown[]) => {
      calls.push(args);
      return {};
    }) as never,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[1], "publishable-key");
  assert.deepEqual(calls[0]?.[2], {
    db: { schema: "studymeta_api" },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer user-access-token" } },
  });
});

test("Data API calls only studymeta_api RPCs and fails closed on malformed rows", async () => {
  const calls: Array<{ schema: string; fn: string; args: unknown }> = [];
  const results = new Map<string, unknown>([
    ["get_my_identity", [{
      auth_user_id: userId,
      learner_id: "00000000-0000-4000-8000-000000000010",
      display_name: null,
      joined_at: timestamp,
      archived_at: null,
      active_roles: ["student"],
    }]],
    ["get_my_current_states", [{ unexpected: "unsafe" }]],
  ]);
  const client = {
    schema(schema: string) {
      return {
        rpc: async (fn: string, args?: unknown) => {
          calls.push({ schema, fn, args });
          return { data: results.get(fn), error: null };
        },
      };
    },
  };
  const api = new StudyMetaDataApi(client);

  assert.equal((await api.getMyIdentity()).auth_user_id, userId);
  await assert.rejects(api.getMyCurrentStates(), /invalid database response/i);
  assert.ok(calls.every((call) => call.schema === "studymeta_api"));
});

test("admin RPC responses reject raw observation or source payload fields", async () => {
  const safeLog = {
    evaluation_id: "00000000-0000-4000-8000-000000000020",
    learner_id: "00000000-0000-4000-8000-000000000010",
    state_target: {
      state_target_id: "00000000-0000-4000-8000-000000000021",
      target_kind: "knowledge",
      domain_id: "calculus",
      scope_id: "single-variable",
      knowledge_level: "skill",
      concept_id: null,
      concept_version: null,
      skill_id: "chain-rule",
      skill_version: "1.0",
      intervention_type_id: null,
      intervention_type_version: null,
      intervention_scope_level: null,
    },
    state_type: "procedural_mastery",
    before_estimate: null,
    after_estimate: null,
    candidate_estimate: null,
    decision: "unchanged",
    changed_fields: [],
    reason_codes: ["insufficient_evidence"],
    processing_status: "completed",
    non_change_category: "insufficient_evidence",
    validation_snapshot_id: null,
    calculation_run_id: "00000000-0000-4000-8000-000000000022",
    occurred_at: timestamp,
  };
  const client = {
    schema() {
      return {
        rpc: async () => ({
          data: [{ ...safeLog, observation: { answer: "sensitive" } }],
          error: null,
        }),
      };
    },
  };

  await assert.rejects(
    new StudyMetaDataApi(client).adminListStateChangeLog(),
    /invalid database response/i,
  );
});

test("learner-context uses authenticated read services without an elevated client", async () => {
  const source = await readFile(
    new URL("../../api/learner-context.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /authenticateRequest\(request\)/);
  assert.match(source, /createAuthenticatedReadServices/);
  assert.match(source, /getMyContext/);
  assert.doesNotMatch(source, /getDefaultServices|SUPABASE_(SECRET|SERVICE_ROLE)_KEY/);
});
