import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const STUDYMETA_DATA_API_SCHEMA = "studymeta_api" as const;

type SupabaseClientFactory = typeof createClient;

const serverAuthOptions = {
  persistSession: false,
  autoRefreshToken: false,
} as const;

export function createAuthVerificationClient(
  url: string,
  publishableKey: string,
  factory: SupabaseClientFactory = createClient,
): SupabaseClient {
  return factory(url, publishableKey, { auth: serverAuthOptions });
}

export function createUserScopedSupabaseClient(
  url: string,
  publishableKey: string,
  accessToken: string,
  factory: SupabaseClientFactory = createClient,
) {
  if (!accessToken || /\s/.test(accessToken)) {
    throw new Error("A valid user access token is required");
  }
  return factory(url, publishableKey, {
    db: { schema: STUDYMETA_DATA_API_SCHEMA },
    auth: serverAuthOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function createElevatedSupabaseClient(
  url: string,
  secretKey: string,
  factory: SupabaseClientFactory = createClient,
) {
  if (!secretKey) {
    throw new Error("A Supabase server secret key is required");
  }
  return factory(url, secretKey, {
    db: { schema: STUDYMETA_DATA_API_SCHEMA },
    auth: serverAuthOptions,
  });
}
