import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getAllowedOAuthEmails,
  getEnvironment,
  getSupabasePublicKey,
} from "../config/env.js";
import { createAuthVerificationClient } from "../supabase/clients.js";

export const oauthScopes = ["openid", "email", "profile"] as const;

export interface AuthenticatedRequest {
  accessToken: string;
  user: VerifiedAuthUser;
}

export interface VerifiedAuthUser {
  id: string;
  email?: string | undefined;
}

interface AuthVerificationClient {
  auth: {
    getUser(jwt: string): Promise<{
      data: { user: VerifiedAuthUser | null };
      error: { message: string } | null;
    }>;
  };
}

interface VerifyUserAccessTokenOptions {
  supabaseUrl: string;
  publishableKey: string;
  createAuthClient?: (url: string, key: string) => AuthVerificationClient;
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
  const match = value?.match(/^Bearer ([^\s,]+)$/i);
  if (!match?.[1] || match[1].length > 16_384) {
    throw new AuthenticationError();
  }
  return match[1];
}

export async function verifyUserAccessToken(
  accessToken: string,
  options: VerifyUserAccessTokenOptions,
): Promise<VerifiedAuthUser> {
  const createAuthClient =
    options.createAuthClient ?? createAuthVerificationClient;
  const authClient = createAuthClient(
    options.supabaseUrl,
    options.publishableKey,
  );
  let result: Awaited<ReturnType<AuthVerificationClient["auth"]["getUser"]>>;
  try {
    result = await authClient.auth.getUser(accessToken);
  } catch {
    throw new AuthenticationError("Invalid or expired access token");
  }
  if (result.error || !result.data.user || !isUuid(result.data.user.id)) {
    throw new AuthenticationError("Invalid or expired access token");
  }
  return result.data.user;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function authenticateRequest(
  request: IncomingMessage,
): Promise<AuthenticatedRequest> {
  const accessToken = extractBearerToken(request.headers.authorization);
  const environment = getEnvironment();
  const user = await verifyUserAccessToken(accessToken, {
    supabaseUrl: environment.SUPABASE_URL,
    publishableKey: getSupabasePublicKey(environment),
  });
  return { accessToken, user };
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
