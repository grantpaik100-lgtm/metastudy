-- StudyMeta v2 foundation only.
-- This migration defines private storage and integrity boundaries. It does not
-- migrate legacy data, assign administrators, enable model rules, or seed the
-- 24 Evidence / 9 State dictionaries into a remote database.

create schema if not exists studymeta_v2;
revoke all on schema studymeta_v2 from public, anon, authenticated;

create or replace function studymeta_v2.reject_immutable_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'studymeta_v2 immutable record cannot be updated: %', tg_table_name
    using errcode = '55000';
end;
$$;
revoke all on function studymeta_v2.reject_immutable_update() from public, anon, authenticated;

create or replace function studymeta_v2.reject_sealed_composition_change()
returns trigger
language plpgsql
as $$
declare
  parent_id uuid;
  old_parent_id uuid;
  parent_table text;
  parent_sealed_at timestamptz;
begin
  -- Permit referential cascades initiated by an approved parent deletion path.
  -- Direct composition changes still require an unsealed draft parent.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_table_name = 'input_manifest_items' then
    parent_id := case when tg_op = 'DELETE' then old.input_manifest_id else new.input_manifest_id end;
    old_parent_id := case when tg_op = 'INSERT' then null else old.input_manifest_id end;
    parent_table := 'input_manifests';
  elsif tg_table_name = 'validation_snapshot_items' then
    parent_id := case when tg_op = 'DELETE' then old.snapshot_id else new.snapshot_id end;
    old_parent_id := case when tg_op = 'INSERT' then null else old.snapshot_id end;
    parent_table := 'validation_snapshots';
  elsif tg_table_name = 'estimate_evidence' then
    parent_id := case when tg_op = 'DELETE' then old.state_estimate_id else new.state_estimate_id end;
    old_parent_id := case when tg_op = 'INSERT' then null else old.state_estimate_id end;
    parent_table := 'state_estimates';
  else
    raise exception 'unsupported sealed composition table: %', tg_table_name using errcode = '55000';
  end if;

  execute format('select sealed_at from studymeta_v2.%I where id = $1 for share', parent_table)
    into parent_sealed_at using parent_id;
  if parent_sealed_at is not null then
    raise exception 'sealed % composition cannot be changed', parent_table using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old_parent_id is distinct from parent_id then
    execute format('select sealed_at from studymeta_v2.%I where id = $1 for share', parent_table)
      into parent_sealed_at using old_parent_id;
    if parent_sealed_at is not null then
      raise exception 'sealed % composition cannot be moved', parent_table using errcode = '55000';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function studymeta_v2.reject_sealed_composition_change() from public, anon, authenticated;

create or replace function studymeta_v2.require_unsealed_insert()
returns trigger
language plpgsql
as $$
begin
  if new.sealed_at is not null then
    raise exception '% must be inserted as a draft and sealed after its composition is written', tg_table_name
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function studymeta_v2.require_unsealed_insert() from public, anon, authenticated;

create table studymeta_v2.learners (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, auth_user_id)
);

create table studymeta_v2.account_roles (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'admin', 'validation_reviewer', 'release_manager')),
  granted_by uuid references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  reason text not null,
  primary key (auth_user_id, role, granted_at)
);

create table studymeta_v2.connections (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references studymeta_v2.learners(id) on delete cascade,
  issuer text not null,
  client_id text not null,
  grants text[] not null default '{}',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (learner_id, id),
  unique (learner_id, issuer, client_id)
);

create table studymeta_v2.domains (
  domain_id text not null,
  version text not null,
  name_ko text not null,
  status text not null check (status in ('draft', 'provisional', 'approved', 'retired')),
  created_at timestamptz not null default now(),
  primary key (domain_id, version)
);

create table studymeta_v2.concepts (
  concept_id text not null,
  version text not null,
  domain_id text not null,
  domain_version text not null,
  name_ko text not null,
  definition text,
  scope_id text not null,
  status text not null check (status in ('draft', 'provisional', 'approved', 'retired')),
  source_manifest jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (concept_id, version),
  foreign key (domain_id, domain_version)
    references studymeta_v2.domains(domain_id, version) on delete restrict
);

create table studymeta_v2.skills (
  skill_id text not null,
  version text not null,
  domain_id text not null,
  domain_version text not null,
  name_ko text not null,
  description text not null,
  rubric_ref text,
  status text not null check (status in ('draft', 'provisional', 'approved', 'retired')),
  created_at timestamptz not null default now(),
  primary key (skill_id, version),
  foreign key (domain_id, domain_version)
    references studymeta_v2.domains(domain_id, version) on delete restrict
);

create table studymeta_v2.sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references studymeta_v2.learners(id) on delete cascade,
  status text not null check (status in ('active', 'idle', 'completed')),
  active_focus jsonb,
  focus_revision integer not null default 0 check (focus_revision >= 0),
  session_revision integer not null default 0 check (session_revision >= 0),
  started_at timestamptz not null,
  last_learning_event_at timestamptz,
  last_resumed_at timestamptz,
  idle_deadline_at timestamptz not null,
  ended_at timestamptz,
  end_reason text,
  summary_status text not null default 'none'
    check (summary_status in ('none', 'draft', 'final', 'pending', 'failed')),
  timeout_policy_version text not null,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  unique (learner_id, id)
);

create table studymeta_v2.episodes (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  session_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  focus_revision integer not null check (focus_revision >= 0),
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  foreign key (learner_id, session_id)
    references studymeta_v2.sessions(learner_id, id) on delete cascade,
  unique (learner_id, id)
);

create table studymeta_v2.learning_attempts (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  session_id uuid not null,
  item_ref text,
  step_ref text,
  attempt_number integer not null check (attempt_number > 0),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (started_at is null or ended_at is null or ended_at >= started_at),
  foreign key (learner_id, session_id)
    references studymeta_v2.sessions(learner_id, id) on delete cascade,
  unique (learner_id, id)
);

create table studymeta_v2.source_refs (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references studymeta_v2.learners(id) on delete cascade,
  source_kind text not null
    check (source_kind in ('message', 'answer', 'task', 'material', 'event_field', 'ui_action')),
  connection_id uuid,
  external_ref text,
  event_id uuid,
  json_pointer text,
  content_ref text,
  content_hash text,
  availability text not null
    check (availability in ('available', 'reference_only', 'expired', 'deleted')),
  provenance_status text not null
    check (provenance_status in ('source_reported', 'server_captured', 'human_reviewed')),
  retention_policy_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (learner_id, connection_id)
    references studymeta_v2.connections(learner_id, id) on delete restrict,
  unique (learner_id, id)
);

create table studymeta_v2.fact_assertions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references studymeta_v2.learners(id) on delete cascade,
  subject_type text not null,
  subject_id text,
  attribute text not null,
  context_scope_id text,
  origin text not null check (origin in ('declared', 'inferred', 'catalog')),
  value jsonb,
  status text not null check (status in ('unknown', 'candidate', 'confirmed', 'not_applicable')),
  source_ref_ids uuid[] not null default '{}',
  basis_ref_ids uuid[] not null default '{}',
  reason text,
  confidence double precision check (confidence is null or confidence between 0 and 1),
  model_version text,
  supersedes_assertion_id uuid,
  created_at timestamptz not null default now(),
  check (status <> 'unknown' or value is null),
  foreign key (learner_id, supersedes_assertion_id)
    references studymeta_v2.fact_assertions(learner_id, id) on delete restrict,
  unique (learner_id, id)
);

create table studymeta_v2.fact_selections (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  assertion_id uuid not null,
  selected_from text not null check (selected_from in ('declared', 'inferred', 'catalog')),
  policy_version text not null,
  confirmation_ref_id uuid,
  supersedes_selection_id uuid,
  applied_at timestamptz not null,
  foreign key (learner_id, assertion_id)
    references studymeta_v2.fact_assertions(learner_id, id) on delete restrict,
  foreign key (learner_id, confirmation_ref_id)
    references studymeta_v2.source_refs(learner_id, id) on delete restrict,
  foreign key (learner_id, supersedes_selection_id)
    references studymeta_v2.fact_selections(learner_id, id) on delete restrict,
  unique (learner_id, id)
);

create table studymeta_v2.evidence_definitions (
  evidence_type_id text not null,
  definition_version text not null,
  category text not null,
  ordinal integer not null check (ordinal between 1 and 24),
  name_ko text not null,
  description text not null,
  inclusion_criteria jsonb not null,
  exclusion_criteria jsonb not null,
  value_schema_version text not null,
  created_at timestamptz not null default now(),
  primary key (evidence_type_id, definition_version),
  unique (definition_version, ordinal)
);

create table studymeta_v2.generation_rules (
  generation_rule_id text not null,
  rule_version text not null,
  evidence_type_id text not null,
  evidence_definition_version text not null,
  required_observation_fields jsonb not null,
  historical_window_spec jsonb,
  extractor_kind text not null,
  artifact_digest text not null,
  prompt_version text,
  judge_version text,
  value_schema_version text not null,
  created_at timestamptz not null default now(),
  primary key (generation_rule_id, rule_version),
  foreign key (evidence_type_id, evidence_definition_version)
    references studymeta_v2.evidence_definitions(evidence_type_id, definition_version) on delete restrict
);

create table studymeta_v2.state_definitions (
  state_type text not null,
  definition_version text not null,
  state_group text not null,
  ordinal integer not null check (ordinal between 1 and 9),
  name_ko text not null,
  description text not null,
  value_role text not null check (value_role in ('learner_state', 'estimate_metadata')),
  created_at timestamptz not null default now(),
  primary key (state_type, definition_version),
  unique (definition_version, ordinal),
  check (state_type <> 'state_confidence' or value_role = 'estimate_metadata')
);

create table studymeta_v2.parameter_sets (
  parameter_set_id text not null,
  parameter_set_version text not null,
  parameter_schema jsonb not null,
  parameter_payload jsonb not null,
  canonical_artifact_digest text not null,
  created_at timestamptz not null default now(),
  primary key (parameter_set_id, parameter_set_version),
  check (jsonb_typeof(parameter_schema) = 'object'),
  check (jsonb_typeof(parameter_payload) = 'object'),
  check (btrim(canonical_artifact_digest) <> '')
);

create table studymeta_v2.state_update_rules (
  state_update_rule_id text not null,
  rule_version text not null,
  state_type text not null,
  state_definition_version text not null,
  target_scope_spec jsonb not null,
  eligibility_predicate jsonb not null,
  observation_grouping jsonb not null,
  conflict_policy_version text,
  parameter_set_id text,
  parameter_set_version text,
  estimator_artifact_digest text not null,
  scale_ref jsonb,
  created_at timestamptz not null default now(),
  primary key (state_update_rule_id, rule_version),
  foreign key (state_type, state_definition_version)
    references studymeta_v2.state_definitions(state_type, definition_version) on delete restrict,
  foreign key (parameter_set_id, parameter_set_version)
    references studymeta_v2.parameter_sets(parameter_set_id, parameter_set_version) on delete restrict,
  check ((parameter_set_id is null) = (parameter_set_version is null))
);

create table studymeta_v2.state_rule_generation_rules (
  state_update_rule_id text not null,
  state_update_rule_version text not null,
  generation_rule_id text not null,
  generation_rule_version text not null,
  primary key (
    state_update_rule_id,
    state_update_rule_version,
    generation_rule_id,
    generation_rule_version
  ),
  foreign key (state_update_rule_id, state_update_rule_version)
    references studymeta_v2.state_update_rules(state_update_rule_id, rule_version) on delete cascade,
  foreign key (generation_rule_id, generation_rule_version)
    references studymeta_v2.generation_rules(generation_rule_id, rule_version) on delete restrict
);

create table studymeta_v2.scale_definitions (
  scale_definition_id text not null,
  scale_definition_version text not null,
  state_type text not null,
  state_definition_version text not null,
  value_schema jsonb not null,
  interpretation text not null,
  created_at timestamptz not null default now(),
  primary key (scale_definition_id, scale_definition_version),
  unique (scale_definition_id, scale_definition_version, state_type, state_definition_version),
  foreign key (state_type, state_definition_version)
    references studymeta_v2.state_definitions(state_type, definition_version) on delete restrict
);

create table studymeta_v2.research_sources (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('article', 'preprint', 'review', 'report', 'other')),
  citation text not null,
  persistent_locator text,
  created_at timestamptz not null default now()
);

create table studymeta_v2.study_records (
  id uuid primary key default gen_random_uuid(),
  research_source_id uuid not null references studymeta_v2.research_sources(id) on delete restrict,
  record_version text not null,
  methods_summary jsonb not null,
  findings_summary jsonb not null,
  created_at timestamptz not null default now(),
  unique (research_source_id, record_version)
);

create table studymeta_v2.validation_assessments (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null
    check (subject_kind in ('evidence_definition', 'generation_rule', 'state_update_rule')),
  subject_id text not null,
  subject_version text not null,
  claim_id text not null,
  scope_id text not null,
  assessment_version integer not null check (assessment_version > 0),
  status text not null check (
    status in ('not_assessed', 'under_review', 'supported_in_scope', 'mixed', 'unsupported_in_scope')
  ),
  claim text not null,
  scope jsonb not null,
  tested_components text[] not null default '{}',
  supporting_source_refs uuid[] not null default '{}',
  contradicting_source_refs uuid[] not null default '{}',
  study_refs uuid[] not null default '{}',
  limitations text[] not null default '{}',
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  previous_assessment_id uuid references studymeta_v2.validation_assessments(id) on delete restrict,
  change_reason text not null,
  created_at timestamptz not null default now(),
  unique (subject_kind, subject_id, subject_version, claim_id, scope_id, assessment_version),
  constraint validation_assessment_semantics check (
    (status = 'not_assessed' and reviewed_by is null and reviewed_at is null)
    or (status <> 'not_assessed' and reviewed_by is not null and reviewed_at is not null)
  ),
  check (
    jsonb_typeof(scope) = 'object'
    and scope ?& array['population', 'domain', 'task_type', 'learning_environment']
    and scope - array['population', 'domain', 'task_type', 'learning_environment'] = '{}'::jsonb
  ),
  check (
    (status = 'not_assessed'
      and scope->'population' = 'null'::jsonb
      and scope->'domain' = 'null'::jsonb
      and scope->'task_type' = 'null'::jsonb
      and scope->'learning_environment' = 'null'::jsonb
      and cardinality(tested_components) = 0
      and cardinality(supporting_source_refs) = 0
      and cardinality(contradicting_source_refs) = 0
      and cardinality(study_refs) = 0
      and previous_assessment_id is null)
    or (status = 'under_review'
      and (cardinality(supporting_source_refs) > 0
        or cardinality(contradicting_source_refs) > 0
        or cardinality(study_refs) > 0
        or cardinality(limitations) > 0))
    or (status in ('supported_in_scope', 'mixed', 'unsupported_in_scope')
      and nullif(btrim(scope->>'population'), '') is not null
      and nullif(btrim(scope->>'domain'), '') is not null
      and nullif(btrim(scope->>'task_type'), '') is not null
      and nullif(btrim(scope->>'learning_environment'), '') is not null
      and (
        (status = 'supported_in_scope'
          and (cardinality(supporting_source_refs) > 0 or cardinality(study_refs) > 0))
        or (status = 'mixed'
          and (cardinality(supporting_source_refs) > 0 or cardinality(study_refs) > 0)
          and cardinality(contradicting_source_refs) > 0)
        or (status = 'unsupported_in_scope' and cardinality(contradicting_source_refs) > 0)
      ))
  )
);

create or replace function studymeta_v2.enforce_validation_assessment_references()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from unnest(new.supporting_source_refs || new.contradicting_source_refs) ref_id
     where not exists (select 1 from studymeta_v2.research_sources rs where rs.id = ref_id)
  ) then
    raise exception 'validation assessment references an unknown research source'
      using errcode = '23503';
  end if;
  if exists (
    select 1 from unnest(new.study_refs) ref_id
     where not exists (select 1 from studymeta_v2.study_records sr where sr.id = ref_id)
  ) then
    raise exception 'validation assessment references an unknown study record'
      using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function studymeta_v2.enforce_validation_assessment_references() from public, anon, authenticated;

create trigger validation_assessments_reference_insert
before insert on studymeta_v2.validation_assessments
for each row execute function studymeta_v2.enforce_validation_assessment_references();

create or replace function studymeta_v2.enforce_validation_subject_reference()
returns trigger
language plpgsql
as $$
declare
  subject_exists boolean;
  previous_assessment studymeta_v2.validation_assessments%rowtype;
begin
  if new.subject_kind = 'evidence_definition' then
    select exists (
      select 1 from studymeta_v2.evidence_definitions
       where evidence_type_id = new.subject_id and definition_version = new.subject_version
    ) into subject_exists;
  elsif new.subject_kind = 'generation_rule' then
    select exists (
      select 1 from studymeta_v2.generation_rules
       where generation_rule_id = new.subject_id and rule_version = new.subject_version
    ) into subject_exists;
  elsif new.subject_kind = 'state_update_rule' then
    select exists (
      select 1 from studymeta_v2.state_update_rules
       where state_update_rule_id = new.subject_id and rule_version = new.subject_version
    ) into subject_exists;
  else
    subject_exists := false;
  end if;

  if not subject_exists then
    raise exception 'unknown validation subject %.% version %', new.subject_kind, new.subject_id, new.subject_version
      using errcode = '23503';
  end if;

  -- Keep the table-specific field access inside a nested branch. PostgreSQL may
  -- resolve NEW fields before boolean short-circuiting for a shared trigger.
  if tg_table_name = 'validation_assessments' then
    if new.previous_assessment_id is not null then
      if new.previous_assessment_id = new.id then
        raise exception 'validation assessment cannot reference itself' using errcode = '23514';
      end if;
      select * into previous_assessment
        from studymeta_v2.validation_assessments where id = new.previous_assessment_id;
      if not found then
        raise exception 'previous validation assessment does not exist' using errcode = '23503';
      end if;
      if previous_assessment.subject_kind <> new.subject_kind
         or previous_assessment.subject_id <> new.subject_id
         or previous_assessment.subject_version <> new.subject_version
         or previous_assessment.claim_id <> new.claim_id
         or previous_assessment.scope_id <> new.scope_id
         or previous_assessment.assessment_version >= new.assessment_version then
        raise exception 'previous assessment must be an earlier version of the same subject, claim, and scope'
          using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function studymeta_v2.enforce_validation_subject_reference() from public, anon, authenticated;

create trigger validation_assessments_subject_insert
before insert on studymeta_v2.validation_assessments
for each row execute function studymeta_v2.enforce_validation_subject_reference();

create table studymeta_v2.validation_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  description text not null,
  sealed_at timestamptz,
  check (sealed_at is null or sealed_at >= created_at)
);

create table studymeta_v2.validation_snapshot_items (
  snapshot_id uuid not null references studymeta_v2.validation_snapshots(id) on delete cascade,
  assessment_id uuid not null references studymeta_v2.validation_assessments(id) on delete restrict,
  primary key (snapshot_id, assessment_id)
);

create table studymeta_v2.operation_assignments (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null
    check (subject_kind in ('evidence_definition', 'generation_rule', 'state_update_rule')),
  subject_id text not null,
  subject_version text not null,
  mode text not null check (mode in ('research_only', 'pilot', 'production', 'disabled')),
  allowed_scope jsonb not null,
  permitted_actions text[] not null default '{}',
  policy_version text not null,
  approver uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  valid_from timestamptz not null,
  expires_at timestamptz,
  rollback_rule_ref text,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > valid_from)
);

create trigger operation_assignments_subject_insert
before insert on studymeta_v2.operation_assignments
for each row execute function studymeta_v2.enforce_validation_subject_reference();

create table studymeta_v2.learning_events (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null,
  learner_id uuid not null references studymeta_v2.learners(id) on delete cascade,
  actor_id uuid not null,
  actor_type text not null check (actor_type in ('student', 'agent', 'admin', 'system')),
  event_type text not null,
  source text not null,
  connection_id uuid,
  connection_scope text not null,
  source_provider_reported text,
  external_event_id text,
  session_id uuid not null,
  episode_id uuid,
  idempotency_key text not null,
  payload_hash text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  coordinates jsonb not null,
  observation jsonb not null,
  caused_by_event_id uuid,
  correction_of_event_id uuid,
  check (started_at is null or ended_at is null or ended_at >= started_at),
  check (external_event_id is null or connection_id is not null),
  foreign key (learner_id, connection_id)
    references studymeta_v2.connections(learner_id, id) on delete restrict,
  foreign key (learner_id, session_id)
    references studymeta_v2.sessions(learner_id, id) on delete restrict,
  foreign key (learner_id, episode_id)
    references studymeta_v2.episodes(learner_id, id) on delete restrict,
  foreign key (learner_id, caused_by_event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete restrict,
  foreign key (learner_id, correction_of_event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete restrict,
  unique (learner_id, connection_scope, idempotency_key),
  unique (learner_id, id)
);

alter table studymeta_v2.source_refs
  add constraint source_refs_event_owner_fk
  foreign key (learner_id, event_id)
  references studymeta_v2.learning_events(learner_id, id) on delete cascade;

create table studymeta_v2.event_source_refs (
  learner_id uuid not null,
  event_id uuid not null,
  source_ref_id uuid not null,
  primary key (event_id, source_ref_id),
  foreign key (learner_id, event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete cascade,
  foreign key (learner_id, source_ref_id)
    references studymeta_v2.source_refs(learner_id, id) on delete restrict
);

create table studymeta_v2.event_attempts (
  learner_id uuid not null,
  event_id uuid not null,
  attempt_id uuid not null,
  primary key (event_id, attempt_id),
  foreign key (learner_id, event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete cascade,
  foreign key (learner_id, attempt_id)
    references studymeta_v2.learning_attempts(learner_id, id) on delete restrict
);

create table studymeta_v2.event_targets (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  event_id uuid not null,
  role text not null check (role in ('primary', 'supporting', 'prerequisite')),
  target_type text not null check (target_type in ('concept', 'skill')),
  target_id text not null,
  target_version text not null,
  domain_id text not null,
  scope_id text not null,
  mapping_status text not null check (mapping_status in ('unmapped', 'provisional', 'approved', 'rejected')),
  mapping_revision_id uuid not null,
  basis_ref_ids uuid[] not null default '{}',
  foreign key (learner_id, event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete cascade,
  unique (event_id, role, target_type, target_id, target_version, scope_id)
);

create table studymeta_v2.event_reviews (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  event_id uuid not null,
  decision text not null check (decision in ('valid', 'disputed', 'corrected', 'invalidated')),
  reason text not null,
  actor_id uuid not null,
  correction_event_id uuid,
  created_at timestamptz not null default now(),
  foreign key (learner_id, event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete cascade,
  foreign key (learner_id, correction_event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete restrict,
  unique (learner_id, id)
);

create table studymeta_v2.outbox_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_learner_id uuid not null,
  event_id uuid not null,
  run_id uuid not null,
  kind text not null check (kind in ('derive_evidence', 'evaluate_state', 'recalculate', 'summarize')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempt_policy text not null,
  last_error_code text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (owner_learner_id, event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete cascade,
  unique (event_id, kind, run_id),
  unique (owner_learner_id, id)
);

comment on table studymeta_v2.outbox_jobs is
  'Application transaction boundary: insert one learning_event and its first outbox job in the same database transaction; processing completion is a later transaction.';

create table studymeta_v2.derivation_runs (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  event_id uuid not null,
  generation_release text not null,
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')),
  result_manifest jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (learner_id, event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete cascade,
  unique (learner_id, id)
);

create table studymeta_v2.derived_evidence (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null,
  learner_id uuid not null,
  evidence_type_id text not null,
  definition_version text not null,
  generation_rule_id text not null,
  generation_rule_version text not null,
  derivation_run_id uuid not null,
  representative_event_id uuid not null,
  value jsonb,
  value_status text not null check (value_status in ('observed', 'inferred', 'unknown')),
  value_schema_version text not null,
  detail text,
  reason text,
  qualifiers jsonb not null default '{}'::jsonb,
  observation_confidence double precision
    check (observation_confidence is null or observation_confidence between 0 and 1),
  confidence_method text,
  support_condition text not null
    check (support_condition in ('independent', 'hint', 'explanation', 'answer_exposed', 'unknown')),
  observation_group_id uuid not null,
  observed_at timestamptz not null,
  generated_at timestamptz not null default now(),
  definition_validation_assessment_id uuid not null,
  generation_validation_assessment_id uuid not null,
  validation_snapshot_id uuid not null,
  provenance_status text not null
    check (provenance_status in ('source_reported', 'server_captured', 'human_reviewed')),
  supersedes_evidence_id uuid,
  check (value_status <> 'unknown' or value is null),
  foreign key (evidence_type_id, definition_version)
    references studymeta_v2.evidence_definitions(evidence_type_id, definition_version) on delete restrict,
  foreign key (generation_rule_id, generation_rule_version)
    references studymeta_v2.generation_rules(generation_rule_id, rule_version) on delete restrict,
  foreign key (learner_id, derivation_run_id)
    references studymeta_v2.derivation_runs(learner_id, id) on delete restrict,
  foreign key (learner_id, representative_event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete restrict,
  foreign key (definition_validation_assessment_id)
    references studymeta_v2.validation_assessments(id) on delete restrict,
  foreign key (generation_validation_assessment_id)
    references studymeta_v2.validation_assessments(id) on delete restrict,
  foreign key (validation_snapshot_id)
    references studymeta_v2.validation_snapshots(id) on delete restrict,
  foreign key (learner_id, supersedes_evidence_id)
    references studymeta_v2.derived_evidence(learner_id, id) on delete restrict,
  unique (learner_id, id),
  unique (derivation_run_id, generation_rule_id, generation_rule_version, observation_group_id, evidence_type_id)
);

create or replace function studymeta_v2.enforce_derived_evidence_validation()
returns trigger
language plpgsql
as $$
declare
  snapshot_sealed_at timestamptz;
begin
  if not exists (
    select 1 from studymeta_v2.generation_rules gr
     where gr.generation_rule_id = new.generation_rule_id
       and gr.rule_version = new.generation_rule_version
       and gr.evidence_type_id = new.evidence_type_id
       and gr.evidence_definition_version = new.definition_version
  ) then
    raise exception 'generation rule does not produce the declared Evidence definition'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from studymeta_v2.validation_assessments va
     where va.id = new.definition_validation_assessment_id
       and va.subject_kind = 'evidence_definition'
       and va.subject_id = new.evidence_type_id
       and va.subject_version = new.definition_version
  ) then
    raise exception 'definition validation assessment does not match the Evidence definition'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from studymeta_v2.validation_assessments va
     where va.id = new.generation_validation_assessment_id
       and va.subject_kind = 'generation_rule'
       and va.subject_id = new.generation_rule_id
       and va.subject_version = new.generation_rule_version
  ) then
    raise exception 'generation validation assessment does not match the generation rule'
      using errcode = '23514';
  end if;

  select sealed_at into snapshot_sealed_at
    from studymeta_v2.validation_snapshots where id = new.validation_snapshot_id;
  if snapshot_sealed_at is null
     or not exists (
       select 1 from studymeta_v2.validation_snapshot_items
        where snapshot_id = new.validation_snapshot_id
          and assessment_id = new.definition_validation_assessment_id
     )
     or not exists (
       select 1 from studymeta_v2.validation_snapshot_items
        where snapshot_id = new.validation_snapshot_id
          and assessment_id = new.generation_validation_assessment_id
     ) then
    raise exception 'Evidence validation assessments require membership in the sealed snapshot'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function studymeta_v2.enforce_derived_evidence_validation() from public, anon, authenticated;

create trigger derived_evidence_validation_insert
before insert on studymeta_v2.derived_evidence
for each row execute function studymeta_v2.enforce_derived_evidence_validation();

create table studymeta_v2.evidence_source_events (
  learner_id uuid not null,
  evidence_id uuid not null,
  event_id uuid not null,
  primary key (evidence_id, event_id),
  foreign key (learner_id, evidence_id)
    references studymeta_v2.derived_evidence(learner_id, id) on delete cascade,
  foreign key (learner_id, event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete restrict
);

create table studymeta_v2.evidence_attempts (
  learner_id uuid not null,
  evidence_id uuid not null,
  attempt_id uuid not null,
  primary key (evidence_id, attempt_id),
  foreign key (learner_id, evidence_id)
    references studymeta_v2.derived_evidence(learner_id, id) on delete cascade,
  foreign key (learner_id, attempt_id)
    references studymeta_v2.learning_attempts(learner_id, id) on delete restrict
);

create table studymeta_v2.evidence_targets (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  evidence_id uuid not null,
  target_type text not null check (target_type in ('concept', 'skill')),
  target_id text not null,
  target_version text not null,
  domain_id text not null,
  scope_id text not null,
  mapping_status text not null check (mapping_status in ('unmapped', 'provisional', 'approved', 'rejected')),
  mapping_revision_id uuid not null,
  validation_assessment_id uuid,
  basis_ref_ids uuid[] not null default '{}',
  foreign key (learner_id, evidence_id)
    references studymeta_v2.derived_evidence(learner_id, id) on delete cascade,
  foreign key (validation_assessment_id)
    references studymeta_v2.validation_assessments(id) on delete restrict,
  unique (evidence_id, target_type, target_id, target_version, scope_id)
);

create table studymeta_v2.evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  evidence_id uuid not null,
  decision text not null check (decision in ('disputed', 'superseded', 'invalidated', 'confirmed')),
  reason text not null,
  actor_id uuid not null,
  correction_event_id uuid,
  created_at timestamptz not null default now(),
  foreign key (learner_id, evidence_id)
    references studymeta_v2.derived_evidence(learner_id, id) on delete cascade,
  foreign key (learner_id, correction_event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete restrict,
  unique (learner_id, id)
);

create table studymeta_v2.state_targets (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references studymeta_v2.learners(id) on delete cascade,
  target_kind text not null check (target_kind in ('knowledge', 'domain', 'intervention')),
  domain_id text not null,
  scope_id text not null,
  knowledge_level text check (knowledge_level in ('concept', 'skill')),
  concept_id text,
  concept_version text,
  skill_id text,
  skill_version text,
  intervention_type_id text,
  intervention_type_version text,
  intervention_scope_level text check (intervention_scope_level in ('domain', 'concept', 'skill')),
  created_at timestamptz not null default now(),
  check (
    (target_kind = 'domain'
      and knowledge_level is null
      and concept_id is null and concept_version is null
      and skill_id is null and skill_version is null
      and intervention_type_id is null and intervention_type_version is null
      and intervention_scope_level is null)
    or (target_kind = 'knowledge' and (
      (knowledge_level = 'concept'
        and concept_id is not null and concept_version is not null
        and skill_id is null and skill_version is null)
      or (knowledge_level = 'skill'
        and skill_id is not null and skill_version is not null
        and concept_id is null and concept_version is null)
      )
      and intervention_type_id is null and intervention_type_version is null
      and intervention_scope_level is null)
    or (target_kind = 'intervention'
      and knowledge_level is null
      and intervention_type_id is not null and intervention_type_version is not null
      and (
        (intervention_scope_level = 'domain'
          and concept_id is null and concept_version is null
          and skill_id is null and skill_version is null)
        or (intervention_scope_level = 'concept'
          and concept_id is not null and concept_version is not null
          and skill_id is null and skill_version is null)
        or (intervention_scope_level = 'skill'
          and skill_id is not null and skill_version is not null
          and concept_id is null and concept_version is null)
      ))
  ),
  unique (learner_id, id)
);

create unique index state_targets_logical_unique_idx
  on studymeta_v2.state_targets (
    learner_id, target_kind, domain_id, scope_id, knowledge_level,
    concept_id, concept_version, skill_id, skill_version,
    intervention_type_id, intervention_type_version, intervention_scope_level
  ) nulls not distinct;

create table studymeta_v2.input_manifests (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references studymeta_v2.learners(id) on delete cascade,
  catalog_mapping_versions text[] not null default '{}',
  rule_artifacts jsonb not null default '[]'::jsonb,
  model_version text,
  prompt_version text,
  parameter_set_id text,
  parameter_set_version text,
  validation_snapshot_id uuid not null references studymeta_v2.validation_snapshots(id) on delete restrict,
  operational_policy_version text,
  as_of timestamptz not null,
  knowledge_cutoff timestamptz not null,
  random_seed text,
  input_hash text not null,
  created_at timestamptz not null default now(),
  sealed_at timestamptz,
  check (jsonb_typeof(rule_artifacts) = 'array'),
  check ((parameter_set_id is null) = (parameter_set_version is null)),
  check (sealed_at is null or sealed_at >= created_at),
  foreign key (parameter_set_id, parameter_set_version)
    references studymeta_v2.parameter_sets(parameter_set_id, parameter_set_version) on delete restrict,
  unique (learner_id, id)
);

create table studymeta_v2.input_manifest_items (
  learner_id uuid not null,
  input_manifest_id uuid not null,
  ordinal integer not null check (ordinal >= 0),
  item_kind text not null
    check (item_kind in ('event', 'source', 'evidence', 'event_review', 'evidence_review')),
  event_id uuid,
  source_ref_id uuid,
  evidence_id uuid,
  event_review_id uuid,
  evidence_review_id uuid,
  included boolean not null,
  exclusion_reason_code text,
  primary key (input_manifest_id, ordinal),
  check (num_nonnulls(event_id, source_ref_id, evidence_id, event_review_id, evidence_review_id) = 1),
  check (
    (item_kind = 'event' and event_id is not null)
    or (item_kind = 'source' and source_ref_id is not null)
    or (item_kind = 'evidence' and evidence_id is not null)
    or (item_kind = 'event_review' and event_review_id is not null)
    or (item_kind = 'evidence_review' and evidence_review_id is not null)
  ),
  check ((included and exclusion_reason_code is null) or (not included and exclusion_reason_code is not null)),
  foreign key (learner_id, input_manifest_id)
    references studymeta_v2.input_manifests(learner_id, id) on delete cascade,
  foreign key (learner_id, event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete restrict,
  foreign key (learner_id, source_ref_id)
    references studymeta_v2.source_refs(learner_id, id) on delete restrict,
  foreign key (learner_id, evidence_id)
    references studymeta_v2.derived_evidence(learner_id, id) on delete restrict,
  foreign key (learner_id, event_review_id)
    references studymeta_v2.event_reviews(learner_id, id) on delete restrict,
  foreign key (learner_id, evidence_review_id)
    references studymeta_v2.evidence_reviews(learner_id, id) on delete restrict
);

create table studymeta_v2.calculation_runs (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  input_manifest_id uuid not null,
  run_kind text not null check (run_kind in ('initial', 'correction', 'historical_replay', 'shadow')),
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  foreign key (learner_id, input_manifest_id)
    references studymeta_v2.input_manifests(learner_id, id) on delete restrict,
  unique (learner_id, id),
  unique (learner_id, id, input_manifest_id)
);

create table studymeta_v2.state_estimates (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  state_target_id uuid not null,
  state_type text not null,
  state_definition_version text not null,
  value jsonb,
  status text not null check (status in ('unknown', 'estimated', 'candidate', 'not_applicable')),
  unknown_reason text check (unknown_reason in (
    'initial', 'evidence_retracted', 'inputs_unavailable_due_to_deletion', 'recalculation_pending'
  )),
  scale_definition_id text,
  scale_definition_version text,
  estimate_confidence double precision
    check (estimate_confidence is null or estimate_confidence between 0 and 1),
  confidence_method_version text,
  evidence_count integer not null check (evidence_count >= 0),
  observation_count integer not null check (observation_count >= 0),
  effective_sample_size double precision check (effective_sample_size is null or effective_sample_size >= 0),
  state_update_rule_id text,
  state_update_rule_version text,
  model_version text,
  parameter_set_id text,
  parameter_set_version text,
  validation_snapshot_id uuid,
  state_update_validation_assessment_id uuid,
  operational_policy_version text,
  operational_mode text check (operational_mode in ('research_only', 'pilot', 'production', 'disabled')),
  calculation_run_id uuid,
  input_manifest_id uuid,
  calculation_input_hash text,
  channel text not null check (channel in ('production', 'shadow')),
  as_of timestamptz not null,
  computed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  supersedes_state_estimate_id uuid,
  limitations text[] not null default '{}',
  sealed_at timestamptz,
  check (state_type <> 'state_confidence'),
  check ((status = 'unknown') = (unknown_reason is not null)),
  check (status not in ('unknown', 'not_applicable') or value is null),
  check (status not in ('estimated', 'candidate') or value is not null),
  check (sealed_at is null or sealed_at >= recorded_at),
  check (
    (scale_definition_id is null and scale_definition_version is null)
    or (scale_definition_id is not null and scale_definition_version is not null)
  ),
  check ((value is null) = (scale_definition_id is null)),
  check (
    (estimate_confidence is null and confidence_method_version is null)
    or (estimate_confidence is not null and confidence_method_version is not null)
  ),
  check (
    (state_update_rule_id is null and state_update_rule_version is null)
    or (state_update_rule_id is not null and state_update_rule_version is not null)
  ),
  check ((parameter_set_id is null) = (parameter_set_version is null)),
  check (
    (operational_policy_version is null and operational_mode is null)
    or (operational_policy_version is not null and operational_mode is not null)
  ),
  check (
    (calculation_run_id is null and input_manifest_id is null and calculation_input_hash is null)
    or (calculation_run_id is not null and input_manifest_id is not null and calculation_input_hash is not null)
  ),
  check (
    status <> 'unknown' or unknown_reason <> 'initial'
    or (
      evidence_count = 0
      and observation_count = 0
      and scale_definition_id is null
      and estimate_confidence is null
      and state_update_rule_id is null
      and model_version is null
      and parameter_set_id is null
      and parameter_set_version is null
      and validation_snapshot_id is null
      and state_update_validation_assessment_id is null
      and operational_policy_version is null
      and operational_mode is null
      and calculation_run_id is null
      and supersedes_state_estimate_id is null
      and cardinality(limitations) = 0
    )
  ),
  check (
    status not in ('estimated', 'candidate')
    or (
      scale_definition_id is not null
      and evidence_count > 0
      and observation_count > 0
      and observation_count <= evidence_count
      and state_update_rule_id is not null
      and validation_snapshot_id is not null
      and state_update_validation_assessment_id is not null
      and calculation_run_id is not null
      and input_manifest_id is not null
      and calculation_input_hash is not null
    )
  ),
  check (
    status <> 'unknown' or unknown_reason = 'initial'
    or (
      supersedes_state_estimate_id is not null
      and state_update_rule_id is not null
      and validation_snapshot_id is not null
      and state_update_validation_assessment_id is not null
      and calculation_run_id is not null
      and input_manifest_id is not null
      and calculation_input_hash is not null
      and cardinality(limitations) > 0
    )
  ),
  foreign key (learner_id, state_target_id)
    references studymeta_v2.state_targets(learner_id, id) on delete restrict,
  foreign key (state_type, state_definition_version)
    references studymeta_v2.state_definitions(state_type, definition_version) on delete restrict,
  foreign key (state_update_rule_id, state_update_rule_version)
    references studymeta_v2.state_update_rules(state_update_rule_id, rule_version) on delete restrict,
  foreign key (scale_definition_id, scale_definition_version, state_type, state_definition_version)
    references studymeta_v2.scale_definitions(
      scale_definition_id, scale_definition_version, state_type, state_definition_version
    )
    on delete restrict,
  foreign key (parameter_set_id, parameter_set_version)
    references studymeta_v2.parameter_sets(parameter_set_id, parameter_set_version) on delete restrict,
  foreign key (validation_snapshot_id)
    references studymeta_v2.validation_snapshots(id) on delete restrict,
  foreign key (state_update_validation_assessment_id)
    references studymeta_v2.validation_assessments(id) on delete restrict,
  foreign key (learner_id, calculation_run_id, input_manifest_id)
    references studymeta_v2.calculation_runs(learner_id, id, input_manifest_id) on delete restrict,
  foreign key (learner_id, input_manifest_id)
    references studymeta_v2.input_manifests(learner_id, id) on delete restrict,
  foreign key (learner_id, supersedes_state_estimate_id)
    references studymeta_v2.state_estimates(learner_id, id) on delete restrict,
  unique (learner_id, id),
  unique (learner_id, id, state_target_id, state_type, channel),
  unique (learner_id, state_target_id, state_type, channel, id)
);

create table studymeta_v2.estimate_evidence (
  learner_id uuid not null,
  state_estimate_id uuid not null,
  evidence_id uuid not null,
  use_status text not null check (use_status in ('used', 'excluded')),
  reason_code text,
  primary key (state_estimate_id, evidence_id),
  foreign key (learner_id, state_estimate_id)
    references studymeta_v2.state_estimates(learner_id, id) on delete cascade,
  foreign key (learner_id, evidence_id)
    references studymeta_v2.derived_evidence(learner_id, id) on delete restrict,
  check ((use_status = 'used' and reason_code is null) or (use_status = 'excluded' and reason_code is not null))
);

create table studymeta_v2.state_heads (
  learner_id uuid not null,
  state_target_id uuid not null,
  state_type text not null,
  channel text not null check (channel in ('production', 'shadow')),
  current_estimate_id uuid not null,
  head_revision bigint not null default 0 check (head_revision >= 0),
  freshness text not null check (freshness in ('fresh', 'stale', 'pending')),
  pending_run_id uuid,
  updated_at timestamptz not null default now(),
  primary key (learner_id, state_target_id, state_type, channel),
  foreign key (learner_id, state_target_id, state_type, channel, current_estimate_id)
    references studymeta_v2.state_estimates(learner_id, state_target_id, state_type, channel, id)
    on delete restrict,
  foreign key (learner_id, pending_run_id)
    references studymeta_v2.calculation_runs(learner_id, id) on delete restrict
);

create or replace function studymeta_v2.seal_reproducibility_record()
returns trigger
language plpgsql
as $$
declare
  item_count integer;
  used_count integer;
  observation_group_count integer;
  referenced_snapshot_sealed_at timestamptz;
begin
  if old.sealed_at is not null
     or new.sealed_at is null
     or (to_jsonb(new) - 'sealed_at') is distinct from (to_jsonb(old) - 'sealed_at') then
    raise exception 'only a one-time draft-to-sealed transition is allowed for %', tg_table_name
      using errcode = '55000';
  end if;

  if tg_table_name = 'validation_snapshots' then
    select count(*) into item_count
      from studymeta_v2.validation_snapshot_items where snapshot_id = new.id;
    if item_count = 0 then
      raise exception 'a validation snapshot must contain at least one assessment before sealing'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'input_manifests' then
    select count(*) into item_count
      from studymeta_v2.input_manifest_items where input_manifest_id = new.id;
    if item_count = 0 then
      raise exception 'an input manifest must contain at least one item before sealing'
        using errcode = '23514';
    end if;
    select sealed_at into referenced_snapshot_sealed_at
      from studymeta_v2.validation_snapshots where id = new.validation_snapshot_id;
    if referenced_snapshot_sealed_at is null then
      raise exception 'an input manifest requires a sealed validation snapshot before sealing'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'state_estimates' then
    select
      count(*) filter (where ee.use_status = 'used'),
      count(distinct de.observation_group_id) filter (where ee.use_status = 'used')
      into used_count, observation_group_count
      from studymeta_v2.estimate_evidence ee
      join studymeta_v2.derived_evidence de
        on de.learner_id = ee.learner_id and de.id = ee.evidence_id
      where ee.state_estimate_id = new.id;
    if used_count <> new.evidence_count or observation_group_count <> new.observation_count then
      raise exception 'sealed estimate counts must match its used Evidence composition'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function studymeta_v2.seal_reproducibility_record() from public, anon, authenticated;

create trigger validation_snapshots_seal_only
before update on studymeta_v2.validation_snapshots
for each row execute function studymeta_v2.seal_reproducibility_record();

create trigger validation_snapshots_require_draft_insert
before insert on studymeta_v2.validation_snapshots
for each row execute function studymeta_v2.require_unsealed_insert();
create trigger input_manifests_require_draft_insert
before insert on studymeta_v2.input_manifests
for each row execute function studymeta_v2.require_unsealed_insert();
create trigger state_estimates_require_draft_insert
before insert on studymeta_v2.state_estimates
for each row execute function studymeta_v2.require_unsealed_insert();
create trigger input_manifests_seal_only
before update on studymeta_v2.input_manifests
for each row execute function studymeta_v2.seal_reproducibility_record();
create trigger state_estimates_seal_only
before update on studymeta_v2.state_estimates
for each row execute function studymeta_v2.seal_reproducibility_record();

create trigger validation_snapshot_items_sealed_guard
before insert or update or delete on studymeta_v2.validation_snapshot_items
for each row execute function studymeta_v2.reject_sealed_composition_change();
create trigger input_manifest_items_sealed_guard
before insert or update or delete on studymeta_v2.input_manifest_items
for each row execute function studymeta_v2.reject_sealed_composition_change();
create trigger estimate_evidence_sealed_guard
before insert or update or delete on studymeta_v2.estimate_evidence
for each row execute function studymeta_v2.reject_sealed_composition_change();

create or replace function studymeta_v2.enforce_state_estimate_provenance()
returns trigger
language plpgsql
as $$
declare
  run_status text;
  manifest_sealed_at timestamptz;
  manifest_input_hash text;
  snapshot_sealed_at timestamptz;
  rule_in_manifest boolean;
  rule_matches_estimate boolean;
  validation_matches_rule boolean;
  manifest_model_version text;
  manifest_parameter_set_id text;
  manifest_parameter_set_version text;
begin
  if new.status in ('estimated', 'candidate')
     or (new.status = 'unknown' and new.unknown_reason <> 'initial') then
    select cr.status, im.sealed_at, im.input_hash, vs.sealed_at,
           exists (
             select 1 from jsonb_array_elements(im.rule_artifacts) artifact
              where artifact->>'id' = new.state_update_rule_id
                and artifact->>'version' = new.state_update_rule_version
           ),
           exists (
             select 1 from studymeta_v2.state_update_rules sur
              where sur.state_update_rule_id = new.state_update_rule_id
                and sur.rule_version = new.state_update_rule_version
                and sur.state_type = new.state_type
                and sur.state_definition_version = new.state_definition_version
                and sur.parameter_set_id is not distinct from new.parameter_set_id
                and sur.parameter_set_version is not distinct from new.parameter_set_version
           ),
           exists (
             select 1
               from studymeta_v2.validation_assessments va
               join studymeta_v2.validation_snapshot_items vsi
                 on vsi.assessment_id = va.id and vsi.snapshot_id = new.validation_snapshot_id
              where va.id = new.state_update_validation_assessment_id
                and va.subject_kind = 'state_update_rule'
                and va.subject_id = new.state_update_rule_id
                and va.subject_version = new.state_update_rule_version
           ),
           im.model_version, im.parameter_set_id, im.parameter_set_version
      into run_status, manifest_sealed_at, manifest_input_hash, snapshot_sealed_at,
           rule_in_manifest, rule_matches_estimate, validation_matches_rule,
           manifest_model_version, manifest_parameter_set_id, manifest_parameter_set_version
      from studymeta_v2.calculation_runs cr
      join studymeta_v2.input_manifests im
        on im.learner_id = cr.learner_id and im.id = cr.input_manifest_id
      join studymeta_v2.validation_snapshots vs on vs.id = new.validation_snapshot_id
     where cr.learner_id = new.learner_id
       and cr.id = new.calculation_run_id
       and cr.input_manifest_id = new.input_manifest_id
       and im.validation_snapshot_id = new.validation_snapshot_id;

    if run_status is distinct from 'completed'
       or manifest_sealed_at is null
       or snapshot_sealed_at is null
       or manifest_input_hash is distinct from new.calculation_input_hash
       or rule_in_manifest is distinct from true
       or rule_matches_estimate is distinct from true
       or validation_matches_rule is distinct from true
       or manifest_model_version is distinct from new.model_version
       or manifest_parameter_set_id is distinct from new.parameter_set_id
       or manifest_parameter_set_version is distinct from new.parameter_set_version then
      raise exception 'computed State requires a completed run and matching sealed inputs'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function studymeta_v2.enforce_state_estimate_provenance() from public, anon, authenticated;

create trigger state_estimates_provenance_insert
before insert on studymeta_v2.state_estimates
for each row execute function studymeta_v2.enforce_state_estimate_provenance();

create or replace function studymeta_v2.enforce_calculation_run_manifest_sealed()
returns trigger
language plpgsql
as $$
declare
  manifest_sealed_at timestamptz;
begin
  if new.status in ('processing', 'completed') then
    select sealed_at into manifest_sealed_at
      from studymeta_v2.input_manifests
     where learner_id = new.learner_id and id = new.input_manifest_id;
    if manifest_sealed_at is null then
      raise exception 'processing or completed calculation runs require a sealed manifest'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function studymeta_v2.enforce_calculation_run_manifest_sealed() from public, anon, authenticated;

create trigger calculation_runs_manifest_sealed
before insert or update on studymeta_v2.calculation_runs
for each row execute function studymeta_v2.enforce_calculation_run_manifest_sealed();

create or replace function studymeta_v2.enforce_state_head_sealed_estimate()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from studymeta_v2.state_estimates se
     where se.learner_id = new.learner_id
       and se.id = new.current_estimate_id
       and se.sealed_at is not null
  ) then
    raise exception 'state head requires a sealed estimate' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function studymeta_v2.enforce_state_head_sealed_estimate() from public, anon, authenticated;

create trigger state_heads_require_sealed_estimate
before insert or update of current_estimate_id on studymeta_v2.state_heads
for each row execute function studymeta_v2.enforce_state_head_sealed_estimate();

create table studymeta_v2.state_evaluations (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  state_target_id uuid not null,
  state_type text not null,
  channel text not null check (channel in ('production', 'shadow')),
  trigger_type text not null check (trigger_type in ('event', 'correction', 'rule_release', 'replay_request')),
  trigger_event_id uuid,
  run_id uuid not null,
  processing_status text not null check (processing_status in ('pending', 'processing', 'completed', 'failed')),
  decision text check (decision in ('updated', 'unchanged', 'withheld', 'disabled', 'retracted')),
  reason_codes text[] not null default '{}',
  reason_detail text,
  before_estimate_id uuid,
  after_estimate_id uuid,
  candidate_estimate_id uuid,
  changed_fields text[] not null default '{}',
  validation_snapshot_id uuid,
  policy_version text,
  input_manifest_id uuid not null,
  request_id uuid not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  foreign key (learner_id, state_target_id)
    references studymeta_v2.state_targets(learner_id, id) on delete restrict,
  foreign key (learner_id, trigger_event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete restrict,
  foreign key (learner_id, run_id, input_manifest_id)
    references studymeta_v2.calculation_runs(learner_id, id, input_manifest_id) on delete restrict,
  foreign key (learner_id, before_estimate_id, state_target_id, state_type, channel)
    references studymeta_v2.state_estimates(learner_id, id, state_target_id, state_type, channel)
    on delete restrict,
  foreign key (learner_id, after_estimate_id, state_target_id, state_type, channel)
    references studymeta_v2.state_estimates(learner_id, id, state_target_id, state_type, channel)
    on delete restrict,
  foreign key (learner_id, candidate_estimate_id, state_target_id, state_type, channel)
    references studymeta_v2.state_estimates(learner_id, id, state_target_id, state_type, channel)
    on delete restrict,
  foreign key (validation_snapshot_id)
    references studymeta_v2.validation_snapshots(id) on delete restrict,
  check (
    (processing_status in ('pending', 'processing', 'failed') and decision is null)
    or (processing_status = 'completed' and decision is not null)
  )
);

create or replace function studymeta_v2.enforce_state_target_kind()
returns trigger
language plpgsql
as $$
declare
  stored_target_kind text;
begin
  if new.state_type = 'state_confidence' then
    raise exception 'state_confidence is estimate metadata, not an independent State'
      using errcode = '23514';
  end if;

  select target_kind
    into stored_target_kind
    from studymeta_v2.state_targets
   where learner_id = new.learner_id
     and id = new.state_target_id;

  if stored_target_kind is null then
    return new; -- The composite foreign key provides the missing/wrong-owner error.
  end if;

  if (new.state_type = 'calibration' and stored_target_kind <> 'domain')
     or (new.state_type = 'intervention_response' and stored_target_kind <> 'intervention')
     or (new.state_type not in ('calibration', 'intervention_response') and stored_target_kind <> 'knowledge') then
    raise exception 'State type % is incompatible with target kind %', new.state_type, stored_target_kind
      using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke all on function studymeta_v2.enforce_state_target_kind() from public, anon, authenticated;

create trigger state_estimates_target_kind_insert
before insert on studymeta_v2.state_estimates
for each row execute function studymeta_v2.enforce_state_target_kind();

create trigger state_evaluations_target_kind_insert
before insert on studymeta_v2.state_evaluations
for each row execute function studymeta_v2.enforce_state_target_kind();

create table studymeta_v2.correction_requests (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references studymeta_v2.learners(id) on delete cascade,
  target_kind text not null check (target_kind in ('event', 'evidence', 'fact', 'focus')),
  target_id uuid not null,
  reason text not null,
  proposed_correction jsonb not null,
  source_ref_ids uuid[] not null,
  requested_by uuid not null,
  requested_at timestamptz not null,
  unique (learner_id, id)
);

create table studymeta_v2.correction_reviews (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  correction_id uuid not null,
  decision text not null check (decision in ('accepted', 'rejected', 'superseded')),
  reason text not null,
  reviewed_by uuid not null,
  reviewed_at timestamptz not null,
  resulting_event_id uuid,
  foreign key (learner_id, correction_id)
    references studymeta_v2.correction_requests(learner_id, id) on delete cascade,
  foreign key (learner_id, resulting_event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete restrict
);

create table studymeta_v2.focus_proposals (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  session_id uuid not null,
  base_focus_revision integer not null check (base_focus_revision >= 0),
  previous_focus jsonb,
  proposed_focus jsonb not null,
  relation text not null check (
    relation in ('same_concept', 'subskill', 'prerequisite_or_supporting', 'same_domain_new_concept', 'new_domain', 'uncertain')
  ),
  fact_assertion_refs uuid[] not null default '{}',
  basis_refs uuid[] not null default '{}',
  status text not null check (status in ('pending', 'confirmed', 'rejected', 'expired')),
  confirmation_event_id uuid,
  created_at timestamptz not null default now(),
  foreign key (learner_id, session_id)
    references studymeta_v2.sessions(learner_id, id) on delete cascade,
  foreign key (learner_id, confirmation_event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete restrict
);

create table studymeta_v2.intervention_instances (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  session_id uuid not null,
  intervention_type_id text not null,
  intervention_type_version text not null,
  targets jsonb not null default '[]'::jsonb,
  offered_event_id uuid,
  choice_event_id uuid,
  delivered_event_id uuid,
  before_attempt_id uuid,
  after_attempt_ids uuid[] not null default '{}',
  followup_refs uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (learner_id, session_id)
    references studymeta_v2.sessions(learner_id, id) on delete cascade,
  foreign key (learner_id, offered_event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete restrict,
  foreign key (learner_id, choice_event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete restrict,
  foreign key (learner_id, delivered_event_id)
    references studymeta_v2.learning_events(learner_id, id) on delete restrict,
  foreign key (learner_id, before_attempt_id)
    references studymeta_v2.learning_attempts(learner_id, id) on delete restrict
);

create table studymeta_v2.session_summaries (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null,
  session_id uuid not null,
  revision integer not null check (revision > 0),
  status text not null check (status in ('draft', 'final')),
  input_manifest_id uuid not null,
  summary_payload jsonb not null,
  supersedes_summary_id uuid,
  generated_at timestamptz not null,
  foreign key (learner_id, session_id)
    references studymeta_v2.sessions(learner_id, id) on delete cascade,
  foreign key (learner_id, input_manifest_id)
    references studymeta_v2.input_manifests(learner_id, id) on delete restrict,
  foreign key (learner_id, supersedes_summary_id)
    references studymeta_v2.session_summaries(learner_id, id) on delete restrict,
  unique (session_id, revision),
  unique (learner_id, id)
);

-- Append-only records reject UPDATE. Corrections and new estimates are separate rows.
do $$
declare
  immutable_table text;
begin
  foreach immutable_table in array array[
    'fact_assertions',
    'fact_selections',
    'evidence_definitions',
    'generation_rules',
    'state_definitions',
    'parameter_sets',
    'state_update_rules',
    'scale_definitions',
    'research_sources',
    'study_records',
    'validation_assessments',
    'operation_assignments',
    'learning_events',
    'event_reviews',
    'derived_evidence',
    'evidence_reviews',
    'state_evaluations',
    'correction_requests',
    'correction_reviews',
    'session_summaries'
  ]
  loop
    execute format(
      'create trigger %I before update on studymeta_v2.%I for each row execute function studymeta_v2.reject_immutable_update()',
      immutable_table || '_immutable_update',
      immutable_table
    );
  end loop;
end;
$$;

-- Private-by-default: no browser-facing role receives table privileges or RLS policies.
do $$
declare
  private_table text;
begin
  foreach private_table in array array[
    'learners', 'account_roles', 'connections', 'sessions', 'episodes',
    'learning_attempts', 'source_refs', 'fact_assertions', 'fact_selections',
    'learning_events', 'event_source_refs', 'event_attempts', 'event_targets',
    'event_reviews', 'outbox_jobs', 'derivation_runs', 'derived_evidence',
    'evidence_source_events', 'evidence_attempts', 'evidence_targets',
    'evidence_reviews', 'state_targets', 'input_manifests', 'calculation_runs',
    'input_manifest_items',
    'state_estimates', 'estimate_evidence', 'state_heads', 'state_evaluations',
    'correction_requests', 'correction_reviews', 'focus_proposals', 'intervention_instances',
    'session_summaries'
  ]
  loop
    execute format('alter table studymeta_v2.%I enable row level security', private_table);
    execute format('alter table studymeta_v2.%I force row level security', private_table);
    execute format('revoke all on table studymeta_v2.%I from public, anon, authenticated', private_table);
  end loop;
end;
$$;

revoke all on all tables in schema studymeta_v2 from public, anon, authenticated;
revoke all on all sequences in schema studymeta_v2 from public, anon, authenticated;

comment on schema studymeta_v2 is
  'Private StudyMeta v2 data. Application writes must use an explicit transaction, a verified AuthContext, learner-scoped repository methods, and a restricted backend role. No direct anon/authenticated access is granted by this migration.';

comment on table studymeta_v2.learning_events is
  'Observation input only. Evidence and State mutation fields do not belong in this table.';
comment on table studymeta_v2.derived_evidence is
  'Server-derived Evidence. observation_confidence is not State confidence or scientific validation.';
comment on table studymeta_v2.state_estimates is
  'Estimate history whose body is immutable after insert; only a one-time sealed_at transition is allowed. Current display state is selected through state_heads.';
comment on table studymeta_v2.state_heads is
  'Mutable current pointer with optimistic head_revision; production and shadow channels are separate.';
comment on column studymeta_v2.state_estimates.channel is
  'Storage channel only. production does not imply an approved operational assignment.';
comment on column studymeta_v2.state_estimates.unknown_reason is
  'Distinguishes an initial unknown from retraction, deletion-unavailable inputs, or pending recalculation.';
comment on function studymeta_v2.reject_sealed_composition_change() is
  'Blocks ordinary child-row mutation after sealing. Cascades from a parent deletion remain possible so a separately authorized privacy-deletion service can be designed without making deletion structurally impossible.';
comment on table studymeta_v2.validation_assessments is
  'Versioned scientific assessment for one claim and scope; structural checks do not prove that a paper or conclusion is scientifically valid; independent from operation_assignments.';
comment on table studymeta_v2.operation_assignments is
  'Operational mode and permitted actions; never implies scientific support.';

create index learning_events_learner_session_time_idx
  on studymeta_v2.learning_events (learner_id, ((coordinates ->> 'session_id')), occurred_at desc);
create unique index learning_events_external_source_unique_idx
  on studymeta_v2.learning_events (learner_id, connection_id, external_event_id)
  where external_event_id is not null;
create index outbox_jobs_ready_idx
  on studymeta_v2.outbox_jobs (status, available_at) where status in ('pending', 'failed');
create index derived_evidence_lookup_idx
  on studymeta_v2.derived_evidence (learner_id, evidence_type_id, observed_at desc);
create index state_estimates_history_idx
  on studymeta_v2.state_estimates (learner_id, state_target_id, state_type, channel, as_of desc);
create index state_evaluations_lookup_idx
  on studymeta_v2.state_evaluations (learner_id, state_target_id, state_type, started_at desc);
create index validation_assessments_subject_idx
  on studymeta_v2.validation_assessments
  (subject_kind, subject_id, subject_version, claim_id, scope_id, assessment_version desc);
