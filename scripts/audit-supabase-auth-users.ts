import { pathToFileURL } from "node:url";
import { z } from "zod";
import { listAllAuthUsers } from "../src/admin/auth-users.js";
import { parseAdminEmails } from "../src/admin/provisioning.js";
import {
  getEnvironment,
  getSupabaseSecretKey,
} from "../src/config/env.js";
import { createElevatedSupabaseClient } from "../src/supabase/clients.js";

const AuditRowSchema = z.object({
  total_auth_users: z.number().int().nonnegative(),
  linked_learner_count: z.number().int().nonnegative(),
  would_create_count: z.number().int().nonnegative(),
  identity_conflict_count: z.number().int().nonnegative(),
  active_student_role_count: z.number().int().nonnegative(),
  would_create_student_role_count: z.number().int().nonnegative(),
  role_conflict_count: z.number().int().nonnegative(),
  requested_admin_count: z.number().int().nonnegative(),
  existing_admin_count: z.number().int().nonnegative(),
}).strict();

async function main(): Promise<void> {
  if (process.argv.slice(2).includes("--apply")) {
    throw new Error("This audit is read-only and does not accept --apply");
  }
  const environment = getEnvironment();
  const client = createElevatedSupabaseClient(
    environment.SUPABASE_URL,
    getSupabaseSecretKey(environment),
  );
  const users = await listAllAuthUsers(client);
  const emailInput = process.env.STUDYMETA_ADMIN_EMAILS;
  const emails = emailInput ? parseAdminEmails(emailInput) : [];
  const targetChecks = emails.map((email, index) => {
    const matches = users.filter(
      (user) => user.email?.trim().toLowerCase() === email,
    );
    return {
      target: index + 1,
      match_count: matches.length,
      ids: matches.map((user) => user.id),
    };
  });
  const requestedIds = [...new Set(targetChecks.flatMap((target) => target.ids))];
  const result = await client.schema("studymeta_api").rpc(
    "server_audit_auth_users",
    { p_admin_user_ids: requestedIds },
  );
  if (result.error) throw new Error("Supabase identity audit RPC was rejected");
  const parsed = AuditRowSchema.array().safeParse(result.data);
  if (!parsed.success || parsed.data.length !== 1) {
    throw new Error("Supabase identity audit returned an invalid database response");
  }
  const report = parsed.data[0]!;
  console.log(JSON.stringify({
    ...report,
    auth_api_user_count: users.length,
    admin_targets: targetChecks.map(({ target, match_count }) => ({ target, match_count })),
    read_only: true,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Audit failed");
    process.exitCode = 1;
  });
}
