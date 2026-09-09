\set ON_ERROR_STOP on

-- Fresh disposable PostgreSQL 15+ only. This fixture provides the minimum
-- Supabase-compatible roles and request claims and never contacts Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;

\ir ../../supabase/migrations/202609080001_studymeta_v2_foundation.sql
\ir ../../supabase/migrations/202609090001_studymeta_v2_identity_rbac.sql
\ir ../../supabase/migrations/202609090002_studymeta_v2_supabase_gateway.sql
\ir ../../supabase/migrations/202609090003_studymeta_v2_event_evidence.sql

create extension dblink;
create schema studymeta_stage3_test;
grant usage on schema studymeta_stage3_test to anon, authenticated, service_role;

create function studymeta_stage3_test.assert_true(label text, condition boolean)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'assertion failed: %', label;
  end if;
  raise notice 'PASS — %', label;
end;
$$;

create function studymeta_stage3_test.expect_rejection(label text, command text)
returns void language plpgsql as $$
declare rejected boolean := false; rejection_message text;
begin
  begin execute command;
  exception when others then
    rejected := true;
    rejection_message := sqlerrm;
  end;
  if not rejected then raise exception 'expected rejection did not occur: %', label; end if;
  raise notice 'PASS rejection — %: %', label, rejection_message;
end;
$$;

create function studymeta_stage3_test.command(
  p_session_id uuid,
  p_attempt_id uuid,
  p_source_ref_id uuid,
  p_idempotency_key text,
  p_external_event_id text default null
)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'schema_version', 'studymeta.v2',
    'event_type', 'attempt_submitted',
    'source', 'student_web',
    'source_provider_reported', null,
    'external_event_id', p_external_event_id,
    'idempotency_key', p_idempotency_key,
    'occurred_at', '2026-09-09T10:00:00.000Z',
    'started_at', null,
    'ended_at', null,
    'coordinates', jsonb_build_object(
      'session_id', p_session_id,
      'episode_id', null,
      'goal_ids', jsonb_build_array(),
      'assessment_goal_ids', jsonb_build_array(),
      'course_offering_id', null,
      'catalog_node_ids', jsonb_build_array(),
      'domain_id', 'calculus',
      'primary_concept_id', 'chain-rule',
      'supporting_concept_ids', jsonb_build_array(),
      'targets', jsonb_build_array(jsonb_build_object(
        'target_type', 'skill', 'target_id', 'chain-rule-apply',
        'target_version', 'fixture-v1', 'domain_id', 'calculus',
        'scope_id', 'single-variable', 'mapping_status', 'provisional',
        'mapping_revision_id', '00000000-0000-4000-8000-000000000090',
        'basis_refs', jsonb_build_array(p_source_ref_id)
      )),
      'focus_revision', 1,
      'catalog_version', null,
      'material_id', null,
      'task_id', null,
      'item_id', null,
      'step_id', null,
      'attempt_id', p_attempt_id,
      'intervention_instance_ids', jsonb_build_array()
    ),
    'observation', jsonb_build_object(
      'learner_actions', jsonb_build_array(),
      'assistant_actions', jsonb_build_array(),
      'answers', jsonb_build_array(),
      'assessments', jsonb_build_array(),
      'self_reports', jsonb_build_array(),
      'measurements', jsonb_build_array(),
      'support_trace', jsonb_build_object(
        'offered', false, 'requested', false, 'selected', false,
        'delivered', false, 'answer_exposed', false,
        'intervention_instance_ids', jsonb_build_array(),
        'coverage', 'complete', 'source_refs', jsonb_build_array()
      )
    ),
    'source_refs', jsonb_build_array(p_source_ref_id),
    'caused_by_event_id', null,
    'correction_of_event_id', null
  )
$$;

create function studymeta_stage3_test.record(
  p_auth_user_id uuid,
  p_connection_id uuid,
  p_command jsonb,
  p_payload_hash text,
  p_run_id uuid,
  p_max_attempt_policy text default 'derive-worker-fixture-v1'
)
returns table(event_id uuid, recorded_at timestamptz, duplicate boolean, processing_status text)
language sql as $$
  select * from studymeta_api.server_record_learning_event(
    p_auth_user_id, 'student', p_connection_id, p_command,
    p_command::text, p_payload_hash, p_run_id,
    'event-intake-fixture-v1', p_max_attempt_policy
  )
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'student-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000002', 'student-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000003', 'approver@example.invalid');

insert into studymeta_v2.sessions (
  id, learner_id, status, started_at, idle_deadline_at, timeout_policy_version
)
select ids.session_id, learners.id, 'active', '2026-09-09T09:00:00Z',
       '2026-09-10T09:00:00Z', 'fixture-explicit-v1'
from studymeta_v2.learners learners
join (values
  ('00000000-0000-4000-8000-000000000001'::uuid, '00000000-0000-4000-8000-000000000011'::uuid),
  ('00000000-0000-4000-8000-000000000002'::uuid, '00000000-0000-4000-8000-000000000012'::uuid)
) ids(auth_user_id, session_id) on ids.auth_user_id = learners.auth_user_id;

insert into studymeta_v2.episodes (id, learner_id, session_id, started_at, focus_revision)
select '00000000-0000-4000-8000-000000000023', learners.id,
       '00000000-0000-4000-8000-000000000012', '2026-09-09T09:10:00Z', 1
from studymeta_v2.learners learners
where learners.auth_user_id = '00000000-0000-4000-8000-000000000002';

insert into studymeta_v2.learning_attempts (
  id, learner_id, session_id, attempt_number, started_at
)
select ids.attempt_id, learners.id, ids.session_id, 1, '2026-09-09T09:30:00Z'
from studymeta_v2.learners learners
join (values
  ('00000000-0000-4000-8000-000000000001'::uuid,
   '00000000-0000-4000-8000-000000000011'::uuid,
   '00000000-0000-4000-8000-000000000021'::uuid),
  ('00000000-0000-4000-8000-000000000002'::uuid,
   '00000000-0000-4000-8000-000000000012'::uuid,
   '00000000-0000-4000-8000-000000000022'::uuid)
) ids(auth_user_id, session_id, attempt_id) on ids.auth_user_id = learners.auth_user_id;

insert into studymeta_v2.source_refs (
  id, learner_id, source_kind, content_ref, content_hash,
  availability, provenance_status
)
select ids.source_ref_id, learners.id, 'answer', ids.content_ref,
       'sha256:fixture', 'reference_only', 'server_captured'
from studymeta_v2.learners learners
join (values
  ('00000000-0000-4000-8000-000000000001'::uuid,
   '00000000-0000-4000-8000-000000000031'::uuid, 'opaque-answer-a'),
  ('00000000-0000-4000-8000-000000000002'::uuid,
   '00000000-0000-4000-8000-000000000032'::uuid, 'opaque-answer-b')
) ids(auth_user_id, source_ref_id, content_ref) on ids.auth_user_id = learners.auth_user_id;

insert into studymeta_v2.connections (
  id, learner_id, issuer, client_id, grants
)
select '00000000-0000-4000-8000-000000000041', learners.id,
       'fixture-issuer', 'fixture-client', array['record']
from studymeta_v2.learners learners
where learners.auth_user_id = '00000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.role', 'service_role', false);

select * from studymeta_stage3_test.record(
  '00000000-0000-4000-8000-000000000001', null,
  studymeta_stage3_test.command(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000031', 'runtime-request-0001'
  ), 'sha256:' || repeat('a', 64), '00000000-0000-4000-8000-000000000101'
);

select studymeta_stage3_test.assert_true(
  'Event intake atomically writes Event, references, target, and one outbox',
  (select count(*) = 1 from studymeta_v2.learning_events where idempotency_key = 'runtime-request-0001')
  and (select count(*) = 1 from studymeta_v2.event_source_refs)
  and (select count(*) = 1 from studymeta_v2.event_attempts)
  and (select count(*) = 1 from studymeta_v2.event_targets)
  and (select count(*) = 1 from studymeta_v2.outbox_jobs)
);

select studymeta_stage3_test.assert_true(
  'same payload returns the original Event receipt',
  (select count(*) = 1 and bool_and(duplicate)
   from studymeta_stage3_test.record(
    '00000000-0000-4000-8000-000000000001', null,
    studymeta_stage3_test.command(
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000031', 'runtime-request-0001'
    ), 'sha256:' || repeat('a', 64), '00000000-0000-4000-8000-000000000199'))
  and (select count(*) = 1 from studymeta_v2.outbox_jobs)
);

select studymeta_stage3_test.expect_rejection(
  'same idempotency key with another payload conflicts',
  $$select * from studymeta_stage3_test.record(
    '00000000-0000-4000-8000-000000000001', null,
    studymeta_stage3_test.command(
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000031', 'runtime-request-0001'
    ), 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    '00000000-0000-4000-8000-000000000198')$$
);

select * from studymeta_stage3_test.record(
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000041',
  studymeta_stage3_test.command(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000031', 'runtime-request-0002', 'provider-event-1'
  ), 'sha256:' || repeat('c', 64), '00000000-0000-4000-8000-000000000102'
);
select studymeta_stage3_test.assert_true(
  'same provider external Event ID and payload returns one Event',
  (select bool_and(duplicate) from studymeta_stage3_test.record(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000041',
    studymeta_stage3_test.command(
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000031', 'runtime-request-0003', 'provider-event-1'
    ), 'sha256:' || repeat('c', 64), '00000000-0000-4000-8000-000000000103'))
);
select studymeta_stage3_test.expect_rejection(
  'same provider external Event ID with another payload conflicts',
  $$select * from studymeta_stage3_test.record(
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000041',
    studymeta_stage3_test.command(
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000031', 'runtime-request-0004', 'provider-event-1'
    ), 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    '00000000-0000-4000-8000-000000000104')$$
);
select studymeta_stage3_test.expect_rejection(
  'another learner cannot use a connection they do not own',
  $$select * from studymeta_stage3_test.record(
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000041',
    studymeta_stage3_test.command(
      '00000000-0000-4000-8000-000000000012',
      '00000000-0000-4000-8000-000000000022',
      '00000000-0000-4000-8000-000000000032', 'runtime-cross-connection', 'provider-event-2'
    ), 'sha256:abababababababababababababababababababababababababababababababab',
    '00000000-0000-4000-8000-000000000120')$$
);
select studymeta_stage3_test.expect_rejection(
  'strict DB boundary rejects client learner authority fields',
  $$select * from studymeta_stage3_test.record(
    '00000000-0000-4000-8000-000000000001', null,
    studymeta_stage3_test.command(
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000031', 'runtime-client-authority'
    ) || '{"learner_id":"00000000-0000-4000-8000-000000000002"}',
    'sha256:acacacacacacacacacacacacacacacacacacacacacacacacacacacacacac',
    '00000000-0000-4000-8000-000000000121')$$
);

select studymeta_stage3_test.expect_rejection(
  'cross-learner source reference rolls back Event and outbox',
  $$select * from studymeta_stage3_test.record(
    '00000000-0000-4000-8000-000000000001', null,
    studymeta_stage3_test.command(
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000032', 'runtime-cross-source'
    ), 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    '00000000-0000-4000-8000-000000000105')$$
);
select studymeta_stage3_test.expect_rejection(
  'cross-learner session reference rolls back the whole intake',
  $$select * from studymeta_stage3_test.record(
    '00000000-0000-4000-8000-000000000001', null,
    studymeta_stage3_test.command(
      '00000000-0000-4000-8000-000000000012',
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000031', 'runtime-cross-session'
    ), 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    '00000000-0000-4000-8000-000000000106')$$
);
select studymeta_stage3_test.expect_rejection(
  'cross-learner attempt reference rolls back the whole intake',
  $$select * from studymeta_stage3_test.record(
    '00000000-0000-4000-8000-000000000001', null,
    studymeta_stage3_test.command(
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000022',
      '00000000-0000-4000-8000-000000000031', 'runtime-cross-attempt'
    ), 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    '00000000-0000-4000-8000-000000000107')$$
);
select studymeta_stage3_test.expect_rejection(
  'cross-learner episode reference rolls back the whole intake',
  $$select * from studymeta_stage3_test.record(
    '00000000-0000-4000-8000-000000000001', null,
    jsonb_set(studymeta_stage3_test.command(
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000031', 'runtime-cross-episode'
    ), '{coordinates,episode_id}', '"00000000-0000-4000-8000-000000000023"'),
    'sha256:2222222222222222222222222222222222222222222222222222222222222222',
    '00000000-0000-4000-8000-000000000108')$$
);
select studymeta_stage3_test.assert_true(
  'rejected cross-owner intakes leave no Event or outbox',
  not exists (select 1 from studymeta_v2.learning_events where idempotency_key like 'runtime-cross-%')
  and (select count(*) = 2 from studymeta_v2.outbox_jobs)
);

select studymeta_stage3_test.expect_rejection(
  'Event originals cannot be updated',
  $$update studymeta_v2.learning_events set observation = '{}' where idempotency_key = 'runtime-request-0001'$$
);
select * from studymeta_stage3_test.record(
  '00000000-0000-4000-8000-000000000001', null,
  jsonb_set(
    jsonb_set(studymeta_stage3_test.command(
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000031', 'runtime-correction-0001'
    ), '{event_type}', '"correction"'),
    '{correction_of_event_id}',
    to_jsonb((select id::text from studymeta_v2.learning_events
              where idempotency_key = 'runtime-request-0001'))
  ), 'sha256:' || repeat('7', 64), '00000000-0000-4000-8000-000000000122'
);
select studymeta_stage3_test.assert_true(
  'correction is a new immutable Event linked to its original',
  (select count(*) = 2 from studymeta_v2.learning_events
   where idempotency_key in ('runtime-request-0001', 'runtime-correction-0001'))
  and (select correction_of_event_id = (
    select id from studymeta_v2.learning_events where idempotency_key = 'runtime-request-0001'
  ) from studymeta_v2.learning_events where idempotency_key = 'runtime-correction-0001')
);

-- Two concurrent duplicate requests serialize on the advisory transaction lock;
-- exactly one Event and one outbox job are committed.
create function studymeta_stage3_test.record_and_hold(p_run_id uuid)
returns boolean language plpgsql as $$
declare was_duplicate boolean;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  select duplicate into was_duplicate from studymeta_stage3_test.record(
    '00000000-0000-4000-8000-000000000001', null,
    studymeta_stage3_test.command(
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000031', 'runtime-concurrent-duplicate'
    ), 'sha256:' || repeat('0', 64), p_run_id
  );
  perform pg_sleep(1);
  return was_duplicate;
end;
$$;
select dblink_connect('event_a', 'host=127.0.0.1 port=' || current_setting('port') || ' dbname=' || current_database() || ' user=postgres');
select dblink_connect('event_b', 'host=127.0.0.1 port=' || current_setting('port') || ' dbname=' || current_database() || ' user=postgres');
select dblink_send_query('event_a', $$select studymeta_stage3_test.record_and_hold('00000000-0000-4000-8000-000000000131')$$);
select pg_sleep(0.1);
select dblink_send_query('event_b', $$select studymeta_stage3_test.record_and_hold('00000000-0000-4000-8000-000000000132')$$);
create temp table concurrent_event_results(was_duplicate boolean);
insert into concurrent_event_results select was_duplicate from dblink_get_result('event_a') as result(was_duplicate boolean);
insert into concurrent_event_results select was_duplicate from dblink_get_result('event_b') as result(was_duplicate boolean);
select dblink_disconnect('event_a');
select dblink_disconnect('event_b');
select studymeta_stage3_test.assert_true(
  'concurrent duplicate requests create one Event and one outbox',
  (select count(*) = 2 and count(*) filter (where was_duplicate) = 1
     and count(*) filter (where not was_duplicate) = 1 from concurrent_event_results)
  and (select count(*) = 1 from studymeta_v2.learning_events
       where idempotency_key = 'runtime-concurrent-duplicate')
  and (select count(*) = 1 from studymeta_v2.outbox_jobs jobs
       join studymeta_v2.learning_events events on events.id = jobs.event_id
       where events.idempotency_key = 'runtime-concurrent-duplicate')
);

update studymeta_v2.outbox_jobs
set status = 'completed', completed_at = clock_timestamp(),
    completion_hash = 'sha256:' || repeat('9', 64)
where status = 'pending';

select * from studymeta_stage3_test.record(
  '00000000-0000-4000-8000-000000000001', null,
  studymeta_stage3_test.command(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000031', 'runtime-lease-race'
  ), 'sha256:' || repeat('3', 64), '00000000-0000-4000-8000-000000000109'
);

create function studymeta_stage3_test.claim_and_hold(p_worker text)
returns uuid language plpgsql as $$
declare claimed_id uuid;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  select job_id into claimed_id from studymeta_api.server_claim_evidence_derivation(
    p_worker, 10000, 3, 'derive-worker-fixture-v1', array['research_only']
  );
  perform pg_sleep(1);
  return claimed_id;
end;
$$;

select dblink_connect('worker_a', 'host=127.0.0.1 port=' || current_setting('port') || ' dbname=' || current_database() || ' user=postgres');
select dblink_connect('worker_b', 'host=127.0.0.1 port=' || current_setting('port') || ' dbname=' || current_database() || ' user=postgres');
select dblink_send_query('worker_a', $$select studymeta_stage3_test.claim_and_hold('worker-a')$$);
select pg_sleep(0.1);
select dblink_send_query('worker_b', $$select studymeta_stage3_test.claim_and_hold('worker-b')$$);
create temp table lease_results(worker text, job_id uuid);
insert into lease_results select 'worker-a', job_id from dblink_get_result('worker_a') as result(job_id uuid);
insert into lease_results select 'worker-b', job_id from dblink_get_result('worker_b') as result(job_id uuid);
select dblink_disconnect('worker_a');
select dblink_disconnect('worker_b');
select studymeta_stage3_test.assert_true(
  'only one worker owns a leased job',
  (select count(job_id) = 1 from lease_results)
  and (select count(*) = 1 from studymeta_v2.outbox_jobs
       where status = 'processing' and lease_owner in ('worker-a', 'worker-b'))
);

create temp table no_rule_completion as
  select * from studymeta_api.server_complete_evidence_derivation(
    (select id from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000109'),
    (select lease_owner from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000109'),
    'studymeta-generation-registry-empty-v1', 'no_authorized_generation_rule',
    jsonb_build_object(
      'generation_release', 'studymeta-generation-registry-empty-v1',
      'source_event_id', (select event_id from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000109'),
      'evidence_ids', jsonb_build_array(), 'evidence_count', 0,
      'hold_reason_code', 'no_authorized_generation_rule',
      'derivation_policy_version', 'derive-worker-fixture-v1',
      'allowed_operational_modes', jsonb_build_array('research_only'),
      'operation_bindings', jsonb_build_array()
    ), jsonb_build_array(), 'sha256:' || repeat('4', 64)
  );
select studymeta_stage3_test.assert_true(
  'no authorized rule completes its job',
  (select count(*) = 1 and bool_and(not duplicate) from no_rule_completion)
  and (select status = 'completed' from studymeta_v2.outbox_jobs
       where run_id = '00000000-0000-4000-8000-000000000109')
);
select studymeta_stage3_test.assert_true(
  'no authorized rule preserves Event with zero Evidence',
  (select count(*) = 0 from studymeta_v2.derived_evidence)
  and (select result_manifest->>'hold_reason_code' = 'no_authorized_generation_rule'
       from studymeta_v2.derivation_runs where id = '00000000-0000-4000-8000-000000000109')
  and (select count(*) = 0 from studymeta_v2.state_estimates)
);

select * from studymeta_stage3_test.record(
  '00000000-0000-4000-8000-000000000001', null,
  studymeta_stage3_test.command(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000031', 'runtime-retry-dead-letter'
  ), 'sha256:' || repeat('5', 64), '00000000-0000-4000-8000-000000000110'
);
select * from studymeta_api.server_claim_evidence_derivation(
  'retry-worker', 10000, 2, 'derive-worker-fixture-v1', array['research_only']
);
select studymeta_stage3_test.assert_true(
  'first failed attempt becomes retryable',
  studymeta_api.server_fail_evidence_derivation(
    (select id from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000110'),
    'retry-worker', 'fixture_transient_error', 0, 2, 'derive-worker-fixture-v1'
  ) = 'failed'
);
select * from studymeta_api.server_claim_evidence_derivation(
  'retry-worker', 10000, 2, 'derive-worker-fixture-v1', array['research_only']
);
create temp table dead_letter_result as
  select studymeta_api.server_fail_evidence_derivation(
    (select id from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000110'),
    'retry-worker', 'fixture_terminal_error', 0, 2, 'derive-worker-fixture-v1'
  ) as status;
select studymeta_stage3_test.assert_true(
  'max attempt transitions the job to dead-letter',
  (select status = 'dead_letter' from dead_letter_result)
  and (select status = 'dead_letter' and dead_lettered_at is not null
       from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000110')
);

-- Every scientific/operational artifact below is test-only fixture data.
insert into studymeta_v2.evidence_definitions (
  evidence_type_id, definition_version, category, ordinal, name_ko,
  description, inclusion_criteria, exclusion_criteria, value_schema_version
) values ('correct', 'fixture-v1', 'PERFORMANCE', 1, '테스트 정답',
  '폐기용 DB fixture', '[]', '[]', 'fixture-v1');
insert into studymeta_v2.generation_rules (
  generation_rule_id, rule_version, evidence_type_id,
  evidence_definition_version, required_observation_fields,
  extractor_kind, artifact_digest, value_schema_version
) values ('fixture-correct-rule', 'fixture-v1', 'correct', 'fixture-v1',
  '[]', 'fixture_only', 'sha256:fixture-only', 'fixture-v1');
insert into studymeta_v2.validation_assessments (
  id, subject_kind, subject_id, subject_version, claim_id, scope_id,
  assessment_version, status, claim, scope, change_reason
) values
  ('00000000-0000-4000-8000-000000000201', 'evidence_definition',
   'correct', 'fixture-v1', 'fixture-claim', 'fixture-scope', 1,
   'not_assessed', 'fixture only',
   '{"population":null,"domain":null,"task_type":null,"learning_environment":null}',
   'test-only fixture'),
  ('00000000-0000-4000-8000-000000000202', 'generation_rule',
   'fixture-correct-rule', 'fixture-v1', 'fixture-claim', 'fixture-scope', 1,
   'not_assessed', 'fixture only',
   '{"population":null,"domain":null,"task_type":null,"learning_environment":null}',
   'test-only fixture');
insert into studymeta_v2.validation_snapshots (id, description)
values ('00000000-0000-4000-8000-000000000203', 'test-only fixture snapshot');
insert into studymeta_v2.validation_snapshot_items (snapshot_id, assessment_id) values
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000202');
update studymeta_v2.validation_snapshots set sealed_at = clock_timestamp()
where id = '00000000-0000-4000-8000-000000000203';
insert into studymeta_v2.operation_assignments (
  id, subject_kind, subject_id, subject_version, mode, allowed_scope,
  permitted_actions, policy_version, approver, reason, valid_from, expires_at
) values
  ('00000000-0000-4000-8000-000000000301', 'evidence_definition',
   'correct', 'fixture-v1', 'research_only', '{}',
   array['derive'], 'fixture-operation-v1', '00000000-0000-4000-8000-000000000003',
   'test-only fixture', '2026-09-01T00:00:00Z', null),
  ('00000000-0000-4000-8000-000000000302', 'generation_rule',
   'fixture-correct-rule', 'fixture-v1', 'research_only', '{}',
   array['derive'], 'fixture-operation-v1', '00000000-0000-4000-8000-000000000003',
   'test-only fixture', '2026-09-01T00:00:00Z', null),
  ('00000000-0000-4000-8000-000000000303', 'evidence_definition',
   'correct', 'fixture-v1', 'research_only', '{}',
   array['derive'], 'fixture-operation-v1', '00000000-0000-4000-8000-000000000003',
   'expired test-only fixture', '2000-01-01T00:00:00Z', '2001-01-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000304', 'evidence_definition',
   'correct', 'fixture-v1', 'disabled', '{}',
   array['derive'], 'fixture-operation-v1', '00000000-0000-4000-8000-000000000003',
   'disabled test-only fixture', '2026-09-01T00:00:00Z', null),
  ('00000000-0000-4000-8000-000000000305', 'evidence_definition',
   'correct', 'fixture-v1', 'research_only', '{}',
   array['display'], 'fixture-operation-v1', '00000000-0000-4000-8000-000000000003',
   'no-derive test-only fixture', '2026-09-01T00:00:00Z', null);

select * from studymeta_stage3_test.record(
  '00000000-0000-4000-8000-000000000001', null,
  studymeta_stage3_test.command(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000031', 'runtime-fixture-evidence'
  ), 'sha256:' || repeat('6', 64), '00000000-0000-4000-8000-000000000111'
);
select * from studymeta_api.server_claim_evidence_derivation(
  'evidence-worker', 60000, 3, 'derive-worker-fixture-v1', array['research_only']
);

create function studymeta_stage3_test.evidence(
  p_evidence_id uuid,
  p_basis_ref_id uuid,
  p_run_id uuid default '00000000-0000-4000-8000-000000000111'
) returns jsonb language sql stable as $$
  select jsonb_build_array(jsonb_build_object(
    'schema_version', 'studymeta.v2', 'evidence_id', p_evidence_id,
    'learner_id', jobs.owner_learner_id, 'evidence_type_id', 'correct',
    'definition_version', 'fixture-v1',
    'generation_rule', jsonb_build_object(
      'generation_rule_id', 'fixture-correct-rule',
      'generation_rule_version', 'fixture-v1'
    ),
    'derivation_run_id', jobs.run_id, 'event_id', jobs.event_id,
    'source_event_ids', jsonb_build_array(jobs.event_id),
    'basis_refs', jsonb_build_array(p_basis_ref_id),
    'targets', jsonb_build_array(jsonb_build_object(
      'target_type', 'skill', 'target_id', 'chain-rule-apply',
      'target_version', 'fixture-v1', 'domain_id', 'calculus',
      'scope_id', 'single-variable', 'mapping_status', 'provisional',
      'mapping_revision_id', '00000000-0000-4000-8000-000000000090',
      'basis_refs', jsonb_build_array(p_basis_ref_id)
    )),
    'value', true, 'value_status', 'observed',
    'value_schema_version', 'fixture-v1', 'detail', null, 'reason', null,
    'qualifiers', jsonb_build_object('fixture', true),
    'observation_confidence', 0.9, 'confidence_method', 'fixture-confidence-v1',
    'support_condition', 'independent', 'observation_group_id', p_evidence_id,
    'attempt_ids', jsonb_build_array('00000000-0000-4000-8000-000000000021'),
    'observed_at', '2026-09-09T10:00:00.000Z',
    'generated_at', '2026-09-09T10:00:01.000Z',
    'definition_validation_assessment_id', '00000000-0000-4000-8000-000000000201',
    'generation_validation_assessment_id', '00000000-0000-4000-8000-000000000202',
    'validation_snapshot_id', '00000000-0000-4000-8000-000000000203',
    'provenance_status', 'server_captured', 'supersedes_evidence_id', null
  ))
  from studymeta_v2.outbox_jobs jobs
  where jobs.run_id = p_run_id
$$;

create function studymeta_stage3_test.operation_binding(
  p_evidence_id uuid,
  p_definition_assignment_id uuid,
  p_generation_assignment_id uuid,
  p_mode text
) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'evidence_id', p_evidence_id,
    'operational_mode', p_mode,
    'definition_operation_assignment_id', p_definition_assignment_id,
    'generation_operation_assignment_id', p_generation_assignment_id
  )
$$;

create function studymeta_stage3_test.evidence_manifest(
  p_evidence_ids jsonb,
  p_policy_version text,
  p_allowed_modes jsonb,
  p_operation_bindings jsonb
) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'generation_release', 'fixture-registry-v1',
    'source_event_id', jobs.event_id,
    'evidence_ids', p_evidence_ids,
    'evidence_count', jsonb_array_length(p_evidence_ids),
    'hold_reason_code', null,
    'derivation_policy_version', p_policy_version,
    'allowed_operational_modes', p_allowed_modes,
    'operation_bindings', p_operation_bindings
  )
  from studymeta_v2.outbox_jobs jobs
  where jobs.run_id = '00000000-0000-4000-8000-000000000111'
$$;

-- Regression: code-declared mode must not override the exact DB assignments.
select * from studymeta_stage3_test.record(
  '00000000-0000-4000-8000-000000000001', null,
  studymeta_stage3_test.command(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000031', 'runtime-mode-mismatch'
  ), 'sha256:' || repeat('9', 64), '00000000-0000-4000-8000-000000000112',
  'derive-worker-production-v1'
);
select * from studymeta_api.server_claim_evidence_derivation(
  'production-worker', 60000, 3, 'derive-worker-production-v1', array['production']
);
select studymeta_stage3_test.expect_rejection(
  'production policy cannot use research-only assignments',
  $$select * from studymeta_api.server_complete_evidence_derivation(
    (select id from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000112'),
    'production-worker', 'fixture-registry-v1', null,
    jsonb_build_object(
      'generation_release', 'fixture-registry-v1',
      'source_event_id', (select event_id from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000112'),
      'evidence_ids', jsonb_build_array('00000000-0000-4000-8000-000000000213'),
      'evidence_count', 1, 'hold_reason_code', null,
      'derivation_policy_version', 'derive-worker-production-v1',
      'allowed_operational_modes', jsonb_build_array('production'),
      'operation_bindings', jsonb_build_array(jsonb_build_object(
        'evidence_id', '00000000-0000-4000-8000-000000000213',
        'operational_mode', 'production',
        'definition_operation_assignment_id', '00000000-0000-4000-8000-000000000301',
        'generation_operation_assignment_id', '00000000-0000-4000-8000-000000000302'
      ))
    ),
    studymeta_stage3_test.evidence(
      '00000000-0000-4000-8000-000000000213',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000112'
    ),
    'sha256:6666666666666666666666666666666666666666666666666666666666666666'
  )$$
);
select studymeta_stage3_test.assert_true(
  'mode rejection leaves Evidence, run, and outbox uncompleted',
  (select count(*) = 0 from studymeta_v2.derived_evidence
   where derivation_run_id = '00000000-0000-4000-8000-000000000112')
  and (select status = 'processing' from studymeta_v2.derivation_runs
       where id = '00000000-0000-4000-8000-000000000112')
  and (select status = 'processing' and completion_hash is null
       from studymeta_v2.outbox_jobs
       where run_id = '00000000-0000-4000-8000-000000000112')
);

select studymeta_stage3_test.expect_rejection(
  'expired assignment is rejected',
  $$select * from studymeta_api.server_complete_evidence_derivation(
    (select id from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000111'),
    'evidence-worker', 'fixture-registry-v1', null,
    studymeta_stage3_test.evidence_manifest(
      jsonb_build_array('00000000-0000-4000-8000-000000000211'),
      'derive-worker-fixture-v1', jsonb_build_array('research_only'),
      jsonb_build_array(studymeta_stage3_test.operation_binding(
        '00000000-0000-4000-8000-000000000211',
        '00000000-0000-4000-8000-000000000303',
        '00000000-0000-4000-8000-000000000302', 'research_only'))
    ),
    studymeta_stage3_test.evidence('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000031'),
    'sha256:6767676767676767676767676767676767676767676767676767676767676767'
  )$$
);
select studymeta_stage3_test.expect_rejection(
  'disabled assignment is rejected',
  $$select * from studymeta_api.server_complete_evidence_derivation(
    (select id from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000111'),
    'evidence-worker', 'fixture-registry-v1', null,
    studymeta_stage3_test.evidence_manifest(
      jsonb_build_array('00000000-0000-4000-8000-000000000211'),
      'derive-worker-fixture-v1', jsonb_build_array('research_only'),
      jsonb_build_array(studymeta_stage3_test.operation_binding(
        '00000000-0000-4000-8000-000000000211',
        '00000000-0000-4000-8000-000000000304',
        '00000000-0000-4000-8000-000000000302', 'research_only'))
    ),
    studymeta_stage3_test.evidence('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000031'),
    'sha256:6868686868686868686868686868686868686868686868686868686868686868'
  )$$
);
select studymeta_stage3_test.expect_rejection(
  'assignment without derive permission is rejected',
  $$select * from studymeta_api.server_complete_evidence_derivation(
    (select id from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000111'),
    'evidence-worker', 'fixture-registry-v1', null,
    studymeta_stage3_test.evidence_manifest(
      jsonb_build_array('00000000-0000-4000-8000-000000000211'),
      'derive-worker-fixture-v1', jsonb_build_array('research_only'),
      jsonb_build_array(studymeta_stage3_test.operation_binding(
        '00000000-0000-4000-8000-000000000211',
        '00000000-0000-4000-8000-000000000305',
        '00000000-0000-4000-8000-000000000302', 'research_only'))
    ),
    studymeta_stage3_test.evidence('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000031'),
    'sha256:6969696969696969696969696969696969696969696969696969696969696969'
  )$$
);
select studymeta_stage3_test.expect_rejection(
  'definition and generation assignment slots cannot be exchanged',
  $$select * from studymeta_api.server_complete_evidence_derivation(
    (select id from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000111'),
    'evidence-worker', 'fixture-registry-v1', null,
    studymeta_stage3_test.evidence_manifest(
      jsonb_build_array('00000000-0000-4000-8000-000000000211'),
      'derive-worker-fixture-v1', jsonb_build_array('research_only'),
      jsonb_build_array(studymeta_stage3_test.operation_binding(
        '00000000-0000-4000-8000-000000000211',
        '00000000-0000-4000-8000-000000000302',
        '00000000-0000-4000-8000-000000000301', 'research_only'))
    ),
    studymeta_stage3_test.evidence('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000031'),
    'sha256:7070707070707070707070707070707070707070707070707070707070707070'
  )$$
);
select studymeta_stage3_test.assert_true(
  'operation assignment failures leave no partial completion',
  (select count(*) = 0 from studymeta_v2.derived_evidence
   where derivation_run_id = '00000000-0000-4000-8000-000000000111')
  and (select status = 'processing' and result_manifest is null
       from studymeta_v2.derivation_runs
       where id = '00000000-0000-4000-8000-000000000111')
  and (select status = 'processing' and completion_hash is null
       from studymeta_v2.outbox_jobs
       where run_id = '00000000-0000-4000-8000-000000000111')
);

select studymeta_stage3_test.expect_rejection(
  'failed completion leaves no partial Evidence',
  $$select * from studymeta_api.server_complete_evidence_derivation(
    (select id from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000111'),
    'evidence-worker', 'fixture-registry-v1', null,
    studymeta_stage3_test.evidence_manifest(
      jsonb_build_array(
        '00000000-0000-4000-8000-000000000211',
        '00000000-0000-4000-8000-000000000212'
      ), 'derive-worker-fixture-v1', jsonb_build_array('research_only'),
      jsonb_build_array(
        studymeta_stage3_test.operation_binding(
          '00000000-0000-4000-8000-000000000211',
          '00000000-0000-4000-8000-000000000301',
          '00000000-0000-4000-8000-000000000302', 'research_only'),
        studymeta_stage3_test.operation_binding(
          '00000000-0000-4000-8000-000000000212',
          '00000000-0000-4000-8000-000000000301',
          '00000000-0000-4000-8000-000000000302', 'research_only')
      )
    ),
    studymeta_stage3_test.evidence('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000031')
      || studymeta_stage3_test.evidence('00000000-0000-4000-8000-000000000212', '00000000-0000-4000-8000-000000000032'),
    'sha256:7777777777777777777777777777777777777777777777777777777777777777'
  )$$
);
select studymeta_stage3_test.assert_true(
  'failed completion transaction retained the processing job but no Evidence rows',
  (select count(*) = 0 from studymeta_v2.derived_evidence
    where derivation_run_id = '00000000-0000-4000-8000-000000000111')
  and (select status = 'processing' from studymeta_v2.outbox_jobs
       where run_id = '00000000-0000-4000-8000-000000000111')
);

select * from studymeta_api.server_complete_evidence_derivation(
  (select id from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000111'),
  'evidence-worker', 'fixture-registry-v1', null,
  studymeta_stage3_test.evidence_manifest(
    jsonb_build_array('00000000-0000-4000-8000-000000000211'),
    'derive-worker-fixture-v1', jsonb_build_array('research_only'),
    jsonb_build_array(studymeta_stage3_test.operation_binding(
      '00000000-0000-4000-8000-000000000211',
      '00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-000000000302', 'research_only'))
  ),
  studymeta_stage3_test.evidence('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000031'),
  'sha256:8888888888888888888888888888888888888888888888888888888888888888'
);
select studymeta_stage3_test.assert_true(
  'Evidence completion stores exact source, basis, attempt, target, and validation bindings',
  (select count(*) = 1 from studymeta_v2.derived_evidence
   where derivation_run_id = '00000000-0000-4000-8000-000000000111'
     and definition_validation_assessment_id = '00000000-0000-4000-8000-000000000201'
     and generation_validation_assessment_id = '00000000-0000-4000-8000-000000000202'
     and validation_snapshot_id = '00000000-0000-4000-8000-000000000203'
     and definition_operation_assignment_id = '00000000-0000-4000-8000-000000000301'
     and generation_operation_assignment_id = '00000000-0000-4000-8000-000000000302'
     and operational_mode = 'research_only'
     and observation_confidence = 0.9 and confidence_method = 'fixture-confidence-v1')
  and (select derivation_policy_version = 'derive-worker-fixture-v1'
         and allowed_operational_modes = array['research_only']::text[]
       from studymeta_v2.derivation_runs
       where id = '00000000-0000-4000-8000-000000000111')
  and (select count(*) = 1 from studymeta_v2.evidence_source_events)
  and (select count(*) = 1 from studymeta_v2.evidence_basis_refs)
  and (select count(*) = 1 from studymeta_v2.evidence_attempts)
  and (select count(*) = 1 from studymeta_v2.evidence_targets)
  and (select count(*) = 0 from studymeta_v2.state_estimates)
  and (select count(*) = 0 from studymeta_v2.state_evaluations)
  and (select count(*) = 0 from studymeta_v2.state_heads)
);
select studymeta_stage3_test.assert_true(
  'retry completion does not duplicate Evidence',
  (select duplicate from studymeta_api.server_complete_evidence_derivation(
    (select id from studymeta_v2.outbox_jobs where run_id = '00000000-0000-4000-8000-000000000111'),
    'evidence-worker', 'fixture-registry-v1', null,
    studymeta_stage3_test.evidence_manifest(
      jsonb_build_array('00000000-0000-4000-8000-000000000211'),
      'derive-worker-fixture-v1', jsonb_build_array('research_only'),
      jsonb_build_array(studymeta_stage3_test.operation_binding(
        '00000000-0000-4000-8000-000000000211',
        '00000000-0000-4000-8000-000000000301',
        '00000000-0000-4000-8000-000000000302', 'research_only'))
    ),
    studymeta_stage3_test.evidence('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000031'),
    'sha256:8888888888888888888888888888888888888888888888888888888888888888'
  ))
  and (select count(*) = 1 from studymeta_v2.derived_evidence
       where derivation_run_id = '00000000-0000-4000-8000-000000000111')
);

select studymeta_stage3_test.assert_true(
  'anon and authenticated callers cannot execute Stage 3 server functions',
  not has_function_privilege('anon',
    'studymeta_api.server_record_learning_event(uuid,text,uuid,jsonb,text,text,uuid,text,text)', 'execute')
  and not has_function_privilege('authenticated',
    'studymeta_api.server_record_learning_event(uuid,text,uuid,jsonb,text,text,uuid,text,text)', 'execute')
  and has_function_privilege('service_role',
    'studymeta_api.server_record_learning_event(uuid,text,uuid,jsonb,text,text,uuid,text,text)', 'execute')
  and not has_schema_privilege('authenticated', 'studymeta_v2', 'usage')
);

\echo 'PASS — StudyMeta v2 Stage 3 PostgreSQL runtime suite completed'
