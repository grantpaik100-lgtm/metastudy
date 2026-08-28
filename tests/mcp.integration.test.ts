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
        { type: "correct", value: true, extractor_confidence: 1 },
      ],
      occurred_at: "2026-08-25T00:00:00.000Z",
      created_at: "2026-08-25T00:00:00.000Z",
    },
  ];

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

  async insertLearningEvent(input: RecordLearningEventInput): Promise<LearningEvent> {
    const timestamp = input.occurred_at ?? "2026-08-26T01:00:00.000Z";
    const event: LearningEvent = {
      id: "00000000-0000-4000-8000-000000000102",
      student_id: input.student_id,
      domain: input.domain,
      skill_id: input.skill_id,
      source: input.source,
      event_type: input.event_type,
      raw_event: input.raw_event,
      evidence: input.evidence,
      occurred_at: timestamp,
      created_at: timestamp,
    };
    this.events.push(event);
    return event;
  }
}

test("MCP tools read all three learner layers and append evidence without changing state", async () => {
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
      ["get_learner_context", "get_my_learner_context", "record_learning_event"],
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
      0.4,
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
      0.7,
      "No-op updater must not mutate Student Model state",
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
  assert.equal(context.evidence_writeback.tool, "record_learning_event");
  assert.equal(context.evidence_writeback.state_update_automated, false);
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
  assert.equal(production.skill_state?.procedural_mastery, 0.7);
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
