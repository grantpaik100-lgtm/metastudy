import type { IncomingMessage } from "node:http";
import { authenticateRequest } from "../auth/oauth.js";
import { getEnvironment, getSupabasePublicKey } from "../config/env.js";
import { createUserScopedSupabaseClient } from "./clients.js";
import { StudyMetaDataApi, type DataApiClient } from "./studymeta-api.js";

export async function createAuthenticatedDataApi(
  request: IncomingMessage,
): Promise<{ authUserId: string; dataApi: StudyMetaDataApi }> {
  const authenticated = await authenticateRequest(request);
  const environment = getEnvironment();
  const client = createUserScopedSupabaseClient(
    environment.SUPABASE_URL,
    getSupabasePublicKey(environment),
    authenticated.accessToken,
  );
  return {
    authUserId: authenticated.user.id,
    dataApi: new StudyMetaDataApi(client as unknown as DataApiClient),
  };
}
