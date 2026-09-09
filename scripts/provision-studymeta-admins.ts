import { pathToFileURL } from "node:url";
import { listAllAuthUsers } from "../src/admin/auth-users.js";
import {
  parseAdminEmails,
  planAdminProvisioning,
  provisionAdmins,
} from "../src/admin/provisioning.js";
import {
  getEnvironment,
  getSupabaseSecretKey,
} from "../src/config/env.js";
import { createElevatedSupabaseClient } from "../src/supabase/clients.js";
import type { DataApiClient } from "../src/supabase/studymeta-api.js";

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const environment = getEnvironment();
  const emails = parseAdminEmails(
    option("emails") ?? process.env.STUDYMETA_ADMIN_EMAILS,
  );
  const reason = option("reason") ?? process.env.STUDYMETA_ADMIN_GRANT_REASON ?? "";
  const grantedBy = option("granted-by") ?? process.env.STUDYMETA_ADMIN_GRANTED_BY ?? "";
  const apply = process.argv.slice(2).includes("--apply");
  const client = createElevatedSupabaseClient(
    environment.SUPABASE_URL,
    getSupabaseSecretKey(environment),
  );
  const users = await listAllAuthUsers(client);
  const plan = planAdminProvisioning(emails, users);
  await provisionAdmins(client as unknown as DataApiClient, plan, {
    grantedBy,
    reason,
    apply,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Provisioning failed");
    process.exitCode = 1;
  });
}
