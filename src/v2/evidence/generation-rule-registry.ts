import type { EvidenceInstance } from "../contracts/evidence.js";
import type { LearningEventCommand } from "../contracts/learning-event.js";
import type { DerivationOperationalMode } from "../contracts/processing.js";
import type { ClaimedDerivationJob } from "./evidence-derivation-worker.js";

export interface GenerationRuleContext {
  claim: ClaimedDerivationJob;
  command: LearningEventCommand;
  generated_at: string;
}

export interface VersionedGenerationRule {
  generation_rule_id: string;
  generation_rule_version: string;
  evidence_type_id: EvidenceInstance["evidence_type_id"];
  definition_version: string;
  definition_validation_assessment_id: string;
  generation_validation_assessment_id: string;
  validation_snapshot_id: string;
  definition_operation_assignment_id: string;
  generation_operation_assignment_id: string;
  operational_mode: DerivationOperationalMode;
  supports?: (command: LearningEventCommand) => boolean;
  derive(context: GenerationRuleContext): EvidenceInstance[] | Promise<EvidenceInstance[]>;
}

export class GenerationRuleRegistry {
  readonly version: string;
  private readonly rules: readonly VersionedGenerationRule[];

  constructor(
    rules: readonly VersionedGenerationRule[],
    version = "studymeta-generation-registry-empty-v1",
  ) {
    const keys = rules.map((rule) => `${rule.generation_rule_id}@${rule.generation_rule_version}`);
    if (new Set(keys).size !== keys.length) {
      throw new Error("Generation rule registry contains a duplicate ID/version");
    }
    this.rules = [...rules].sort((left, right) =>
      `${left.generation_rule_id}@${left.generation_rule_version}`.localeCompare(
        `${right.generation_rule_id}@${right.generation_rule_version}`,
      ),
    );
    this.version = version;
  }

  loadAuthorized(
    command: LearningEventCommand,
    allowedModes: readonly DerivationOperationalMode[],
  ): readonly VersionedGenerationRule[] {
    const allowed = new Set(allowedModes);
    return this.rules.filter((rule) =>
      allowed.has(rule.operational_mode) && (rule.supports?.(command) ?? true),
    );
  }
}

/** Production ships no rule until a reviewed release explicitly injects one. */
export const EMPTY_GENERATION_RULE_REGISTRY = new GenerationRuleRegistry([]);
