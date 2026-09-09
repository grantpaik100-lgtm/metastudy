import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  getLearnerCardHtml,
  LEARNER_CARD_MIME_TYPE,
} from "./learner-card-ui.js";

// A UI resource URI is a cache key in MCP Apps hosts. Keep this demo-specific
// version separate from the production card URI so a spike update cannot alter
// the existing /api/mcp resource or be served from an older host cache.
export const DEMO_LEARNER_CARD_RESOURCE_URI = "ui://studymeta/learner-card-demo-v3";

/**
 * Deliberately static data for the MCP UI spike. This server has no OAuth,
 * repository, or learning-event dependency and must never be used as a source
 * of learner records or scientific-validation claims.
 */
export const SYNTHETIC_DEMO_LEARNER_CARD = {
  profile_type: "synthetic_demo",
  learner_card: {
    data_label: "synthetic_demo",
    course: "미적분학",
    current_concept: "연쇄법칙",
    states: [
      {
        label: "개념 이해",
        value: "알 수 없음",
        description: "이 데모에는 개념 이해를 판단할 관찰이 없어서 변화 없음으로 표시해요.",
        tone: "",
      },
      {
        label: "절차 숙련",
        value: "다듬는 중",
        description: "가상 예시값이에요. 실제 학생의 상태나 계산 결과가 아니에요.",
        tone: "help",
      },
      {
        label: "도움 필요도",
        value: "조금 높음",
        description: "최근 가상 Evidence를 바탕으로 한 표시일 뿐, State를 변경하지 않아요.",
        tone: "help",
      },
      {
        label: "State 변화",
        value: "변화 없음",
        description: "이 카드 호출은 읽기 전용이며 Learning Event나 State를 기록하지 않아요.",
        tone: "",
      },
    ],
    scientific_validation_status: "under_review",
    recent_evidence: [
      {
        source: "synthetic_demo",
        evidence: [{ type: "hint_requested" }, { type: "success_after_hint" }],
      },
    ],
    recommendation: "가상 연쇄법칙 문제를 한 단계씩 이어서 살펴볼까요?",
  },
} as const;

const EmptyInput = z.object({}).strict();

export function createStudyMetaMcpDemoServer(): McpServer {
  const server = new McpServer({
    name: "studymeta-mcp-ui-demo",
    version: "0.1.0",
  });

  server.registerResource(
    "studymeta-demo-learner-card",
    DEMO_LEARNER_CARD_RESOURCE_URI,
    {
      title: "StudyMeta synthetic demo learner card",
      description: "Read-only UI resource for a clearly labeled synthetic Learner Context demo.",
      mimeType: LEARNER_CARD_MIME_TYPE,
      _meta: { ui: { prefersBorder: true } },
    },
    async () => ({
      contents: [{
        uri: DEMO_LEARNER_CARD_RESOURCE_URI,
        mimeType: LEARNER_CARD_MIME_TYPE,
        text: getLearnerCardHtml(),
        _meta: { ui: { prefersBorder: true } },
      }],
    }),
  );

  server.registerTool(
    "show_studymeta_learner_card",
    {
      title: "Show StudyMeta Learner Context demo",
      description: "Render a read-only, explicitly synthetic_demo Learner Context card for MCP UI testing. It does not use OAuth, a database, real student data, Learning Events, or State calculations.",
      inputSchema: EmptyInput,
      outputSchema: z.object({
        profile_type: z.literal("synthetic_demo"),
        learner_card: z.object({
          data_label: z.literal("synthetic_demo"),
          course: z.string(),
          current_concept: z.string(),
          states: z.array(z.object({ label: z.string(), value: z.string(), description: z.string(), tone: z.string() })),
          scientific_validation_status: z.enum(["not_assessed", "under_review", "supported_in_scope"]),
          recent_evidence: z.array(z.object({ source: z.string(), evidence: z.array(z.object({ type: z.string() })) })),
          recommendation: z.string(),
        }),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: {
        ui: { resourceUri: DEMO_LEARNER_CARD_RESOURCE_URI, visibility: ["model", "app"] },
        "ui/resourceUri": DEMO_LEARNER_CARD_RESOURCE_URI,
      },
    },
    async () => ({
      structuredContent: SYNTHETIC_DEMO_LEARNER_CARD,
      content: [{
        type: "text",
        text: "StudyMeta synthetic_demo Learner Context: 미적분학 · 연쇄법칙. Read-only demo; no learner data, events, or state updates were used.",
      }],
    }),
  );

  return server;
}
