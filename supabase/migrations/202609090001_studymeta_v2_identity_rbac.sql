-- StudyMeta v2 Stage 2A: Auth identity, account roles, read-only RLS, and
-- minimum-data administrator query contracts. No administrator identifier or
-- email address is embedded in this migration.

alter table studymeta_v2.account_roles
  add column revoked_by uuid references auth.users(id) on delete restrict,
  add column revocation_reason text;

alter table studymeta_v2.account_roles
  add constraint account_roles_revocation_complete check (
    (revoked_at is null and revoked_by is null and revocation_reason is null)
    or (
      revoked_at is not null
      and revoked_by is not null
      and revocation_reason is not null
      and btrim(revocation_reason) <> ''
    )
  ),
  add constraint account_roles_reason_not_blank check (btrim(reason) <> ''),
  add constraint account_roles_revocation_after_grant check (
    revoked_at is null or revoked_at >= granted_at
  );

create unique index active_account_roles_unique
  on studymeta_v2.account_roles (auth_user_id, role)
  where revoked_at is null;

create or replace function studymeta_v2.guard_account_role_history()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'account role history cannot be deleted'
      using errcode = '55000';
  end if;

  if old.revoked_at is not null then
    raise exception 'a revoked account role cannot be changed'
      using errcode = '55000';
  end if;

  if new.auth_user_id is distinct from old.auth_user_id
     or new.role is distinct from old.role
     or new.granted_by is distinct from old.granted_by
     or new.granted_at is distinct from old.granted_at
     or new.reason is distinct from old.reason
     or new.revoked_at is null
     or new.revoked_by is null
     or new.revocation_reason is null
     or btrim(new.revocation_reason) = '' then
    raise exception 'only a complete one-way role revocation is allowed'
      using errcode = '55000';
  end if;

  return new;
end;
$$;
revoke all on function studymeta_v2.guard_account_role_history()
  from public, anon, authenticated, service_role;

create trigger account_roles_history_guard
before update or delete on studymeta_v2.account_roles
for each row execute function studymeta_v2.guard_account_role_history();

create or replace function studymeta_v2.ensure_auth_user_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into studymeta_v2.learners (auth_user_id)
  values (new.id)
  on conflict (auth_user_id) do nothing;

  insert into studymeta_v2.account_roles (
    auth_user_id,
    role,
    granted_by,
    reason
  ) values (
    new.id,
    'student',
    null,
    'automatic signup provisioning'
  )
  on conflict (auth_user_id, role) where revoked_at is null do nothing;

  return new;
end;
$$;
revoke all on function studymeta_v2.ensure_auth_user_identity()
  from public, anon, authenticated, service_role;

-- Stage 1 may already have auth users. Backfill with the same conflict rules
-- before installing the trigger for future sign-ups.
insert into studymeta_v2.learners (auth_user_id)
select users.id
from auth.users as users
on conflict (auth_user_id) do nothing;

insert into studymeta_v2.account_roles (
  auth_user_id,
  role,
  granted_by,
  reason
)
select users.id, 'student', null, 'Stage 2A identity backfill'
from auth.users as users
on conflict (auth_user_id, role) where revoked_at is null do nothing;

create trigger on_auth_user_created_studymeta_v2
after insert on auth.users
for each row execute function studymeta_v2.ensure_auth_user_identity();

create or replace function studymeta_v2.current_learner_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select learners.id
  from studymeta_v2.learners as learners
  where learners.auth_user_id = auth.uid()
$$;

create or replace function studymeta_v2.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from studymeta_v2.account_roles as roles
    where roles.auth_user_id = auth.uid()
      and roles.role = 'admin'
      and roles.revoked_at is null
  )
$$;

revoke all on function studymeta_v2.current_learner_id()
  from public, anon, authenticated, service_role;
revoke all on function studymeta_v2.is_active_admin()
  from public, anon, authenticated, service_role;
grant execute on function studymeta_v2.current_learner_id() to authenticated;
grant execute on function studymeta_v2.is_active_admin() to authenticated;

create or replace function studymeta_v2.provision_admin_role(
  p_auth_user_id uuid,
  p_granted_by uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  inserted_count integer;
begin
  if p_auth_user_id is null or p_granted_by is null then
    raise exception 'target and grantor UUIDs are required'
      using errcode = '22004';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a non-empty grant reason is required'
      using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_auth_user_id) then
    raise exception 'target auth user does not exist'
      using errcode = '23503';
  end if;
  if not exists (select 1 from auth.users where id = p_granted_by) then
    raise exception 'grantor auth user does not exist'
      using errcode = '23503';
  end if;

  insert into studymeta_v2.account_roles (
    auth_user_id,
    role,
    granted_by,
    reason
  ) values (
    p_auth_user_id,
    'admin',
    p_granted_by,
    btrim(p_reason)
  )
  on conflict (auth_user_id, role) where revoked_at is null do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

create or replace function studymeta_v2.revoke_admin_role(
  p_auth_user_id uuid,
  p_revoked_by uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  updated_count integer;
begin
  if p_auth_user_id is null or p_revoked_by is null then
    raise exception 'target and revoker UUIDs are required'
      using errcode = '22004';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a non-empty revocation reason is required'
      using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_revoked_by) then
    raise exception 'revoker auth user does not exist'
      using errcode = '23503';
  end if;

  update studymeta_v2.account_roles
  set revoked_at = clock_timestamp(),
      revoked_by = p_revoked_by,
      revocation_reason = btrim(p_reason)
  where auth_user_id = p_auth_user_id
    and role = 'admin'
    and revoked_at is null;

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function studymeta_v2.provision_admin_role(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function studymeta_v2.revoke_admin_role(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function studymeta_v2.provision_admin_role(uuid, uuid, text)
  to service_role;
grant execute on function studymeta_v2.revoke_admin_role(uuid, uuid, text)
  to service_role;

create or replace function studymeta_v2.get_authenticated_learner()
returns table (
  auth_user_id uuid,
  learner_id uuid,
  display_name text,
  joined_at timestamptz,
  archived_at timestamptz,
  active_roles text[]
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    learners.auth_user_id,
    learners.id,
    learners.display_name,
    learners.created_at,
    learners.archived_at,
    coalesce(
      array_agg(roles.role order by roles.role)
        filter (where roles.role is not null),
      '{}'::text[]
    )
  from studymeta_v2.learners as learners
  left join studymeta_v2.account_roles as roles
    on roles.auth_user_id = learners.auth_user_id
   and roles.revoked_at is null
  where learners.auth_user_id = auth.uid()
  group by learners.id
$$;

revoke all on function studymeta_v2.get_authenticated_learner()
  from public, anon, authenticated, service_role;
grant execute on function studymeta_v2.get_authenticated_learner()
  to authenticated;

-- Student direct reads. No INSERT, UPDATE, or DELETE privilege is granted to
-- authenticated; Evidence, State, validation, and policy writes remain server-only.
create policy learner_self_select
on studymeta_v2.learners
for select
to authenticated
using (auth_user_id = auth.uid());

create policy sessions_self_select
on studymeta_v2.sessions
for select
to authenticated
using (learner_id = studymeta_v2.current_learner_id());

create policy learning_events_self_select
on studymeta_v2.learning_events
for select
to authenticated
using (learner_id = studymeta_v2.current_learner_id());

create policy derived_evidence_self_select
on studymeta_v2.derived_evidence
for select
to authenticated
using (learner_id = studymeta_v2.current_learner_id());

create policy state_targets_self_select
on studymeta_v2.state_targets
for select
to authenticated
using (learner_id = studymeta_v2.current_learner_id());

create policy state_estimates_self_select
on studymeta_v2.state_estimates
for select
to authenticated
using (learner_id = studymeta_v2.current_learner_id());

create policy state_heads_self_select
on studymeta_v2.state_heads
for select
to authenticated
using (learner_id = studymeta_v2.current_learner_id());

create policy state_evaluations_self_select
on studymeta_v2.state_evaluations
for select
to authenticated
using (learner_id = studymeta_v2.current_learner_id());

grant usage on schema studymeta_v2 to authenticated, service_role;
grant select on table
  studymeta_v2.learners,
  studymeta_v2.sessions,
  studymeta_v2.learning_events,
  studymeta_v2.derived_evidence,
  studymeta_v2.state_targets,
  studymeta_v2.state_estimates,
  studymeta_v2.state_heads,
  studymeta_v2.state_evaluations
to authenticated;

-- Restricted global definitions plus validation/operations records receive no
-- browser policy. FORCE RLS keeps them fail-closed even if a future table GRANT
-- is added accidentally.
do $$
declare
  restricted_table text;
begin
  foreach restricted_table in array array[
    'generation_rules',
    'parameter_sets',
    'state_update_rules',
    'state_rule_generation_rules',
    'research_sources',
    'study_records',
    'validation_assessments',
    'validation_snapshots',
    'validation_snapshot_items',
    'operation_assignments'
  ]
  loop
    execute format('alter table studymeta_v2.%I enable row level security', restricted_table);
    execute format('alter table studymeta_v2.%I force row level security', restricted_table);
    execute format(
      'revoke all on table studymeta_v2.%I from public, anon, authenticated',
      restricted_table
    );
  end loop;
end;
$$;

-- Global, non-personal dictionaries are readable by authenticated accounts.
-- Generation artifacts, parameters, validation records, and operation policies
-- are deliberately excluded from this grant.
do $$
declare
  dictionary_table text;
begin
  foreach dictionary_table in array array[
    'domains',
    'concepts',
    'skills',
    'evidence_definitions',
    'state_definitions',
    'scale_definitions'
  ]
  loop
    execute format('alter table studymeta_v2.%I enable row level security', dictionary_table);
    execute format('alter table studymeta_v2.%I force row level security', dictionary_table);
    execute format(
      'create policy %I on studymeta_v2.%I for select to authenticated using (true)',
      dictionary_table || '_authenticated_select',
      dictionary_table
    );
    execute format('grant select on table studymeta_v2.%I to authenticated', dictionary_table);
  end loop;
end;
$$;

create or replace function studymeta_v2.admin_list_students(
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
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be between 1 and 100' using errcode = '22023';
  end if;
  if (p_after_joined_at is null) <> (p_after_learner_id is null) then
    raise exception 'student cursor fields must be supplied together' using errcode = '22023';
  end if;

  return query
  with latest_learning as (
    select events.learner_id, max(events.occurred_at) as last_learning_at
    from studymeta_v2.learning_events as events
    group by events.learner_id
  ),
  state_counts as (
    select
      heads.learner_id,
      count(*) as current_state_count,
      count(*) filter (
        where heads.freshness in ('stale', 'pending')
           or estimates.status in ('unknown', 'candidate')
      ) as needs_review_state_count
    from studymeta_v2.state_heads as heads
    join studymeta_v2.state_estimates as estimates
      on estimates.learner_id = heads.learner_id
     and estimates.id = heads.current_estimate_id
    where heads.channel = 'production'
    group by heads.learner_id
  )
  select
    learners.id,
    learners.display_name,
    learners.created_at,
    learners.archived_at is not null,
    latest_learning.last_learning_at,
    coalesce(state_counts.current_state_count, 0),
    coalesce(state_counts.needs_review_state_count, 0)
  from studymeta_v2.learners as learners
  left join latest_learning on latest_learning.learner_id = learners.id
  left join state_counts on state_counts.learner_id = learners.id
  where (p_include_archived or learners.archived_at is null)
    and (
      p_after_joined_at is null
      or (learners.created_at, learners.id) > (p_after_joined_at, p_after_learner_id)
    )
  order by learners.created_at, learners.id
  limit p_limit;
end;
$$;

create or replace function studymeta_v2.admin_list_state_change_log(
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
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be between 1 and 100' using errcode = '22023';
  end if;
  if (p_before_occurred_at is null) <> (p_before_evaluation_id is null) then
    raise exception 'State log cursor fields must be supplied together' using errcode = '22023';
  end if;
  if p_decisions is not null and not (
    p_decisions <@ array['updated', 'unchanged', 'withheld', 'disabled', 'retracted']::text[]
  ) then
    raise exception 'unknown State evaluation decision filter' using errcode = '22023';
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
  where (p_learner_id is null or evaluations.learner_id = p_learner_id)
    and (p_state_type is null or evaluations.state_type = p_state_type)
    and (p_decisions is null or evaluations.decision = any(p_decisions))
    and (
      p_before_occurred_at is null
      or (coalesce(evaluations.completed_at, evaluations.started_at), evaluations.id)
        < (p_before_occurred_at, p_before_evaluation_id)
    )
  order by coalesce(evaluations.completed_at, evaluations.started_at) desc, evaluations.id desc
  limit p_limit;
end;
$$;

create or replace function studymeta_v2.admin_list_current_states(
  p_learner_id uuid,
  p_limit integer default 50,
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
  if p_learner_id is null then
    raise exception 'learner UUID is required' using errcode = '22004';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be between 1 and 100' using errcode = '22023';
  end if;
  if (p_after_state_type is null) <> (p_after_state_target_id is null) then
    raise exception 'current State cursor fields must be supplied together' using errcode = '22023';
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
  where heads.learner_id = p_learner_id
    and heads.channel = 'production'
    and (
      p_after_state_type is null
      or (heads.state_type, heads.state_target_id)
        > (p_after_state_type, p_after_state_target_id)
    )
  order by heads.state_type, heads.state_target_id
  limit p_limit;
end;
$$;

create or replace function studymeta_v2.admin_list_non_change_log(
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

  return query
  select *
  from studymeta_v2.admin_list_state_change_log(
    p_learner_id,
    p_state_type,
    array['unchanged', 'withheld', 'disabled']::text[],
    p_limit,
    p_before_occurred_at,
    p_before_evaluation_id
  );
end;
$$;

revoke all on function studymeta_v2.admin_list_students(boolean, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke all on function studymeta_v2.admin_list_state_change_log(uuid, text, text[], integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
revoke all on function studymeta_v2.admin_list_current_states(uuid, integer, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function studymeta_v2.admin_list_non_change_log(uuid, text, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function studymeta_v2.admin_list_students(boolean, integer, timestamptz, uuid)
  to authenticated;
grant execute on function studymeta_v2.admin_list_state_change_log(uuid, text, text[], integer, timestamptz, uuid)
  to authenticated;
grant execute on function studymeta_v2.admin_list_current_states(uuid, integer, text, uuid)
  to authenticated;
grant execute on function studymeta_v2.admin_list_non_change_log(uuid, text, integer, timestamptz, uuid)
  to authenticated;

-- Even the service role uses the audited functions for role lifecycle changes.
revoke insert, update, delete on table studymeta_v2.account_roles from service_role;

comment on table studymeta_v2.learners is
  'Access class: learner-owned identity. Authenticated users can select only the row mapped from auth.uid().';
comment on table studymeta_v2.account_roles is
  'Access class: identity/RBAC audit. Active rows are unique; revocation is one-way and preserves grant history.';
comment on table studymeta_v2.domains is
  'Access class: global dictionary. Readable by authenticated accounts.';
comment on table studymeta_v2.validation_assessments is
  'Access class: validation/operations management. No Stage 2A browser table privileges or write policy.';
comment on table studymeta_v2.outbox_jobs is
  'Access class: internal processing/outbox. No Stage 2A browser privileges.';
comment on function studymeta_v2.provision_admin_role(uuid, uuid, text) is
  'Server-only UUID-based admin grant. Returns true only when a new active audited grant is inserted.';
comment on function studymeta_v2.admin_list_students(boolean, integer, timestamptz, uuid) is
  'Admin query contract A. Returns minimum learner summary fields; excludes auth identifiers and source payloads.';
comment on function studymeta_v2.admin_list_state_change_log(uuid, text, text[], integer, timestamptz, uuid) is
  'Admin query contract B. Returns State evaluation/estimate metadata without Learning Event observations or source payloads.';
comment on function studymeta_v2.admin_list_current_states(uuid, integer, text, uuid) is
  'Admin current-State contract. Returns production StateHead values for one learner without Evidence or source payloads.';
comment on function studymeta_v2.admin_list_non_change_log(uuid, text, integer, timestamptz, uuid) is
  'Admin query contract C. Restricts decisions to unchanged/withheld/disabled and classifies recognized reason codes without changing calculation policy.';
