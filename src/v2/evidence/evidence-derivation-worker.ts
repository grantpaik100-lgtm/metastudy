import { createHash } from "node:crypto";
import {
  EvidenceInstanceSchema,
  type EvidenceInstance,
} from "../contracts/evidence.js";
import {
  EvidenceDerivationPolicySchema,
  type DerivationHoldReason,
  type EvidenceDerivationPolicy,
  type EvidenceOperationBinding,
} from "../contracts/processing.js";
import {
  LearningEventCommandSchema,
  type LearningEventCommand,
} from "../contracts/learning-event.js";
import { GenerationRuleRegistry, type VersionedGenerationRule } from "./generation-rule-registry.js";

export interface ClaimedDerivationJob {
  job_id: string;
  run_id: string;
  event_id: string;
  learner_id: string;
  attempt_count: number;
  command: LearningEventCommand;
}

export interface DerivationCompletion {
  generation_release: string;
  reason_code: DerivationHoldReason | null;
  evidence: EvidenceInstance[];
  result_manifest: {
    generation_release: string;
    source_event_id: string;
    evidence_ids: string[];
    evidence_count: number;
    hold_reason_code: DerivationHoldReason | null;
    derivation_policy_version: string;
    allowed_operational_modes: EvidenceDerivationPolicy["allowed_operational_modes"];
    operation_bindings: EvidenceOperationBinding[];
  };
  completion_hash: string;
}

export interface DerivationRepository {
  claim(workerId: string, policy: EvidenceDerivationPolicy): Promise<ClaimedDerivationJob | null>;
  complete(
    claim: ClaimedDerivationJob,
    result: DerivationCompletion,
    workerId: string,
  ): Promise<{ status: "completed"; duplicate: boolean }>;
  fail(
    claim: ClaimedDerivationJob,
    failure: {
      worker_id: string;
      error_code: string;
      policy: EvidenceDerivationPolicy;
    },
  ): Promise<{ status: "failed" | "dead_letter" }>;
}

export type DerivationWorkerOutcome =
  | { status: "idle" }
  | { status: "completed"; evidence_count: number; reason_code: DerivationHoldReason | null }
  | { status: "failed" | "dead_letter"; error_code: string };

function commandReferenceSets(command: LearningEventCommand): {
  sourceRefs: Set<string>;
  attempts: Set<string>;
  targets: Set<string>;
} {
  const sourceRefs = new Set(command.source_refs);
  for (const action of [...command.observation.learner_actions, ...command.observation.assistant_actions]) {
    action.source_refs.forEach((id) => sourceRefs.add(id));
  }
  command.observation.assessments.forEach((assessment) =>
    assessment.basis_refs.forEach((id) => sourceRefs.add(id)));
  command.observation.self_reports.forEach((report) =>
    report.source_refs.forEach((id) => sourceRefs.add(id)));
  command.observation.support_trace.source_refs.forEach((id) => sourceRefs.add(id));
  command.coordinates.targets.forEach((target) =>
    target.basis_refs.forEach((id) => sourceRefs.add(id)));

  const attempts = new Set<string>();
  if (command.coordinates.attempt_id) attempts.add(command.coordinates.attempt_id);
  command.observation.answers.forEach((answer) => attempts.add(answer.attempt_id));
  const targets = new Set(command.coordinates.targets.map((target) => JSON.stringify(target)));
  return { sourceRefs, attempts, targets };
}

function validateRuleEvidence(
  value: unknown,
  rule: VersionedGenerationRule,
  claim: ClaimedDerivationJob,
): EvidenceInstance {
  const evidence = EvidenceInstanceSchema.parse(value);
  const refs = commandReferenceSets(claim.command);
  const exactBinding =
    evidence.learner_id === claim.learner_id &&
    evidence.derivation_run_id === claim.run_id &&
    evidence.event_id === claim.event_id &&
    evidence.source_event_ids.includes(claim.event_id) &&
    evidence.evidence_type_id === rule.evidence_type_id &&
    evidence.definition_version === rule.definition_version &&
    evidence.generation_rule.generation_rule_id === rule.generation_rule_id &&
    evidence.generation_rule.generation_rule_version === rule.generation_rule_version &&
    evidence.definition_validation_assessment_id === rule.definition_validation_assessment_id &&
    evidence.generation_validation_assessment_id === rule.generation_validation_assessment_id &&
    evidence.validation_snapshot_id === rule.validation_snapshot_id &&
    evidence.basis_refs.every((id) => refs.sourceRefs.has(id)) &&
    evidence.attempt_ids.every((id) => refs.attempts.has(id)) &&
    (refs.attempts.size === 0 || evidence.attempt_ids.length > 0) &&
    evidence.targets.every((target) => refs.targets.has(JSON.stringify(target)));
  if (!exactBinding) {
    throw new Error("generation_rule_output_binding_mismatch");
  }
  return evidence;
}

function completionHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

export class EvidenceDerivationWorker {
  private readonly policy: EvidenceDerivationPolicy;

  constructor(
    private readonly repository: DerivationRepository,
    private readonly registry: GenerationRuleRegistry,
    policy: EvidenceDerivationPolicy,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.policy = EvidenceDerivationPolicySchema.parse(policy);
  }

  async runOnce(workerId: string): Promise<DerivationWorkerOutcome> {
    if (!workerId.trim()) throw new Error("worker_id_required");
    const claim = await this.repository.claim(workerId, this.policy);
    if (!claim) return { status: "idle" };

    try {
      claim.command = LearningEventCommandSchema.parse(claim.command);
      const rules = this.registry.loadAuthorized(
        claim.command,
        this.policy.allowed_operational_modes,
      );
      const generatedAt = this.now();
      const evidence: EvidenceInstance[] = [];
      const operationBindings: EvidenceOperationBinding[] = [];
      for (const rule of rules) {
        const outputs = await rule.derive({ claim, command: claim.command, generated_at: generatedAt });
        const validated = outputs.map((output) => validateRuleEvidence(output, rule, claim));
        evidence.push(...validated);
        operationBindings.push(...validated.map((item) => ({
          evidence_id: item.evidence_id,
          operational_mode: rule.operational_mode,
          definition_operation_assignment_id: rule.definition_operation_assignment_id,
          generation_operation_assignment_id: rule.generation_operation_assignment_id,
        })));
      }
      if (rules.length > 0 && evidence.length === 0) {
        throw new Error("authorized_generation_rule_produced_no_evidence");
      }
      const reasonCode: DerivationHoldReason | null =
        evidence.length === 0 ? "no_authorized_generation_rule" : null;
      const manifest: DerivationCompletion["result_manifest"] = {
        generation_release: this.registry.version,
        source_event_id: claim.event_id,
        evidence_ids: evidence.map((item) => item.evidence_id),
        evidence_count: evidence.length,
        hold_reason_code: reasonCode,
        derivation_policy_version: this.policy.version,
        allowed_operational_modes: [...this.policy.allowed_operational_modes],
        operation_bindings: operationBindings,
      };
      await this.repository.complete(claim, {
        generation_release: this.registry.version,
        reason_code: reasonCode,
        evidence,
        result_manifest: manifest,
        completion_hash: completionHash(manifest),
      }, workerId);
      return { status: "completed", evidence_count: evidence.length, reason_code: reasonCode };
    } catch (error) {
      const errorCode = error instanceof Error && /^[a-z0-9_]+$/i.test(error.message)
        ? error.message
        : "evidence_derivation_failed";
      const failed = await this.repository.fail(claim, {
        worker_id: workerId,
        error_code: errorCode,
        policy: this.policy,
      });
      return { status: failed.status, error_code: errorCode };
    }
  }
}
