import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DomainStateSchema,
  LearnerStateEstimateSchema,
  LearnerProfileSchema,
  RecentLearningEventSchema,
  SkillStateSchema,
  StudentSchema,
  type DomainState,
  type LearnerProfile,
  type LearnerStateEstimate,
  type LearningEvent,
  type RecordLearningEventInput,
  type RecentLearningEvent,
  type SkillState,
  type Student,
} from "../domain/contracts.js";
import { RepositoryError } from "../domain/errors.js";
import type { StudyMetaRepository } from "./study-meta-repository.js";

function assertQuerySucceeded<T>(
  operation: string,
  result: { data: T; error: { message: string } | null },
): T {
  if (result.error) {
    throw new RepositoryError(`${operation} failed: ${result.error.message}`);
  }
  return result.data;
}

export class SupabaseStudyMetaRepository implements StudyMetaRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly stateWriter: SupabaseClient = client,
  ) {}

  async getCurrentStudentId(): Promise<string | null> {
    const result = await this.client.rpc("current_student_id");
    const data = assertQuerySucceeded("get current student id", result);
    return typeof data === "string" ? data : null;
  }

  async getMostRelevantDomain(
    studentId: string,
    skillId?: string,
  ): Promise<string | null> {
    let skillQuery = this.client
      .from("learner_states")
      .select("domain")
      .eq("student_id", studentId);

    if (skillId) {
      skillQuery = skillQuery.eq("skill_id", skillId);
    }

    const skillResult = await skillQuery
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const skillData = assertQuerySucceeded("get most relevant skill domain", skillResult);
    if (skillData && typeof skillData.domain === "string") {
      return skillData.domain;
    }

    const domainResult = await this.client
      .from("domain_states")
      .select("domain")
      .eq("student_id", studentId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const domainData = assertQuerySucceeded(
      "get most relevant domain state",
      domainResult,
    );
    return domainData && typeof domainData.domain === "string"
      ? domainData.domain
      : null;
  }

  async getStudent(studentId: string): Promise<Student | null> {
    const result = await this.client
      .from("students")
      .select("id, display_name, created_at, updated_at")
      .eq("id", studentId)
      .maybeSingle();
    const data = assertQuerySucceeded("get student", result);
    return data ? StudentSchema.parse(data) : null;
  }

  async getLearnerProfile(studentId: string): Promise<LearnerProfile | null> {
    const result = await this.client
      .from("student_profiles")
      .select(
        "preferred_explanation_depth, preferred_pace, preferred_interaction_style, example_preference, hint_preference, direct_answer_preference, general_learning_goal, preferred_language",
      )
      .eq("student_id", studentId)
      .maybeSingle();
    const data = assertQuerySucceeded("get learner profile", result);
    return data ? LearnerProfileSchema.parse(data) : null;
  }

  async getDomainState(studentId: string, domain: string): Promise<DomainState | null> {
    const result = await this.client
      .from("domain_states")
      .select(
        "domain, calibration, intervention_response, state_confidence, updated_at",
      )
      .eq("student_id", studentId)
      .eq("domain", domain)
      .maybeSingle();
    const data = assertQuerySucceeded("get domain state", result);
    return data ? DomainStateSchema.parse(data) : null;
  }

  async getSkillState(
    studentId: string,
    domain: string,
    skillId: string,
  ): Promise<SkillState | null> {
    const result = await this.client
      .from("learner_states")
      .select(
        "domain, skill_id, skill_name, conceptual_mastery, procedural_mastery, retrievability, transferability, help_need, misconceptions, state_confidence, updated_at",
      )
      .eq("student_id", studentId)
      .eq("domain", domain)
      .eq("skill_id", skillId)
      .maybeSingle();
    const data = assertQuerySucceeded("get skill state", result);
    return data ? SkillStateSchema.parse(data) : null;
  }

  async listSkillStates(
    studentId: string,
    domain: string,
    limit: number,
  ): Promise<SkillState[]> {
    const result = await this.client
      .from("learner_states")
      .select(
        "domain, skill_id, skill_name, conceptual_mastery, procedural_mastery, retrievability, transferability, help_need, misconceptions, state_confidence, updated_at",
      )
      .eq("student_id", studentId)
      .eq("domain", domain)
      .order("updated_at", { ascending: false })
      .limit(limit);
    const data = assertQuerySucceeded("list skill states", result);
    return SkillStateSchema.array().parse(data);
  }

  async listRecentEvents(
    studentId: string,
    domain: string,
    skillId: string | undefined,
    limit: number,
  ): Promise<RecentLearningEvent[]> {
    let query = this.client
      .from("learning_events")
      .select("id, source, source_provider, problem_id, event_type, raw_event, evidence, started_at, ended_at, occurred_at, created_at")
      .eq("student_id", studentId)
      .eq("domain", domain);

    if (skillId) {
      query = query.eq("skill_id", skillId);
    }

    const result = await query.order("occurred_at", { ascending: false }).limit(limit);
    const data = assertQuerySucceeded("list recent learning events", result);
    return RecentLearningEventSchema.array().parse(data);
  }

  async listLearnerStateEstimates(
    studentId: string,
    domain: string,
    skillId: string,
  ): Promise<LearnerStateEstimate[]> {
    const result = await this.client
      .from("learner_state_estimates")
      .select(
        "domain, skill_id, state_type, value, status, confidence, evidence_count, effective_sample_size, last_updated, model_version, supporting_event_ids, limitation",
      )
      .eq("student_id", studentId)
      .eq("domain", domain)
      .eq("skill_id", skillId)
      .order("state_type", { ascending: true });
    const data = assertQuerySucceeded("list learner state estimates", result);
    return LearnerStateEstimateSchema.array().parse(data);
  }

  async findLearningEventByIdempotencyKey(
    studentId: string,
    idempotencyKey: string,
  ): Promise<LearningEvent | null> {
    const result = await this.client
      .from("learning_events")
      .select(
        "id, student_id, domain, skill_id, skill_name, source, source_provider, problem_id, event_type, raw_event, evidence, started_at, ended_at, occurred_at, created_at, idempotency_key",
      )
      .eq("student_id", studentId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    const data = assertQuerySucceeded("find learning event by idempotency key", result);
    return data ? parseLearningEvent(data) : null;
  }

  async insertLearningEvent(input: RecordLearningEventInput): Promise<LearningEvent> {
    const result = await this.client
      .from("learning_events")
      .insert({
        student_id: input.student_id,
        domain: input.domain,
        skill_id: input.skill_id,
        skill_name: input.skill_name ?? null,
        source: input.source,
        source_provider: input.source_provider ?? null,
        event_type: input.event_type,
        problem_id: input.problem_id ?? null,
        raw_event: input.raw_event,
        evidence: input.evidence,
        started_at: input.started_at ?? null,
        ended_at: input.ended_at ?? null,
        occurred_at: input.occurred_at ?? new Date().toISOString(),
        idempotency_key: input.idempotency_key ?? null,
      })
      .select(
        "id, student_id, domain, skill_id, skill_name, source, source_provider, problem_id, event_type, raw_event, evidence, started_at, ended_at, occurred_at, created_at, idempotency_key",
      )
      .single();
    const data = assertQuerySucceeded("insert learning event", result);
    if (!data) {
      throw new RepositoryError("insert learning event failed: no row returned");
    }
    return parseLearningEvent(data);
  }

  async saveLearnerStateEstimate(
    studentId: string,
    skillName: string,
    estimate: LearnerStateEstimate,
  ): Promise<void> {
    const estimateResult = await this.stateWriter.from("learner_state_estimates").upsert(
      {
        student_id: studentId,
        domain: estimate.domain,
        skill_id: estimate.skill_id,
        state_type: estimate.state_type,
        value: estimate.value,
        status: estimate.status,
        confidence: estimate.confidence,
        evidence_count: estimate.evidence_count,
        effective_sample_size: estimate.effective_sample_size,
        last_updated: estimate.last_updated,
        model_version: estimate.model_version,
        supporting_event_ids: estimate.supporting_event_ids,
        limitation: estimate.limitation,
      },
      { onConflict: "student_id,domain,skill_id,state_type" },
    );
    assertQuerySucceeded("save learner state estimate", estimateResult);

    if (estimate.status !== "verified" || estimate.value === null) return;
    const stateColumn =
      estimate.state_type === "procedural_mastery"
        ? { procedural_mastery: estimate.value }
        : estimate.state_type === "help_need"
          ? { help_need: estimate.value }
          : {};
    if (Object.keys(stateColumn).length === 0) return;
    const stateResult = await this.stateWriter.from("learner_states").upsert(
      {
        student_id: studentId,
        domain: estimate.domain,
        skill_id: estimate.skill_id,
        skill_name: skillName,
        ...stateColumn,
        state_confidence: estimate.confidence,
      },
      { onConflict: "student_id,domain,skill_id" },
    );
    assertQuerySucceeded("materialize verified learner state", stateResult);
  }
}

function parseLearningEvent(data: Record<string, unknown>): LearningEvent {
  const recentEvent = RecentLearningEventSchema.parse(data);
  return {
    ...recentEvent,
    student_id: String(data.student_id),
    domain: String(data.domain),
    skill_id: String(data.skill_id),
    ...(typeof data.skill_name === "string" ? { skill_name: data.skill_name } : {}),
    ...(typeof data.idempotency_key === "string"
      ? { idempotency_key: data.idempotency_key }
      : {}),
  };
}

export function createSupabaseRepository(
  url: string,
  key: string,
  accessToken?: string,
  stateWriterKey?: string,
): SupabaseStudyMetaRepository {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : {}),
  });
  const stateWriter = stateWriterKey
    ? createClient(url, stateWriterKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : client;
  return new SupabaseStudyMetaRepository(client, stateWriter);
}
