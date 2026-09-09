import assert from "node:assert/strict";
import test from "node:test";
import { syntheticAdminValidationMatrix, syntheticAdminValidationRows, syntheticAdminStudents } from "../../src/v2/ui/admin/mock-adapter.js";
import { renderAdminPreviewHtml } from "../../src/v2/ui/admin/preview.js";

test("admin preview keeps official 24 Evidence in three exact A/B/C layers", () => {
  assert.equal(syntheticAdminValidationRows.length, 72);
  assert.equal(new Set(syntheticAdminValidationRows.map((row) => row.evidence_type_id)).size, 24);
  assert.equal(syntheticAdminValidationMatrix.rows.every((row) => row.operation_assignment === null), true);
  assert.equal(syntheticAdminValidationMatrix.rows.every((row) => row.validation_status === "not_assessed"), true);
  for (const row of syntheticAdminValidationRows) {
    assert.equal(row.subject_kind, row.layer === "A" ? "evidence_definition" : row.layer === "B" ? "generation_rule" : "state_update_rule");
  }
});

test("admin-only intervention is present but confidence is estimate metadata", () => {
  assert.equal(syntheticAdminStudents[0]?.states.some((state) => state.state_type === "intervention_response"), true);
  assert.equal(syntheticAdminStudents.flatMap((student) => student.states).every((state) => state.estimate_confidence === null), true);
});

test("preview labels mock provenance and has no raw sensitive fields or direct state write", () => {
  const html = renderAdminPreviewHtml();
  assert.match(html, /synthetic_ui_mock/);
  assert.match(html, /실제 admin 인증 성공을 나타내지 않습니다/);
  assert.doesNotMatch(html, /email|password|access_token|secret/i);
  assert.doesNotMatch(html, /<button[^>]*>[^<]*State 직접/);
  assert.match(html, /disabled aria-disabled/);
});
