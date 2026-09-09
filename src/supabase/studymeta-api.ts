import type { z } from "zod";
import {
  AdminCurrentStateSchema,
  AdminStateChangeLogSchema,
  AdminStudentSummarySchema,
  AuthenticatedLearnerSchema,
  type AdminCurrentState,
  type AdminStateChangeLog,
  type AdminStudentSummary,
  type AuthenticatedLearner,
} from "../v2/contracts/identity-rbac.js";
import { STUDYMETA_DATA_API_SCHEMA } from "./clients.js";

interface RpcResult {
  data: unknown;
  error: { message?: string } | null;
}

export interface DataApiClient {
  schema(name: string): {
    rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
  };
}

export class DataApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataApiError";
  }
}

export class StudyMetaDataApi {
  constructor(private readonly client: DataApiClient) {}

  async getMyIdentity(): Promise<AuthenticatedLearner> {
    return this.callSingle("get_my_identity", {}, AuthenticatedLearnerSchema);
  }

  async getMyLearnerSummary(): Promise<AdminStudentSummary> {
    return this.callSingle(
      "get_my_learner_summary",
      {},
      AdminStudentSummarySchema,
    );
  }

  async getMyCurrentStates(limit = 100): Promise<AdminCurrentState[]> {
    return this.callMany(
      "get_my_current_states",
      { p_limit: limit },
      AdminCurrentStateSchema,
    );
  }

  async getMyRecentStateLog(limit = 50): Promise<AdminStateChangeLog[]> {
    return this.callMany(
      "get_my_recent_state_log",
      { p_limit: limit },
      AdminStateChangeLogSchema,
    );
  }

  async adminListStudents(
    includeArchived = false,
    limit = 50,
  ): Promise<AdminStudentSummary[]> {
    return this.callMany(
      "admin_list_students",
      { p_include_archived: includeArchived, p_limit: limit },
      AdminStudentSummarySchema,
    );
  }

  async adminListCurrentStates(
    learnerId: string,
    limit = 100,
  ): Promise<AdminCurrentState[]> {
    return this.callMany(
      "admin_list_current_states",
      { p_learner_id: learnerId, p_limit: limit },
      AdminCurrentStateSchema,
    );
  }

  async adminListStateChangeLog(limit = 50): Promise<AdminStateChangeLog[]> {
    return this.callMany(
      "admin_list_state_change_log",
      { p_limit: limit },
      AdminStateChangeLogSchema,
    );
  }

  async adminListNonChangeLog(limit = 50): Promise<AdminStateChangeLog[]> {
    return this.callMany(
      "admin_list_non_change_log",
      { p_limit: limit },
      AdminStateChangeLogSchema,
    );
  }

  private async callSingle<T>(
    name: string,
    args: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const data = await this.call(name, args);
    const parsed = schema.array().safeParse(data);
    if (!parsed.success || parsed.data.length !== 1) {
      throw new DataApiError(`${name} returned an invalid database response`);
    }
    return parsed.data[0]!;
  }

  private async callMany<T>(
    name: string,
    args: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T[]> {
    const data = await this.call(name, args);
    const parsed = schema.array().safeParse(data);
    if (!parsed.success) {
      throw new DataApiError(`${name} returned an invalid database response`);
    }
    return parsed.data;
  }

  private async call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const result = await this.client
      .schema(STUDYMETA_DATA_API_SCHEMA)
      .rpc(name, args);
    if (result.error) {
      throw new DataApiError(`${name} request was rejected`);
    }
    return result.data;
  }
}
