import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import {
  GetLearnerContextInputSchema,
  GetLearnerContextOutputSchema,
  GetMyLearnerContextInputSchema,
  GetMyLearnerContextOutputSchema,
  RecordMyLearningEventInputSchema,
  RecordLearningEventInputSchema,
  RecordLearningEventOutputSchema,
} from "../domain/contracts.js";
import type { StudyMetaServices } from "../services/service-container.js";
import {
  getLearnerCardHtml,
  LEARNER_CARD_MIME_TYPE,
  LEARNER_CARD_RESOURCE_URI,
} from "./learner-card-ui.js";

const LEARNER_CARD_FALLBACK_PREFIX = "STUDYMETA_LEARNER_CARD_DATA:";

function toolError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : "Unknown StudyMeta error";
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | null | undefined {
  return typeof value === "number" || value === null ? value : undefined;
}

/**
 * Claude Desktop can currently omit structuredContent when it forwards a tool
 * result to an MCP App iframe. Keep a deliberately small, display-only copy in
 * the text fallback so the UI can recover without sending raw events, IDs, or
 * private profile preferences through the model-visible content channel.
 */
function learnerCardFallbackPayload(output: unknown): Record<string, unknown> {
  const context = asRecord(output);
  const skillStates = Array.isArray(context.skill_states) ? context.skill_states : [];
  const skill = asRecord(context.skill_state ?? context.learner_state ?? skillStates[0]);
  const metadata = asRecord(context.learner_profile_metadata);
  const interactionPolicy = asRecord(context.interaction_policy);
  const pedagogicalPolicy = asRecord(context.pedagogical_policy);
  const domainState = asRecord(context.domain_state);
  const stateEstimates = Array.isArray(context.state_estimates)
    ? context.state_estimates.map((estimate) => {
        const item = asRecord(estimate);
        return {
          state_type: textValue(item.state_type),
          evidence_count: numberValue(item.evidence_count),
        };
      })
    : [];
  const recentEvidence = Array.isArray(context.recent_evidence)
    ? context.recent_evidence.slice(0, 4).map((event) => {
        const item = asRecord(event);
        const evidence = Array.isArray(item.evidence)
          ? item.evidence.map((entry) => ({ type: textValue(asRecord(entry).type) }))
          : [];
        return { source: textValue(item.source), evidence };
      })
    : [];

  return {
    profile_type: textValue(context.profile_type),
    resolved_domain: textValue(context.resolved_domain),
    learner_profile_metadata: {
      is_real_user_data: metadata.is_real_user_data === true,
    },
    skill_state: {
      domain: textValue(skill.domain),
      skill_name: textValue(skill.skill_name),
      procedural_mastery: numberValue(skill.procedural_mastery),
      help_need: numberValue(skill.help_need),
      state_confidence: numberValue(skill.state_confidence),
      transferability: numberValue(skill.transferability),
    },
    state_estimates: stateEstimates,
    recent_evidence: recentEvidence,
    interaction_policy: {
      initial_scaffold: textValue(interactionPolicy.initial_scaffold),
    },
    pedagogical_policy: {
      initial_scaffold: textValue(pedagogicalPolicy.initial_scaffold),
    },
    domain_state: {
      calibration: domainState.calibration === null || domainState.calibration === undefined
        ? undefined
        : true,
    },
  };
}

function learnerCardFallbackText(output: unknown): string {
  return [
    "StudyMeta learner context is available. Hosts without MCP Apps UI support can use the structured result and existing text tools.",
    "",
    `${LEARNER_CARD_FALLBACK_PREFIX}${JSON.stringify(learnerCardFallbackPayload(output))}`,
  ].join("\n");
}

export function createStudyMetaMcpServer(services: StudyMetaServices): McpServer {
  const server = new McpServer({
    name: "studymeta-mcp",
    version: "0.1.0",
  });

  server.registerResource(
    "studymeta-learner-card",
    LEARNER_CARD_RESOURCE_URI,
    {
      title: "StudyMeta learner card",
      description:
        "Interactive StudyMeta learner-state card rendered from a tool result's structured content.",
      mimeType: LEARNER_CARD_MIME_TYPE,
      _meta: {
        ui: {
          prefersBorder: true,
          csp: {
            connectDomains: [],
            resourceDomains: [],
            frameDomains: [],
          },
        },
      },
    },
    async () => ({
      contents: [
        {
          uri: LEARNER_CARD_RESOURCE_URI,
          mimeType: LEARNER_CARD_MIME_TYPE,
          text: getLearnerCardHtml(),
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                connectDomains: [],
                resourceDomains: [],
                frameDomains: [],
              },
            },
          },
        },
      ],
    }),
  );

  server.registerTool(
    "get_my_learner_context",
    {
      title: "Get my learner context",
      description:
        "Start or resume a personalized StudyMeta session for the authenticated learner. Resolve the student from OAuth automatically and return real learner state plus executable policy. For a Chain Rule learning request, pass domain=calculus and skill_id=chain_rule. If demo_scenario=chain_rule_ir and first_turn_contract is returned, output its exact_response_template as the complete first tutoring response, stop after closing_instruction, and wait. Never add a lecture, answer, hint, STEP 2, or an unavailable-context disclaimer after a successful read. demo_mode uses server configuration when omitted; the code default is false. Never ask for a student_id.",
      inputSchema: GetMyLearnerContextInputSchema,
      outputSchema: GetMyLearnerContextOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const output = await services.learnerStateService.getMyContext(input);
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "render_my_learner_card",
    {
      title: "Render my StudyMeta learner card",
      description:
        "Read the authenticated learner context and render an interactive StudyMeta learner card. This is read-only: it never writes Evidence or Learner State. The card's learning-start buttons send follow-up messages only; record_my_learning_event remains the only write path after an actual completed learning interaction.",
      inputSchema: GetMyLearnerContextInputSchema,
      outputSchema: GetMyLearnerContextOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: {
          resourceUri: LEARNER_CARD_RESOURCE_URI,
          visibility: ["model", "app"],
        },
        "ui/resourceUri": LEARNER_CARD_RESOURCE_URI,
      },
    },
    async (input) => {
      try {
        const output = await services.learnerStateService.getMyContext(input);
        return {
          content: [
            {
              type: "text",
              text: learnerCardFallbackText(output),
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_learner_context",
    {
      title: "Get learner context",
      description:
        "Read real learner state and return learner_state, versioned state_estimates, pedagogical_policy, teaching_context, and profile_type. Verified MVP states are returned by default; experimental fields require include_experimental_states=true, except the explicitly labeled synthetic IR demo. For demo_scenario=chain_rule_ir, output first_turn_contract.exact_response_template as the entire first tutoring response and stop at closing_instruction. This read does not mutate Learner State.",
      inputSchema: GetLearnerContextInputSchema,
      outputSchema: GetLearnerContextOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const output = await services.learnerStateService.getContext(input);
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "record_my_learning_event",
    {
      title: "Record my learning event",
      description:
        "Record an append-only raw learning event for the authenticated learner without asking for a student ID. Keep raw_event separate from structured Evidence, include source and extraction provenance, and provide an idempotency_key for safe retries. The server derives independent_success when possible, preserves low-confidence observations, and updates only verified MVP states (Procedural Mastery and Help Need) when evidence gates are met. Always report the returned state_update status; withheld or insufficient evidence is not a decline.",
      inputSchema: RecordMyLearningEventInputSchema,
      outputSchema: RecordLearningEventOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const output = await services.learningEventService.recordMy(input);
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "record_learning_event",
    {
      title: "Record learning event",
      description:
        "Legacy scoped write for a known learner ID. Prefer record_my_learning_event for authenticated tutoring. Validate and append a raw event with separate structured Evidence, derive independent_success when possible, and run the same confidence-gated MVP State updater. Low-confidence camera Evidence is preserved but withheld from State updates.",
      inputSchema: RecordLearningEventInputSchema,
      outputSchema: RecordLearningEventOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        const output = await services.learningEventService.record(input);
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}
