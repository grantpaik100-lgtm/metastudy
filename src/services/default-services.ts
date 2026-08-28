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
    services = createStudyMetaServices(repository, undefined, {
      demoMode: environment.STUDYMETA_DEMO_MODE === "true",
      learnerProfileType: environment.STUDYMETA_LEARNER_PROFILE_TYPE,
      demoStudentId: environment.DEMO_STUDENT_ID,
    });
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
  return createStudyMetaServices(repository, undefined, {
    demoMode: environment.STUDYMETA_DEMO_MODE === "true",
    learnerProfileType: environment.STUDYMETA_LEARNER_PROFILE_TYPE,
    demoStudentId: environment.DEMO_STUDENT_ID,
  });
}
