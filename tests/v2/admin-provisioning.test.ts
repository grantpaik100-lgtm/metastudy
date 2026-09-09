import assert from "node:assert/strict";
import test from "node:test";
import {
  planAdminProvisioning,
  provisionAdmins,
} from "../../src/admin/provisioning.js";

const grantor = "00000000-0000-4000-8000-000000000099";

test("admin provisioning resolves every email exactly once without returning emails", () => {
  const plan = planAdminProvisioning(
    ["first@example.com", "second@example.com"],
    [
      { id: "00000000-0000-4000-8000-000000000001", email: "first@example.com" },
      { id: "00000000-0000-4000-8000-000000000002", email: "SECOND@example.com" },
    ],
  );
  assert.deepEqual(plan, [
    { target: 1, auth_user_id: "00000000-0000-4000-8000-000000000001" },
    { target: 2, auth_user_id: "00000000-0000-4000-8000-000000000002" },
  ]);
  assert.doesNotMatch(JSON.stringify(plan), /example\.com/i);
});

test("admin provisioning fails closed on zero, duplicate, or duplicate-input matches", () => {
  const users = [
    { id: "00000000-0000-4000-8000-000000000001", email: "same@example.com" },
    { id: "00000000-0000-4000-8000-000000000002", email: "same@example.com" },
  ];
  assert.throws(() => planAdminProvisioning(["missing@example.com"], users));
  assert.throws(() => planAdminProvisioning(["same@example.com"], users));
  assert.throws(() => planAdminProvisioning(["A@example.com", "a@example.com"], []));
});

test("provisioning is dry-run by default and applies all UUIDs in one RPC only with apply", async () => {
  const rpcCalls: unknown[] = [];
  const client = {
    schema: () => ({
      rpc: async (_fn: string, args: unknown) => {
        rpcCalls.push(args);
        return {
          data: [{
            auth_user_id: "00000000-0000-4000-8000-000000000001",
            newly_granted: true,
          }],
          error: null,
        };
      },
    }),
  };
  const plan = [{ target: 1, auth_user_id: "00000000-0000-4000-8000-000000000001" }];
  await provisionAdmins(client, plan, {
    grantedBy: grantor,
    reason: "승인 기록",
    logger: () => {},
  });
  assert.equal(rpcCalls.length, 0);
  await provisionAdmins(client, plan, {
    grantedBy: grantor,
    reason: "승인 기록",
    apply: true,
    logger: () => {},
  });
  assert.equal(rpcCalls.length, 1);
});

test("provisioning logs contain neither secret nor full email", async () => {
  const logs: string[] = [];
  const client = { schema: () => ({ rpc: async () => ({ data: [], error: null }) }) };
  const plan = [{ target: 1, auth_user_id: "00000000-0000-4000-8000-000000000001" }];
  await provisionAdmins(client, plan, {
    grantedBy: grantor,
    reason: "승인 기록",
    logger: (message) => logs.push(message),
  });
  assert.doesNotMatch(logs.join("\n"), /secret-value|person@example\.com/i);
});
