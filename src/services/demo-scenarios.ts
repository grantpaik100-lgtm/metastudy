import type { FirstTurnContract } from "../domain/contracts.js";

export const CHAIN_RULE_IR_SCENARIO = "chain_rule_ir" as const;
export const DEFAULT_DEMO_STUDENT_ID =
  "00000000-0000-4000-8000-000000000001";

export const CHAIN_RULE_IR_FIRST_TURN: FirstTurnContract = {
  scenario: CHAIN_RULE_IR_SCENARIO,
  applies_to_first_tutoring_turn_only: true,
  banner: "[StudyMeta · Demo Learner]",
  state_summary: ["Procedural Mastery 0.35 ↓", "Help Need 0.75 ↑"],
  strategy_summary: "Step-by-step · Socratic · Adaptive Scaffolding",
  step_label: "STEP 1 · 구조 인식",
  problem: "y = (3x² + 1)^5",
  question: "가장 먼저 해야 할 행동은?",
  choices: [
    { key: "ㄱ", text: "바깥 함수와 안쪽 함수를 구분한다" },
    { key: "ㄴ", text: "전체 식을 바로 미분한다" },
    { key: "ㄷ", text: "Chain Rule 공식을 다시 복습한다" },
  ],
  closing_instruction: "→ ㄱ / ㄴ / ㄷ 중 하나를 입력해주세요.",
  stop_after_closing_instruction: true,
  exact_response_template: [
    "[StudyMeta · Demo Learner]",
    "학습 상태를 반영했습니다.",
    "Procedural Mastery 0.35 ↓",
    "Help Need 0.75 ↑",
    "",
    "Teaching Strategy:",
    "Step-by-step · Socratic · Adaptive Scaffolding",
    "",
    "현재는 전체 설명보다 한 단계씩 직접 풀어보는 방식으로 진행합니다.",
    "",
    "STEP 1 · 구조 인식",
    "",
    "y = (3x² + 1)^5",
    "",
    "가장 먼저 해야 할 행동은?",
    "",
    "ㄱ. 바깥 함수와 안쪽 함수를 구분한다",
    "ㄴ. 전체 식을 바로 미분한다",
    "ㄷ. Chain Rule 공식을 다시 복습한다",
    "",
    "→ ㄱ / ㄴ / ㄷ 중 하나를 입력해주세요.",
  ].join("\n"),
  forbidden_content: [
    "full_chain_rule_lecture",
    "complete_formula_explanation",
    "answer_reveal",
    "worked_example_solution",
    "hint_before_student_response",
    "step_2_in_first_response",
    "claim_context_unavailable_after_successful_read",
    "content_after_closing_instruction",
  ],
};

export function isChainRuleIrDemo(input: {
  demoMode: boolean;
  studentId: string;
  demoStudentId: string;
  domain: string;
  skillId?: string;
  requestedProfileType: "stored" | "synthetic" | "synthetic_demo";
}): boolean {
  return (
    input.demoMode &&
    input.requestedProfileType !== "stored" &&
    input.studentId === input.demoStudentId &&
    input.domain === "calculus" &&
    input.skillId === "chain_rule"
  );
}
