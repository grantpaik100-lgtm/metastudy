import { config } from "dotenv";
import { z } from "zod";

config({ path: [".env.local", ".env"], quiet: true });

const EnvironmentSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  OAUTH_ALLOWED_EMAILS: z.string().default(""),
  OPENAI_APPS_CHALLENGE_TOKEN: z.string().min(1).optional(),
  DEMO_STUDENT_ID: z.uuid().default("00000000-0000-4000-8000-000000000001"),
  STUDYMETA_DEMO_MODE: z.enum(["true", "false"]).default("false"),
  STUDYMETA_LEARNER_PROFILE_TYPE: z
    .enum(["stored", "synthetic", "synthetic_demo"])
    .default("stored"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

let cachedEnvironment: Environment | undefined;

export function getEnvironment(): Environment {
  cachedEnvironment ??= EnvironmentSchema.parse(process.env);
  return cachedEnvironment;
}

export function getSupabasePublicKey(
  environment: Environment = getEnvironment(),
): string {
  const key = environment.SUPABASE_PUBLISHABLE_KEY ?? environment.SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is required for OAuth",
    );
  }
  return key;
}

export function getAllowedOAuthEmails(
  environment: Environment = getEnvironment(),
): Set<string> {
  return new Set(
    environment.OAUTH_ALLOWED_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}
