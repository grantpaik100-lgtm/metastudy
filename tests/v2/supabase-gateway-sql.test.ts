import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/202609090002_studymeta_v2_supabase_gateway.sql",
  import.meta.url,
);
const runtimePath = new URL("./supabase-gateway-runtime.sql", import.meta.url);

test("gateway exposes only explicit studymeta_api RPCs to authenticated users", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create schema studymeta_api/i);
  assert.doesNotMatch(sql, /grant select on (all tables|table)/i);
  assert.match(sql, /revoke all on schema studymeta_api from public, anon/i);
  assert.match(sql, /grant usage on schema studymeta_api to authenticated/i);
  assert.match(sql, /revoke all on all tables in schema studymeta_v2 from authenticated/i);
  for (const name of [
    "get_my_identity",
    "get_my_learner_summary",
    "get_my_current_states",
    "get_my_recent_state_log",
    "admin_list_students",
    "admin_list_current_states",
    "admin_list_state_change_log",
    "admin_list_non_change_log",
  ]) {
    assert.match(sql, new RegExp(`function studymeta_api\\.${name}`, "i"));
    assert.match(sql, new RegExp(`grant execute on function studymeta_api\\.${name}[\\s\\S]*?to authenticated`, "i"));
  }
});

test("gateway functions are fixed-search-path security definers with caller checks", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const definitions = sql.match(/create or replace function[\s\S]*?\$\$;/gi) ?? [];
  assert.ok(definitions.length >= 10);
  for (const definition of definitions) {
    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path\s*=\s*pg_catalog/i);
    assert.match(definition, /auth\.(uid|role)\(\)|is_active_admin/i);
  }
  assert.doesNotMatch(sql, /observation\s+jsonb|source_payload|raw_message/i);
  assert.match(sql, /revoke all on all (tables|sequences|functions) in schema studymeta_api/i);
  assert.match(sql, /alter default privileges[\s\S]*revoke execute on functions from public/i);
});

test("server provisioning is a service-role-only atomic wrapper over Stage 2A", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /server_provision_admin_roles/i);
  assert.match(sql, /auth\.role\(\)\s*<>\s*'service_role'/i);
  assert.match(sql, /studymeta_v2\.provision_admin_role/i);
  assert.match(sql, /grant execute on function studymeta_api\.server_provision_admin_roles[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function studymeta_api\.server_provision_admin_roles[\s\S]*to authenticated/i);
});

test("disposable PostgreSQL suite covers anon, student isolation, and admin gateway access", async () => {
  const sql = await readFile(runtimePath, "utf8");
  assert.match(sql, /anon cannot call a learner RPC/i);
  assert.match(sql, /student current states exclude every other learner/i);
  assert.match(sql, /admin-looking email is not administrator authority/i);
  assert.match(sql, /active administrator receives both restricted State logs/i);
  assert.match(sql, /failed multi-target provisioning leaves no partial administrator grant/i);
});
