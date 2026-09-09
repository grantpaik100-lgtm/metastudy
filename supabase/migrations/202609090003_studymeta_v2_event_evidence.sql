-- StudyMeta v2 Stage 3: immutable Learning Event intake and leased Evidence
-- derivation. This migration does not install an official Evidence definition,
-- generation rule, validation result, operation assignment, or State updater.

alter table studymeta_v2.learning_events
  add column normalized_command jsonb,
  add column canonical_serialization_version text,
  add column canonical_payload text,
  add column intake_policy_version text,
  add constraint learning_events_canonical_record_complete check (
    (normalized_command is null
      and canonical_serialization_version is null
      and canonical_payload is null
      and intake_policy_version is null)
    or (normalized_command is not null
      and canonical_serialization_version is not null
      and canonical_payload is not null
      and intake_policy_version is not null)
  );

alter table studymeta_v2.outbox_jobs
  add column lease_owner text,
  add column completed_at timestamptz,
  add column dead_lettered_at timestamptz,
  add column completion_hash text,
  add constraint outbox_lease_complete check (
    (status = 'processing' and lease_until is not null and lease_owner is not null)
    or (status <> 'processing' and lease_until is null and lease_owner is null)
  ),
  add constraint outbox_terminal_times check (
    (status = 'completed' and completed_at is not null and dead_lettered_at is null)
    or (status = 'dead_letter' and dead_lettered_at is not null and completed_at is null)
    or (status not in ('completed', 'dead_letter')
      and completed_at is null and dead_lettered_at is null)
  );

alter table studymeta_v2.derivation_runs
  add column derivation_policy_version text,
  add column allowed_operational_modes text[],
  add constraint derivation_runs_operational_policy_complete check (
    (derivation_policy_version is null and allowed_operational_modes is null)
    or (derivation_policy_version is not null
      and allowed_operational_modes is not null
      and cardinality(allowed_operational_modes) > 0
      and allowed_operational_modes
        <@ array['research_only', 'pilot', 'production']::text[])
  );

alter table studymeta_v2.derived_evidence
  add column definition_operation_assignment_id uuid
    references studymeta_v2.operation_assignments(id) on delete restrict,
  add column generation_operation_assignment_id uuid
    references studymeta_v2.operation_assignments(id) on delete restrict,
  add column operational_mode text,
  add constraint derived_evidence_operation_binding_complete check (
    (definition_operation_assignment_id is null
      and generation_operation_assignment_id is null
      and operational_mode is null)
    or (definition_operation_assignment_id is not null
      and generation_operation_assignment_id is not null
      and operational_mode in ('research_only', 'pilot', 'production'))
  ),
  add constraint derived_evidence_confidence_pair check (
    (observation_confidence is null and confidence_method is null)
    or (observation_confidence is not null and confidence_method is not null)
  );

create table studymeta_v2.evidence_basis_refs (
  learner_id uuid not null,
  evidence_id uuid not null,
  source_ref_id uuid not null,
  primary key (evidence_id, source_ref_id),
  foreign key (learner_id, evidence_id)
    references studymeta_v2.derived_evidence(learner_id, id) on delete cascade,
  foreign key (learner_id, source_ref_id)
    references studymeta_v2.source_refs(learner_id, id) on delete restrict
);
alter table studymeta_v2.evidence_basis_refs enable row level security;
alter table studymeta_v2.evidence_basis_refs force row level security;
revoke all on table studymeta_v2.evidence_basis_refs from public, anon, authenticated;

create or replace function studymeta_v2.assert_learning_event_command_shape(p_command jsonb)
returns void
language plpgsql
set search_path = pg_catalog
as $$
declare
  expected_top_level constant text[] := array[
    'schema_version', 'event_type', 'source', 'source_provider_reported',
    'external_event_id', 'idempotency_key', 'occurred_at', 'started_at',
    'ended_at', 'coordinates', 'observation', 'source_refs',
    'caused_by_event_id', 'correction_of_event_id'
  ];
  expected_coordinates constant text[] := array[
    'session_id', 'episode_id', 'goal_ids', 'assessment_goal_ids',
    'course_offering_id', 'catalog_node_ids', 'domain_id',
    'primary_concept_id', 'supporting_concept_ids', 'targets',
    'focus_revision', 'catalog_version', 'material_id', 'task_id',
    'item_id', 'step_id', 'attempt_id', 'intervention_instance_ids'
  ];
  expected_observation constant text[] := array[
    'learner_actions', 'assistant_actions', 'answers', 'assessments',
    'self_reports', 'measurements', 'support_trace'
  ];
begin
  if jsonb_typeof(p_command) is distinct from 'object'
     or (select array_agg(key order by key) from jsonb_object_keys(p_command) key)
       is distinct from (select array_agg(value order by value) from unnest(expected_top_level) value)
     or p_command->>'schema_version' <> 'studymeta.v2'
     or p_command->>'event_type' not in (
       'question', 'attempt_submitted', 'self_report', 'intervention_offered',
       'intervention_choice', 'intervention_delivered', 'focus_confirmation',
       'correction', 'session_action', 'observation'
     )
     or p_command->>'source' not in (
       'chatgpt', 'claude', 'external_ai', 'learning_app', 'mcp_ui',
       'student_web', 'admin_web', 'system'
     )
     or jsonb_typeof(p_command->'coordinates') is distinct from 'object'
     or (select array_agg(key order by key) from jsonb_object_keys(p_command->'coordinates') key)
       is distinct from (select array_agg(value order by value) from unnest(expected_coordinates) value)
     or jsonb_typeof(p_command->'observation') is distinct from 'object'
     or (select array_agg(key order by key) from jsonb_object_keys(p_command->'observation') key)
       is distinct from (select array_agg(value order by value) from unnest(expected_observation) value)
     or jsonb_typeof(p_command->'source_refs') is distinct from 'array'
     or jsonb_typeof(p_command#>'{coordinates,targets}') is distinct from 'array'
     or jsonb_typeof(p_command#>'{observation,learner_actions}') is distinct from 'array'
     or jsonb_typeof(p_command#>'{observation,assistant_actions}') is distinct from 'array'
     or jsonb_typeof(p_command#>'{observation,answers}') is distinct from 'array'
     or jsonb_typeof(p_command#>'{observation,assessments}') is distinct from 'array'
     or jsonb_typeof(p_command#>'{observation,self_reports}') is distinct from 'array'
     or jsonb_typeof(p_command#>'{observation,measurements}') is distinct from 'array'
     or jsonb_typeof(p_command#>'{observation,support_trace}') is distinct from 'object'
     or length(btrim(p_command->>'idempotency_key')) not between 8 and 200 then
    raise exception 'invalid_learning_event_command' using errcode = '22023';
  end if;

  -- Authority and derived-model fields are rejected by exact-key validation.
  perform (p_command->>'occurred_at')::timestamptz;
  perform (p_command#>>'{coordinates,session_id}')::uuid;
  if p_command->'started_at' <> 'null'::jsonb then
    perform (p_command->>'started_at')::timestamptz;
  end if;
  if p_command->'ended_at' <> 'null'::jsonb then
    perform (p_command->>'ended_at')::timestamptz;
  end if;
end;
$$;
revoke all on function studymeta_v2.assert_learning_event_command_shape(jsonb)
  from public, anon, authenticated, service_role;

create or replace function studymeta_api.server_record_learning_event(
  p_auth_user_id uuid,
  p_actor_type text,
  p_connection_id uuid,
  p_command jsonb,
  p_canonical_serialization text,
  p_payload_hash text,
  p_outbox_run_id uuid,
  p_intake_policy_version text,
  p_max_attempt_policy text
)
returns table (
  event_id uuid,
  recorded_at timestamptz,
  duplicate boolean,
  processing_status text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  resolved_learner_id uuid;
  resolved_connection_scope text;
  existing_by_key studymeta_v2.learning_events%rowtype;
  existing_by_external studymeta_v2.learning_events%rowtype;
  inserted_event studymeta_v2.learning_events%rowtype;
  target jsonb;
  target_ordinal bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  perform studymeta_v2.assert_learning_event_command_shape(p_command);
  if p_auth_user_id is null or p_actor_type not in ('student', 'admin') then
    raise exception 'verified AuthContext required' using errcode = '22023';
  end if;
  if p_payload_hash !~ '^sha256:[0-9a-f]{64}$'
     or p_canonical_serialization is null
     or p_intake_policy_version is null or btrim(p_intake_policy_version) = ''
     or p_max_attempt_policy is null or btrim(p_max_attempt_policy) = '' then
    raise exception 'versioned canonical payload and processing policy are required'
      using errcode = '22023';
  end if;

  select learners.id into resolved_learner_id
    from studymeta_v2.learners as learners
   where learners.auth_user_id = p_auth_user_id
     and learners.archived_at is null;
  if resolved_learner_id is null then
    raise exception 'active authenticated learner required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from studymeta_v2.account_roles roles
     where roles.auth_user_id = p_auth_user_id
       and roles.role = p_actor_type and roles.revoked_at is null
  ) then
    raise exception 'active actor role required' using errcode = '42501';
  end if;

  if p_connection_id is null then
    if p_command->>'external_event_id' is not null then
      raise exception 'external Event ID requires an active learner connection'
        using errcode = '22023';
    end if;
    resolved_connection_scope := 'auth-user:' || p_auth_user_id::text;
  else
    if not exists (
      select 1 from studymeta_v2.connections connections
       where connections.id = p_connection_id
         and connections.learner_id = resolved_learner_id
         and connections.revoked_at is null
    ) then
      raise exception 'active learner-owned connection required' using errcode = '42501';
    end if;
    resolved_connection_scope := 'connection:' || p_connection_id::text;
  end if;

  -- Serialize competing retries before checking both idempotency namespaces.
  perform pg_advisory_xact_lock(hashtextextended(
    resolved_learner_id::text || ':' || resolved_connection_scope || ':' ||
      (p_command->>'idempotency_key'), 0
  ));
  if p_command->>'external_event_id' is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      resolved_learner_id::text || ':' || p_connection_id::text || ':' ||
        (p_command->>'external_event_id'), 1
    ));
  end if;

  select * into existing_by_key
    from studymeta_v2.learning_events events
   where events.learner_id = resolved_learner_id
     and events.connection_scope = resolved_connection_scope
     and events.idempotency_key = p_command->>'idempotency_key';
  if p_command->>'external_event_id' is not null then
    select * into existing_by_external
      from studymeta_v2.learning_events events
     where events.learner_id = resolved_learner_id
       and events.connection_id = p_connection_id
       and events.external_event_id = p_command->>'external_event_id';
  end if;

  if existing_by_key.id is not null and existing_by_external.id is not null
     and existing_by_key.id <> existing_by_external.id then
    raise exception 'idempotency_external_identity_conflict' using errcode = '23505';
  end if;
  if existing_by_key.id is not null then
    if existing_by_key.payload_hash <> p_payload_hash then
      raise exception 'idempotency_payload_conflict' using errcode = '23505';
    end if;
    return query select existing_by_key.id, existing_by_key.recorded_at, true,
      coalesce((select jobs.status from studymeta_v2.outbox_jobs jobs
        where jobs.event_id = existing_by_key.id and jobs.kind = 'derive_evidence'
        order by jobs.created_at limit 1), 'pending');
    return;
  end if;
  if existing_by_external.id is not null then
    if existing_by_external.payload_hash <> p_payload_hash then
      raise exception 'external_event_payload_conflict' using errcode = '23505';
    end if;
    return query select existing_by_external.id, existing_by_external.recorded_at, true,
      coalesce((select jobs.status from studymeta_v2.outbox_jobs jobs
        where jobs.event_id = existing_by_external.id and jobs.kind = 'derive_evidence'
        order by jobs.created_at limit 1), 'pending');
    return;
  end if;

  insert into studymeta_v2.learning_events (
    schema_version, learner_id, actor_id, actor_type, event_type, source,
    connection_id, connection_scope, source_provider_reported,
    external_event_id, session_id, episode_id, idempotency_key, payload_hash,
    occurred_at, started_at, ended_at, coordinates, observation,
    caused_by_event_id, correction_of_event_id, normalized_command,
    canonical_serialization_version, canonical_payload, intake_policy_version
  ) values (
    p_command->>'schema_version', resolved_learner_id, p_auth_user_id,
    p_actor_type, p_command->>'event_type', p_command->>'source',
    p_connection_id, resolved_connection_scope,
    p_command->>'source_provider_reported', p_command->>'external_event_id',
    (p_command#>>'{coordinates,session_id}')::uuid,
    nullif(p_command#>>'{coordinates,episode_id}', '')::uuid,
    p_command->>'idempotency_key', p_payload_hash,
    (p_command->>'occurred_at')::timestamptz,
    nullif(p_command->>'started_at', '')::timestamptz,
    nullif(p_command->>'ended_at', '')::timestamptz,
    p_command->'coordinates', p_command->'observation',
    nullif(p_command->>'caused_by_event_id', '')::uuid,
    nullif(p_command->>'correction_of_event_id', '')::uuid,
    p_command, 'studymeta.learning-event.canonical-json.v1',
    p_canonical_serialization, p_intake_policy_version
  ) returning * into inserted_event;

  insert into studymeta_v2.event_source_refs (learner_id, event_id, source_ref_id)
  select resolved_learner_id, inserted_event.id, collected_refs.source_ref_id::uuid
  from (
    select jsonb_array_elements_text(p_command->'source_refs') source_ref_id
    union
    select jsonb_array_elements_text(action->'source_refs')
      from jsonb_array_elements(p_command#>'{observation,learner_actions}') action
    union
    select jsonb_array_elements_text(action->'source_refs')
      from jsonb_array_elements(p_command#>'{observation,assistant_actions}') action
    union
    select jsonb_array_elements_text(assessment->'basis_refs')
      from jsonb_array_elements(p_command#>'{observation,assessments}') assessment
    union
    select jsonb_array_elements_text(report->'source_refs')
      from jsonb_array_elements(p_command#>'{observation,self_reports}') report
    union
    select jsonb_array_elements_text(p_command#>'{observation,support_trace,source_refs}')
    union
    select jsonb_array_elements_text(event_target->'basis_refs')
      from jsonb_array_elements(p_command#>'{coordinates,targets}') event_target
  ) collected_refs;

  insert into studymeta_v2.event_attempts (learner_id, event_id, attempt_id)
  select resolved_learner_id, inserted_event.id, attempts.attempt_id::uuid
  from (
    select p_command#>>'{coordinates,attempt_id}' attempt_id
    where p_command#>'{coordinates,attempt_id}' <> 'null'::jsonb
    union
    select answer->>'attempt_id'
      from jsonb_array_elements(p_command#>'{observation,answers}') answer
  ) attempts;

  for target, target_ordinal in
    select value, ordinality from jsonb_array_elements(p_command#>'{coordinates,targets}')
      with ordinality
  loop
    insert into studymeta_v2.event_targets (
      learner_id, event_id, role, target_type, target_id, target_version,
      domain_id, scope_id, mapping_status, mapping_revision_id, basis_ref_ids
    ) values (
      resolved_learner_id, inserted_event.id,
      case when target_ordinal = 1 then 'primary' else 'supporting' end,
      target->>'target_type', target->>'target_id', target->>'target_version',
      target->>'domain_id', target->>'scope_id', target->>'mapping_status',
      (target->>'mapping_revision_id')::uuid,
      array(select jsonb_array_elements_text(target->'basis_refs')::uuid)
    );
  end loop;

  insert into studymeta_v2.outbox_jobs (
    owner_learner_id, event_id, run_id, kind, status,
    max_attempt_policy, payload
  ) values (
    resolved_learner_id, inserted_event.id, p_outbox_run_id,
    'derive_evidence', 'pending', p_max_attempt_policy,
    jsonb_build_object(
      'schema_version', 'studymeta.v2',
      'intake_policy_version', p_intake_policy_version,
      'canonical_serialization_version', 'studymeta.learning-event.canonical-json.v1'
    )
  );

  return query select inserted_event.id, inserted_event.recorded_at, false, 'pending'::text;
end;
$$;

revoke all on function studymeta_api.server_record_learning_event(
  uuid, text, uuid, jsonb, text, text, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function studymeta_api.server_record_learning_event(
  uuid, text, uuid, jsonb, text, text, uuid, text, text
) to service_role;

create or replace function studymeta_api.server_claim_evidence_derivation(
  p_worker_id text,
  p_lease_milliseconds integer,
  p_max_attempts integer,
  p_max_attempt_policy text,
  p_allowed_operational_modes text[]
)
returns table (
  job_id uuid,
  run_id uuid,
  event_id uuid,
  learner_id uuid,
  attempt_count integer,
  command jsonb
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  claimed studymeta_v2.outbox_jobs%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_worker_id is null or btrim(p_worker_id) = ''
     or p_lease_milliseconds is null or p_lease_milliseconds <= 0
     or p_max_attempts is null or p_max_attempts <= 0
     or p_max_attempt_policy is null or btrim(p_max_attempt_policy) = ''
     or p_allowed_operational_modes is null
     or cardinality(p_allowed_operational_modes) = 0
     or not (p_allowed_operational_modes
       <@ array['research_only', 'pilot', 'production']::text[])
     or cardinality(p_allowed_operational_modes) <>
       (select count(distinct mode) from unnest(p_allowed_operational_modes) mode) then
    raise exception 'explicit worker lease and retry policy required' using errcode = '22023';
  end if;

  with exhausted as (
    update studymeta_v2.outbox_jobs jobs
       set status = 'dead_letter', lease_until = null, lease_owner = null,
           dead_lettered_at = clock_timestamp(),
           last_error_code = coalesce(jobs.last_error_code, 'max_attempts_exhausted')
     where jobs.kind = 'derive_evidence'
       and jobs.max_attempt_policy = p_max_attempt_policy
       and jobs.attempt_count >= p_max_attempts
       and (
         (jobs.status in ('pending', 'failed') and jobs.available_at <= clock_timestamp())
         or (jobs.status = 'processing' and jobs.lease_until <= clock_timestamp())
       )
    returning jobs.owner_learner_id, jobs.run_id, jobs.last_error_code
  )
  update studymeta_v2.derivation_runs runs
     set status = 'failed', completed_at = clock_timestamp(),
         result_manifest = jsonb_build_object('error_code', exhausted.last_error_code)
    from exhausted
   where runs.learner_id = exhausted.owner_learner_id
     and runs.id = exhausted.run_id;

  with candidate as (
    select jobs.id
      from studymeta_v2.outbox_jobs jobs
     where jobs.kind = 'derive_evidence'
       and jobs.max_attempt_policy = p_max_attempt_policy
       and jobs.attempt_count < p_max_attempts
       and (
         (jobs.status in ('pending', 'failed') and jobs.available_at <= clock_timestamp())
         or (jobs.status = 'processing' and jobs.lease_until <= clock_timestamp())
       )
     order by jobs.available_at, jobs.created_at, jobs.id
     for update skip locked
     limit 1
  )
  update studymeta_v2.outbox_jobs jobs
     set status = 'processing',
         lease_owner = p_worker_id,
         lease_until = clock_timestamp() + p_lease_milliseconds * interval '1 millisecond',
         attempt_count = jobs.attempt_count + 1,
         last_error_code = null
    from candidate
   where jobs.id = candidate.id
  returning jobs.* into claimed;

  if claimed.id is null then return; end if;

  insert into studymeta_v2.derivation_runs (
    id, learner_id, event_id, generation_release, status, started_at,
    derivation_policy_version, allowed_operational_modes
  ) values (
    claimed.run_id, claimed.owner_learner_id, claimed.event_id,
    'unresolved-until-worker-completion', 'processing', clock_timestamp(),
    p_max_attempt_policy, p_allowed_operational_modes
  )
  on conflict (id) do update
    set status = 'processing',
        started_at = coalesce(studymeta_v2.derivation_runs.started_at, clock_timestamp()),
        completed_at = null,
        result_manifest = null,
        derivation_policy_version = excluded.derivation_policy_version,
        allowed_operational_modes = excluded.allowed_operational_modes;

  return query
  select claimed.id, claimed.run_id, claimed.event_id, claimed.owner_learner_id,
         claimed.attempt_count, events.normalized_command
    from studymeta_v2.learning_events events
   where events.learner_id = claimed.owner_learner_id and events.id = claimed.event_id;
end;
$$;

revoke all on function studymeta_api.server_claim_evidence_derivation(text, integer, integer, text, text[])
  from public, anon, authenticated, service_role;
grant execute on function studymeta_api.server_claim_evidence_derivation(text, integer, integer, text, text[])
  to service_role;

create or replace function studymeta_api.server_fail_evidence_derivation(
  p_job_id uuid,
  p_worker_id text,
  p_error_code text,
  p_retry_delay_milliseconds integer,
  p_max_attempts integer,
  p_max_attempt_policy text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  job studymeta_v2.outbox_jobs%rowtype;
  next_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_retry_delay_milliseconds < 0 or p_max_attempts <= 0
     or p_error_code is null or btrim(p_error_code) = ''
     or p_max_attempt_policy is null or btrim(p_max_attempt_policy) = '' then
    raise exception 'explicit failure and retry policy required' using errcode = '22023';
  end if;
  select * into job from studymeta_v2.outbox_jobs where id = p_job_id for update;
  if job.id is null or job.kind <> 'derive_evidence'
     or job.status <> 'processing' or job.lease_owner <> p_worker_id
     or job.max_attempt_policy <> p_max_attempt_policy then
    raise exception 'job lease ownership mismatch' using errcode = '55000';
  end if;
  next_status := case when job.attempt_count >= p_max_attempts then 'dead_letter' else 'failed' end;
  update studymeta_v2.outbox_jobs
     set status = next_status,
         available_at = case when next_status = 'failed'
           then clock_timestamp() + p_retry_delay_milliseconds * interval '1 millisecond'
           else available_at end,
         lease_until = null, lease_owner = null,
         last_error_code = p_error_code,
         dead_lettered_at = case when next_status = 'dead_letter' then clock_timestamp() else null end
   where id = job.id;
  update studymeta_v2.derivation_runs
     set status = 'failed', completed_at = clock_timestamp(),
         result_manifest = jsonb_build_object('error_code', p_error_code)
   where id = job.run_id and learner_id = job.owner_learner_id;
  return next_status;
end;
$$;

revoke all on function studymeta_api.server_fail_evidence_derivation(
  uuid, text, text, integer, integer, text
) from public, anon, authenticated, service_role;
grant execute on function studymeta_api.server_fail_evidence_derivation(
  uuid, text, text, integer, integer, text
) to service_role;

create or replace function studymeta_api.server_complete_evidence_derivation(
  p_job_id uuid,
  p_worker_id text,
  p_generation_release text,
  p_reason_code text,
  p_result_manifest jsonb,
  p_evidence jsonb,
  p_completion_hash text
)
returns table (status text, duplicate boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  job studymeta_v2.outbox_jobs%rowtype;
  item jsonb;
  operation_binding jsonb;
  evidence_id uuid;
  evidence_count integer;
  definition_operation_assignment_id uuid;
  generation_operation_assignment_id uuid;
  selected_operational_mode text;
  policy_allowed_operational_modes text[];
  recorded_derivation_policy_version text;
  recorded_allowed_operational_modes text[];
  completion_time timestamptz := clock_timestamp();
  source_event text;
  attempt text;
  basis_ref text;
  target jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_generation_release is null or btrim(p_generation_release) = ''
     or p_completion_hash !~ '^sha256:[0-9a-f]{64}$'
     or jsonb_typeof(p_result_manifest) is distinct from 'object'
     or jsonb_typeof(p_evidence) is distinct from 'array' then
    raise exception 'complete derivation result is required' using errcode = '22023';
  end if;
  evidence_count := jsonb_array_length(p_evidence);
  if (evidence_count = 0 and p_reason_code is distinct from 'no_authorized_generation_rule')
     or (evidence_count > 0 and p_reason_code is not null)
     or (p_result_manifest->>'generation_release') is distinct from p_generation_release
     or (p_result_manifest->>'source_event_id') is null
     or jsonb_typeof(p_result_manifest->'evidence_ids') is distinct from 'array'
     or nullif(btrim(p_result_manifest->>'derivation_policy_version'), '') is null
     or jsonb_typeof(p_result_manifest->'allowed_operational_modes') is distinct from 'array'
     or jsonb_array_length(p_result_manifest->'allowed_operational_modes') = 0
     or jsonb_typeof(p_result_manifest->'operation_bindings') is distinct from 'array'
     or jsonb_array_length(p_result_manifest->'operation_bindings') <> evidence_count
     or jsonb_array_length(p_result_manifest->'evidence_ids') <> evidence_count
     or (p_result_manifest->>'evidence_count')::integer <> evidence_count
     or (p_result_manifest->>'hold_reason_code') is distinct from p_reason_code then
    raise exception 'invalid derivation result manifest' using errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_result_manifest->'allowed_operational_modes') modes(value)
     where jsonb_typeof(modes.value) <> 'string'
        or modes.value#>>'{}' not in ('research_only', 'pilot', 'production')
  ) or (
    select count(*) <> count(distinct modes.value#>>'{}')
      from jsonb_array_elements(p_result_manifest->'allowed_operational_modes') modes(value)
  ) then
    raise exception 'invalid allowed operational modes' using errcode = '22023';
  end if;
  select array_agg(modes.value order by modes.ordinal)
    into policy_allowed_operational_modes
    from jsonb_array_elements_text(p_result_manifest->'allowed_operational_modes')
      with ordinality modes(value, ordinal);
  if exists (
    (select manifest_ids.value from jsonb_array_elements_text(p_result_manifest->'evidence_ids') manifest_ids(value))
    except
    (select evidence_items.value->>'evidence_id' from jsonb_array_elements(p_evidence) evidence_items(value))
  ) or exists (
    (select evidence_items.value->>'evidence_id' from jsonb_array_elements(p_evidence) evidence_items(value))
    except
    (select manifest_ids.value from jsonb_array_elements_text(p_result_manifest->'evidence_ids') manifest_ids(value))
  ) then
    raise exception 'result manifest Evidence IDs do not match its Evidence rows'
      using errcode = '23514';
  end if;
  if exists (
    (select manifest_ids.value from jsonb_array_elements_text(p_result_manifest->'evidence_ids') manifest_ids(value))
    except
    (select bindings.value->>'evidence_id' from jsonb_array_elements(p_result_manifest->'operation_bindings') bindings(value))
  ) or exists (
    (select bindings.value->>'evidence_id' from jsonb_array_elements(p_result_manifest->'operation_bindings') bindings(value))
    except
    (select manifest_ids.value from jsonb_array_elements_text(p_result_manifest->'evidence_ids') manifest_ids(value))
  ) or (
    select count(*) <> count(distinct bindings.value->>'evidence_id')
      from jsonb_array_elements(p_result_manifest->'operation_bindings') bindings(value)
  ) then
    raise exception 'operation bindings do not match manifest Evidence IDs'
      using errcode = '23514';
  end if;

  select * into job from studymeta_v2.outbox_jobs where id = p_job_id for update;
  if job.id is null or job.kind <> 'derive_evidence' then
    raise exception 'derivation job not found' using errcode = '23503';
  end if;
  if job.status = 'completed' then
    if job.completion_hash <> p_completion_hash then
      raise exception 'derivation_completion_conflict' using errcode = '23505';
    end if;
    return query select 'completed'::text, true;
    return;
  end if;
  if job.status <> 'processing' or job.lease_owner <> p_worker_id
     or job.lease_until <= clock_timestamp() then
    raise exception 'active job lease required' using errcode = '55000';
  end if;
  if p_result_manifest->>'source_event_id' <> job.event_id::text then
    raise exception 'result manifest Event mismatch' using errcode = '23514';
  end if;
  select runs.derivation_policy_version, runs.allowed_operational_modes
    into recorded_derivation_policy_version, recorded_allowed_operational_modes
    from studymeta_v2.derivation_runs runs
   where runs.id = job.run_id and runs.learner_id = job.owner_learner_id;
  if not found
     or recorded_derivation_policy_version is distinct from
       p_result_manifest->>'derivation_policy_version'
     or recorded_allowed_operational_modes is distinct from
       policy_allowed_operational_modes then
    raise exception 'derivation policy does not match the claimed run'
      using errcode = '23514';
  end if;

  for item in select value from jsonb_array_elements(p_evidence)
  loop
    evidence_id := (item->>'evidence_id')::uuid;
    select bindings.value into operation_binding
      from jsonb_array_elements(p_result_manifest->'operation_bindings') bindings(value)
     where bindings.value->>'evidence_id' = evidence_id::text;
    if operation_binding is null
       or jsonb_typeof(operation_binding) <> 'object'
       or (select array_agg(key order by key) from jsonb_object_keys(operation_binding) key)
          is distinct from array[
            'definition_operation_assignment_id', 'evidence_id',
            'generation_operation_assignment_id', 'operational_mode'
          ]::text[] then
      raise exception 'invalid Evidence operation binding' using errcode = '22023';
    end if;
    definition_operation_assignment_id :=
      (operation_binding->>'definition_operation_assignment_id')::uuid;
    generation_operation_assignment_id :=
      (operation_binding->>'generation_operation_assignment_id')::uuid;
    selected_operational_mode := operation_binding->>'operational_mode';
    if item->>'learner_id' <> job.owner_learner_id::text
       or item->>'derivation_run_id' <> job.run_id::text
       or item->>'event_id' <> job.event_id::text
       or jsonb_array_length(item->'source_event_ids') = 0
       or jsonb_array_length(item->'basis_refs') = 0
       or jsonb_array_length(item->'targets') = 0
       or (item->'observation_confidence' = 'null'::jsonb)
          <> (item->'confidence_method' = 'null'::jsonb) then
      raise exception 'incomplete Evidence provenance' using errcode = '23514';
    end if;
    if selected_operational_mode is null
       or not (selected_operational_mode = any(policy_allowed_operational_modes)) then
      raise exception 'operation assignment mode is not allowed by derivation policy'
        using errcode = '42501';
    end if;
    if not exists (
      select 1 from studymeta_v2.operation_assignments assignments
       where assignments.id = generation_operation_assignment_id
         and assignments.subject_kind = 'generation_rule'
         and assignments.subject_id = item#>>'{generation_rule,generation_rule_id}'
         and assignments.subject_version = item#>>'{generation_rule,generation_rule_version}'
         and assignments.mode = selected_operational_mode
         and assignments.mode = any(policy_allowed_operational_modes)
         and 'derive' = any(assignments.permitted_actions)
         and assignments.valid_from <= completion_time
         and (assignments.expires_at is null or assignments.expires_at > completion_time)
    ) or not exists (
      select 1 from studymeta_v2.operation_assignments assignments
       where assignments.id = definition_operation_assignment_id
         and assignments.subject_kind = 'evidence_definition'
         and assignments.subject_id = item->>'evidence_type_id'
         and assignments.subject_version = item->>'definition_version'
         and assignments.mode = selected_operational_mode
         and assignments.mode = any(policy_allowed_operational_modes)
         and 'derive' = any(assignments.permitted_actions)
         and assignments.valid_from <= completion_time
         and (assignments.expires_at is null or assignments.expires_at > completion_time)
    ) then
      raise exception 'no_authorized_generation_rule' using errcode = '42501';
    end if;

    insert into studymeta_v2.derived_evidence (
      id, schema_version, learner_id, evidence_type_id, definition_version,
      generation_rule_id, generation_rule_version, derivation_run_id,
      representative_event_id, value, value_status, value_schema_version,
      detail, reason, qualifiers, observation_confidence, confidence_method,
      support_condition, observation_group_id, observed_at, generated_at,
      definition_validation_assessment_id, generation_validation_assessment_id,
      validation_snapshot_id, provenance_status, supersedes_evidence_id,
      definition_operation_assignment_id, generation_operation_assignment_id,
      operational_mode
    ) values (
      evidence_id, item->>'schema_version', job.owner_learner_id,
      item->>'evidence_type_id', item->>'definition_version',
      item#>>'{generation_rule,generation_rule_id}',
      item#>>'{generation_rule,generation_rule_version}', job.run_id, job.event_id,
      item->'value', item->>'value_status', item->>'value_schema_version',
      item->>'detail', item->>'reason', item->'qualifiers',
      nullif(item->>'observation_confidence', '')::double precision,
      item->>'confidence_method', item->>'support_condition',
      (item->>'observation_group_id')::uuid,
      (item->>'observed_at')::timestamptz,
      (item->>'generated_at')::timestamptz,
      (item->>'definition_validation_assessment_id')::uuid,
      (item->>'generation_validation_assessment_id')::uuid,
      (item->>'validation_snapshot_id')::uuid,
      item->>'provenance_status',
      nullif(item->>'supersedes_evidence_id', '')::uuid,
      definition_operation_assignment_id, generation_operation_assignment_id,
      selected_operational_mode
    );

    for source_event in select jsonb_array_elements_text(item->'source_event_ids') loop
      insert into studymeta_v2.evidence_source_events (learner_id, evidence_id, event_id)
      values (job.owner_learner_id, evidence_id, source_event::uuid);
    end loop;
    for basis_ref in select jsonb_array_elements_text(item->'basis_refs') loop
      insert into studymeta_v2.evidence_basis_refs (learner_id, evidence_id, source_ref_id)
      values (job.owner_learner_id, evidence_id, basis_ref::uuid);
    end loop;
    for attempt in select jsonb_array_elements_text(item->'attempt_ids') loop
      insert into studymeta_v2.evidence_attempts (learner_id, evidence_id, attempt_id)
      values (job.owner_learner_id, evidence_id, attempt::uuid);
    end loop;
    for target in select value from jsonb_array_elements(item->'targets') loop
      insert into studymeta_v2.evidence_targets (
        learner_id, evidence_id, target_type, target_id, target_version,
        domain_id, scope_id, mapping_status, mapping_revision_id, basis_ref_ids
      ) values (
        job.owner_learner_id, evidence_id, target->>'target_type',
        target->>'target_id', target->>'target_version', target->>'domain_id',
        target->>'scope_id', target->>'mapping_status',
        (target->>'mapping_revision_id')::uuid,
        array(select jsonb_array_elements_text(target->'basis_refs')::uuid)
      );
    end loop;
  end loop;

  update studymeta_v2.derivation_runs
     set generation_release = p_generation_release,
         status = 'completed', result_manifest = p_result_manifest,
         completed_at = completion_time
   where id = job.run_id and learner_id = job.owner_learner_id;
  if not found then
    raise exception 'derivation run not found' using errcode = '23503';
  end if;
  update studymeta_v2.outbox_jobs
     set status = 'completed', lease_until = null, lease_owner = null,
         completed_at = completion_time, completion_hash = p_completion_hash,
         last_error_code = p_reason_code
   where id = job.id;
  return query select 'completed'::text, false;
end;
$$;

revoke all on function studymeta_api.server_complete_evidence_derivation(
  uuid, text, text, text, jsonb, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function studymeta_api.server_complete_evidence_derivation(
  uuid, text, text, text, jsonb, jsonb, text
) to service_role;

comment on function studymeta_api.server_record_learning_event(
  uuid, text, uuid, jsonb, text, text, uuid, text, text
) is 'Server-only Stage 3A transaction. AuthContext is separate from the strict Event command; learner and connection scope are resolved in the database.';
comment on function studymeta_api.server_claim_evidence_derivation(text, integer, integer, text, text[])
  is 'Server-only Stage 3B claim using FOR UPDATE SKIP LOCKED and an injected versioned retry policy.';
comment on function studymeta_api.server_complete_evidence_derivation(
  uuid, text, text, text, jsonb, jsonb, text
) is 'Atomically writes Evidence provenance, run manifest, and outbox completion. It never invokes State calculation.';
comment on table studymeta_v2.evidence_basis_refs is
  'Owned SourceRef basis for derived Evidence; opaque references only, no student message or answer body.';
