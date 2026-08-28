"use strict";

// StudyMeta MCP 서버가 돌려주는 Learner Context(0~1 연속값)를 이 프로토타입
// UI가 쓰는 정성적 형태(up/down/neutral, 배지)로 바꾼다.
//
// design.md 12번 결정: 학생 화면에는 원점수(0.85 같은 숫자)를 그대로 노출하지
// 않는다. 그래서 이 변환은 반드시 서버(이 파일)에서 끝내고, 브라우저로는
// 방향(direction)만 내려보낸다 — 원점수가 API 응답에도 담기지 않게 한다.
//
// 임계값(0.6 / 0.4)은 이번에 처음 정하는 값이라 잠정치다. 실제 서비스에
// 반영하기 전에 팀과 다시 확인한다.

const UP_THRESHOLD = 0.6;
const DOWN_THRESHOLD = 0.4;

function toDirection(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "neutral";
  if (value >= UP_THRESHOLD) return "up";
  if (value <= DOWN_THRESHOLD) return "down";
  return "neutral";
}

// get_learner_context / get_my_learner_context 응답의 skill_state 한 개를
// service-prototype.html의 newSkill() 스킬 객체와 같은 모양으로 바꾼다.
function mapSkillState(skillState) {
  if (!skillState) return null;

  const hasMisconception = Array.isArray(skillState.misconceptions) && skillState.misconceptions.length > 0;

  return {
    id: skillState.skill_id,
    name: skillState.skill_name || skillState.skill_id,
    unattempted: false,
    conceptual_mastery: toDirection(skillState.conceptual_mastery),
    procedural_mastery: toDirection(skillState.procedural_mastery),
    retrievability: toDirection(skillState.retrievability),
    transferability: toDirection(skillState.transferability),
    help_need: toDirection(skillState.help_need),
    // misconceptions는 후보 목록(배열)이라 방향이 아니라 존재 여부로만 판단한다.
    // 스냅샷 한 장으로는 "줄어드는 중(down)"을 판단할 근거가 없어 neutral로 둔다.
    misconception: hasMisconception ? "up" : "neutral",
    state_confidence: toDirection(skillState.state_confidence),
    updatedAt: skillState.updated_at || null
  };
}

// domain_state.calibration은 아직 값이 없으면 null로 온다(관찰이 더 필요하다는 뜻).
function mapDomainCalibration(domainState) {
  if (!domainState || domainState.calibration === null || domainState.calibration === undefined) {
    return "아직 예상과 실제를 비교할 기록이 없어요";
  }
  const dir = toDirection(domainState.calibration);
  if (dir === "down") return "예상보다 실제 결과가 낮았던 적이 있어요. 확신 정도를 같이 살펴볼게요";
  if (dir === "up") return "예상과 실제가 꽤 잘 맞고 있어요";
  return "예상과 실제를 비교할 기록이 하나 더 쌓였어요";
}

module.exports = { toDirection, mapSkillState, mapDomainCalibration, UP_THRESHOLD, DOWN_THRESHOLD };
