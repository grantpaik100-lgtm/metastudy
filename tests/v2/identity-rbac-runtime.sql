\set ON_ERROR_STOP on

-- Run only in a fresh, disposable PostgreSQL 15+ database. This fixture creates
-- minimal Supabase-compatible roles/auth helpers; it does not validate JWT
-- signatures or contact a Supabase project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

\ir ../../supabase/migrations/202609080001_studymeta_v2_foundation.sql
\ir ../../supabase/migrations/202609090001_studymeta_v2_identity_rbac.sql

create schema studymeta_v2_test;
grant usage on schema studymeta_v2_test to anon, authenticated, service_role;

create function studymeta_v2_test.assert_true(label text, condition boolean)
returns void
language plpgsql
as $$
begin
  if condition is distinct from true then
    raise exception 'assertion failed: %', label;
  end if;
  raise notice 'PASS — %', label;
end;
$$;

create function studymeta_v2_test.expect_rejection(label text, command text)
returns void
language plpgsql
as $$
declare
  rejected boolean := false;
  rejection_message text;
begin
  begin
    execute command;
  exception when others then
    rejected := true;
    rejection_message := sqlerrm;
  end;

  if not rejected then
    raise exception 'expected rejection did not occur: %', label;
  end if;
  raise notice 'PASS rejection — %: %', label, rejection_message;
end;
$$;

begin;

-- Trigger path: one auth account becomes one learner with one active student role.
insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000004');

select studymeta_v2_test.assert_true(
  'new auth users receive exactly one learner each',
  (select count(*) from studymeta_v2.learners) = 4
  and (select count(distinct auth_user_id) from studymeta_v2.learners) = 4
);
select studymeta_v2_test.assert_true(
  'new auth users receive exactly one active student role each',
  (select count(*) from studymeta_v2.account_roles where role = 'student' and revoked_at is null) = 4
);

insert into auth.users (id)
values ('00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
select studymeta_v2_test.assert_true(
  'auth insert retry creates no duplicate learner or student role',
  (select count(*) from studymeta_v2.learners
    where auth_user_id = '00000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from studymeta_v2.account_roles
    where auth_user_id = '00000000-0000-4000-8000-000000000001'
      and role = 'student' and revoked_at is null) = 1
);

-- Fixture data is intentionally minimal: the test isolates grants, RLS, and
-- administrator projections from Stage 1 scientific/provenance validation.
insert into studymeta_v2.state_definitions (
  state_type, definition_version, state_group, ordinal, name_ko, description, value_role
) values (
  'procedural_mastery', '1.0', 'STUDENT_SKILL', 1,
  '절차 숙달', 'Stage 2A RLS fixture', 'learner_state'
);

insert into studymeta_v2.sessions (
  id, learner_id, status, started_at, idle_deadline_at, timeout_policy_version
)
select
  '00000000-0000-4000-8000-000000000101', id, 'active',
  '2026-09-09T00:00:00Z', '2026-09-09T01:00:00Z', 'fixture-v1'
from studymeta_v2.learners
where auth_user_id = '00000000-0000-4000-8000-000000000001';

insert into studymeta_v2.sessions (
  id, learner_id, status, started_at, idle_deadline_at, timeout_policy_version
)
select
  '00000000-0000-4000-8000-000000000102', id, 'active',
  '2026-09-09T00:00:00Z', '2026-09-09T01:00:00Z', 'fixture-v1'
from studymeta_v2.learners
where auth_user_id = '00000000-0000-4000-8000-000000000002';

insert into studymeta_v2.learning_events (
  id, schema_version, learner_id, actor_id, actor_type, event_type, source,
  connection_scope, session_id, idempotency_key, payload_hash, occurred_at,
  coordinates, observation
)
select
  '00000000-0000-4000-8000-000000000201', 'studymeta.v2', learners.id,
  learners.auth_user_id, 'student', 'problem_attempt', 'runtime_fixture',
  'local', '00000000-0000-4000-8000-000000000101', 'student-a-event',
  'sha256:student-a', '2026-09-09T00:10:00Z', '{}', '{"fixture":"student-a"}'
from studymeta_v2.learners as learners
where learners.auth_user_id = '00000000-0000-4000-8000-000000000001';

insert into studymeta_v2.learning_events (
  id, schema_version, learner_id, actor_id, actor_type, event_type, source,
  connection_scope, session_id, idempotency_key, payload_hash, occurred_at,
  coordinates, observation
)
select
  '00000000-0000-4000-8000-000000000202', 'studymeta.v2', learners.id,
  learners.auth_user_id, 'student', 'problem_attempt', 'runtime_fixture',
  'local', '00000000-0000-4000-8000-000000000102', 'student-b-event',
  'sha256:student-b', '2026-09-09T00:20:00Z', '{}', '{"fixture":"student-b"}'
from studymeta_v2.learners as learners
where learners.auth_user_id = '00000000-0000-4000-8000-000000000002';

insert into studymeta_v2.state_targets (
  id, learner_id, target_kind, domain_id, scope_id,
  knowledge_level, skill_id, skill_version
)
select
  '00000000-0000-4000-8000-000000000401', id, 'knowledge',
  'calculus', 'single-variable', 'skill', 'chain-rule', '1.0'
from studymeta_v2.learners
where auth_user_id = '00000000-0000-4000-8000-000000000001';

insert into studymeta_v2.state_targets (
  id, learner_id, target_kind, domain_id, scope_id,
  knowledge_level, skill_id, skill_version
)
select
  '00000000-0000-4000-8000-000000000402', id, 'knowledge',
  'calculus', 'single-variable', 'skill', 'chain-rule', '1.0'
from studymeta_v2.learners
where auth_user_id = '00000000-0000-4000-8000-000000000002';

insert into studymeta_v2.state_estimates (
  id, learner_id, state_target_id, state_type, state_definition_version,
  status, unknown_reason, evidence_count, observation_count,
  channel, as_of, computed_at
)
select
  '00000000-0000-4000-8000-000000000501', learner_id,
  '00000000-0000-4000-8000-000000000401', 'procedural_mastery', '1.0',
  'unknown', 'initial', 0, 0, 'production',
  '2026-09-09T00:10:00Z', '2026-09-09T00:10:00Z'
from studymeta_v2.state_targets
where id = '00000000-0000-4000-8000-000000000401';

insert into studymeta_v2.state_estimates (
  id, learner_id, state_target_id, state_type, state_definition_version,
  status, unknown_reason, evidence_count, observation_count,
  channel, as_of, computed_at
)
select
  '00000000-0000-4000-8000-000000000502', learner_id,
  '00000000-0000-4000-8000-000000000402', 'procedural_mastery', '1.0',
  'unknown', 'initial', 0, 0, 'production',
  '2026-09-09T00:20:00Z', '2026-09-09T00:20:00Z'
from studymeta_v2.state_targets
where id = '00000000-0000-4000-8000-000000000402';

update studymeta_v2.state_estimates set sealed_at = clock_timestamp()
where id in (
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000502'
);

insert into studymeta_v2.state_heads (
  learner_id, state_target_id, state_type, channel,
  current_estimate_id, freshness
)
select learner_id, state_target_id, state_type, channel, id, 'fresh'
from studymeta_v2.state_estimates
where id in (
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000502'
);

-- Bypass only FK/provenance triggers while inserting isolated RLS projection
-- fixtures; CHECK constraints still apply. Runtime access tests run in origin mode.
set local session_replication_role = replica;

insert into studymeta_v2.derived_evidence (
  id, schema_version, learner_id, evidence_type_id, definition_version,
  generation_rule_id, generation_rule_version, derivation_run_id,
  representative_event_id, value, value_status, value_schema_version,
  support_condition, observation_group_id, observed_at,
  definition_validation_assessment_id, generation_validation_assessment_id,
  validation_snapshot_id, provenance_status
)
select
  '00000000-0000-4000-8000-000000000301', 'studymeta.v2', id,
  'correct', '1.0', 'fixture-rule', '1.0',
  '00000000-0000-4000-8000-000000000311',
  '00000000-0000-4000-8000-000000000201', 'true', 'observed', '1.0',
  'independent', '00000000-0000-4000-8000-000000000321',
  '2026-09-09T00:10:00Z',
  '00000000-0000-4000-8000-000000000331',
  '00000000-0000-4000-8000-000000000332',
  '00000000-0000-4000-8000-000000000333', 'server_captured'
from studymeta_v2.learners
where auth_user_id = '00000000-0000-4000-8000-000000000001';

insert into studymeta_v2.derived_evidence (
  id, schema_version, learner_id, evidence_type_id, definition_version,
  generation_rule_id, generation_rule_version, derivation_run_id,
  representative_event_id, value, value_status, value_schema_version,
  support_condition, observation_group_id, observed_at,
  definition_validation_assessment_id, generation_validation_assessment_id,
  validation_snapshot_id, provenance_status
)
select
  '00000000-0000-4000-8000-000000000302', 'studymeta.v2', id,
  'correct', '1.0', 'fixture-rule', '1.0',
  '00000000-0000-4000-8000-000000000312',
  '00000000-0000-4000-8000-000000000202', 'true', 'observed', '1.0',
  'independent', '00000000-0000-4000-8000-000000000322',
  '2026-09-09T00:20:00Z',
  '00000000-0000-4000-8000-000000000331',
  '00000000-0000-4000-8000-000000000332',
  '00000000-0000-4000-8000-000000000333', 'server_captured'
from studymeta_v2.learners
where auth_user_id = '00000000-0000-4000-8000-000000000002';

insert into studymeta_v2.state_evaluations (
  id, learner_id, state_target_id, state_type, channel, trigger_type,
  run_id, processing_status, decision, reason_codes, changed_fields,
  input_manifest_id, request_id, started_at, completed_at
)
select
  '00000000-0000-4000-8000-000000000601', learner_id,
  '00000000-0000-4000-8000-000000000401', 'procedural_mastery',
  'production', 'event', '00000000-0000-4000-8000-000000000611',
  'completed', 'unchanged', array['insufficient_evidence'], '{}',
  '00000000-0000-4000-8000-000000000621',
  '00000000-0000-4000-8000-000000000631',
  '2026-09-09T00:11:00Z', '2026-09-09T00:11:01Z'
from studymeta_v2.state_targets
where id = '00000000-0000-4000-8000-000000000401';

insert into studymeta_v2.state_evaluations (
  id, learner_id, state_target_id, state_type, channel, trigger_type,
  run_id, processing_status, decision, reason_codes, changed_fields,
  input_manifest_id, request_id, started_at, completed_at
)
select
  '00000000-0000-4000-8000-000000000602', learner_id,
  '00000000-0000-4000-8000-000000000402', 'procedural_mastery',
  'production', 'event', '00000000-0000-4000-8000-000000000612',
  'completed', 'withheld', array['validation_not_approved'], '{}',
  '00000000-0000-4000-8000-000000000622',
  '00000000-0000-4000-8000-000000000632',
  '2026-09-09T00:21:00Z', '2026-09-09T00:21:01Z'
from studymeta_v2.state_targets
where id = '00000000-0000-4000-8000-000000000402';

set local session_replication_role = origin;

-- Student A can read every required owned relation and cannot see B.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

select studymeta_v2_test.assert_true(
  'student A reads only own learner row',
  (select count(*) from studymeta_v2.learners) = 1
  and (select bool_and(auth_user_id = '00000000-0000-4000-8000-000000000001')
       from studymeta_v2.learners)
);
select studymeta_v2_test.assert_true(
  'authenticated learner contract returns own active roles',
  (select count(*) = 1 and bool_and('student' = any(active_roles))
   from studymeta_v2.get_authenticated_learner())
);
select studymeta_v2_test.assert_true('student A reads own Session', (select count(*) from studymeta_v2.sessions) = 1);
select studymeta_v2_test.assert_true('student A reads own Learning Event', (select count(*) from studymeta_v2.learning_events) = 1);
select studymeta_v2_test.assert_true('student A reads own Evidence', (select count(*) from studymeta_v2.derived_evidence) = 1);
select studymeta_v2_test.assert_true('student A reads own State target', (select count(*) from studymeta_v2.state_targets) = 1);
select studymeta_v2_test.assert_true('student A reads own StateEstimate', (select count(*) from studymeta_v2.state_estimates) = 1);
select studymeta_v2_test.assert_true('student A reads own StateHead', (select count(*) from studymeta_v2.state_heads) = 1);
select studymeta_v2_test.assert_true('student A reads own StateEvaluation', (select count(*) from studymeta_v2.state_evaluations) = 1);
select studymeta_v2_test.assert_true(
  'student A cannot read student B Event',
  (select count(*) from studymeta_v2.learning_events
   where id = '00000000-0000-4000-8000-000000000202') = 0
);
select studymeta_v2_test.expect_rejection(
  'student cannot update StateEstimate',
  $$update studymeta_v2.state_estimates set limitations = array['forbidden']
    where id = '00000000-0000-4000-8000-000000000501'$$
);
select studymeta_v2_test.expect_rejection(
  'student cannot update Evidence',
  $$update studymeta_v2.derived_evidence set detail = 'forbidden'
    where id = '00000000-0000-4000-8000-000000000301'$$
);
select studymeta_v2_test.expect_rejection(
  'student cannot update scientific validation',
  $$update studymeta_v2.validation_assessments set change_reason = 'forbidden'$$
);
select studymeta_v2_test.expect_rejection(
  'student cannot update operation policy',
  $$update studymeta_v2.operation_assignments set reason = 'forbidden'$$
);
select studymeta_v2_test.expect_rejection(
  'ordinary student cannot call admin learner list',
  $$select * from studymeta_v2.admin_list_students()$$
);
select studymeta_v2_test.expect_rejection(
  'browser role cannot provision admin',
  $$select studymeta_v2.provision_admin_role(
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000004',
      'forbidden browser grant')$$
);

reset role;

insert into studymeta_v2.account_roles (
  auth_user_id, role, granted_by, reason
) values
  ('00000000-0000-4000-8000-000000000002', 'validation_reviewer',
   '00000000-0000-4000-8000-000000000004', 'runtime reviewer fixture'),
  ('00000000-0000-4000-8000-000000000002', 'release_manager',
   '00000000-0000-4000-8000-000000000004', 'runtime release fixture');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select studymeta_v2_test.expect_rejection(
  'validation reviewer and release manager are not implicitly admin',
  $$select * from studymeta_v2.admin_list_students()$$
);
reset role;

-- Only service_role can call the audited, fixed-admin provisioning function.
set local role service_role;
select studymeta_v2_test.assert_true(
  'service role provisions admin by UUID',
  studymeta_v2.provision_admin_role(
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000004',
    'runtime authorization fixture'
  )
);
select studymeta_v2_test.assert_true(
  'repeated admin provisioning is idempotent',
  not studymeta_v2.provision_admin_role(
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000004',
    'runtime authorization fixture retry'
  )
);
select studymeta_v2_test.expect_rejection(
  'service role cannot bypass audited role table mutation',
  $$insert into studymeta_v2.account_roles
    (auth_user_id, role, granted_by, reason)
    values (
      '00000000-0000-4000-8000-000000000002', 'admin',
      '00000000-0000-4000-8000-000000000004', 'direct mutation')$$
);

reset role;

select studymeta_v2_test.assert_true(
  'admin and student roles can be active together',
  (select count(*) from studymeta_v2.account_roles
   where auth_user_id = '00000000-0000-4000-8000-000000000003'
     and role in ('student', 'admin')
     and revoked_at is null) = 2
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select studymeta_v2_test.assert_true(
  'admin learner list succeeds with all learners',
  (select count(*) from studymeta_v2.admin_list_students(true, 100)) = 4
);
select studymeta_v2_test.assert_true(
  'admin State log succeeds without raw source payload',
  (select count(*) from studymeta_v2.admin_list_state_change_log()) = 2
);
select studymeta_v2_test.assert_true(
  'admin reads one learner current State values',
  (select count(*)
   from studymeta_v2.admin_list_current_states(
     (select learner_id
      from studymeta_v2.admin_list_students(true, 100)
      where last_learning_at = '2026-09-09T00:10:00Z')
   )) = 1
);
select studymeta_v2_test.assert_true(
  'admin non-change log distinguishes reason categories',
  (select count(*) from studymeta_v2.admin_list_non_change_log()
   where non_change_category in ('insufficient_evidence', 'validation_policy')) = 2
);
select studymeta_v2_test.expect_rejection(
  'admin cannot update StateEstimate',
  $$update studymeta_v2.state_estimates set limitations = array['forbidden']$$
);
select studymeta_v2_test.expect_rejection(
  'admin cannot update Evidence',
  $$update studymeta_v2.derived_evidence set detail = 'forbidden'$$
);
select studymeta_v2_test.expect_rejection(
  'admin cannot update scientific validation',
  $$update studymeta_v2.validation_assessments set change_reason = 'forbidden'$$
);

reset role;

set local role service_role;
select studymeta_v2_test.assert_true(
  'service role revokes active admin with audit metadata',
  studymeta_v2.revoke_admin_role(
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000004',
    'runtime revocation fixture'
  )
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select studymeta_v2_test.expect_rejection(
  'revoked admin cannot call learner list',
  $$select * from studymeta_v2.admin_list_students()$$
);
reset role;

select studymeta_v2_test.assert_true(
  'admin grant and revocation audit history is preserved',
  (select count(*) from studymeta_v2.account_roles
   where auth_user_id = '00000000-0000-4000-8000-000000000003'
     and role = 'admin'
     and granted_by = '00000000-0000-4000-8000-000000000004'
     and revoked_by = '00000000-0000-4000-8000-000000000004'
     and reason = 'runtime authorization fixture'
     and revocation_reason = 'runtime revocation fixture') = 1
);

set local role anon;
select studymeta_v2_test.expect_rejection(
  'anon cannot read learner data',
  $$select * from studymeta_v2.learners$$
);
select studymeta_v2_test.expect_rejection(
  'anon cannot call admin RPC',
  $$select * from studymeta_v2.admin_list_students()$$
);
reset role;

-- Transaction rollback includes trigger side effects.
savepoint before_rollback_probe;
insert into auth.users (id) values ('00000000-0000-4000-8000-000000000099');
select studymeta_v2_test.assert_true(
  'identity trigger participates in caller transaction',
  (select count(*) from studymeta_v2.learners
   where auth_user_id = '00000000-0000-4000-8000-000000000099') = 1
);
rollback to savepoint before_rollback_probe;
select studymeta_v2_test.assert_true(
  'auth user and learner trigger effects roll back together',
  not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-000000000099')
  and not exists (
    select 1 from studymeta_v2.learners
    where auth_user_id = '00000000-0000-4000-8000-000000000099'
  )
);

rollback;

select studymeta_v2_test.assert_true(
  'runtime fixture transaction leaves no account data',
  not exists (select 1 from auth.users)
  and not exists (select 1 from studymeta_v2.learners)
);

\echo 'PASS — StudyMeta v2 Stage 2A PostgreSQL runtime suite completed'
