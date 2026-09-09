\set ON_ERROR_STOP on

-- Run only in a fresh disposable PostgreSQL 15+ database. This fixture models
-- the Supabase roles and request claims without contacting a Supabase project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text unique
);

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;

\ir ../../supabase/migrations/202609080001_studymeta_v2_foundation.sql
\ir ../../supabase/migrations/202609090001_studymeta_v2_identity_rbac.sql
\ir ../../supabase/migrations/202609090002_studymeta_v2_supabase_gateway.sql

create schema studymeta_gateway_test;
grant usage on schema studymeta_gateway_test to anon, authenticated, service_role;

create function studymeta_gateway_test.assert_true(label text, condition boolean)
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

create function studymeta_gateway_test.expect_rejection(label text, command text)
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

select studymeta_gateway_test.assert_true(
  'all ten gateway functions use fixed pg_catalog search_path',
  (select count(*) = 10
     and bool_and(proconfig @> array['search_path=pg_catalog']::text[])
   from pg_proc as procedures
   join pg_namespace as namespaces on namespaces.oid = procedures.pronamespace
   where namespaces.nspname = 'studymeta_api')
);

select studymeta_gateway_test.assert_true(
  'gateway schema contains functions and no base relations',
  not exists (
    select 1 from pg_class as relations
    join pg_namespace as namespaces on namespaces.oid = relations.relnamespace
    where namespaces.nspname = 'studymeta_api'
      and relations.relkind in ('r', 'p', 'v', 'm', 'f')
  )
);

select studymeta_gateway_test.assert_true(
  'PUBLIC has no gateway schema or function privileges',
  not exists (
    select 1
    from pg_namespace as namespaces
    cross join lateral aclexplode(
      coalesce(namespaces.nspacl, acldefault('n', namespaces.nspowner))
    ) as privileges
    where namespaces.nspname = 'studymeta_api'
      and privileges.grantee = 0
  )
  and not exists (
    select 1
    from pg_proc as procedures
    join pg_namespace as namespaces on namespaces.oid = procedures.pronamespace
    cross join lateral aclexplode(
      coalesce(procedures.proacl, acldefault('f', procedures.proowner))
    ) as privileges
    where namespaces.nspname = 'studymeta_api'
      and privileges.grantee = 0
  )
);

select studymeta_gateway_test.assert_true(
  'only authenticated can execute user RPCs and only service_role can execute server RPCs',
  (select count(*) = 10
     and bool_and(not has_function_privilege('anon', procedures.oid, 'EXECUTE'))
     and bool_and(
       case when procedures.proname like 'server_%'
         then has_function_privilege('service_role', procedures.oid, 'EXECUTE')
              and not has_function_privilege('authenticated', procedures.oid, 'EXECUTE')
         else has_function_privilege('authenticated', procedures.oid, 'EXECUTE')
       end
     )
   from pg_proc as procedures
   join pg_namespace as namespaces on namespaces.oid = procedures.pronamespace
   where namespaces.nspname = 'studymeta_api')
);

select studymeta_gateway_test.assert_true(
  'authenticated has no direct internal schema or table access',
  not has_schema_privilege('authenticated', 'studymeta_v2', 'USAGE')
  and not has_table_privilege('authenticated', 'studymeta_v2.learners', 'SELECT')
  and has_schema_privilege('authenticated', 'studymeta_api', 'USAGE')
);

set local role anon;
select studymeta_gateway_test.expect_rejection(
  'anon cannot call a learner RPC',
  $$select * from studymeta_api.get_my_identity()$$
);
select studymeta_gateway_test.expect_rejection(
  'anon cannot read an internal base table',
  $$select * from studymeta_v2.learners$$
);
select studymeta_gateway_test.expect_rejection(
  'anon cannot call the server Auth audit RPC',
  $$select * from studymeta_api.server_audit_auth_users(array[]::uuid[])$$
);
select studymeta_gateway_test.expect_rejection(
  'anon cannot call the server provisioning RPC',
  $$select * from studymeta_api.server_provision_admin_roles(
    array['00000000-0000-4000-8000-000000000001']::uuid[],
    '00000000-0000-4000-8000-000000000004'::uuid,
    'must be rejected before execution'
  )$$
);
reset role;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'admin-looking-student@example.invalid'),
  ('00000000-0000-4000-8000-000000000002', 'student-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000003', 'admin-candidate@example.invalid'),
  ('00000000-0000-4000-8000-000000000004', 'grantor@example.invalid'),
  ('00000000-0000-4000-8000-000000000005', 'rollback-target@example.invalid');

insert into studymeta_v2.state_definitions (
  state_type, definition_version, state_group, ordinal,
  name_ko, description, value_role
) values (
  'procedural_mastery', '1.0', 'STUDENT_SKILL', 1,
  '절차 숙달', 'Stage 2B runtime fixture', 'learner_state'
);

insert into studymeta_v2.state_targets (
  id, learner_id, target_kind, domain_id, scope_id,
  knowledge_level, skill_id, skill_version
)
select
  case learners.auth_user_id
    when '00000000-0000-4000-8000-000000000001'
      then '00000000-0000-4000-8000-000000000101'::uuid
    else '00000000-0000-4000-8000-000000000102'::uuid
  end,
  learners.id, 'knowledge', 'calculus', 'single-variable',
  'skill', 'chain-rule', '1.0'
from studymeta_v2.learners as learners
where learners.auth_user_id in (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002'
);

insert into studymeta_v2.state_estimates (
  id, learner_id, state_target_id, state_type, state_definition_version,
  status, unknown_reason, evidence_count, observation_count,
  channel, as_of, computed_at
)
select
  case targets.id
    when '00000000-0000-4000-8000-000000000101'
      then '00000000-0000-4000-8000-000000000201'::uuid
    else '00000000-0000-4000-8000-000000000202'::uuid
  end,
  targets.learner_id, targets.id, 'procedural_mastery', '1.0',
  'unknown', 'initial', 0, 0, 'production',
  '2026-09-09T00:00:00Z', '2026-09-09T00:00:00Z'
from studymeta_v2.state_targets as targets
where targets.id in (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102'
);

update studymeta_v2.state_estimates
set sealed_at = clock_timestamp()
where id in (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000202'
);

insert into studymeta_v2.state_heads (
  learner_id, state_target_id, state_type, channel,
  current_estimate_id, freshness
)
select learner_id, state_target_id, state_type, channel, id, 'fresh'
from studymeta_v2.state_estimates
where id in (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000202'
);

set local session_replication_role = replica;
insert into studymeta_v2.state_evaluations (
  id, learner_id, state_target_id, state_type, channel, trigger_type,
  run_id, processing_status, decision, reason_codes, changed_fields,
  input_manifest_id, request_id, started_at, completed_at
)
select
  case targets.id
    when '00000000-0000-4000-8000-000000000101'
      then '00000000-0000-4000-8000-000000000301'::uuid
    else '00000000-0000-4000-8000-000000000302'::uuid
  end,
  targets.learner_id, targets.id, 'procedural_mastery', 'production',
  'event',
  case targets.id
    when '00000000-0000-4000-8000-000000000101'
      then '00000000-0000-4000-8000-000000000311'::uuid
    else '00000000-0000-4000-8000-000000000312'::uuid
  end,
  'completed',
  case targets.id
    when '00000000-0000-4000-8000-000000000101' then 'unchanged'
    else 'withheld'
  end,
  case targets.id
    when '00000000-0000-4000-8000-000000000101'
      then array['insufficient_evidence']::text[]
    else array['validation_not_approved']::text[]
  end,
  '{}',
  case targets.id
    when '00000000-0000-4000-8000-000000000101'
      then '00000000-0000-4000-8000-000000000321'::uuid
    else '00000000-0000-4000-8000-000000000322'::uuid
  end,
  case targets.id
    when '00000000-0000-4000-8000-000000000101'
      then '00000000-0000-4000-8000-000000000331'::uuid
    else '00000000-0000-4000-8000-000000000332'::uuid
  end,
  '2026-09-09T00:10:00Z', '2026-09-09T00:10:01Z'
from studymeta_v2.state_targets as targets
where targets.id in (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102'
);
set local session_replication_role = origin;

create schema attacker;
create function attacker.current_learner_id()
returns uuid language sql stable
as $$ select '00000000-0000-4000-8000-000000000002'::uuid $$;
create function attacker.is_active_admin()
returns boolean language sql stable
as $$ select true $$;
create table attacker.state_heads (learner_id uuid);
grant usage on schema attacker to authenticated;
grant execute on function attacker.current_learner_id() to authenticated;
grant execute on function attacker.is_active_admin() to authenticated;
grant select on attacker.state_heads to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local search_path = attacker, public;

select studymeta_gateway_test.assert_true(
  'student identity resolves only the JWT learner despite hostile search_path',
  (select count(*) = 1
     and bool_and(auth_user_id = '00000000-0000-4000-8000-000000000001')
   from studymeta_api.get_my_identity())
);
select studymeta_gateway_test.assert_true(
  'student summary returns only the JWT learner',
  (select count(*) = 1
     and bool_and(learner_id = (
       select learner_id from studymeta_api.get_my_identity()
     ))
   from studymeta_api.get_my_learner_summary())
);
select studymeta_gateway_test.assert_true(
  'student current states exclude every other learner',
  (select count(*) = 1
     and bool_and(state_target ->> 'state_target_id' = '00000000-0000-4000-8000-000000000101')
   from studymeta_api.get_my_current_states())
);
select studymeta_gateway_test.assert_true(
  'student recent State log excludes every other learner',
  (select count(*) = 1
     and bool_and(evaluation_id = '00000000-0000-4000-8000-000000000301')
   from studymeta_api.get_my_recent_state_log())
);

select studymeta_gateway_test.expect_rejection(
  'authenticated cannot read internal base tables directly',
  $$select * from studymeta_v2.learners$$
);
select studymeta_gateway_test.expect_rejection(
  'student cannot change State directly',
  $$update studymeta_v2.state_estimates set limitations = array['forbidden']$$
);
select studymeta_gateway_test.expect_rejection(
  'student cannot change administrator roles directly',
  $$insert into studymeta_v2.account_roles
    (auth_user_id, role, reason)
    values ('00000000-0000-4000-8000-000000000001', 'admin', 'forbidden')$$
);
select studymeta_gateway_test.expect_rejection(
  'an admin-looking email is not administrator authority',
  $$select * from studymeta_api.admin_list_students()$$
);
select studymeta_gateway_test.expect_rejection(
  'student cannot call admin current State RPC',
  $$select * from studymeta_api.admin_list_current_states(
    (select learner_id from studymeta_api.get_my_identity()))$$
);
select studymeta_gateway_test.expect_rejection(
  'student cannot call admin change log RPC',
  $$select * from studymeta_api.admin_list_state_change_log()$$
);
select studymeta_gateway_test.expect_rejection(
  'student cannot call admin non-change log RPC',
  $$select * from studymeta_api.admin_list_non_change_log()$$
);
select studymeta_gateway_test.expect_rejection(
  'student cannot call server Auth audit RPC',
  $$select * from studymeta_api.server_audit_auth_users()$$
);
select studymeta_gateway_test.expect_rejection(
  'student cannot call server provisioning RPC',
  $$select * from studymeta_api.server_provision_admin_roles(
    array['00000000-0000-4000-8000-000000000001']::uuid[],
    '00000000-0000-4000-8000-000000000004', 'forbidden')$$
);
reset role;
reset search_path;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select studymeta_gateway_test.assert_true(
  'service_role can execute the read-only Auth audit RPC',
  (select total_auth_users = 5
      and linked_learner_count = 5
      and would_create_count = 0
      and active_student_role_count = 5
      and would_create_student_role_count = 0
      and identity_conflict_count = 0
      and role_conflict_count = 0
   from studymeta_api.server_audit_auth_users())
);
select studymeta_gateway_test.expect_rejection(
  'invalid provisioning target rejects the entire RPC',
  $$select * from studymeta_api.server_provision_admin_roles(
    array[
      '00000000-0000-4000-8000-000000000005',
      '00000000-0000-4000-8000-000000000999'
    ]::uuid[],
    '00000000-0000-4000-8000-000000000004',
    'must roll back every target')$$
);
reset role;

select studymeta_gateway_test.assert_true(
  'failed multi-target provisioning leaves no partial administrator grant',
  not exists (
    select 1 from studymeta_v2.account_roles
    where auth_user_id = '00000000-0000-4000-8000-000000000005'
      and role = 'admin' and revoked_at is null
  )
);

set local role service_role;
select studymeta_gateway_test.assert_true(
  'service_role provisions all valid targets in one RPC',
  (select count(*) = 2 and bool_and(newly_granted)
   from studymeta_api.server_provision_admin_roles(
     array[
       '00000000-0000-4000-8000-000000000003',
       '00000000-0000-4000-8000-000000000005'
     ]::uuid[],
     '00000000-0000-4000-8000-000000000004',
     'Stage 2B runtime approval'
   ))
);
select studymeta_gateway_test.assert_true(
  'repeated server provisioning is idempotent',
  (select count(*) = 2 and bool_and(not newly_granted)
   from studymeta_api.server_provision_admin_roles(
     array[
       '00000000-0000-4000-8000-000000000003',
       '00000000-0000-4000-8000-000000000005'
     ]::uuid[],
     '00000000-0000-4000-8000-000000000004',
     'Stage 2B runtime approval retry'
   ))
);
select studymeta_gateway_test.assert_true(
  'server Auth audit sees both active administrator targets',
  (select requested_admin_count = 2 and existing_admin_count = 2
   from studymeta_api.server_audit_auth_users(
     array[
       '00000000-0000-4000-8000-000000000003',
       '00000000-0000-4000-8000-000000000005'
     ]::uuid[]
   ))
);
reset role;

select studymeta_gateway_test.assert_true(
  'provisioning preserves grantor and original reason',
  (select count(*) = 2
      and bool_and(granted_by = '00000000-0000-4000-8000-000000000004')
      and bool_and(reason = 'Stage 2B runtime approval')
   from studymeta_v2.account_roles
   where auth_user_id in (
     '00000000-0000-4000-8000-000000000003',
     '00000000-0000-4000-8000-000000000005'
   ) and role = 'admin' and revoked_at is null)
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select studymeta_gateway_test.assert_true(
  'active administrator can list students',
  (select count(*) from studymeta_api.admin_list_students(true, 100)) = 5
);
select studymeta_gateway_test.assert_true(
  'active administrator can read one learner current State',
  (select count(*) from studymeta_api.admin_list_current_states(
    (select learner_id from studymeta_api.admin_list_students(true, 100)
     where current_state_count = 1 order by learner_id limit 1)
  )) = 1
);
select studymeta_gateway_test.assert_true(
  'active administrator receives both restricted State logs',
  (select count(*) from studymeta_api.admin_list_state_change_log()) = 2
  and (select count(*) from studymeta_api.admin_list_non_change_log()) = 2
);
select studymeta_gateway_test.assert_true(
  'administrator log projection contains no raw fields',
  not exists (
    select 1
    from studymeta_api.admin_list_state_change_log() as logs
    cross join lateral jsonb_object_keys(to_jsonb(logs)) as keys(key)
    where keys.key in ('observation', 'source_payload', 'raw_message', 'reason_detail')
  )
);
select studymeta_gateway_test.expect_rejection(
  'administrator JWT cannot call server Auth audit',
  $$select * from studymeta_api.server_audit_auth_users()$$
);
select studymeta_gateway_test.expect_rejection(
  'administrator JWT cannot call server provisioning',
  $$select * from studymeta_api.server_provision_admin_roles(
    array['00000000-0000-4000-8000-000000000002']::uuid[],
    '00000000-0000-4000-8000-000000000004', 'forbidden')$$
);
select studymeta_gateway_test.expect_rejection(
  'administrator cannot read internal base tables directly',
  $$select * from studymeta_v2.state_heads$$
);
select studymeta_gateway_test.expect_rejection(
  'administrator cannot update State directly',
  $$update studymeta_v2.state_estimates set limitations = array['forbidden']$$
);
reset role;

select studymeta_gateway_test.assert_true(
  'no gateway function accepts an email authority parameter',
  not exists (
    select 1
    from pg_proc as procedures
    join pg_namespace as namespaces on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'studymeta_api'
      and pg_get_function_arguments(procedures.oid) ~* 'email'
  )
);

rollback;

select studymeta_gateway_test.assert_true(
  'runtime transaction leaves no Auth users behind',
  (select count(*) from auth.users) = 0
);

\echo 'PASS — StudyMeta v2 Stage 2B PostgreSQL runtime suite completed'
