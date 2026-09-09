import {
  getEnvironment,
  getSupabasePublicKey,
  getSupabaseSecretKey,
} from "../config/env.js";
import {
  createElevatedSupabaseRepository,
  createUserScopedSupabaseRepository,
} from "../repositories/supabase-study-meta-repository.js";
import { createStudyMetaServices, type StudyMetaServices } from "./service-container.js";
import {
  EvidenceBasedLearnerStateUpdater,
  NoOpLearnerStateUpdater,
} from "./learner-state-updater.js";

let services: StudyMetaServices | undefined;

export function getDefaultServices(): StudyMetaServices {
  if (!services) {
    const environment = getEnvironment();
    const repository = createElevatedSupabaseRepository(
      environment.SUPABASE_URL,
      getSupabaseSecretKey(environment),
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
  const userRepository = createUserScopedSupabaseRepository(
    environment.SUPABASE_URL,
    getSupabasePublicKey(environment),
    accessToken,
  );
  const stateRepository = createElevatedSupabaseRepository(
    environment.SUPABASE_URL,
    getSupabaseSecretKey(environment),
  );
  return createStudyMetaServices(
    userRepository,
    new EvidenceBasedLearnerStateUpdater(stateRepository),
    {
      demoMode: environment.STUDYMETA_DEMO_MODE === "true",
      learnerProfileType: environment.STUDYMETA_LEARNER_PROFILE_TYPE,
      demoStudentId: environment.DEMO_STUDENT_ID,
    },
  );
}

export function createAuthenticatedReadServices(
  accessToken: string,
): StudyMetaServices {
  const environment = getEnvironment();
  const userRepository = createUserScopedSupabaseRepository(
    environment.SUPABASE_URL,
    getSupabasePublicKey(environment),
    accessToken,
  );
  return createStudyMetaServices(userRepository, new NoOpLearnerStateUpdater(), {
    demoMode: environment.STUDYMETA_DEMO_MODE === "true",
    learnerProfileType: environment.STUDYMETA_LEARNER_PROFILE_TYPE,
    demoStudentId: environment.DEMO_STUDENT_ID,
  });
}
