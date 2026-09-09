-- StudyMeta v2 Stage 2B: the only browser-facing Data API surface for v2.
-- Keep studymeta_v2 out of PostgREST Exposed schemas. Expose studymeta_api only.

create schema studymeta_api;

revoke all on schema studymeta_api from public, anon, authenticated, service_role;
grant usage on schema studymeta_api to authenticated, service_role;

-- Stage 2A granted authenticated direct table reads so its RLS could be tested
-- before a Data API facade existed. Stage 2B closes that temporary surface:
-- authenticated callers reach v2 data only through studymeta_api functions.
revoke usage on schema studymeta_v2 from authenticated;
revoke all on all tables in schema studymeta_v2 from authenticated;
revoke all on all sequences in schema studymeta_v2 from authenticated;
revoke all on all functions in schema studymeta_v2 from authenticated;

alter default privileges for role postgres in schema studymeta_api
  revoke execute on functions from public;
alter default privileges for role postgres in schema studymeta_api
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema studymeta_api
  revoke all on sequences from public, anon, authenticated, service_role;

create or replace function studymeta_api.get_my_identity()
returns table (
  auth_user_id uuid,
  learner_id uuid,
  display_name text,
  joined_at timestamptz,
  archived_at timestamptz,
  active_roles text[]
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null or studymeta_v2.current_learner_id() is null then
    raise exception 'authenticated learner required' using errcode = '42501';
  end if;
  return query select * from studymeta_v2.get_authenticated_learner();
end;
$$;

create or replace function studymeta_api.get_my_learner_summary()
returns table (
  learner_id uuid,
  display_name text,
  joined_at timestamptz,
  is_archived boolean,
  last_learning_at timestamptz,
  current_state_count bigint,
  needs_review_state_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  caller_learner_id uuid;
begin
  caller_learner_id := studymeta_v2.current_learner_id();
  if auth.uid() is null or caller_learner_id is null then
    raise exception 'authenticated learner required' using errcode = '42501';
  end if;

  return query
  select
    learners.id,
    learners.display_name,
    learners.created_at,
    learners.archived_at is not null,
    (select max(events.occurred_at)
       from studymeta_v2.learning_events as events
      where events.learner_id = learners.id),
    (select count(*)
       from studymeta_v2.state_heads as heads
      where heads.learner_id = learners.id and heads.channel = 'production'),
    (select count(*)
       from studymeta_v2.state_heads as heads
       join studymeta_v2.state_estimates as estimates
         on estimates.learner_id = heads.learner_id
        and estimates.id = heads.current_estimate_id
      where heads.learner_id = learners.id
        and heads.channel = 'production'
        and (heads.freshness in ('stale', 'pending')
             or estimates.status in ('unknown', 'candidate')))
  from studymeta_v2.learners as learners
  where learners.id = caller_learner_id;
end;
$$;

create or replace function studymeta_api.get_my_current_states(
  p_limit integer default 100
)
returns table (
  learner_id uuid,
  state_target jsonb,
  state_type text,
  current_estimate jsonb,
  head_revision bigint,
  freshness text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  caller_learner_id uuid;
begin
  caller_learner_id := studymeta_v2.current_learner_id();
  if auth.uid() is null or caller_learner_id is null then
    raise exception 'authenticated learner required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be between 1 and 100' using errcode = '22023';
  end if;

  return query
  select
    heads.learner_id,
    jsonb_build_object(
      'state_target_id', targets.id,
      'target_kind', targets.target_kind,
      'domain_id', targets.domain_id,
      'scope_id', targets.scope_id,
      'knowledge_level', targets.knowledge_level,
      'concept_id', targets.concept_id,
      'concept_version', targets.concept_version,
      'skill_id', targets.skill_id,
      'skill_version', targets.skill_version,
      'intervention_type_id', targets.intervention_type_id,
      'intervention_type_version', targets.intervention_type_version,
      'intervention_scope_level', targets.intervention_scope_level
    ),
    heads.state_type,
    jsonb_build_object(
      'state_estimate_id', estimates.id,
      'status', estimates.status,
      'value', estimates.value,
      'estimate_confidence', estimates.estimate_confidence,
      'evidence_count', estimates.evidence_count,
      'observation_count', estimates.observation_count,
      'as_of', estimates.as_of
    ),
    heads.head_revision,
    heads.freshness,
    heads.updated_at
  from studymeta_v2.state_heads as heads
  join studymeta_v2.state_targets as targets
    on targets.learner_id = heads.learner_id
   and targets.id = heads.state_target_id
  join studymeta_v2.state_estimates as estimates
    on estimates.learner_id = heads.learner_id
   and estimates.id = heads.current_estimate_id
  where heads.learner_id = caller_learner_id
    and heads.channel = 'production'
  order by heads.state_type, heads.state_target_id
  limit p_limit;
end;
$$;

create or replace function studymeta_api.get_my_recent_state_log(
  p_limit integer default 50
)
returns table (
  evaluation_id uuid,
  learner_id uuid,
  state_target jsonb,
  state_type text,
  before_estimate jsonb,
  after_estimate jsonb,
  candidate_estimate jsonb,
  decision text,
  changed_fields text[],
  reason_codes text[],
  processing_status text,
  non_change_category text,
  validation_snapshot_id uuid,
  calculation_run_id uuid,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  caller_learner_id uuid;
begin
  caller_learner_id := studymeta_v2.current_learner_id();
  if auth.uid() is null or caller_learner_id is null then
    raise exception 'authenticated learner required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be between 1 and 100' using errcode = '22023';
  end if;

  return query
  select
    evaluations.id,
    evaluations.learner_id,
    jsonb_build_object(
      'state_target_id', targets.id,
      'target_kind', targets.target_kind,
      'domain_id', targets.domain_id,
      'scope_id', targets.scope_id,
      'knowledge_level', targets.knowledge_level,
      'concept_id', targets.concept_id,
      'concept_version', targets.concept_version,
      'skill_id', targets.skill_id,
      'skill_version', targets.skill_version,
      'intervention_type_id', targets.intervention_type_id,
      'intervention_type_version', targets.intervention_type_version,
      'intervention_scope_level', targets.intervention_scope_level
    ),
    evaluations.state_type,
    case when before_estimates.id is null then null else jsonb_build_object(
      'state_estimate_id', before_estimates.id,
      'status', before_estimates.status,
      'value', before_estimates.value,
      'estimate_confidence', before_estimates.estimate_confidence,
      'evidence_count', before_estimates.evidence_count,
      'observation_count', before_estimates.observation_count,
      'as_of', before_estimates.as_of
    ) end,
    case when after_estimates.id is null then null else jsonb_build_object(
      'state_estimate_id', after_estimates.id,
      'status', after_estimates.status,
      'value', after_estimates.value,
      'estimate_confidence', after_estimates.estimate_confidence,
      'evidence_count', after_estimates.evidence_count,
      'observation_count', after_estimates.observation_count,
      'as_of', after_estimates.as_of
    ) end,
    case when candidate_estimates.id is null then null else jsonb_build_object(
      'state_estimate_id', candidate_estimates.id,
      'status', candidate_estimates.status,
      'value', candidate_estimates.value,
      'estimate_confidence', candidate_estimates.estimate_confidence,
      'evidence_count', candidate_estimates.evidence_count,
      'observation_count', candidate_estimates.observation_count,
      'as_of', candidate_estimates.as_of
    ) end,
    evaluations.decision,
    evaluations.changed_fields,
    evaluations.reason_codes,
    evaluations.processing_status,
    case
      when evaluations.decision not in ('unchanged', 'withheld', 'disabled') then null
      when evaluations.reason_codes && array[
        'insufficient_evidence', 'insufficient_observations',
        'no_eligible_evidence', 'effective_sample_size_too_low'
      ]::text[] then 'insufficient_evidence'
      when evaluations.reason_codes && array[
        'validation_not_approved', 'validation_scope_mismatch',
        'operation_not_permitted', 'policy_withheld', 'rule_disabled'
      ]::text[] then 'validation_policy'
      when evaluations.reason_codes && array[
        'calculation_pending', 'calculation_failed',
        'manifest_unavailable', 'replay_pending'
      ]::text[] then 'calculation_held'
      else 'unclassified'
    end,
    evaluations.validation_snapshot_id,
    evaluations.run_id,
    coalesce(evaluations.completed_at, evaluations.started_at)
  from studymeta_v2.state_evaluations as evaluations
  join studymeta_v2.state_targets as targets
    on targets.learner_id = evaluations.learner_id
   and targets.id = evaluations.state_target_id
  left join studymeta_v2.state_estimates as before_estimates
    on before_estimates.learner_id = evaluations.learner_id
   and before_estimates.id = evaluations.before_estimate_id
  left join studymeta_v2.state_estimates as after_estimates
    on after_estimates.learner_id = evaluations.learner_id
   and after_estimates.id = evaluations.after_estimate_id
  left join studymeta_v2.state_estimates as candidate_estimates
    on candidate_estimates.learner_id = evaluations.learner_id
   and candidate_estimates.id = evaluations.candidate_estimate_id
  where evaluations.learner_id = caller_learner_id
  order by coalesce(evaluations.completed_at, evaluations.started_at) desc,
           evaluations.id desc
  limit p_limit;
end;
$$;

create or replace function studymeta_api.admin_list_students(
  p_include_archived boolean default false,
  p_limit integer default 50,
  p_after_joined_at timestamptz default null,
  p_after_learner_id uuid default null
)
returns table (
  learner_id uuid,
  display_name text,
  joined_at timestamptz,
  is_archived boolean,
  last_learning_at timestamptz,
  current_state_count bigint,
  needs_review_state_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not studymeta_v2.is_active_admin() then
    raise exception 'active admin role required' using errcode = '42501';
  end if;
  return query select * from studymeta_v2.admin_list_students(
    p_include_archived, p_limit, p_after_joined_at, p_after_learner_id
  );
end;
$$;

create or replace function studymeta_api.admin_list_current_states(
  p_learner_id uuid,
  p_limit integer default 100,
  p_after_state_type text default null,
  p_after_state_target_id uuid default null
)
returns table (
  learner_id uuid,
  state_target jsonb,
  state_type text,
  current_estimate jsonb,
  head_revision bigint,
  freshness text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not studymeta_v2.is_active_admin() then
    raise exception 'active admin role required' using errcode = '42501';
  end if;
  return query select * from studymeta_v2.admin_list_current_states(
    p_learner_id, p_limit, p_after_state_type, p_after_state_target_id
  );
end;
$$;

create or replace function studymeta_api.admin_list_state_change_log(
  p_learner_id uuid default null,
  p_state_type text default null,
  p_decisions text[] default null,
  p_limit integer default 50,
  p_before_occurred_at timestamptz default null,
  p_before_evaluation_id uuid default null
)
returns table (
  evaluation_id uuid,
  learner_id uuid,
  state_target jsonb,
  state_type text,
  before_estimate jsonb,
  after_estimate jsonb,
  candidate_estimate jsonb,
  decision text,
  changed_fields text[],
  reason_codes text[],
  processing_status text,
  non_change_category text,
  validation_snapshot_id uuid,
  calculation_run_id uuid,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not studymeta_v2.is_active_admin() then
    raise exception 'active admin role required' using errcode = '42501';
  end if;
  return query select * from studymeta_v2.admin_list_state_change_log(
    p_learner_id, p_state_type, p_decisions, p_limit,
    p_before_occurred_at, p_before_evaluation_id
  );
end;
$$;

create or replace function studymeta_api.admin_list_non_change_log(
  p_learner_id uuid default null,
  p_state_type text default null,
  p_limit integer default 50,
  p_before_occurred_at timestamptz default null,
  p_before_evaluation_id uuid default null
)
returns table (
  evaluation_id uuid,
  learner_id uuid,
  state_target jsonb,
  state_type text,
  before_estimate jsonb,
  after_estimate jsonb,
  candidate_estimate jsonb,
  decision text,
  changed_fields text[],
  reason_codes text[],
  processing_status text,
  non_change_category text,
  validation_snapshot_id uuid,
  calculation_run_id uuid,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not studymeta_v2.is_active_admin() then
    raise exception 'active admin role required' using errcode = '42501';
  end if;
  return query select * from studymeta_v2.admin_list_non_change_log(
    p_learner_id, p_state_type, p_limit,
    p_before_occurred_at, p_before_evaluation_id
  );
end;
$$;

create or replace function studymeta_api.server_audit_auth_users(
  p_admin_user_ids uuid[] default '{}'
)
returns table (
  total_auth_users bigint,
  linked_learner_count bigint,
  would_create_count bigint,
  identity_conflict_count bigint,
  active_student_role_count bigint,
  would_create_student_role_count bigint,
  role_conflict_count bigint,
  requested_admin_count integer,
  existing_admin_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  return query
  select
    (select count(*) from auth.users),
    (select count(distinct learners.auth_user_id) from studymeta_v2.learners as learners),
    (select count(*) from auth.users as users
      where not exists (
        select 1 from studymeta_v2.learners as learners
        where learners.auth_user_id = users.id
      )),
    (select count(*) from (
      select learners.auth_user_id
      from studymeta_v2.learners as learners
      group by learners.auth_user_id
      having count(*) <> 1
    ) as conflicts),
    (select count(distinct roles.auth_user_id)
       from studymeta_v2.account_roles as roles
      where roles.role = 'student' and roles.revoked_at is null),
    (select count(*) from auth.users as users
      where not exists (
        select 1 from studymeta_v2.account_roles as roles
        where roles.auth_user_id = users.id
          and roles.role = 'student'
          and roles.revoked_at is null
      )),
    (select count(*) from (
      select roles.auth_user_id
      from studymeta_v2.account_roles as roles
      where roles.role = 'student' and roles.revoked_at is null
      group by roles.auth_user_id
      having count(*) > 1
    ) as conflicts),
    coalesce(cardinality(p_admin_user_ids), 0),
    (select count(*) from studymeta_v2.account_roles as roles
      where roles.auth_user_id = any(coalesce(p_admin_user_ids, '{}'::uuid[]))
        and roles.role = 'admin'
        and roles.revoked_at is null);
end;
$$;

create or replace function studymeta_api.server_provision_admin_roles(
  p_auth_user_ids uuid[],
  p_granted_by uuid,
  p_reason text
)
returns table (
  auth_user_id uuid,
  newly_granted boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_auth_user_ids is null or cardinality(p_auth_user_ids) = 0
     or array_position(p_auth_user_ids, null) is not null then
    raise exception 'at least one non-null target UUID is required' using errcode = '22023';
  end if;
  if (select count(distinct value) from unnest(p_auth_user_ids) as ids(value))
     <> cardinality(p_auth_user_ids) then
    raise exception 'target UUIDs must be unique' using errcode = '22023';
  end if;
  if p_granted_by is null
     or not exists (select 1 from auth.users where id = p_granted_by) then
    raise exception 'grantor auth user does not exist' using errcode = '23503';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a non-empty grant reason is required' using errcode = '22023';
  end if;
  if (select count(*) from auth.users where id = any(p_auth_user_ids))
     <> cardinality(p_auth_user_ids) then
    raise exception 'every target auth user must exist' using errcode = '23503';
  end if;

  foreach target_id in array p_auth_user_ids loop
    auth_user_id := target_id;
    newly_granted := studymeta_v2.provision_admin_role(
      target_id, p_granted_by, btrim(p_reason)
    );
    return next;
  end loop;
end;
$$;

revoke all on all tables in schema studymeta_api
  from public, anon, authenticated, service_role;
revoke all on all sequences in schema studymeta_api
  from public, anon, authenticated, service_role;
revoke all on all functions in schema studymeta_api
  from public, anon, authenticated, service_role;

grant execute on function studymeta_api.get_my_identity() to authenticated;
grant execute on function studymeta_api.get_my_learner_summary() to authenticated;
grant execute on function studymeta_api.get_my_current_states(integer) to authenticated;
grant execute on function studymeta_api.get_my_recent_state_log(integer) to authenticated;
grant execute on function studymeta_api.admin_list_students(boolean, integer, timestamptz, uuid) to authenticated;
grant execute on function studymeta_api.admin_list_current_states(uuid, integer, text, uuid) to authenticated;
grant execute on function studymeta_api.admin_list_state_change_log(uuid, text, text[], integer, timestamptz, uuid) to authenticated;
grant execute on function studymeta_api.admin_list_non_change_log(uuid, text, integer, timestamptz, uuid) to authenticated;
grant execute on function studymeta_api.server_audit_auth_users(uuid[]) to service_role;
grant execute on function studymeta_api.server_provision_admin_roles(uuid[], uuid, text) to service_role;

comment on schema studymeta_api is
  'StudyMeta v2 least-privilege PostgREST RPC facade. Do not expose studymeta_v2.';
