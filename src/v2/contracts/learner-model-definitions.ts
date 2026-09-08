import type { EvidenceDefinition } from "./evidence.js";
import { EvidenceDefinitionSchema } from "./evidence.js";
import { z } from "zod";
import { StateDefinitionSchema } from "./state.js";

type StateDefinition = z.infer<typeof StateDefinitionSchema>;

const createdAt = "2026-09-08T00:00:00.000Z";

const evidenceSource = [
  ["PERFORMANCE", "correct", "정답"],
  ["PERFORMANCE", "incorrect", "오답"],
  ["PERFORMANCE", "partial_success", "부분 성공"],
  ["ASSISTANCE", "independent_success", "독립 성공"],
  ["ASSISTANCE", "hint_requested", "힌트 요청"],
  ["ASSISTANCE", "success_after_hint", "힌트 후 성공"],
  ["ASSISTANCE", "success_after_explanation", "설명 후 성공"],
  ["ERROR", "first_error", "첫 오류"],
  ["ERROR", "repeated_error", "반복 오류"],
  ["ERROR", "misconception_candidate", "오개념 후보"],
  ["ERROR", "self_correction", "자기 수정"],
  ["MEMORY / RETRIEVAL", "immediate_retrieval_success", "즉시 인출 성공"],
  ["MEMORY / RETRIEVAL", "delayed_retrieval_success", "지연 인출 성공"],
  ["MEMORY / RETRIEVAL", "delayed_retrieval_failure", "지연 인출 실패"],
  ["MEMORY / RETRIEVAL", "relearning", "재학습"],
  ["TRANSFER", "novel_application_success", "새로운 적용 성공"],
  ["TRANSFER", "novel_application_failure", "새로운 적용 실패"],
  ["METACOGNITION", "confidence_report", "자신감 보고"],
  ["METACOGNITION", "perceived_understanding", "주관적 이해감"],
  ["METACOGNITION", "perceived_difficulty", "주관적 어려움"],
  ["METACOGNITION", "error_awareness", "오류 인식"],
  ["PROCESS", "response_time", "응답 시간"],
  ["PROCESS", "stuck_duration", "막힘 지속시간"],
  ["PROCESS", "attempt_count", "시도 횟수"],
] as const;

export const EVIDENCE_DEFINITIONS: readonly EvidenceDefinition[] = evidenceSource.map(
  ([category, evidenceTypeId, nameKo], index) => {
    const ordinal = index + 1;
    const suffix = String(ordinal).padStart(12, "0");
    return EvidenceDefinitionSchema.parse({
      evidence_type_id: evidenceTypeId,
      definition_version: "1.0",
      category,
      ordinal,
      name_ko: nameKo,
      description: `${nameKo} 관찰을 다른 학습 관찰과 구분하여 기록하는 공식 Evidence 정의`,
      inclusion_criteria: ["버전된 생성 규칙이 요구하는 실제 관찰과 근거 참조가 존재함"],
      exclusion_criteria: ["관찰 누락을 false 또는 0으로 보충한 경우"],
      value_schema_version: "1.0",
      scientific_validation: {
        assessment_id: `00000000-0000-4000-8000-${suffix}`,
        assessment_version: 1,
        subject_kind: "evidence_definition",
        subject_id: evidenceTypeId,
        subject_version: "1.0",
        claim_id: `definition-${evidenceTypeId}`,
        claim: `${nameKo} 관찰을 학습 근거 유형으로 구분할 이론적·경험적 근거가 있는가`,
        scope_id: "unassessed-scope",
        scope: {
          population: null,
          domain: null,
          task_type: null,
          learning_environment: null,
        },
        status: "not_assessed",
        tested_components: [],
        supporting_source_refs: [],
        contradicting_source_refs: [],
        study_refs: [],
        limitations: [],
        reviewed_by: null,
        reviewed_at: null,
        previous_assessment_id: null,
        change_reason: "검토 기록이 없어 초기 미검토 상태로 등록",
        created_at: createdAt,
      },
      operational_mode: null,
      operation_assignment_id: null,
    });
  },
);

export const EVIDENCE_TYPE_IDS = EVIDENCE_DEFINITIONS.map(
  (definition) => definition.evidence_type_id,
) as readonly EvidenceDefinition["evidence_type_id"][];

const stateSource = [
  ["STUDENT × SKILL", "conceptual_mastery", "개념 이해도", "learner_state"],
  ["STUDENT × SKILL", "procedural_mastery", "절차 숙련도", "learner_state"],
  ["STUDENT × SKILL", "retrievability", "인출 가능성", "learner_state"],
  ["STUDENT × SKILL", "transferability", "전이 가능성", "learner_state"],
  ["STUDENT × SKILL", "help_need", "도움 필요도", "learner_state"],
  ["STUDENT × SKILL", "misconception", "오개념", "learner_state"],
  ["STUDENT × SKILL", "state_confidence", "추정 신뢰도", "estimate_metadata"],
  ["STUDENT × DOMAIN", "calibration", "자기평가 정확도", "learner_state"],
  [
    "STUDENT × DOMAIN × INTERVENTION",
    "intervention_response",
    "개입 반응",
    "learner_state",
  ],
] as const;

export const STATE_DEFINITIONS: readonly StateDefinition[] = stateSource.map(
  ([group, stateType, nameKo, valueRole], index) =>
    StateDefinitionSchema.parse({
      state_type: stateType,
      definition_version: "1.0",
      group,
      ordinal: index + 1,
      name_ko: nameKo,
      description:
        stateType === "state_confidence"
          ? "개별 State 추정의 근거 충분성과 측정 불확실성을 나타내는 메타데이터"
          : `${nameKo}를 근거와 범위에 따라 표현하는 버전된 State 정의`,
      value_role: valueRole,
    }),
);

export const STATE_TYPE_IDS = STATE_DEFINITIONS.map(
  (definition) => definition.state_type,
) as readonly StateDefinition["state_type"][];
