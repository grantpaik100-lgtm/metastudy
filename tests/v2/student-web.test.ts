import assert from "node:assert/strict";
import test from "node:test";
import { getStudentWebPreviewHtml } from "../../src/v2/ui/student-web.js";

const html = getStudentWebPreviewHtml();

test("student preview keeps synthetic provenance and unavailable actions explicit", () => {
  assert.match(html, /가상 UI 예시 데이터 · 실제 학습 판단 아님/);
  assert.match(html, /로그인 연결 준비 중/);
  assert.match(html, /backend 미구현/);
  assert.match(html, /정정 생성 API가 아직 구현되지 않았습니다/);
  assert.match(html, /disabled/);
});

test("student preview exposes the required routes and constrains State visibility", () => {
  for (const label of ["홈", "학습 상태", "학습 기록", "연결 및 내 정보", "개념 이해", "절차 숙련", "도움 필요도"]) assert.match(html, new RegExp(label));
  assert.match(html, /전이 가능성 · 자기 판단 정확도 · 추정 신뢰도/);
  assert.doesNotMatch(html, /intervention_response|state_confidence|conceptual_mastery|procedural_mastery|help_need/);
});

test("student preview uses buttons, live updates, reduced motion, and mobile layout guards", () => {
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /button:focus-visible/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /@media\(max-width:640px\)/);
  assert.match(html, /grid-template-columns:1fr/);
});
