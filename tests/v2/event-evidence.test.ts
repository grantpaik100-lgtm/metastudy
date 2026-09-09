import assert from "node:assert/strict";
import test from "node:test";
import type { LearningEventCommand } from "../../src/v2/contracts/learning-event.js";
import {
  canonicalizeLearningEventCommand,
  hashLearningEventCommand,
} from "../../src/v2/events/canonical-learning-event.js";
import {
  LearningEventIntakeError,
  LearningEventIntakeService,
  type LearningEventIntakeRepository,
} from "../../src/v2/events/learning-event-intake-service.js";
import {
  EvidenceDerivationWorker,
  type DerivationRepository,
} from "../../src/v2/evidence/evidence-derivation-worker.js";
import {
  GenerationRuleRegistry,
  type VersionedGenerationRule,
} from "../../src/v2/evidence/generation-rule-registry.js";

const uuid = (value: number): string =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const timestamp = "2026-09-09T10:00:00.000Z";

const command: LearningEventCommand = {
  schema_version: "studymeta.v2",
  event_type: "attempt_submitted",
  source: "student_web",
  source_provider_reported: null,
  external_event_id: null,
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
    primary_concept_id: "chain-rule",
    supporting_concept_ids: [],
    targets: [{
      target_type: "skill",
      target_id: "chain-rule-apply",
      target_version: "fixture-v1",
      domain_id: "calculus",
      scope_id: "single-variable",
      mapping_status: "provisional",
      mapping_revision_id: uuid(2),
      basis_refs: [uuid(3)],
    }],
    focus_revision: 1,
    catalog_version: null,
    material_id: null,
    task_id: null,
    item_id: null,
    step_id: null,
    attempt_id: uuid(4),
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
      coverage: "complete",
      source_refs: [],
    },
  },
  source_refs: [uuid(3)],
  caused_by_event_id: null,
  correction_of_event_id: null,
};

test("intake rejects client authority, Evidence, State, validation, and operation fields", async () => {
  let writes = 0;
  const repository: LearningEventIntakeRepository = {
    record: async () => {
      writes += 1;
      throw new Error("must not write invalid input");
    },
  };
  const service = new LearningEventIntakeService(repository, {
    version: "event-intake-fixture-v1",
    outbox_max_attempt_policy: "derive-retry-fixture-v1",
  });
  const forbidden = [
    { learner_id: uuid(90) },
    { actor_type: "admin" },
    { evidence: [{ evidence_type_id: "correct" }] },
    { state_updates: { help_need: 0 } },
    { validation_assessment: { status: "supported_in_scope" } },
    { operational_mode: "production" },
  ];

  for (const extra of forbidden) {
    await assert.rejects(
      service.record({ ...command, ...extra }, {
        auth_user_id: uuid(10),
        actor_type: "student",
        connection_id: null,
      }),
      LearningEventIntakeError,
    );
  }
  assert.equal(writes, 0);
});

test("canonical Event serialization is versioned, stable, and SHA-256 hashed", () => {
  const reordered = JSON.parse(JSON.stringify(command)) as Record<string, unknown>;
  const reverseObject = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reverseObject);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .reverse()
          .map(([key, child]) => [key, reverseObject(child)]),
      );
    }
    return value;
  };
  const canonical = canonicalizeLearningEventCommand(command);
  const reorderedCanonical = canonicalizeLearningEventCommand(reverseObject(reordered) as LearningEventCommand);
  assert.equal(canonical, reorderedCanonical);
  assert.match(canonical, /studymeta\.learning-event\.canonical-json\.v1/);
  assert.match(hashLearningEventCommand(command), /^sha256:[a-f0-9]{64}$/);
  assert.equal(hashLearningEventCommand(command), hashLearningEventCommand(reverseObject(reordered) as LearningEventCommand));
  assert.equal(
    hashLearningEventCommand(command),
    hashLearningEventCommand({ ...command, idempotency_key: "another-request-key" }),
    "the transport idempotency key is not part of provider payload identity",
  );
});

test("intake passes only validated command and verified server AuthContext to storage", async () => {
  let received: Parameters<LearningEventIntakeRepository["record"]>[0] | undefined;
  const repository: LearningEventIntakeRepository = {
    record: async (request) => {
      received = request;
      return {
        event_id: uuid(20),
        recorded_at: timestamp,
        duplicate: false,
        processing_status: "pending",
      };
    },
  };
  const service = new LearningEventIntakeService(repository, {
    version: "event-intake-fixture-v1",
    outbox_max_attempt_policy: "derive-retry-fixture-v1",
  });
  const receipt = await service.record(command, {
    auth_user_id: uuid(10),
    actor_type: "student",
    connection_id: null,
  });

  assert.equal(receipt.event_id, uuid(20));
  assert.equal(received?.auth.auth_user_id, uuid(10));
  assert.equal(received?.command.schema_version, "studymeta.v2");
  assert.match(received?.payload_hash ?? "", /^sha256:/);
  assert.ok(!("learner_id" in (received?.command ?? {})));
});

test("student-OAuth external AI actor ambiguity remains fail-closed", async () => {
  const service = new LearningEventIntakeService({ record: async () => assert.fail() }, {
    version: "event-intake-fixture-v1",
    outbox_max_attempt_policy: "derive-retry-fixture-v1",
  });
  await assert.rejects(
    service.record({ ...command, source: "external_ai" }, {
      auth_user_id: uuid(10),
      actor_type: "student",
      connection_id: uuid(11),
    }),
    (error: unknown) =>
      error instanceof LearningEventIntakeError && error.code === "actor_policy_unresolved",
  );
});

test("no shipped generation rule completes with zero Evidence and an explicit hold reason", async () => {
  const calls: string[] = [];
  const repository: DerivationRepository = {
    claim: async () => ({
      job_id: uuid(30),
      run_id: uuid(31),
      event_id: uuid(32),
      learner_id: uuid(33),
      attempt_count: 1,
      command,
    }),
    complete: async (_claim, result) => {
      calls.push(`complete:${result.reason_code}:${result.evidence.length}`);
      return { status: "completed", duplicate: false };
    },
    fail: async () => {
      calls.push("fail");
      return { status: "failed" };
    },
  };
  const worker = new EvidenceDerivationWorker(
    repository,
    new GenerationRuleRegistry([]),
    {
      version: "derive-worker-fixture-v1",
      lease_ms: 5_000,
      max_attempts: 3,
      retry_delay_ms: 100,
      allowed_operational_modes: ["research_only"],
    },
    () => timestamp,
  );

  const outcome = await worker.runOnce("fixture-worker");
  assert.deepEqual(outcome, { status: "completed", evidence_count: 0, reason_code: "no_authorized_generation_rule" });
  assert.deepEqual(calls, ["complete:no_authorized_generation_rule:0"]);
});

test("fixture-only rule output carries exact versioned validation and provenance bindings", async () => {
  const rule: VersionedGenerationRule = {
    generation_rule_id: "fixture-correct-rule",
    generation_rule_version: "fixture-v1",
    evidence_type_id: "correct",
    definition_version: "fixture-v1",
    definition_validation_assessment_id: uuid(40),
    generation_validation_assessment_id: uuid(41),
    validation_snapshot_id: uuid(42),
    definition_operation_assignment_id: uuid(45),
    generation_operation_assignment_id: uuid(46),
    operational_mode: "research_only",
    derive: ({ claim }) => [{
      schema_version: "studymeta.v2",
      evidence_id: uuid(43),
      learner_id: claim.learner_id,
      evidence_type_id: "correct",
      definition_version: "fixture-v1",
      generation_rule: {
        generation_rule_id: "fixture-correct-rule",
        generation_rule_version: "fixture-v1",
      },
      derivation_run_id: claim.run_id,
      event_id: claim.event_id,
      source_event_ids: [claim.event_id],
      basis_refs: [uuid(3)],
      targets: command.coordinates.targets,
      value: true,
      value_status: "observed",
      value_schema_version: "fixture-v1",
      detail: null,
      reason: null,
      qualifiers: { fixture: true },
      observation_confidence: 0.9,
      confidence_method: "fixture-confidence-v1",
      support_condition: "independent",
      observation_group_id: uuid(44),
      attempt_ids: [uuid(4)],
      observed_at: timestamp,
      generated_at: timestamp,
      definition_validation_assessment_id: uuid(40),
      generation_validation_assessment_id: uuid(41),
      validation_snapshot_id: uuid(42),
      provenance_status: "server_captured",
      supersedes_evidence_id: null,
    }],
  };
  let written: unknown;
  const repository: DerivationRepository = {
    claim: async () => ({
      job_id: uuid(30), run_id: uuid(31), event_id: uuid(32), learner_id: uuid(33),
      attempt_count: 1, command,
    }),
    complete: async (_claim, result) => {
      written = result;
      return { status: "completed", duplicate: false };
    },
    fail: async () => ({ status: "failed" }),
  };
  const worker = new EvidenceDerivationWorker(repository, new GenerationRuleRegistry([rule]), {
    version: "derive-worker-fixture-v1",
    lease_ms: 5_000,
    max_attempts: 3,
    retry_delay_ms: 100,
    allowed_operational_modes: ["research_only"],
  }, () => timestamp);

  assert.deepEqual(await worker.runOnce("fixture-worker"), {
    status: "completed", evidence_count: 1, reason_code: null,
  });
  const result = written as {
    evidence: Array<Record<string, unknown>>;
    result_manifest: {
      derivation_policy_version: string;
      allowed_operational_modes: string[];
      operation_bindings: Array<Record<string, unknown>>;
    };
  };
  assert.equal(result.evidence[0]?.definition_validation_assessment_id, uuid(40));
  assert.equal(result.evidence[0]?.generation_validation_assessment_id, uuid(41));
  assert.equal(result.evidence[0]?.validation_snapshot_id, uuid(42));
  assert.equal(result.evidence[0]?.observation_confidence, 0.9);
  assert.equal(result.evidence[0]?.confidence_method, "fixture-confidence-v1");
  assert.equal(result.result_manifest.derivation_policy_version, "derive-worker-fixture-v1");
  assert.deepEqual(result.result_manifest.allowed_operational_modes, ["research_only"]);
  assert.deepEqual(result.result_manifest.operation_bindings, [{
    evidence_id: uuid(43),
    operational_mode: "research_only",
    definition_operation_assignment_id: uuid(45),
    generation_operation_assignment_id: uuid(46),
  }]);
});

test("an injected rule that violates its output contract follows the injected retry policy", async () => {
  let failure: Parameters<DerivationRepository["fail"]>[1] | undefined;
  const policy = {
    version: "derive-worker-fixture-v2",
    lease_ms: 7_000,
    max_attempts: 4,
    retry_delay_ms: 250,
    allowed_operational_modes: ["research_only" as const],
  };
  const repository: DerivationRepository = {
    claim: async (_workerId, receivedPolicy) => {
      assert.deepEqual(receivedPolicy, policy);
      return {
        job_id: uuid(60), run_id: uuid(61), event_id: uuid(62), learner_id: uuid(63),
        attempt_count: 1, command,
      };
    },
    complete: async () => assert.fail("invalid output must not complete"),
    fail: async (_claim, receivedFailure) => {
      failure = receivedFailure;
      return { status: "failed" };
    },
  };
  const rule: VersionedGenerationRule = {
    generation_rule_id: "fixture-empty-rule",
    generation_rule_version: "fixture-v1",
    evidence_type_id: "correct",
    definition_version: "fixture-v1",
    definition_validation_assessment_id: uuid(64),
    generation_validation_assessment_id: uuid(65),
    validation_snapshot_id: uuid(66),
    definition_operation_assignment_id: uuid(67),
    generation_operation_assignment_id: uuid(68),
    operational_mode: "research_only",
    derive: () => [],
  };
  const worker = new EvidenceDerivationWorker(
    repository,
    new GenerationRuleRegistry([rule], "fixture-registry-v2"),
    policy,
    () => timestamp,
  );

  assert.deepEqual(await worker.runOnce("fixture-worker"), {
    status: "failed",
    error_code: "authorized_generation_rule_produced_no_evidence",
  });
  assert.equal(failure?.policy.retry_delay_ms, 250);
  assert.equal(failure?.policy.max_attempts, 4);
});
