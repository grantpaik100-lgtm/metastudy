import { createClient } from "@supabase/supabase-js";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AuthenticationError,
  authenticateRequest,
  isOAuthEmailAllowed,
  sendOAuthChallenge,
} from "../src/auth/oauth.js";
import { getEnvironment } from "../src/config/env.js";

function sendJson(response: ServerResponse, status: number, body: unknown): void {
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
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const authenticated = await authenticateRequest(request);
    if (!isOAuthEmailAllowed(authenticated.user.email)) {
      sendJson(response, 403, {
        error: "This account is not allowed to claim the demo learner",
      });
      return;
    }

    const environment = getEnvironment();
    const admin = createClient(
      environment.SUPABASE_URL,
      environment.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const existing = await admin
      .from("student_auth_links")
      .select("student_id")
      .eq("user_id", authenticated.user.id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      sendJson(response, 200, { student_id: existing.data.student_id });
      return;
    }

    const claimed = await admin
      .from("student_auth_links")
      .insert({
        user_id: authenticated.user.id,
        student_id: environment.DEMO_STUDENT_ID,
      })
      .select("student_id")
      .single();
    if (claimed.error) {
      if (claimed.error.code === "23505") {
        const concurrent = await admin
          .from("student_auth_links")
          .select("student_id")
          .eq("user_id", authenticated.user.id)
          .maybeSingle();
        if (concurrent.error) throw concurrent.error;
        if (concurrent.data) {
          sendJson(response, 200, { student_id: concurrent.data.student_id });
          return;
        }
        sendJson(response, 409, { error: "Unable to link this account" });
        return;
      }
      throw claimed.error;
    }
    sendJson(response, 200, { student_id: claimed.data.student_id });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendOAuthChallenge(request, response, error.message);
      return;
    }
    console.error("Demo learner linking failed", error);
    sendJson(response, 500, { error: "Unable to link demo learner" });
  }
}
