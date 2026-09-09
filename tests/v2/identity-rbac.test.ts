import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AccountRoleSchema,
  AdminCurrentStateSchema,
  AdminStateChangeLogSchema,
  AdminStateLogFilterSchema,
  AdminStudentListFilterSchema,
  AdminStudentSummarySchema,
  AuthenticatedLearnerSchema,
  RoleGrantSchema,
  RoleRevocationSchema,
} from "../../src/v2/contracts/identity-rbac.js";

const migrationPath = new URL(
  "../../supabase/migrations/202609090001_studymeta_v2_identity_rbac.sql",
  import.meta.url,
);

const uuid = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`;
const timestamp = "2026-09-09T00:00:00.000Z";

test("identity migration provisions one learner and one active student role idempotently", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /after insert on auth\.users/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path\s*=\s*pg_catalog/i);
  assert.match(sql, /on conflict\s*\(auth_user_id\)\s*do nothing/i);
  assert.match(sql, /where revoked_at is null\s+do nothing/i);
  assert.match(sql, /unique index active_account_roles_unique/i);
});

test("admin provisioning is UUID-only, audited, and unavailable to browser roles", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /provision_admin_role\s*\(\s*p_auth_user_id uuid/i);
  assert.doesNotMatch(sql, /p_email|@example|admin_email/i);
  assert.match(sql, /grant execute on function studymeta_v2\.provision_admin_role[\s\S]*to service_role/i);
  assert.match(sql, /revoke all on function studymeta_v2\.provision_admin_role[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /revoked_by uuid/i);
  assert.match(sql, /revocation_reason text/i);
});

test("student RLS uses auth identity and grants read-only access to required own data", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /create policy learner_self_select/i);
  for (const table of [
    "sessions",
    "learning_events",
    "derived_evidence",
    "state_targets",
    "state_estimates",
    "state_heads",
    "state_evaluations",
  ]) {
    assert.match(sql, new RegExp(`create policy ${table}_self_select`, "i"));
  }
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete)[\s\S]*to authenticated/i);
  assert.match(sql, /restricted global definitions[\s\S]*force row level security/i);
  assert.match(sql, /'validation_assessments'[\s\S]*'operation_assignments'/i);
});

test("admin reads use guarded minimal RPCs and do not grant raw source access", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create or replace function studymeta_v2\.admin_list_students/i);
  assert.match(sql, /create or replace function studymeta_v2\.admin_list_current_states/i);
  assert.match(sql, /create or replace function studymeta_v2\.admin_list_state_change_log/i);
  assert.match(sql, /create or replace function studymeta_v2\.admin_list_non_change_log/i);
  assert.match(sql, /if not studymeta_v2\.is_active_admin\(\)/i);
  assert.doesNotMatch(sql, /grant select on table studymeta_v2\.(source_refs|event_source_refs) to authenticated/i);
  assert.doesNotMatch(sql, /source_payload|observation\s+jsonb|content_ref/i);
});

test("identity and admin response contracts reject malformed or unsafe values", () => {
  assert.equal(AccountRoleSchema.safeParse("admin").success, true);
  assert.equal(AccountRoleSchema.safeParse("owner").success, false);

  const grant = {
    auth_user_id: uuid(1),
    role: "admin" as const,
    granted_by: uuid(2),
    granted_at: timestamp,
    reason: "운영 승인",
  };
  assert.equal(RoleGrantSchema.safeParse(grant).success, true);
  assert.equal(RoleGrantSchema.safeParse({ ...grant, reason: " " }).success, false);
  assert.equal(
    RoleRevocationSchema.safeParse({
      auth_user_id: uuid(1),
      role: "admin",
      revoked_by: uuid(2),
      revoked_at: timestamp,
      reason: "담당 종료",
    }).success,
    true,
  );

  assert.equal(
    AuthenticatedLearnerSchema.safeParse({
      auth_user_id: uuid(1),
      learner_id: uuid(10),
      display_name: null,
      joined_at: timestamp,
      archived_at: null,
      active_roles: ["student", "admin"],
    }).success,
    true,
  );
  assert.equal(
    AuthenticatedLearnerSchema.safeParse({
      auth_user_id: uuid(1),
      learner_id: uuid(10),
      display_name: null,
      joined_at: timestamp,
      archived_at: null,
      active_roles: ["student", "student"],
    }).success,
    false,
  );
});

test("admin list and State log contracts support keyset pagination without raw text", () => {
  const summary = {
    learner_id: uuid(10),
    display_name: "학생 A",
    joined_at: timestamp,
    is_archived: false,
    last_learning_at: null,
    current_state_count: 2,
    needs_review_state_count: 1,
  };
  assert.equal(AdminStudentSummarySchema.safeParse(summary).success, true);
  assert.equal(
    AdminStudentListFilterSchema.safeParse({
      include_archived: false,
      limit: 25,
      after: { joined_at: timestamp, learner_id: uuid(10) },
    }).success,
    true,
  );

  const log = {
    evaluation_id: uuid(20),
    learner_id: uuid(10),
    state_target: {
      state_target_id: uuid(21),
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
    calculation_run_id: uuid(22),
    occurred_at: timestamp,
  };
  assert.equal(AdminStateChangeLogSchema.safeParse(log).success, true);
  assert.equal(
    AdminStateChangeLogSchema.safeParse({ ...log, raw_source_payload: { answer: "sensitive" } }).success,
    false,
  );
  assert.equal(
    AdminStateLogFilterSchema.safeParse({
      learner_id: uuid(10),
      state_type: "procedural_mastery",
      decisions: ["unchanged", "withheld"],
      limit: 50,
      before: { occurred_at: timestamp, evaluation_id: uuid(20) },
    }).success,
    true,
  );
  assert.equal(
    AdminCurrentStateSchema.safeParse({
      learner_id: log.learner_id,
      state_target: log.state_target,
      state_type: log.state_type,
      current_estimate: {
        state_estimate_id: uuid(23),
        status: "unknown",
        value: null,
        estimate_confidence: null,
        evidence_count: 0,
        observation_count: 0,
        as_of: timestamp,
      },
      head_revision: 0,
      freshness: "fresh",
      updated_at: timestamp,
    }).success,
    true,
  );
});
