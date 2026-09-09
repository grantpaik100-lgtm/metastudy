import { EVIDENCE_DEFINITIONS } from "../../contracts/learner-model-definitions.js";
import { AdminStateDisplaySchema, AdminValidationMatrixSchema } from "../contracts.js";
import type { z } from "zod";

/** UI-only adapter. It deliberately has no network or write implementation. */
export const ADMIN_PREVIEW_PROVENANCE = {
  data_mode: "synthetic_ui_mock" as const,
  source_label: "가상 UI 예시 데이터",
};

export type AdminValidationRow = z.infer<typeof AdminValidationMatrixSchema>["rows"][number];
type AdminStateDisplay = z.infer<typeof AdminStateDisplaySchema>;

const at = "2026-09-09T09:00:00+09:00";
const unassessed = {
  assessment_ref: "synthetic-assessment", assessment_version: 1,
  validation_status: "not_assessed" as const,
  claim: "가상 UI 행: 실제 검증 주장이 아닙니다.",
  scope: { population: null, domain: null, task_type: null, learning_environment: null },
  supporting_source_refs: [], contradicting_source_refs: [], study_refs: [], limitations: [],
  reviewer_ref: null, reviewed_at: null, history_ref: null, operation_assignment: null,
};

export const syntheticAdminValidationRows: readonly AdminValidationRow[] = EVIDENCE_DEFINITIONS.flatMap((evidence) => [
  { ...unassessed, layer: "A" as const, subject_kind: "evidence_definition" as const, subject_id: evidence.evidence_type_id, subject_version: evidence.definition_version, evidence_type_id: evidence.evidence_type_id },
  { ...unassessed, layer: "B" as const, subject_kind: "generation_rule" as const, subject_id: `synthetic-generation-${evidence.evidence_type_id}`, subject_version: "1.0", evidence_type_id: evidence.evidence_type_id },
  { ...unassessed, layer: "C" as const, subject_kind: "state_update_rule" as const, subject_id: `synthetic-update-${evidence.evidence_type_id}`, subject_version: "1.0", evidence_type_id: evidence.evidence_type_id },
]);

export const syntheticAdminValidationMatrix = AdminValidationMatrixSchema.parse({
  provenance: ADMIN_PREVIEW_PROVENANCE,
  rows: syntheticAdminValidationRows,
});

const base = (state_type: AdminStateDisplay["state_type"], display_label: string, result_reason_label: string): AdminStateDisplay => ({
  state_type, display_label, value: null, status: "unknown", display_level: "unknown",
  display_text: "가상 예시 데이터입니다. 실제 학습 판단이 아닙니다.", tone: "neutral", direction: "not_applicable",
  scale_definition_id: null, scale_definition_version: null, evaluated_at: null, as_of: at,
  evidence_count: 0, observation_count: 0, result_outcome: "unchanged", result_reason_label,
  estimate_confidence: null, estimate_confidence_label: null,
});

export const syntheticAdminStudents = [
  { learner_ref: "learner-preview-01", display_name: "가상 학생 01", subject: "가상 미적분", concept: "가상 연쇄법칙", last_active_at: at, attention: "확인 필요 없음", states: [base("conceptual_mastery", "개념 이해", "관련 Evidence 없음"), base("intervention_response", "개입 반응", "운영 정책 차단")], account: "활성" },
  { learner_ref: "learner-preview-02", display_name: "가상 학생 02", subject: "가상 선형대수", concept: "가상 고유값", last_active_at: "2026-09-08T15:20:00+09:00", attention: "재계산 대기", states: [base("procedural_mastery", "절차 숙련", "최소 Evidence 미충족")], account: "활성" },
] as const;

export const syntheticNonChangeReasons = ["관련 Evidence 없음", "최소 Evidence 미충족", "State 연결 규칙 없음", "규칙 비활성화", "운영 정책 차단", "이전 결과와 동일", "재계산 대기"] as const;
