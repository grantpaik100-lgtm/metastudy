import assert from "node:assert/strict";
import test from "node:test";
import {
  EVIDENCE_DEFINITIONS,
  EVIDENCE_TYPE_IDS,
  EvidenceInstanceSchema,
  EvidenceValidationContextSchema,
  FactAssertionSchema,
  InputManifestSchema,
  LearningEventCommandSchema,
  ParameterSetSchema,
  ScientificValidationStatusSchema,
  STATE_DEFINITIONS,
  STATE_TYPE_IDS,
  StateEstimateSchema,
  StateEstimateValidationContextSchema,
  StateEvaluationSchema,
  StateTargetSchema,
  ValidationAssessmentSchema,
  ValueWithStatusSchema,
} from "../../src/v2/contracts/index.js";

const uuid = (value: number): string =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const timestamp = "2026-09-08T10:00:00.000Z";

const target = {
  target_type: "skill" as const,
  target_id: "math.chain_rule.apply",
  target_version: "1.0",
  domain_id: "calculus",
  scope_id: "single-variable",
  mapping_status: "provisional" as const,
  mapping_revision_id: uuid(8),
  basis_refs: [uuid(9)],
};

const command = {
  schema_version: "studymeta.v2" as const,
  event_type: "attempt_submitted" as const,
  source: "chatgpt" as const,
  source_provider_reported: "ChatGPT",
  external_event_id: "chatgpt-event-0001",
  idempotency_key: "request-00000001",
  occurred_at: timestamp,
  started_at: null,
  ended_at: null,
  coordinates: {
    session_id: uuid(1),
    episode_id: null,
    goal_ids: [],
    assessment_goal_ids: [],
    course_offering_id: null,
    catalog_node_ids: [],
    domain_id: "calculus",
    primary_concept_id: "math.chain_rule.single",
    supporting_concept_ids: ["math.trig.derivative"],
    targets: [target],
    focus_revision: 1,
    catalog_version: null,
    material_id: null,
    task_id: null,
    item_id: null,
    step_id: null,
    attempt_id: uuid(2),
    intervention_instance_ids: [],
  },
  observation: {
    learner_actions: [],
    assistant_actions: [],
    answers: [],
    assessments: [],
    self_reports: [],
    measurements: [],
    support_trace: {
      offered: false,
      requested: false,
      selected: false,
      delivered: false,
      answer_exposed: false,
      intervention_instance_ids: [],
      coverage: "complete" as const,
      source_refs: [],
    },
  },
  source_refs: [],
  caused_by_event_id: null,
  correction_of_event_id: null,
};

test("null/unknown, false, and zero remain distinct", () => {
  assert.deepEqual(ValueWithStatusSchema.parse({ value: null, status: "unknown" }), {
    value: null,
    status: "unknown",
  });
  assert.deepEqual(ValueWithStatusSchema.parse({ value: false, status: "confirmed" }), {
    value: false,
    status: "confirmed",
  });
  assert.deepEqual(ValueWithStatusSchema.parse({ value: 0, status: "observed" }), {
    value: 0,
    status: "observed",
  });
  assert.equal(
    ValueWithStatusSchema.safeParse({ value: 0, status: "unknown" }).success,
    false,
  );
});

test("Learning Event input accepts observations and rejects Evidence or State commands", () => {
  assert.equal(LearningEventCommandSchema.safeParse(command).success, true);
  assert.equal(
    LearningEventCommandSchema.safeParse({ ...command, evidence: [{ type: "correct" }] })
      .success,
    false,
  );
  assert.equal(
    LearningEventCommandSchema.safeParse({ ...command, state_updates: { help_need: 0 } })
      .success,
    false,
  );
  assert.equal(command.coordinates.targets.length, 1);
  const multipleTargets = structuredClone(command);
  multipleTargets.coordinates.targets.push({ ...target, target_id: "math.trig.derivative" });
  assert.equal(LearningEventCommandSchema.safeParse(multipleTargets).success, true);
});

test("official Evidence definitions preserve the 24 original IDs and order", () => {
  assert.deepEqual(EVIDENCE_TYPE_IDS, [
    "correct",
    "incorrect",
    "partial_success",
    "independent_success",
    "hint_requested",
    "success_after_hint",
    "success_after_explanation",
    "first_error",
    "repeated_error",
    "misconception_candidate",
    "self_correction",
    "immediate_retrieval_success",
    "delayed_retrieval_success",
    "delayed_retrieval_failure",
    "relearning",
    "novel_application_success",
    "novel_application_failure",
    "confidence_report",
    "perceived_understanding",
    "perceived_difficulty",
    "error_awareness",
    "response_time",
    "stuck_duration",
    "attempt_count",
  ]);
  assert.equal(EVIDENCE_DEFINITIONS.length, 24);
  assert.equal(new Set(EVIDENCE_DEFINITIONS.map((item) => item.ordinal)).size, 24);
  for (const definition of EVIDENCE_DEFINITIONS) {
    assert.equal(definition.scientific_validation.status, "not_assessed");
    assert.equal(definition.operational_mode, null);
    assert.equal(definition.operation_assignment_id, null);
  }
});

test("official State definitions preserve all 9 IDs and metadata-only state confidence", () => {
  assert.deepEqual(STATE_TYPE_IDS, [
    "conceptual_mastery",
    "procedural_mastery",
    "retrievability",
    "transferability",
    "help_need",
    "misconception",
    "state_confidence",
    "calibration",
    "intervention_response",
  ]);
  assert.equal(STATE_DEFINITIONS.length, 9);
  assert.equal(
    STATE_DEFINITIONS.find((item) => item.state_type === "state_confidence")?.value_role,
    "estimate_metadata",
  );
});

test("scientific validation status is not an operational mode or confidence", () => {
  assert.equal(ScientificValidationStatusSchema.safeParse("production").success, false);
  const initial = EVIDENCE_DEFINITIONS[0]?.scientific_validation;
  assert.ok(initial);
  assert.equal(initial.status, "not_assessed");
  assert.equal(initial.reviewed_by, null);
  assert.equal(initial.reviewed_at, null);

  assert.equal(
    ValidationAssessmentSchema.safeParse({
      ...initial,
      status: "supported_in_scope",
      reviewed_by: null,
      reviewed_at: null,
    }).success,
    false,
  );
});

test("scientific validation requires status-specific scope and evidence", () => {
  const initial = EVIDENCE_DEFINITIONS[0]?.scientific_validation;
  assert.ok(initial);
  const reviewed = {
    ...initial,
    reviewed_by: uuid(201),
    reviewed_at: timestamp,
  };

  assert.equal(ValidationAssessmentSchema.safeParse(initial).success, true);
  assert.equal(
    ValidationAssessmentSchema.safeParse({ ...initial, study_refs: [uuid(200)] }).success,
    false,
  );
  assert.equal(
    ValidationAssessmentSchema.safeParse({ ...reviewed, status: "supported_in_scope" }).success,
    false,
  );

  const scoped = {
    ...reviewed,
    scope: {
      population: "대학생",
      domain: "미적분학",
      task_type: "단답형 문제 풀이",
      learning_environment: "외부 AI 튜터 대화",
    },
  };
  assert.equal(
    ValidationAssessmentSchema.safeParse({
      ...scoped,
      status: "supported_in_scope",
      supporting_source_refs: [uuid(202)],
    }).success,
    true,
  );
  assert.equal(
    ValidationAssessmentSchema.safeParse({ ...scoped, status: "mixed" }).success,
    false,
  );
  assert.equal(
    ValidationAssessmentSchema.safeParse({
      ...scoped,
      status: "mixed",
      supporting_source_refs: [uuid(203)],
      contradicting_source_refs: [uuid(204)],
    }).success,
    true,
  );
  assert.equal(
    ValidationAssessmentSchema.safeParse({ ...scoped, status: "unsupported_in_scope" }).success,
    false,
  );
  assert.equal(
    ValidationAssessmentSchema.safeParse({
      ...scoped,
      status: "unsupported_in_scope",
      contradicting_source_refs: [uuid(205)],
    }).success,
    true,
  );
  assert.equal(
    ValidationAssessmentSchema.safeParse({ ...reviewed, status: "under_review" }).success,
    false,
  );
  assert.equal(
    ValidationAssessmentSchema.safeParse({
      ...reviewed,
      status: "under_review",
      limitations: ["검토 프로토콜 진행 중"],
    }).success,
    true,
  );
});

test("inferred facts require traceable basis, reason, and model version", () => {
  const result = FactAssertionSchema.safeParse({
    assertion_id: uuid(30),
    learner_id: uuid(31),
    subject_type: "learner",
    subject_id: null,
    attribute: "preferred_explanation_length",
    context_scope_id: null,
    origin: "inferred",
    value: "short",
    status: "candidate",
    source_refs: [],
    basis_refs: [],
    reason: null,
    confidence: null,
    model_version: null,
    created_at: timestamp,
    supersedes_assertion_id: null,
  });
  assert.equal(result.success, false);
});

test("Evidence keeps observation confidence separate and groups one learning opportunity", () => {
  const evidence = EvidenceInstanceSchema.parse({
    schema_version: "studymeta.v2",
    evidence_id: uuid(40),
    learner_id: uuid(41),
    evidence_type_id: "success_after_hint",
    definition_version: "1.0",
    generation_rule: {
      generation_rule_id: "hint-success",
      generation_rule_version: "1.0",
    },
    derivation_run_id: uuid(42),
    event_id: uuid(43),
    source_event_ids: [uuid(43), uuid(44)],
    basis_refs: [uuid(45)],
    targets: [target],
    value: true,
    value_status: "observed",
    value_schema_version: "1.0",
    detail: null,
    reason: null,
    qualifiers: {},
    observation_confidence: null,
    confidence_method: null,
    support_condition: "hint",
    observation_group_id: uuid(46),
    attempt_ids: [uuid(2)],
    observed_at: timestamp,
    generated_at: timestamp,
    definition_validation_assessment_id: uuid(47),
    generation_validation_assessment_id: uuid(48),
    validation_snapshot_id: uuid(49),
    provenance_status: "source_reported",
    supersedes_evidence_id: null,
  });
  assert.equal(evidence.observation_confidence, null);
  assert.equal(evidence.observation_group_id, uuid(46));
  assert.equal(evidence.source_event_ids.length, 2);

  const validationTemplate = EVIDENCE_DEFINITIONS[0]?.scientific_validation;
  assert.ok(validationTemplate);
  const definitionAssessment = {
    ...validationTemplate,
    assessment_id: uuid(47),
    subject_id: "success_after_hint",
  };
  const generationAssessment = {
    ...validationTemplate,
    assessment_id: uuid(48),
    subject_kind: "generation_rule" as const,
    subject_id: "hint-success",
  };
  const validationContext = {
    evidence,
    definition_assessment: definitionAssessment,
    generation_assessment: generationAssessment,
    snapshot: {
      validation_snapshot_id: uuid(49),
      assessment_ids: [uuid(47), uuid(48)],
      created_at: timestamp,
      sealed_at: timestamp,
    },
  };
  assert.equal(EvidenceValidationContextSchema.safeParse(validationContext).success, true);
  assert.equal(
    EvidenceValidationContextSchema.safeParse({
      ...validationContext,
      definition_assessment: { ...definitionAssessment, subject_id: "incorrect" },
    }).success,
    false,
  );
});

test("State estimate owns its target and unknown does not become zero", () => {
  const learnerId = uuid(50);
  const estimate = {
    state_estimate_id: uuid(51),
    learner_id: learnerId,
    target: {
      state_target_id: uuid(52),
      learner_id: learnerId,
      target_kind: "knowledge" as const,
      domain_id: "calculus",
      scope_id: "single-variable",
      knowledge_level: "skill" as const,
      concept_id: null,
      concept_version: null,
      skill_id: "math.chain_rule.apply",
      skill_version: "1.0",
    },
    state_type: "procedural_mastery" as const,
    state_definition_version: "1.0",
    value: null,
    status: "unknown" as const,
    unknown_reason: "initial" as const,
    scale_definition_id: null,
    scale_definition_version: null,
    estimate_confidence: null,
    confidence_method_version: null,
    evidence_count: 0,
    observation_count: 0,
    effective_sample_size: null,
    supporting_evidence_ids: [],
    excluded_evidence_ids: [],
    state_update_rule_id: null,
    state_update_rule_version: null,
    model_version: null,
    parameter_set_id: null,
    parameter_set_version: null,
    validation_snapshot_id: null,
    state_update_validation_assessment_id: null,
    operational_policy_version: null,
    operational_mode: null,
    calculation_run_id: null,
    input_manifest_id: null,
    calculation_input_hash: null,
    channel: "production" as const,
    as_of: timestamp,
    computed_at: timestamp,
    recorded_at: timestamp,
    supersedes_state_estimate_id: null,
    limitations: [],
    sealed_at: null,
  };
  assert.equal(StateEstimateSchema.safeParse(estimate).success, true);
  assert.equal(StateEstimateSchema.safeParse({ ...estimate, value: 0 }).success, false);
  assert.equal(
    StateEstimateSchema.safeParse({
      ...estimate,
      target: { ...estimate.target, learner_id: uuid(99) },
    }).success,
    false,
  );
  assert.equal(
    StateEstimateSchema.safeParse({ ...estimate, state_type: "state_confidence" }).success,
    false,
  );
  assert.equal(
    StateEstimateSchema.safeParse({
      ...estimate,
      state_type: "calibration",
    }).success,
    false,
  );
  assert.equal(
    StateEstimateSchema.safeParse({
      ...estimate,
      status: "estimated",
      value: 0.99,
    }).success,
    false,
  );
  const computed = {
    ...estimate,
    status: "estimated" as const,
    unknown_reason: null,
    value: 0.75,
    scale_definition_id: "probability-v1",
    scale_definition_version: "1.0",
    evidence_count: 1,
    observation_count: 1,
    supporting_evidence_ids: [uuid(53)],
    state_update_rule_id: "procedural-mastery-v1",
    state_update_rule_version: "1.0",
    validation_snapshot_id: uuid(54),
    state_update_validation_assessment_id: uuid(57),
    calculation_run_id: uuid(55),
    input_manifest_id: uuid(56),
    calculation_input_hash: "sha256:computed",
    sealed_at: timestamp,
  };
  assert.equal(StateEstimateSchema.safeParse(computed).success, true);
  const validationTemplate = EVIDENCE_DEFINITIONS[0]?.scientific_validation;
  assert.ok(validationTemplate);
  const stateValidationContext = {
    estimate: computed,
    state_update_assessment: {
      ...validationTemplate,
      assessment_id: uuid(57),
      subject_kind: "state_update_rule" as const,
      subject_id: "procedural-mastery-v1",
    },
    snapshot: {
      validation_snapshot_id: uuid(54),
      assessment_ids: [uuid(57)],
      created_at: timestamp,
      sealed_at: timestamp,
    },
  };
  assert.equal(StateEstimateValidationContextSchema.safeParse(stateValidationContext).success, true);
  assert.equal(
    StateEstimateValidationContextSchema.safeParse({
      ...stateValidationContext,
      snapshot: { ...stateValidationContext.snapshot, sealed_at: null },
    }).success,
    false,
  );
  assert.equal(StateEstimateSchema.safeParse({ ...computed, status: "candidate" }).success, true);
  assert.equal(
    StateEstimateSchema.safeParse({ ...computed, evidence_count: 2 }).success,
    false,
  );
  assert.equal(
    StateEstimateSchema.safeParse({
      ...computed,
      status: "unknown",
      unknown_reason: "evidence_retracted",
      value: null,
      scale_definition_id: null,
      scale_definition_version: null,
      evidence_count: 0,
      observation_count: 0,
      supporting_evidence_ids: [],
      supersedes_state_estimate_id: estimate.state_estimate_id,
      limitations: ["기존 근거가 철회되어 재계산 결과를 사용할 수 없음"],
    }).success,
    true,
  );
  assert.equal(
    StateEstimateSchema.safeParse({
      ...estimate,
      status: "not_applicable",
      unknown_reason: null,
    }).success,
    true,
  );
});

test("State targets reject unrelated or incomplete coordinates", () => {
  const base = {
    state_target_id: uuid(220),
    learner_id: uuid(221),
    domain_id: "calculus",
    scope_id: "single-variable",
  };
  const concept = {
    ...base,
    target_kind: "knowledge" as const,
    knowledge_level: "concept" as const,
    concept_id: "math.chain_rule",
    concept_version: "1.0",
    skill_id: null,
    skill_version: null,
  };
  const skill = {
    ...base,
    target_kind: "knowledge" as const,
    knowledge_level: "skill" as const,
    concept_id: null,
    concept_version: null,
    skill_id: "math.chain_rule.apply",
    skill_version: "1.0",
  };
  const intervention = {
    ...base,
    target_kind: "intervention" as const,
    intervention_type_id: "hint",
    intervention_type_version: "1.0",
    scope_level: "domain" as const,
    concept_id: null,
    concept_version: null,
    skill_id: null,
    skill_version: null,
  };

  assert.equal(StateTargetSchema.safeParse(concept).success, true);
  assert.equal(StateTargetSchema.safeParse(skill).success, true);
  assert.equal(StateTargetSchema.safeParse(intervention).success, true);
  assert.equal(
    StateTargetSchema.safeParse({ ...skill, concept_id: "other-concept" }).success,
    false,
  );
  assert.equal(
    StateTargetSchema.safeParse({ ...concept, concept_version: null }).success,
    false,
  );
  assert.equal(
    StateTargetSchema.safeParse({ ...intervention, concept_id: "math.chain_rule" }).success,
    false,
  );
  assert.equal(
    StateTargetSchema.safeParse({
      ...intervention,
      scope_level: "concept",
      concept_id: "math.chain_rule",
      concept_version: "1.0",
    }).success,
    true,
  );
  assert.equal(
    StateTargetSchema.safeParse({
      ...intervention,
      scope_level: "concept",
      concept_id: "math.chain_rule",
      concept_version: null,
    }).success,
    false,
  );
  assert.equal(
    StateTargetSchema.safeParse({
      ...intervention,
      scope_level: "skill",
      skill_id: "math.chain_rule.apply",
      skill_version: "1.0",
    }).success,
    true,
  );
  assert.equal(
    StateTargetSchema.safeParse({
      ...intervention,
      scope_level: "skill",
      skill_id: "math.chain_rule.apply",
      skill_version: null,
    }).success,
    false,
  );
});

test("input manifest keeps ordered real references and explicit exclusions", () => {
  const manifest = {
    input_manifest_id: uuid(60),
    learner_id: uuid(61),
    items: [
      {
        kind: "event" as const,
        ref_id: uuid(62),
        ordinal: 0,
        included: true,
        exclusion_reason_code: null,
      },
      {
        kind: "evidence" as const,
        ref_id: uuid(63),
        ordinal: 1,
        included: false,
        exclusion_reason_code: "source_deleted",
      },
    ],
    catalog_mapping_versions: [],
    rule_artifacts: [],
    model_version: null,
    prompt_version: null,
    parameter_set_id: null,
    parameter_set_version: null,
    validation_snapshot_id: uuid(64),
    operational_policy_version: null,
    as_of: timestamp,
    knowledge_cutoff: timestamp,
    random_seed: null,
    input_hash: "sha256:example",
    created_at: timestamp,
    sealed_at: null,
  };
  assert.equal(InputManifestSchema.safeParse(manifest).success, true);
  assert.equal(
    InputManifestSchema.safeParse({
      ...manifest,
      items: manifest.items.map((item) => ({ ...item, ordinal: 0 })),
    }).success,
    false,
  );
  assert.equal(
    InputManifestSchema.safeParse({
      ...manifest,
      items: [{ ...manifest.items[0], included: false, exclusion_reason_code: null }],
    }).success,
    false,
  );
});

test("parameter sets and their references require explicit versions", () => {
  assert.equal(
    ParameterSetSchema.safeParse({
      parameter_set_id: "procedural-mastery-params",
      parameter_set_version: "1.0",
      parameter_schema: {},
      parameter_payload: {},
      canonical_artifact_digest: "sha256:parameter-set-v1",
      created_at: timestamp,
    }).success,
    true,
  );

  const manifest = {
    input_manifest_id: uuid(240),
    learner_id: uuid(241),
    items: [{
      kind: "evidence" as const,
      ref_id: uuid(242),
      ordinal: 0,
      included: true,
      exclusion_reason_code: null,
    }],
    catalog_mapping_versions: [],
    rule_artifacts: [],
    model_version: null,
    prompt_version: null,
    parameter_set_id: "procedural-mastery-params",
    parameter_set_version: null,
    validation_snapshot_id: uuid(243),
    operational_policy_version: null,
    as_of: timestamp,
    knowledge_cutoff: timestamp,
    random_seed: null,
    input_hash: "sha256:manifest",
    created_at: timestamp,
    sealed_at: null,
  };
  assert.equal(InputManifestSchema.safeParse(manifest).success, false);
});

test("State evaluations require an explicit channel and calculation manifest", () => {
  const evaluation = {
    evaluation_id: uuid(250),
    learner_id: uuid(251),
    state_target_id: uuid(252),
    state_type: "procedural_mastery" as const,
    channel: "production" as const,
    trigger_type: "event" as const,
    trigger_event_id: uuid(253),
    run_id: uuid(254),
    processing_status: "completed" as const,
    decision: "updated" as const,
    reason_codes: [],
    reason_detail: null,
    input_evidence_ids: [uuid(255)],
    used_evidence_ids: [uuid(255)],
    excluded_evidence: [],
    before_estimate_id: null,
    after_estimate_id: uuid(256),
    candidate_estimate_id: null,
    changed_fields: ["value" as const],
    rule_refs: [{ id: "procedural-mastery-rule", version: "1.0" }],
    validation_snapshot_id: uuid(257),
    policy_version: null,
    input_manifest_id: uuid(258),
    started_at: timestamp,
    completed_at: timestamp,
    request_id: uuid(259),
  };
  assert.equal(StateEvaluationSchema.safeParse(evaluation).success, true);
  const { channel: _channel, ...withoutChannel } = evaluation;
  assert.equal(StateEvaluationSchema.safeParse(withoutChannel).success, false);
  assert.equal(StateEvaluationSchema.safeParse({ ...evaluation, input_manifest_id: null }).success, false);
});
