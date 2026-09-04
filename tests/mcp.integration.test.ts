import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  Client,
  InMemoryTransport,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type {
  DomainState,
  LearnerProfile,
  LearnerStateEstimate,
  LearningEvent,
  RecordLearningEventInput,
  RecentLearningEvent,
  SkillState,
  Student,
} from "../src/domain/contracts.js";
import { createStudyMetaMcpServer } from "../src/mcp/server.js";
import { createStudyMetaMcpHttpHandlers } from "../src/mcp/http-handler.js";
import type { StudyMetaRepository } from "../src/repositories/study-meta-repository.js";
import { createStudyMetaServices } from "../src/services/service-container.js";

const demoStudentId = "00000000-0000-4000-8000-000000000001";
const seededEventId = "00000000-0000-4000-8000-000000000101";

class MemoryRepository implements StudyMetaRepository {
  private nextEventNumber = 102;
  readonly student: Student = {
    id: demoStudentId,
    display_name: "Demo Student",
    created_at: "2026-08-26T00:00:00.000Z",
    updated_at: "2026-08-26T00:00:00.000Z",
  };

  readonly profile: LearnerProfile = {
    preferred_explanation_depth: "detailed",
    preferred_pace: "step_by_step",
    preferred_interaction_style: "socratic",
    example_preference: "example_first",
    hint_preference: null,
    direct_answer_preference: null,
    general_learning_goal: null,
    preferred_language: "ko",
  };

  readonly domainState: DomainState = {
    domain: "calculus",
    calibration: null,
    intervention_response: {},
    state_confidence: null,
    updated_at: "2026-08-26T00:00:00.000Z",
  };

  readonly skillState: SkillState = {
    domain: "calculus",
    skill_id: "chain_rule",
    skill_name: "Chain Rule",
    conceptual_mastery: 0.82,
    procedural_mastery: 0.7,
    retrievability: 0.4,
    transferability: 0.3,
    help_need: 0.35,
    misconceptions: [],
    state_confidence: 0.7,
    updated_at: "2026-08-26T00:00:00.000Z",
  };

  readonly events: LearningEvent[] = [
    {
      id: seededEventId,
      student_id: demoStudentId,
      domain: "calculus",
      skill_id: "chain_rule",
      source: "manual",
      event_type: "problem_attempt",
      raw_event: { description: "Seed event" },
      evidence: [
        {
          type: "correct",
          value: true,
          extractor_confidence: 1,
          extractor: "seed",
          extractor_version: "1",
          definition_version: "studymeta-evidence-v1",
          missing_reason: null,
        },
      ],
      occurred_at: "2026-08-25T00:00:00.000Z",
      created_at: "2026-08-25T00:00:00.000Z",
    },
  ];

  readonly stateEstimates: LearnerStateEstimate[] = [];

  async getCurrentStudentId(): Promise<string | null> {
    return this.student.id;
  }

  async getMostRelevantDomain(
    studentId: string,
    skillId?: string,
  ): Promise<string | null> {
    return studentId === this.student.id &&
      (!skillId || skillId === this.skillState.skill_id)
      ? this.skillState.domain
      : null;
  }

  async getStudent(studentId: string): Promise<Student | null> {
    return studentId === this.student.id ? this.student : null;
  }

  async getLearnerProfile(studentId: string): Promise<LearnerProfile | null> {
    return studentId === this.student.id ? this.profile : null;
  }

  async getDomainState(studentId: string, domain: string): Promise<DomainState | null> {
    return studentId === this.student.id && domain === this.domainState.domain
      ? this.domainState
      : null;
  }

  async getSkillState(
    studentId: string,
    domain: string,
    skillId: string,
  ): Promise<SkillState | null> {
    return studentId === this.student.id &&
      domain === this.skillState.domain &&
      skillId === this.skillState.skill_id
      ? this.skillState
      : null;
  }

  async listSkillStates(
    studentId: string,
    domain: string,
    _limit: number,
  ): Promise<SkillState[]> {
    return studentId === this.student.id && domain === this.skillState.domain
      ? [this.skillState]
      : [];
  }

  async listRecentEvents(
    studentId: string,
    domain: string,
    skillId: string | undefined,
    limit: number,
  ): Promise<RecentLearningEvent[]> {
    return this.events
      .filter(
        (event) =>
          event.student_id === studentId &&
          event.domain === domain &&
          (!skillId || event.skill_id === skillId),
      )
      .slice(-limit)
      .reverse()
      .map(({ student_id: _studentId, domain: _domain, skill_id: _skillId, ...event }) => event);
  }

  async listLearnerStateEstimates(
    studentId: string,
    domain: string,
    skillId: string,
  ): Promise<LearnerStateEstimate[]> {
    return this.stateEstimates.filter(
      (estimate) =>
        studentId === this.student.id &&
        estimate.domain === domain &&
        estimate.skill_id === skillId,
    );
  }

  async findLearningEventByIdempotencyKey(
    studentId: string,
    idempotencyKey: string,
  ): Promise<LearningEvent | null> {
    return (
      this.events.find(
        (event) =>
          event.student_id === studentId &&
          event.idempotency_key === idempotencyKey,
      ) ?? null
    );
  }

  async insertLearningEvent(input: RecordLearningEventInput): Promise<LearningEvent> {
    const timestamp = input.occurred_at ?? "2026-08-26T01:00:00.000Z";
    const eventNumber = String(this.nextEventNumber++).padStart(12, "0");
    const event: LearningEvent = {
      id: `00000000-0000-4000-8000-${eventNumber}`,
      student_id: input.student_id,
      domain: input.domain,
      skill_id: input.skill_id,
      source: input.source,
      ...(input.source_provider ? { source_provider: input.source_provider } : {}),
      ...(input.problem_id ? { problem_id: input.problem_id } : {}),
      event_type: input.event_type,
      raw_event: input.raw_event,
      evidence: input.evidence,
      ...(input.started_at ? { started_at: input.started_at } : {}),
      ...(input.ended_at ? { ended_at: input.ended_at } : {}),
      occurred_at: timestamp,
      created_at: timestamp,
      ...(input.skill_name ? { skill_name: input.skill_name } : {}),
      ...(input.idempotency_key
        ? { idempotency_key: input.idempotency_key }
        : {}),
    };
    this.events.push(event);
    return event;
  }

  async saveLearnerStateEstimate(
    studentId: string,
    _skillName: string,
    estimate: LearnerStateEstimate,
  ): Promise<void> {
    if (studentId !== this.student.id) return;
    const index = this.stateEstimates.findIndex(
      (item) =>
        item.domain === estimate.domain &&
        item.skill_id === estimate.skill_id &&
        item.state_type === estimate.state_type,
    );
    if (index >= 0) this.stateEstimates[index] = estimate;
    else this.stateEstimates.push(estimate);

    if (estimate.status !== "verified" || estimate.value === null) return;
    if (estimate.state_type === "procedural_mastery") {
      this.skillState.procedural_mastery = estimate.value;
    }
    if (estimate.state_type === "help_need") {
      this.skillState.help_need = estimate.value;
    }
    this.skillState.state_confidence = estimate.confidence;
    this.skillState.updated_at = estimate.last_updated;
  }
}

test("MCP tools read all three learner layers and withhold State changes until Evidence is sufficient", async () => {
  const repository = new MemoryRepository();
  const services = createStudyMetaServices(repository);
  const server = createStudyMetaMcpServer(services);
  const client = new Client({ name: "studymeta-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      [
        "get_learner_context",
        "get_my_learner_context",
        "record_learning_event",
        "record_my_learning_event",
      ],
    );

    const started = await client.callTool({
      name: "get_my_learner_context",
      arguments: {},
    });
    assert.equal(started.isError, undefined);
    const startedContext = started.structuredContent as Record<string, unknown>;
    assert.equal(startedContext.student_id, demoStudentId);
    assert.equal(startedContext.resolved_domain, "calculus");
    assert.equal(
      (startedContext.student as Record<string, unknown>).display_name,
      "Demo Student",
    );
    assert.equal(
      (startedContext.skill_states as Array<Record<string, unknown>>)[0]?.skill_id,
      "chain_rule",
    );

    const initial = await client.callTool({
      name: "get_learner_context",
      arguments: {
        student_id: demoStudentId,
        domain: "calculus",
        skill_id: "chain_rule",
      },
    });
    assert.equal(initial.isError, undefined);
    const initialContext = initial.structuredContent as Record<string, unknown>;
    assert.equal(
      (initialContext.learner_profile as Record<string, unknown>).preferred_pace,
      "step_by_step",
    );
    assert.equal(
      (initialContext.domain_state as Record<string, unknown>).domain,
      "calculus",
    );
    assert.equal(
      (initialContext.skill_state as Record<string, unknown>).retrievability,
      null,
      "Experimental State must be hidden unless explicitly requested",
    );

    const recorded = await client.callTool({
      name: "record_learning_event",
      arguments: {
        student_id: demoStudentId,
        domain: "calculus",
        skill_id: "chain_rule",
        source: "claude",
        raw_event: {
          description: "Student solved a Chain Rule problem without a hint.",
        },
        evidence: [
          { type: "correct", value: true, extractor_confidence: 1 },
          {
            type: "independent_success",
            value: true,
            extractor_confidence: 0.95,
          },
        ],
      },
    });
    assert.equal(recorded.isError, undefined);
    assert.equal(
      (recorded.structuredContent as Record<string, unknown>).event_id,
      "00000000-0000-4000-8000-000000000102",
    );
    assert.equal(repository.events.at(-1)?.event_type, "observation");
    assert.equal(
      ((recorded.structuredContent as Record<string, unknown>).state_update as Record<string, unknown>).status,
      "insufficient_evidence",
    );

    const afterWrite = await client.callTool({
      name: "get_learner_context",
      arguments: {
        student_id: demoStudentId,
        domain: "calculus",
        skill_id: "chain_rule",
      },
    });
    const afterContext = afterWrite.structuredContent as Record<string, unknown>;
    const evidence = afterContext.recent_evidence as Array<Record<string, unknown>>;
    assert.equal(evidence[0]?.id, "00000000-0000-4000-8000-000000000102");
    assert.equal(
      (afterContext.skill_state as Record<string, unknown>).procedural_mastery,
      null,
      "Unversioned or insufficient State must not be exposed as verified",
    );
    assert.equal(
      repository.skillState.procedural_mastery,
      0.7,
      "Insufficient Evidence must not mutate stored Learner State",
    );
  } finally {
    await client.close();
    await server.close();
  }
});

test("Streamable HTTP exposes the same MCP tool contract", async () => {
  const services = createStudyMetaServices(new MemoryRepository());
  const { httpHandler, nodeHandler } = createStudyMetaMcpHttpHandlers(services);
  const httpServer = createServer(async (request, response) => {
    if (request.url !== "/mcp") {
      response.writeHead(404).end();
      return;
    }
    await nodeHandler(
      request as Parameters<typeof nodeHandler>[0],
      response,
    );
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  assert(address && typeof address !== "string");

  const client = new Client({ name: "studymeta-http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${address.port}/mcp`),
  );

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "get_learner_context",
      arguments: {
        student_id: demoStudentId,
        domain: "calculus",
        skill_id: "chain_rule",
      },
    });
    assert.equal(result.isError, undefined);
    assert.equal(
      (result.structuredContent as Record<string, unknown>).student_id,
      demoStudentId,
    );
  } finally {
    await client.close();
    await httpHandler.close();
    await new Promise<void>((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("production and demo modes share one adaptive policy while only display changes", async () => {
  const repository = new MemoryRepository();
  const service = createStudyMetaServices(repository).learnerStateService;

  const production = await service.getContext({
    student_id: demoStudentId,
    domain: "calculus",
    skill_id: "chain_rule",
  });
  const demo = await service.getContext({
    student_id: demoStudentId,
    domain: "calculus",
    skill_id: "chain_rule",
    demo_mode: true,
  });

  assert.equal(production.display.demo_mode, false, "demo mode must default false");
  assert.equal(production.display.show_studymeta_banner, false);
  assert.equal(demo.display.show_studymeta_banner, true);
  assert.deepEqual(production.interaction_policy, demo.interaction_policy);
  assert.equal(production.teaching_context.policy_version, "adaptive-rule-based-v2");
  assert.match(
    production.teaching_context.executable_instructions.at(-1) ?? "",
    /do not mention StudyMeta/i,
  );
  assert.match(
    demo.teaching_context.executable_instructions.at(-1) ?? "",
    /stored learner data/i,
  );
});

test("synthetic demo learner returns a deterministic chain_rule_ir first-turn contract", async () => {
  const service = createStudyMetaServices(new MemoryRepository()).learnerStateService;
  const context = await service.getContext({
    student_id: demoStudentId,
    domain: "calculus",
    skill_id: "chain_rule",
    demo_mode: true,
    learner_profile_type: "synthetic",
  });

  assert.equal(context.profile_type, "synthetic_demo");
  assert.equal(context.learner_profile_metadata.profile_type, "synthetic_demo");
  assert.equal(context.learner_profile_metadata.is_real_user_data, false);
  assert.match(context.learner_profile_metadata.label, /Synthetic Demo Learner/);
  assert.equal(context.skill_state?.conceptual_mastery, 0.85);
  assert.equal(context.skill_state?.procedural_mastery, 0.35);
  assert.equal(context.skill_state?.retrievability, 0.3);
  assert.equal(context.skill_state?.transferability, 0.2);
  assert.equal(context.skill_state?.help_need, 0.75);
  assert.equal(context.skill_state?.state_confidence, 0.8);
  assert.equal(context.learner_profile?.preferred_explanation_depth, "concise");
  assert.deepEqual(context.learner_state, context.skill_state);
  assert.deepEqual(context.pedagogical_policy, context.interaction_policy);
  assert.equal(context.demo_scenario, "chain_rule_ir");
  assert.equal(context.first_turn_contract?.problem, "y = (3x² + 1)^5");
  assert.equal(
    context.first_turn_contract?.closing_instruction,
    "→ ㄱ / ㄴ / ㄷ 중 하나를 입력해주세요.",
  );
  assert.equal(context.first_turn_contract?.stop_after_closing_instruction, true);
  assert.match(
    context.first_turn_contract?.exact_response_template ?? "",
    /STEP 1 · 구조 인식/,
  );
  assert.match(
    context.teaching_context.executable_instructions[0] ?? "",
    /DETERMINISTIC IR FIRST-TURN CONTRACT/,
  );
  assert.equal(context.interaction_policy.initial_scaffold, "multiple_choice");
  assert.deepEqual(context.interaction_policy.success_path, [
    "multiple_choice",
    "guided_short_answer",
    "independent_solution",
    "novel_form_transfer_probe",
  ]);
  assert.deepEqual(context.interaction_policy.failure_path, [
    "retry_without_answer",
    "small_hint",
    "stronger_hint_or_choices",
    "worked_example_then_new_attempt",
  ]);
  assert.equal(context.interaction_policy.wait_for_learner_response, true);
  assert.equal(context.interaction_policy.transfer_probe.signal_status, "experimental");
  assert.equal(context.interaction_policy.retrievability_probe.signal_status, "experimental");
  assert.equal(context.evidence_writeback.tool, "record_my_learning_event");
  assert.equal(context.evidence_writeback.state_update_automated, true);
});

test("IR deployment defaults can enable demo while an explicit request can disable it", async () => {
  const repository = new MemoryRepository();
  const service = createStudyMetaServices(repository, undefined, {
    demoMode: true,
    learnerProfileType: "synthetic",
  }).learnerStateService;

  const irDefault = await service.getContext({
    student_id: demoStudentId,
    domain: "calculus",
    skill_id: "chain_rule",
  });
  assert.equal(irDefault.display.demo_mode, true);
  assert.equal(irDefault.learner_profile_metadata.profile_type, "synthetic_demo");

  const productionOverride = await service.getContext({
    student_id: demoStudentId,
    domain: "calculus",
    skill_id: "chain_rule",
    demo_mode: false,
    learner_profile_type: "stored",
  });
  assert.equal(productionOverride.display.demo_mode, false);
  assert.equal(productionOverride.learner_profile_metadata.profile_type, "stored");
});

test("synthetic state is denied outside the explicit demo student chain-rule scope", async () => {
  const service = createStudyMetaServices(new MemoryRepository(), undefined, {
    demoMode: true,
    learnerProfileType: "synthetic_demo",
  }).learnerStateService;

  const wrongSkill = await service.getContext({
    student_id: demoStudentId,
    domain: "calculus",
    skill_id: "product_rule",
    demo_mode: true,
    learner_profile_type: "synthetic_demo",
  });
  assert.equal(wrongSkill.profile_type, "stored");
  assert.equal(wrongSkill.demo_scenario, null);
  assert.equal(wrongSkill.first_turn_contract, null);
  assert.equal(wrongSkill.skill_state, null);

  const production = await service.getContext({
    student_id: demoStudentId,
    domain: "calculus",
    skill_id: "chain_rule",
    demo_mode: false,
    learner_profile_type: "synthetic_demo",
  });
  assert.equal(production.profile_type, "stored");
  assert.equal(production.skill_state?.procedural_mastery, null);
});

test("evidence write derives independent_success value separately from confidence", async () => {
  const repository = new MemoryRepository();
  const services = createStudyMetaServices(repository);

  await services.learningEventService.record({
    student_id: demoStudentId,
    domain: "calculus",
    skill_id: "chain_rule",
    source: "chatgpt",
    event_type: "problem_attempt",
    raw_event: {
      problem: "y=(3x^2+1)^5",
      student_answer: "15x(3x^2+1)^4",
      interaction_summary: "Correct after one retry and a hint.",
    },
    evidence: [
      { type: "correct", value: true, extractor_confidence: 1 },
      { type: "hint_used", value: true, extractor_confidence: 1 },
      { type: "retry_count", value: 1, extractor_confidence: 1 },
      {
        type: "independent_success",
        value: true,
        extractor_confidence: 0.95,
      },
    ],
  });

  const storedEvidence = repository.events.at(-1)?.evidence ?? [];
  const independent = storedEvidence.find(
    (item) => item.type === "independent_success",
  );
  assert.equal(independent?.value, false);
  assert.equal(independent?.extractor_confidence, 0.95);
});

test("authenticated write closes the loop only after sufficient trusted Evidence", async () => {
  const repository = new MemoryRepository();
  const services = createStudyMetaServices(repository);
  const startingMastery = repository.skillState.procedural_mastery;

  const attempts = [
    { correct: true, hint: false, retry: 0 },
    { correct: false, hint: true, retry: 1 },
    { correct: true, hint: false, retry: 0 },
  ];
  let finalResult: Awaited<ReturnType<typeof services.learningEventService.recordMy>> | null = null;
  for (const [index, attempt] of attempts.entries()) {
    finalResult = await services.learningEventService.recordMy({
      domain: "calculus",
      skill_id: "chain_rule",
      skill_name: "Chain Rule",
      source: index % 2 === 0 ? "chatgpt" : "claude",
      source_provider: index % 2 === 0 ? "ChatGPT" : "Claude",
      event_type: "problem_attempt",
      problem_id: `chain-rule-${index + 1}`,
      idempotency_key: `trusted-attempt-${index + 1}`,
      raw_event: { description: `Trusted attempt ${index + 1}` },
      evidence: [
        { type: "correct", value: attempt.correct, extractor_confidence: 1 },
        { type: "hint_used", value: attempt.hint, extractor_confidence: 1 },
        { type: "retry_count", value: attempt.retry, extractor_confidence: 1 },
      ],
    });
  }

  assert(finalResult);
  assert.equal(finalResult.state_update.status, "updated");
  assert.notEqual(repository.skillState.procedural_mastery, startingMastery);
  assert.equal(repository.stateEstimates.length, 2);
  assert(repository.stateEstimates.every((estimate) => estimate.status === "verified"));
  assert(repository.stateEstimates.every((estimate) => estimate.evidence_count >= 3));

  const context = await services.learnerStateService.getMyContext({
    domain: "calculus",
    skill_id: "chain_rule",
  });
  assert.equal(context.state_estimates.length, 2);
  assert.equal(context.experimental_states_included, false);
  assert.equal(context.skill_state?.retrievability, null);
  assert.equal(context.evidence_writeback.state_update_automated, true);
});

test("low-confidence camera Evidence is preserved but withheld from State", async () => {
  const repository = new MemoryRepository();
  const services = createStudyMetaServices(repository);
  const startingMastery = repository.skillState.procedural_mastery;
  const startingHelpNeed = repository.skillState.help_need;

  const result = await services.learningEventService.recordMy({
    domain: "calculus",
    skill_id: "chain_rule",
    source: "camera",
    event_type: "problem_attempt",
    idempotency_key: "camera-attempt-low-confidence",
    raw_event: { description: "Camera transcription was uncertain." },
    evidence: [
      {
        type: "correct",
        value: false,
        extractor_confidence: 0.85,
        extractor: "vision_model",
        extractor_version: "camera-v1",
      },
      {
        type: "hint_used",
        value: true,
        extractor_confidence: 0.85,
        extractor: "vision_model",
        extractor_version: "camera-v1",
      },
    ],
  });

  assert.equal(result.state_update.status, "withheld");
  assert(result.state_update.excluded_evidence.length >= 2);
  assert.equal(repository.skillState.procedural_mastery, startingMastery);
  assert.equal(repository.skillState.help_need, startingHelpNeed);
  assert.equal(repository.events.at(-1)?.source, "camera");
});

test("idempotency key replays one authenticated event without a second update", async () => {
  const repository = new MemoryRepository();
  const services = createStudyMetaServices(repository);
  const input = {
    domain: "calculus",
    skill_id: "chain_rule",
    source: "external_ai" as const,
    source_provider: "Example AI",
    event_type: "problem_attempt",
    idempotency_key: "same-logical-attempt-001",
    raw_event: { description: "One logical event." },
    evidence: [
      { type: "correct", value: true, extractor_confidence: 1 },
    ],
  };

  const first = await services.learningEventService.recordMy(input);
  const replay = await services.learningEventService.recordMy(input);

  assert.equal(first.duplicate, false);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.event_id, first.event_id);
  assert.equal(repository.events.length, 2, "Seed plus one logical event only");
});

test("idempotency key rejects a conflicting payload", async () => {
  const repository = new MemoryRepository();
  const services = createStudyMetaServices(repository);
  const baseInput = {
    domain: "calculus",
    skill_id: "chain_rule",
    source: "external_ai" as const,
    event_type: "problem_attempt",
    idempotency_key: "conflicting-logical-attempt-001",
    raw_event: { description: "Original event." },
    evidence: [{ type: "correct", value: true, extractor_confidence: 1 }],
  };

  await services.learningEventService.recordMy(baseInput);

  await assert.rejects(
    services.learningEventService.recordMy({
      ...baseInput,
      raw_event: { description: "Different event using the same key." },
    }),
    /idempotency[_ ]key/i,
  );
  assert.equal(repository.events.length, 2, "Conflicting replay was not inserted");
});

test("experimental states require explicit opt-in", async () => {
  const repository = new MemoryRepository();
  const service = createStudyMetaServices(repository).learnerStateService;

  const defaultContext = await service.getMyContext({
    domain: "calculus",
    skill_id: "chain_rule",
  });
  const experimentalContext = await service.getMyContext({
    domain: "calculus",
    skill_id: "chain_rule",
    include_experimental_states: true,
  });

  assert.equal(defaultContext.skill_state?.retrievability, null);
  assert.equal(defaultContext.experimental_states_included, false);
  assert.equal(experimentalContext.skill_state?.retrievability, 0.4);
  assert.equal(experimentalContext.experimental_states_included, true);
});
