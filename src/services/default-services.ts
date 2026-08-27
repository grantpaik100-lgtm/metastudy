import { getEnvironment, getSupabasePublicKey } from "../config/env.js";
import { createSupabaseRepository } from "../repositories/supabase-study-meta-repository.js";
import { createStudyMetaServices, type StudyMetaServices } from "./service-container.js";

let services: StudyMetaServices | undefined;

export function getDefaultServices(): StudyMetaServices {
  if (!services) {
    const environment = getEnvironment();
    const repository = createSupabaseRepository(
      environment.SUPABASE_URL,
      environment.SUPABASE_SERVICE_ROLE_KEY,
    );
    services = createStudyMetaServices(repository);
  }
  return services;
}

export function createAuthenticatedServices(accessToken: string): StudyMetaServices {
  const environment = getEnvironment();
  const repository = createSupabaseRepository(
    environment.SUPABASE_URL,
    getSupabasePublicKey(environment),
    accessToken,
  );
  return createStudyMetaServices(repository);
}
