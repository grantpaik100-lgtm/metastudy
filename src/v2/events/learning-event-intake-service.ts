import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  LearningEventAuthContextSchema,
  LearningEventCommandSchema,
  LearningEventReceiptSchema,
  type LearningEventAuthContext,
  type LearningEventCommand,
  type LearningEventReceipt,
} from "../contracts/learning-event.js";
import { VersionSchema } from "../contracts/common.js";
import {
  canonicalizeLearningEventCommand,
  hashCanonicalLearningEvent,
} from "./canonical-learning-event.js";

const IntakePolicySchema = z.object({
  version: VersionSchema,
  outbox_max_attempt_policy: VersionSchema,
}).strict();

export interface LearningEventIntakePolicy {
  version: string;
  outbox_max_attempt_policy: string;
}

export interface LearningEventRecordRequest {
  auth: LearningEventAuthContext;
  command: LearningEventCommand;
  canonical_serialization: string;
  payload_hash: string;
  outbox_run_id: string;
  intake_policy_version: string;
  outbox_max_attempt_policy: string;
}

export interface LearningEventIntakeRepository {
  record(request: LearningEventRecordRequest): Promise<LearningEventReceipt>;
}

export class LearningEventIntakeError extends Error {
  constructor(
    readonly code: "invalid_command" | "invalid_auth_context" | "connection_required" | "actor_policy_unresolved" | "invalid_receipt",
    message: string,
  ) {
    super(message);
    this.name = "LearningEventIntakeError";
  }
}

const unresolvedStudentOAuthSources = new Set(["chatgpt", "claude", "external_ai"]);
const connectionRequiredSources = new Set(["chatgpt", "claude", "external_ai", "learning_app"]);

export class LearningEventIntakeService {
  private readonly policy: LearningEventIntakePolicy;

  constructor(
    private readonly repository: LearningEventIntakeRepository,
    policy: LearningEventIntakePolicy,
    private readonly createRunId: () => string = randomUUID,
  ) {
    this.policy = IntakePolicySchema.parse(policy);
  }

  async record(input: unknown, authInput: unknown): Promise<LearningEventReceipt> {
    const parsedCommand = LearningEventCommandSchema.safeParse(input);
    if (!parsedCommand.success) {
      throw new LearningEventIntakeError("invalid_command", "Learning Event command was rejected");
    }
    const parsedAuth = LearningEventAuthContextSchema.safeParse(authInput);
    if (!parsedAuth.success) {
      throw new LearningEventIntakeError("invalid_auth_context", "Verified AuthContext is required");
    }

    const command = parsedCommand.data;
    const auth = parsedAuth.data;
    if (command.external_event_id !== null && auth.connection_id === null) {
      throw new LearningEventIntakeError("connection_required", "External Event IDs require a verified connection");
    }
    if (connectionRequiredSources.has(command.source) && auth.connection_id === null) {
      throw new LearningEventIntakeError("connection_required", "This Event source requires a verified connection");
    }
    if ((command.source === "admin_web") !== (auth.actor_type === "admin")) {
      throw new LearningEventIntakeError("invalid_auth_context", "Event source does not match the verified actor role");
    }
    if (command.source === "system") {
      throw new LearningEventIntakeError("invalid_auth_context", "System Events require a future server principal policy");
    }
    if (auth.actor_type === "student" && unresolvedStudentOAuthSources.has(command.source)) {
      throw new LearningEventIntakeError(
        "actor_policy_unresolved",
        "External AI actor classification is not approved",
      );
    }

    const canonicalSerialization = canonicalizeLearningEventCommand(command);
    const receipt = await this.repository.record({
      auth,
      command,
      canonical_serialization: canonicalSerialization,
      payload_hash: hashCanonicalLearningEvent(canonicalSerialization),
      outbox_run_id: this.createRunId(),
      intake_policy_version: this.policy.version,
      outbox_max_attempt_policy: this.policy.outbox_max_attempt_policy,
    });
    const parsedReceipt = LearningEventReceiptSchema.safeParse(receipt);
    if (!parsedReceipt.success) {
      throw new LearningEventIntakeError("invalid_receipt", "Event storage returned an invalid receipt");
    }
    return parsedReceipt.data;
  }
}
