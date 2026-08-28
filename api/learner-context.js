"use strict";

// GET /api/learner-context?student_id=...&domain=...&skill_id=...
//
// service-prototype.html이 fetch로 호출하는 유일한 엔드포인트. StudyMeta MCP
// 서버의 get_learner_context 툴을 대신 호출해서(브라우저는 MCP 툴을 직접 부를
// 수 없으므로) 결과를 학생 화면이 바로 쓸 수 있는 정성적 형태로 바꿔 돌려준다.
//
// 쓰기(record_learning_event)는 여기서 다루지 않는다 — design.md 16번 결정에
// 따라 학습(그리고 그 기록)은 MCP로 연결된 프론티어 모델 앱(Claude, ChatGPT 등)
// 쪽에서 그 앱 자신의 MCP 연결로 직접 기록한다. 이 홈은 읽기 전용 관제탑이다.

const { callMcpTool } = require("../lib/mcp-client");
const { mapSkillState, mapDomainCalibration } = require("../lib/learner-mapping");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "GET만 지원합니다." });
    return;
  }

  const studentId = firstValue(req.query.student_id);
  const domain = firstValue(req.query.domain);
  const skillId = firstValue(req.query.skill_id);

  if (!studentId || !UUID_RE.test(studentId)) {
    res.status(400).json({ error: "student_id가 유효한 UUID가 아닙니다." });
    return;
  }
  if (!domain) {
    res.status(400).json({ error: "domain은 필수입니다." });
    return;
  }

  try {
    const args = { student_id: studentId, domain: domain };
    if (skillId) args.skill_id = skillId;

    const context = await callMcpTool("get_learner_context", args);
    const metadata = context.learner_profile_metadata || {};

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      student_id: context.student_id,
      domain: context.domain_state ? context.domain_state.domain : domain,
      calibration_text: mapDomainCalibration(context.domain_state),
      skill: mapSkillState(context.skill_state),
      is_synthetic: metadata.is_real_user_data === false,
      profile_label: metadata.label || null
    });
  } catch (err) {
    console.error("[api/learner-context]", err);
    res.status(502).json({
      error: "MCP 서버에서 학습자 컨텍스트를 가져오지 못했습니다.",
      detail: err && err.message ? err.message : String(err)
    });
  }
};

function firstValue(v) {
  if (Array.isArray(v)) return v[0];
  return v;
}
