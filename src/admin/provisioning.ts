import { z } from "zod";
import type { DataApiClient } from "../supabase/studymeta-api.js";

const UuidSchema = z.uuid();

export interface AuthUserRecord {
  id: string;
  email?: string | undefined;
}

export interface AdminProvisioningTarget {
  target: number;
  auth_user_id: string;
}

export interface ProvisioningOptions {
  grantedBy: string;
  reason: string;
  apply?: boolean;
  logger?: (message: string) => void;
}

const ProvisioningResultSchema = z
  .object({ auth_user_id: UuidSchema, newly_granted: z.boolean() })
  .strict();

export function parseAdminEmails(value: string | undefined): string[] {
  const emails = (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) {
    throw new Error("STUDYMETA_ADMIN_EMAILS must contain at least one email");
  }
  return emails;
}

export function planAdminProvisioning(
  requestedEmails: string[],
  users: AuthUserRecord[],
): AdminProvisioningTarget[] {
  const normalized = requestedEmails.map((email) => email.trim().toLowerCase());
  if (normalized.some((email) => !email)) {
    throw new Error("Administrator email input contains an empty value");
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Administrator email input contains duplicates");
  }

  const plan = normalized.map((email, index) => {
    const matches = users.filter(
      (user) => user.email?.trim().toLowerCase() === email,
    );
    if (matches.length !== 1) {
      throw new Error(
        `Administrator target ${index + 1} matched ${matches.length} auth users; no changes were made`,
      );
    }
    const authUserId = UuidSchema.parse(matches[0]!.id);
    return { target: index + 1, auth_user_id: authUserId };
  });

  if (new Set(plan.map((entry) => entry.auth_user_id)).size !== plan.length) {
    throw new Error("Administrator targets do not resolve to unique auth users");
  }
  return plan;
}

export async function provisionAdmins(
  client: DataApiClient,
  plan: AdminProvisioningTarget[],
  options: ProvisioningOptions,
): Promise<Array<{ auth_user_id: string; newly_granted: boolean }>> {
  const logger = options.logger ?? console.log;
  const grantedBy = UuidSchema.parse(options.grantedBy);
  const reason = options.reason.trim();
  if (!reason) throw new Error("A non-empty grant reason is required");
  if (plan.length === 0) throw new Error("At least one administrator is required");

  if (options.apply !== true) {
    logger(`DRY RUN: ${plan.length} administrator target(s) resolved; no roles changed.`);
    for (const item of plan) {
      logger(`Target ${item.target}: auth user ${item.auth_user_id}`);
    }
    return [];
  }

  const result = await client.schema("studymeta_api").rpc(
    "server_provision_admin_roles",
    {
      p_auth_user_ids: plan.map((entry) => entry.auth_user_id),
      p_granted_by: grantedBy,
      p_reason: reason,
    },
  );
  if (result.error) {
    throw new Error("Administrator provisioning was rejected; no secret or email was logged");
  }
  const parsed = ProvisioningResultSchema.array().safeParse(result.data);
  if (!parsed.success || parsed.data.length !== plan.length) {
    throw new Error("Administrator provisioning returned an invalid database response");
  }
  logger(`APPLIED: ${parsed.data.length} administrator target(s) processed atomically.`);
  return parsed.data;
}
