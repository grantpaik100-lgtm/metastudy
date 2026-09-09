import { z } from "zod";
import {
  LearningEventCommandSchema,
  LearningEventReceiptSchema,
} from "../contracts/learning-event.js";
import type { EvidenceDerivationPolicy } from "../contracts/processing.js";
import type {
  ClaimedDerivationJob,
  DerivationCompletion,
  DerivationRepository,
} from "../evidence/evidence-derivation-worker.js";
import type {
  LearningEventIntakeRepository,
  LearningEventRecordRequest,
} from "../events/learning-event-intake-service.js";

interface RpcError {
  code?: string;
  message?: string;
}

interface RpcResult {
  data: unknown;
  error: RpcError | null;
}

export interface Stage3RpcClient {
  schema(name: "studymeta_api"): {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  };
}

export class Stage3RepositoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "Stage3RepositoryError";
  }
}

const ClaimRowSchema = z.object({
  job_id: z.string().uuid(),
  run_id: z.string().uuid(),
  event_id: z.string().uuid(),
  learner_id: z.string().uuid(),
  attempt_count: z.number().int().positive(),
  command: LearningEventCommandSchema,
}).strict();

const CompletionRowSchema = z.object({
  status: z.literal("completed"),
  duplicate: z.boolean(),
}).strict();

export class Stage3SupabaseRepository
implements LearningEventIntakeRepository, DerivationRepository {
  constructor(private readonly client: Stage3RpcClient) {}

  async record(request: LearningEventRecordRequest) {
    const data = await this.rpc("server_record_learning_event", {
      p_auth_user_id: request.auth.auth_user_id,
      p_actor_type: request.auth.actor_type,
      p_connection_id: request.auth.connection_id,
      p_command: request.command,
      p_canonical_serialization: request.canonical_serialization,
      p_payload_hash: request.payload_hash,
      p_outbox_run_id: request.outbox_run_id,
      p_intake_policy_version: request.intake_policy_version,
      p_max_attempt_policy: request.outbox_max_attempt_policy,
    });
    return this.single(data, LearningEventReceiptSchema, "invalid_event_receipt");
  }

  async claim(workerId: string, policy: EvidenceDerivationPolicy): Promise<ClaimedDerivationJob | null> {
    const data = await this.rpc("server_claim_evidence_derivation", {
      p_worker_id: workerId,
      p_lease_milliseconds: policy.lease_ms,
      p_max_attempts: policy.max_attempts,
      p_max_attempt_policy: policy.version,
      p_allowed_operational_modes: policy.allowed_operational_modes,
    });
    const parsed = z.array(ClaimRowSchema).safeParse(data);
    if (!parsed.success || parsed.data.length > 1) {
      throw new Stage3RepositoryError("invalid_claim_response", "Worker claim returned an invalid response");
    }
    return parsed.data[0] ?? null;
  }

  async complete(
    claim: ClaimedDerivationJob,
    result: DerivationCompletion,
    workerId: string,
  ): Promise<{ status: "completed"; duplicate: boolean }> {
    const data = await this.rpc("server_complete_evidence_derivation", {
      p_job_id: claim.job_id,
      p_worker_id: workerId,
      p_generation_release: result.generation_release,
      p_reason_code: result.reason_code,
      p_result_manifest: result.result_manifest,
      p_evidence: result.evidence,
      p_completion_hash: result.completion_hash,
    });
    return this.single(data, CompletionRowSchema, "invalid_completion_response");
  }

  async fail(
    claim: ClaimedDerivationJob,
    failure: {
      worker_id: string;
      error_code: string;
      policy: EvidenceDerivationPolicy;
    },
  ): Promise<{ status: "failed" | "dead_letter" }> {
    const data = await this.rpc("server_fail_evidence_derivation", {
      p_job_id: claim.job_id,
      p_worker_id: failure.worker_id,
      p_error_code: failure.error_code,
      p_retry_delay_milliseconds: failure.policy.retry_delay_ms,
      p_max_attempts: failure.policy.max_attempts,
      p_max_attempt_policy: failure.policy.version,
    });
    const value = Array.isArray(data) ? data[0] : data;
    const status = z.enum(["failed", "dead_letter"]).safeParse(value);
    if (!status.success) {
      throw new Stage3RepositoryError("invalid_failure_response", "Worker failure returned an invalid response");
    }
    return { status: status.data };
  }

  private async rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await this.client.schema("studymeta_api").rpc(name, args);
    if (result.error) {
      const safeCode = result.error.message?.match(/\b[a-z][a-z0-9_]{2,}\b/i)?.[0]
        ?? result.error.code
        ?? "stage3_rpc_rejected";
      throw new Stage3RepositoryError(safeCode, `${name} request was rejected`);
    }
    return result.data;
  }

  private single<T>(data: unknown, schema: z.ZodType<T>, code: string): T {
    const parsed = schema.array().safeParse(data);
    if (!parsed.success || parsed.data.length !== 1) {
      throw new Stage3RepositoryError(code, "Stage 3 RPC returned an invalid database response");
    }
    return parsed.data[0]!;
  }
}
