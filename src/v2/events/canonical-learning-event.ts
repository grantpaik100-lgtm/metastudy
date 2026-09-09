import { createHash } from "node:crypto";
import type { LearningEventCommand } from "../contracts/learning-event.js";

export const LEARNING_EVENT_CANONICAL_SERIALIZATION_VERSION =
  "studymeta.learning-event.canonical-json.v1" as const;

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

export function canonicalizeLearningEventCommand(
  command: LearningEventCommand,
): string {
  const { idempotency_key: _transportIdempotencyKey, ...eventPayload } = command;
  return JSON.stringify(canonicalValue({
    serialization_version: LEARNING_EVENT_CANONICAL_SERIALIZATION_VERSION,
    event_payload: eventPayload,
  }));
}

export function hashCanonicalLearningEvent(serialization: string): string {
  return `sha256:${createHash("sha256").update(serialization, "utf8").digest("hex")}`;
}

export function hashLearningEventCommand(command: LearningEventCommand): string {
  return hashCanonicalLearningEvent(canonicalizeLearningEventCommand(command));
}
