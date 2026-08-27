import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DomainStateSchema,
  LearnerProfileSchema,
  RecentLearningEventSchema,
  SkillStateSchema,
  StudentSchema,
  type DomainState,
  type LearnerProfile,
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
  constructor(private readonly client: SupabaseClient) {}

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
      .select("id, source, event_type, raw_event, evidence, occurred_at, created_at")
      .eq("student_id", studentId)
      .eq("domain", domain);

    if (skillId) {
      query = query.eq("skill_id", skillId);
    }

    const result = await query.order("occurred_at", { ascending: false }).limit(limit);
    const data = assertQuerySucceeded("list recent learning events", result);
    return RecentLearningEventSchema.array().parse(data);
  }

  async insertLearningEvent(input: RecordLearningEventInput): Promise<LearningEvent> {
    const result = await this.client
      .from("learning_events")
      .insert({
        student_id: input.student_id,
        domain: input.domain,
        skill_id: input.skill_id,
        source: input.source,
        event_type: input.event_type,
        raw_event: input.raw_event,
        evidence: input.evidence,
        occurred_at: input.occurred_at ?? new Date().toISOString(),
      })
      .select(
        "id, student_id, domain, skill_id, source, event_type, raw_event, evidence, occurred_at, created_at",
      )
      .single();
    const data = assertQuerySucceeded("insert learning event", result);
    if (!data) {
      throw new RepositoryError("insert learning event failed: no row returned");
    }
    const recentEvent = RecentLearningEventSchema.parse(data);

    return {
      ...recentEvent,
      student_id: String(data.student_id),
      domain: String(data.domain),
      skill_id: String(data.skill_id),
    };
  }
}

export function createSupabaseRepository(
  url: string,
  key: string,
  accessToken?: string,
): SupabaseStudyMetaRepository {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : {}),
  });
  return new SupabaseStudyMetaRepository(client);
}
