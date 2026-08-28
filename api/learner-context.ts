import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import { NotFoundError } from "../src/domain/errors.js";
import { getDefaultServices } from "../src/services/default-services.js";

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const url = new URL(
    request.url ?? "/api/learner-context",
    `https://${request.headers.host ?? "localhost"}`,
  );
  const studentId = url.searchParams.get("student_id");
  const domain = url.searchParams.get("domain");
  const skillId = url.searchParams.get("skill_id");
  const demoMode = url.searchParams.get("demo_mode");
  const learnerProfileType = url.searchParams.get("learner_profile_type");

  if (!studentId || !domain) {
    sendJson(response, 400, {
      error: "student_id and domain query parameters are required",
    });
    return;
  }

  try {
    const service = getDefaultServices().learnerStateService;
    const context = await service.getContext({
      student_id: studentId,
      domain,
      ...(skillId ? { skill_id: skillId } : {}),
      ...(demoMode ? { demo_mode: demoMode === "true" } : {}),
      ...(learnerProfileType
        ? { learner_profile_type: learnerProfileType as "stored" | "synthetic" }
        : {}),
    });
    sendJson(response, 200, context);
  } catch (error) {
    if (error instanceof ZodError) {
      sendJson(response, 400, { error: "Invalid query", details: error.issues });
      return;
    }
    if (error instanceof NotFoundError) {
      sendJson(response, 404, { error: error.message });
      return;
    }
    console.error("Learner context API failed", error);
    sendJson(response, 500, { error: "Unable to load learner context" });
  }
}
