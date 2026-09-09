import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/202609090003_studymeta_v2_event_evidence.sql",
  import.meta.url,
);
const runtimePath = new URL("./event-evidence-runtime.sql", import.meta.url);

test("Stage 3 adds atomic Event intake without changing earlier migrations", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /server_record_learning_event/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /insert into studymeta_v2\.learning_events/i);
  assert.match(sql, /insert into studymeta_v2\.event_source_refs/i);
  assert.match(sql, /insert into studymeta_v2\.event_attempts/i);
  assert.match(sql, /insert into studymeta_v2\.event_targets/i);
  assert.match(sql, /insert into studymeta_v2\.outbox_jobs/i);
  assert.match(sql, /idempotency_payload_conflict/i);
  assert.match(sql, /external_event_payload_conflict/i);
  assert.doesNotMatch(sql, /insert into studymeta_v2\.(evidence_definitions|generation_rules|validation_assessments|operation_assignments)/i);
});

test("Stage 3 worker uses lease-safe claiming and injected retry policy", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /p_lease_milliseconds/i);
  assert.match(sql, /p_max_attempts/i);
  assert.match(sql, /p_retry_delay_milliseconds/i);
  assert.match(sql, /dead_letter/i);
  assert.match(sql, /server_complete_evidence_derivation/i);
  assert.match(sql, /server_fail_evidence_derivation/i);
});

test("Evidence completion validates exact provenance and does not invoke State calculation", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /definition_validation_assessment_id/i);
  assert.match(sql, /generation_validation_assessment_id/i);
  assert.match(sql, /validation_snapshot_id/i);
  assert.match(sql, /observation_group_id/i);
  assert.match(sql, /observation_confidence/i);
  assert.match(sql, /confidence_method/i);
  assert.match(sql, /no_authorized_generation_rule/i);
  assert.match(sql, /derivation_policy_version/i);
  assert.match(sql, /allowed_operational_modes/i);
  assert.match(sql, /definition_operation_assignment_id/i);
  assert.match(sql, /generation_operation_assignment_id/i);
  assert.match(sql, /assignments\.id = definition_operation_assignment_id/i);
  assert.match(sql, /assignments\.id = generation_operation_assignment_id/i);
  assert.doesNotMatch(sql, /insert into studymeta_v2\.state_(estimates|evaluations|heads)/i);
});

test("runtime fixture covers conflicts, rollback, leases, retries, and no-rule hold", async () => {
  const sql = await readFile(runtimePath, "utf8");
  for (const phrase of [
    "same payload returns the original Event receipt",
    "same idempotency key with another payload conflicts",
    "cross-learner source reference rolls back Event and outbox",
    "only one worker owns a leased job",
    "failed completion leaves no partial Evidence",
    "retry completion does not duplicate Evidence",
    "no authorized rule preserves Event with zero Evidence",
    "production policy cannot use research-only assignments",
    "expired assignment is rejected",
    "disabled assignment is rejected",
    "assignment without derive permission is rejected",
    "definition and generation assignment slots cannot be exchanged",
  ]) {
    assert.match(sql, new RegExp(phrase, "i"));
  }
});
