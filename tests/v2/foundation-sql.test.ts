import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  EVIDENCE_DEFINITIONS,
  STATE_DEFINITIONS,
} from "../../src/v2/contracts/learner-model-definitions.js";

const migrationPath = new URL(
  "../../supabase/migrations/202609080001_studymeta_v2_foundation.sql",
  import.meta.url,
);
const indexPath = new URL("../../index.html", import.meta.url);

test("migration is private-by-default and creates no dictionary data", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create schema if not exists studymeta_v2/i);
  assert.match(sql, /revoke all on schema studymeta_v2 from public, anon, authenticated/i);
  assert.match(sql, /force row level security/i);
  assert.doesNotMatch(sql, /insert\s+into\s+studymeta_v2\.(evidence_definitions|state_definitions)/i);
});

test("migration separates immutable State history from mutable heads", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table studymeta_v2\.state_estimates/i);
  assert.match(sql, /create table studymeta_v2\.state_heads/i);
  assert.match(sql, /create trigger state_estimates_seal_only[\s\S]*seal_reproducibility_record/i);
  assert.match(sql, /primary key \(learner_id, state_target_id, state_type, channel\)/i);
  assert.match(sql, /production.*shadow/is);
  assert.match(sql, /check \(state_type <> 'state_confidence'\)/i);
  assert.match(sql, /create trigger state_estimates_target_kind_insert/i);
  assert.match(sql, /create trigger state_evaluations_target_kind_insert/i);
});

test("migration defines idempotency conflict and Event/outbox transaction boundary", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /unique \(learner_id, connection_scope, idempotency_key\)/i);
  assert.match(sql, /payload_hash text not null/i);
  assert.match(sql, /unique index learning_events_external_source_unique_idx[\s\S]*learner_id, connection_id, external_event_id/i);
  assert.match(sql, /insert one learning_event and its first outbox job in the same database transaction/i);
  assert.match(sql, /foreign key \(owner_learner_id, event_id\)/i);
});

test("learner-owned references use composite owner keys", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /foreign key \(learner_id, session_id\)[\s\S]*sessions\(learner_id, id\)/i);
  assert.match(sql, /foreign key \(learner_id, attempt_id\)[\s\S]*learning_attempts\(learner_id, id\)/i);
  assert.match(sql, /foreign key \(learner_id, event_id\)[\s\S]*learning_events\(learner_id, id\)/i);
  assert.match(sql, /foreign key \(learner_id, evidence_id\)[\s\S]*derived_evidence\(learner_id, id\)/i);
  assert.match(sql, /foreign key \(learner_id, state_target_id\)[\s\S]*state_targets\(learner_id, id\)/i);
  assert.match(sql, /foreign key \(learner_id, state_estimate_id\)[\s\S]*state_estimates\(learner_id, id\)/i);
  assert.match(sql, /create table studymeta_v2\.input_manifest_items/i);
  assert.match(sql, /primary key \(input_manifest_id, ordinal\)/i);
  assert.match(sql, /foreign key \(learner_id, input_manifest_id\)[\s\S]*input_manifests\(learner_id, id\)/i);
});

test("scientific validation and operational mode remain separate tables", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table studymeta_v2\.validation_assessments/i);
  assert.match(sql, /create table studymeta_v2\.operation_assignments/i);
  assert.match(sql, /not_assessed.*under_review.*supported_in_scope.*mixed.*unsupported_in_scope/is);
  assert.match(sql, /research_only.*pilot.*production.*disabled/is);
});

test("scientific validation rows enforce status-specific scope and evidence", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /validation_assessment_semantics/i);
  assert.match(sql, /supporting_source_refs[\s\S]*contradicting_source_refs[\s\S]*study_refs/i);
  assert.match(sql, /population[\s\S]*task_type[\s\S]*learning_environment/i);
  assert.match(sql, /create table studymeta_v2\.research_sources/i);
  assert.match(sql, /create table studymeta_v2\.study_records/i);
  assert.match(sql, /enforce_validation_assessment_references/i);
});

test("State targets are exact and logically unique despite NULLs", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /state_targets_logical_unique_idx[\s\S]*nulls not distinct/i);
  assert.match(sql, /intervention_scope_level = 'domain'[\s\S]*concept_id is null[\s\S]*skill_id is null/i);
  assert.match(sql, /intervention_scope_level = 'concept'[\s\S]*concept_id is not null[\s\S]*concept_version is not null/i);
  assert.match(sql, /intervention_scope_level = 'skill'[\s\S]*skill_id is not null[\s\S]*skill_version is not null/i);
});

test("reproducibility compositions can be drafted and become immutable when sealed", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /sealed_at timestamptz/i);
  assert.match(sql, /reject_sealed_composition_change/i);
  assert.match(sql, /input_manifest_items_sealed_guard/i);
  assert.match(sql, /validation_snapshot_items_sealed_guard/i);
  assert.match(sql, /estimate_evidence_sealed_guard/i);
  assert.match(sql, /state_heads_require_sealed_estimate/i);
});

test("computed State estimates require complete calculation provenance", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /status not in \('estimated', 'candidate'\)[\s\S]*state_update_rule_id is not null/i);
  assert.match(sql, /evidence_count > 0[\s\S]*observation_count > 0/i);
  assert.match(sql, /foreign key \(learner_id, calculation_run_id, input_manifest_id\)/i);
  assert.match(sql, /foreign key \(scale_definition_id, scale_definition_version, state_type, state_definition_version\)/i);
  assert.match(sql, /manifest_input_hash is distinct from new\.calculation_input_hash/i);
});

test("validation assessments bind to exact existing subjects and valid lineage", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /enforce_validation_subject_reference/i);
  assert.match(sql, /subject_kind = 'evidence_definition'[\s\S]*evidence_definitions/i);
  assert.match(sql, /subject_kind = 'generation_rule'[\s\S]*generation_rules/i);
  assert.match(sql, /subject_kind = 'state_update_rule'[\s\S]*state_update_rules/i);
  assert.match(sql, /previous_assessment_id[\s\S]*previous_assessment\.assessment_version >= new\.assessment_version/i);
});

test("Evidence validation assessments match exact definitions, rules, and sealed snapshots", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /enforce_derived_evidence_validation/i);
  assert.match(sql, /definition_validation_assessment_id[\s\S]*subject_kind = 'evidence_definition'/i);
  assert.match(sql, /generation_validation_assessment_id[\s\S]*subject_kind = 'generation_rule'/i);
  assert.match(sql, /validation_snapshot_items[\s\S]*snapshot_sealed_at/i);
});

test("State estimates bind exact rule validation inside their sealed snapshot", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /state_update_validation_assessment_id uuid/i);
  assert.match(sql, /subject_kind = 'state_update_rule'/i);
  assert.match(sql, /state_update_validation_assessment_id[\s\S]*validation_snapshot_items/i);
});

test("operation assignments only target existing exact subject versions", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /operation_assignments_subject_insert/i);
  assert.match(sql, /enforce_validation_subject_reference/i);
});

test("parameter sets are versioned and fixed across rules, manifests, and estimates", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table studymeta_v2\.parameter_sets/i);
  assert.match(sql, /parameter_set_version text/i);
  assert.match(sql, /canonical_artifact_digest text not null/i);
  assert.match(sql, /foreign key \(parameter_set_id, parameter_set_version\)/i);
  assert.match(sql, /manifest_parameter_set_version is distinct from new\.parameter_set_version/i);
});

test("State evaluations keep estimate coordinates and run manifest consistent", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /channel text not null check \(channel in \('production', 'shadow'\)\)/i);
  assert.match(sql, /foreign key \(learner_id, before_estimate_id, state_target_id, state_type, channel\)/i);
  assert.match(sql, /foreign key \(learner_id, after_estimate_id, state_target_id, state_type, channel\)/i);
  assert.match(sql, /foreign key \(learner_id, candidate_estimate_id, state_target_id, state_type, channel\)/i);
  assert.match(sql, /foreign key \(learner_id, run_id, input_manifest_id\)/i);
});

test("original research demo still contains the exact 24/9/9 source records", async () => {
  const html = await readFile(indexPath, "utf8");
  const evidenceBlock = /const evidenceTypes = ([\s\S]*?);\s*const stateTypes/.exec(html)?.[1];
  const stateBlock = /const stateTypes = ([\s\S]*?);\s*const scenarios/.exec(html)?.[1];
  const scenarioBlock = /const scenarios = ([\s\S]*?);\s*const elements/.exec(html)?.[1];
  assert.ok(evidenceBlock);
  assert.ok(stateBlock);
  assert.ok(scenarioBlock);
  assert.equal([...evidenceBlock.matchAll(/id:\s*"([^"]+)"/g)].length, 24);
  assert.equal([...stateBlock.matchAll(/id:\s*"([^"]+)"/g)].length, 9);
  assert.equal([...scenarioBlock.matchAll(/id:\s*"([^"]+)"/g)].length, 9);

  const evidenceFromHtml = [...evidenceBlock.matchAll(/"([^"]+)":\s*\[([\s\S]*?)\](?:,|\s*})/g)]
    .flatMap(([, category, items]) =>
      [...(items ?? "").matchAll(/id:\s*"([^"]+)"/g)].map(([, id]) => ({ category, id })),
    );
  assert.deepEqual(
    EVIDENCE_DEFINITIONS.map(({ category, evidence_type_id: id }) => ({ category, id })),
    evidenceFromHtml,
  );

  const stateFromHtml = [...stateBlock.matchAll(/"([^"]+)":\s*\[([\s\S]*?)\](?:,|\s*})/g)]
    .flatMap(([, group, items]) =>
      [...(items ?? "").matchAll(/id:\s*"([^"]+)"/g)].map(([, id]) => ({ group, id })),
    );
  assert.deepEqual(
    STATE_DEFINITIONS.map(({ group, state_type: id }) => ({ group, id })),
    stateFromHtml,
  );
});
