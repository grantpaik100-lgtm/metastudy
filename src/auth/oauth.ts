import { createClient, type User } from "@supabase/supabase-js";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getAllowedOAuthEmails,
  getEnvironment,
} from "../config/env.js";

export const oauthScopes = ["openid", "email", "profile"] as const;

export interface AuthenticatedRequest {
  accessToken: string;
  user: User;
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  resource_documentation: string;
}

export class AuthenticationError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only HTTP(S) origins are supported");
  }
  return url.origin;
}

export function requestOrigin(request: IncomingMessage): string {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto?.split(",")[0]?.trim();
  const host = request.headers.host ?? "localhost";
  return normalizeOrigin(`${protocol ?? "https"}://${host}`);
}

export function buildProtectedResourceMetadata(
  origin: string,
  supabaseUrl: string,
): ProtectedResourceMetadata {
  const normalizedOrigin = normalizeOrigin(origin);
  const normalizedSupabaseUrl = normalizeOrigin(supabaseUrl);
  return {
    resource: `${normalizedOrigin}/api/mcp`,
    authorization_servers: [`${normalizedSupabaseUrl}/auth/v1`],
    scopes_supported: [...oauthScopes],
    resource_documentation: `${normalizedOrigin}/viewer.html`,
  };
}

export function extractBearerToken(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  const match = value?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new AuthenticationError();
  }
  return match[1].trim();
}

export async function authenticateRequest(
  request: IncomingMessage,
): Promise<AuthenticatedRequest> {
  const accessToken = extractBearerToken(request.headers.authorization);
  const environment = getEnvironment();
  const authClient = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new AuthenticationError("Invalid or expired access token");
  }
  return { accessToken, user: data.user };
}

export function isOAuthEmailAllowed(email: string | undefined): boolean {
  if (!email) return false;
  const allowedEmails = getAllowedOAuthEmails();
  return allowedEmails.has(email.toLowerCase());
}

export function sendOAuthChallenge(
  request: IncomingMessage,
  response: ServerResponse,
  message = "Authentication required",
): void {
  const metadataUrl = `${requestOrigin(request)}/.well-known/oauth-protected-resource`;
  response.writeHead(401, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "www-authenticate": `Bearer resource_metadata="${metadataUrl}", scope="${oauthScopes.join(" ")}"`,
  });
  response.end(JSON.stringify({ error: "unauthorized", error_description: message }));
}
