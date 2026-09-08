\set ON_ERROR_STOP on

-- Run only against a disposable PostgreSQL 15+ database after applying
-- 202609080001_studymeta_v2_foundation.sql. This file intentionally inserts no
-- production coefficients and rolls its entire fixture back at the end.
begin;

create schema studymeta_v2_test;

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

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003');

insert into studymeta_v2.learners (id, auth_user_id, display_name) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'runtime learner one'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', 'runtime learner two');

insert into studymeta_v2.domains (domain_id, version, name_ko, status)
values ('runtime-domain', '1.0', '런타임 검증 도메인', 'draft');

insert into studymeta_v2.skills (
  skill_id, version, domain_id, domain_version, name_ko, description, status
) values
  ('runtime-skill', '1.0', 'runtime-domain', '1.0', '런타임 스킬', '무결성 검증 전용', 'draft'),
  ('runtime-skill-two', '1.0', 'runtime-domain', '1.0', '런타임 스킬 2', '좌표 불일치 검증 전용', 'draft');

insert into studymeta_v2.evidence_definitions (
  evidence_type_id, definition_version, category, ordinal, name_ko, description,
  inclusion_criteria, exclusion_criteria, value_schema_version
) values
  ('correct', '1.0', 'PERFORMANCE', 1, '정답', '런타임 검증 전용', '{}', '{}', '1.0'),
  ('incorrect', '1.0', 'PERFORMANCE', 2, '오답', '런타임 검증 전용', '{}', '{}', '1.0');

insert into studymeta_v2.generation_rules (
  generation_rule_id, rule_version, evidence_type_id, evidence_definition_version,
  required_observation_fields, extractor_kind, artifact_digest, value_schema_version
) values
  ('correct-rule', '1.0', 'correct', '1.0', '[]', 'deterministic', 'sha256:correct-rule', '1.0'),
  ('incorrect-rule', '1.0', 'incorrect', '1.0', '[]', 'deterministic', 'sha256:incorrect-rule', '1.0');

insert into studymeta_v2.state_definitions (
  state_type, definition_version, state_group, ordinal, name_ko, description, value_role
) values ('procedural_mastery', '1.0', 'STUDENT_SKILL', 1, '절차 숙달', '런타임 검증 전용', 'learner_state');

insert into studymeta_v2.parameter_sets (
  parameter_set_id, parameter_set_version, parameter_schema, parameter_payload, canonical_artifact_digest
) values
  ('runtime-parameters', '1.0', '{"type":"object"}', '{"fixture":"opaque-v1"}', 'sha256:runtime-parameters-v1'),
  ('runtime-parameters', '2.0', '{"type":"object"}', '{"fixture":"opaque-v2"}', 'sha256:runtime-parameters-v2');

insert into studymeta_v2.state_update_rules (
  state_update_rule_id, rule_version, state_type, state_definition_version,
  target_scope_spec, eligibility_predicate, observation_grouping,
  parameter_set_id, parameter_set_version, estimator_artifact_digest
) values
  ('mastery-rule', '1.0', 'procedural_mastery', '1.0', '{}', '{}', '{}',
   'runtime-parameters', '1.0', 'sha256:mastery-rule'),
  ('mastery-rule-two', '1.0', 'procedural_mastery', '1.0', '{}', '{}', '{}',
   'runtime-parameters', '1.0', 'sha256:mastery-rule-two');

insert into studymeta_v2.scale_definitions (
  scale_definition_id, scale_definition_version, state_type, state_definition_version,
  value_schema, interpretation
) values ('mastery-scale', '1.0', 'procedural_mastery', '1.0', '{"type":"number"}', '런타임 검증용 추상 척도');

-- A: assessments bind to real, exactly-versioned subjects.
select studymeta_v2_test.expect_rejection(
  'A unknown assessment subject',
  $$insert into studymeta_v2.validation_assessments
    (id, subject_kind, subject_id, subject_version, claim_id, scope_id,
     assessment_version, status, claim, scope, change_reason)
    values ('00000000-0000-0000-0000-000000000099', 'evidence_definition',
      'missing', '1.0', 'missing-claim', 'global', 1, 'not_assessed', 'fixture',
      '{"population":null,"domain":null,"task_type":null,"learning_environment":null}', 'fixture')$$
);

insert into studymeta_v2.validation_assessments (
  id, subject_kind, subject_id, subject_version, claim_id, scope_id,
  assessment_version, status, claim, scope, change_reason
) values
  ('00000000-0000-0000-0000-000000000101', 'evidence_definition', 'correct', '1.0', 'definition-claim', 'global', 1, 'not_assessed', 'fixture', '{"population":null,"domain":null,"task_type":null,"learning_environment":null}', 'fixture'),
  ('00000000-0000-0000-0000-000000000102', 'evidence_definition', 'incorrect', '1.0', 'incorrect-definition-claim', 'global', 1, 'not_assessed', 'fixture', '{"population":null,"domain":null,"task_type":null,"learning_environment":null}', 'fixture'),
  ('00000000-0000-0000-0000-000000000103', 'generation_rule', 'correct-rule', '1.0', 'generation-claim', 'global', 1, 'not_assessed', 'fixture', '{"population":null,"domain":null,"task_type":null,"learning_environment":null}', 'fixture'),
  ('00000000-0000-0000-0000-000000000104', 'generation_rule', 'incorrect-rule', '1.0', 'incorrect-generation-claim', 'global', 1, 'not_assessed', 'fixture', '{"population":null,"domain":null,"task_type":null,"learning_environment":null}', 'fixture'),
  ('00000000-0000-0000-0000-000000000105', 'state_update_rule', 'mastery-rule', '1.0', 'state-rule-claim', 'global', 1, 'not_assessed', 'fixture', '{"population":null,"domain":null,"task_type":null,"learning_environment":null}', 'fixture'),
  ('00000000-0000-0000-0000-000000000106', 'state_update_rule', 'mastery-rule-two', '1.0', 'state-rule-two-claim', 'global', 1, 'not_assessed', 'fixture', '{"population":null,"domain":null,"task_type":null,"learning_environment":null}', 'fixture');

insert into studymeta_v2.validation_assessments (
  id, subject_kind, subject_id, subject_version, claim_id, scope_id,
  assessment_version, status, claim, scope, limitations, reviewed_by,
  reviewed_at, previous_assessment_id, change_reason
) values
  ('00000000-0000-0000-0000-000000000107', 'generation_rule', 'correct-rule', '1.0',
   'lineage-claim', 'global', 1, 'under_review', 'lineage fixture',
   '{"population":null,"domain":null,"task_type":null,"learning_environment":null}',
   array['runtime fixture'], '00000000-0000-0000-0000-000000000003', now(), null, 'fixture base'),
  ('00000000-0000-0000-0000-000000000108', 'generation_rule', 'correct-rule', '1.0',
   'lineage-claim', 'global', 2, 'under_review', 'lineage fixture',
   '{"population":null,"domain":null,"task_type":null,"learning_environment":null}',
   array['runtime fixture'], '00000000-0000-0000-0000-000000000003', now(),
   '00000000-0000-0000-0000-000000000107', 'fixture continuation');

select studymeta_v2_test.expect_rejection(
  'A previous assessment from another subject',
  $$insert into studymeta_v2.validation_assessments
    (id, subject_kind, subject_id, subject_version, claim_id, scope_id,
     assessment_version, status, claim, scope, limitations, reviewed_by,
     reviewed_at, previous_assessment_id, change_reason)
    values ('00000000-0000-0000-0000-000000000109', 'generation_rule', 'correct-rule', '1.0',
      'lineage-claim', 'global', 3, 'under_review', 'lineage fixture',
      '{"population":null,"domain":null,"task_type":null,"learning_environment":null}',
      array['runtime fixture'], '00000000-0000-0000-0000-000000000003', now(),
      '00000000-0000-0000-0000-000000000106', 'invalid lineage fixture')$$
);

insert into studymeta_v2.validation_snapshots (id, description)
values
  ('00000000-0000-0000-0000-000000000201', 'complete runtime snapshot'),
  ('00000000-0000-0000-0000-000000000202', 'intentionally unrelated runtime snapshot');

insert into studymeta_v2.validation_snapshot_items (snapshot_id, assessment_id) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000103'),
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000105'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000104'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000106');

update studymeta_v2.validation_snapshots set sealed_at = now()
where id in ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202');

-- Sealed validation compositions and the seal transition itself are immutable.
select studymeta_v2_test.expect_rejection('sealed snapshot insert', $$insert into studymeta_v2.validation_snapshot_items values ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000102')$$);
select studymeta_v2_test.expect_rejection('sealed snapshot update', $$update studymeta_v2.validation_snapshot_items set assessment_id='00000000-0000-0000-0000-000000000102' where snapshot_id='00000000-0000-0000-0000-000000000201' and assessment_id='00000000-0000-0000-0000-000000000101'$$);
select studymeta_v2_test.expect_rejection('sealed snapshot delete', $$delete from studymeta_v2.validation_snapshot_items where snapshot_id='00000000-0000-0000-0000-000000000201' and assessment_id='00000000-0000-0000-0000-000000000101'$$);
select studymeta_v2_test.expect_rejection('snapshot reseal', $$update studymeta_v2.validation_snapshots set sealed_at=now() where id='00000000-0000-0000-0000-000000000201'$$);

insert into studymeta_v2.operation_assignments (
  id, subject_kind, subject_id, subject_version, mode, allowed_scope,
  policy_version, approver, reason, valid_from
) values ('00000000-0000-0000-0000-000000000211', 'evidence_definition', 'correct', '1.0',
  'research_only', '{}', 'runtime-policy', '00000000-0000-0000-0000-000000000003', 'fixture', now());

-- F: operational assignments cannot point at an invented subject/version.
select studymeta_v2_test.expect_rejection(
  'F unknown operation assignment subject',
  $$insert into studymeta_v2.operation_assignments
    (id, subject_kind, subject_id, subject_version, mode, allowed_scope,
     policy_version, approver, reason, valid_from)
    values ('00000000-0000-0000-0000-000000000212', 'generation_rule', 'missing-rule', '1.0',
      'research_only', '{}', 'runtime-policy', '00000000-0000-0000-0000-000000000003', 'fixture', now())$$
);

insert into studymeta_v2.sessions (
  id, learner_id, status, started_at, idle_deadline_at, timeout_policy_version
) values ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000011',
  'active', now(), now() + interval '1 hour', 'runtime-timeout');

insert into studymeta_v2.learning_events (
  id, schema_version, learner_id, actor_id, actor_type, event_type, source,
  connection_scope, session_id, idempotency_key, payload_hash, occurred_at,
  coordinates, observation
) values ('00000000-0000-0000-0000-000000000302', '1.0',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001',
  'student', 'attempt_submitted', 'runtime', 'local',
  '00000000-0000-0000-0000-000000000301', 'runtime-event-1', 'sha256:event-1', now(),
  '{"domain_id":"runtime-domain","skill_id":"runtime-skill"}', '{"result":"fixture"}');

insert into studymeta_v2.derivation_runs (
  id, learner_id, event_id, generation_release, status, started_at, completed_at
) values ('00000000-0000-0000-0000-000000000303',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000302',
  'runtime-release', 'completed', now(), now());

insert into studymeta_v2.derived_evidence (
  id, schema_version, learner_id, evidence_type_id, definition_version,
  generation_rule_id, generation_rule_version, derivation_run_id,
  representative_event_id, value, value_status, value_schema_version, detail,
  support_condition, observation_group_id, observed_at,
  definition_validation_assessment_id, generation_validation_assessment_id,
  validation_snapshot_id, provenance_status
) values ('00000000-0000-0000-0000-000000000304', '1.0',
  '00000000-0000-0000-0000-000000000011', 'correct', '1.0', 'correct-rule', '1.0',
  '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000302',
  '{"correct":true}', 'observed', '1.0', 'fixture', 'independent',
  '00000000-0000-0000-0000-000000000305', now(),
  '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000201', 'server_captured');

-- B/C/D: Evidence slots must use the right subject kinds, exact tuples, and snapshot membership.
select studymeta_v2_test.expect_rejection('B generation assessment in definition slot', $$insert into studymeta_v2.derived_evidence select '00000000-0000-0000-0000-000000000311',schema_version,learner_id,evidence_type_id,definition_version,generation_rule_id,generation_rule_version,derivation_run_id,representative_event_id,value,value_status,value_schema_version,detail,reason,qualifiers,observation_confidence,confidence_method,support_condition,'00000000-0000-0000-0000-000000000311',observed_at,generated_at,'00000000-0000-0000-0000-000000000103',generation_validation_assessment_id,validation_snapshot_id,provenance_status,null from studymeta_v2.derived_evidence where id='00000000-0000-0000-0000-000000000304'$$);
select studymeta_v2_test.expect_rejection('C other definition assessment', $$insert into studymeta_v2.derived_evidence select '00000000-0000-0000-0000-000000000312',schema_version,learner_id,evidence_type_id,definition_version,generation_rule_id,generation_rule_version,derivation_run_id,representative_event_id,value,value_status,value_schema_version,detail,reason,qualifiers,observation_confidence,confidence_method,support_condition,'00000000-0000-0000-0000-000000000312',observed_at,generated_at,'00000000-0000-0000-0000-000000000102',generation_validation_assessment_id,validation_snapshot_id,provenance_status,null from studymeta_v2.derived_evidence where id='00000000-0000-0000-0000-000000000304'$$);
select studymeta_v2_test.expect_rejection('D assessments absent from snapshot', $$insert into studymeta_v2.derived_evidence select '00000000-0000-0000-0000-000000000313',schema_version,learner_id,evidence_type_id,definition_version,generation_rule_id,generation_rule_version,derivation_run_id,representative_event_id,value,value_status,value_schema_version,detail,reason,qualifiers,observation_confidence,confidence_method,support_condition,'00000000-0000-0000-0000-000000000313',observed_at,generated_at,definition_validation_assessment_id,generation_validation_assessment_id,'00000000-0000-0000-0000-000000000202',provenance_status,null from studymeta_v2.derived_evidence where id='00000000-0000-0000-0000-000000000304'$$);

insert into studymeta_v2.input_manifests (
  id, learner_id, rule_artifacts, model_version, parameter_set_id,
  parameter_set_version, validation_snapshot_id, as_of, knowledge_cutoff, input_hash
) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000011',
   '[{"id":"mastery-rule","version":"1.0","digest":"sha256:mastery-rule"}]',
   'runtime-model', 'runtime-parameters', '1.0', '00000000-0000-0000-0000-000000000201',
   now(), now(), 'sha256:manifest-1'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000011',
   '[{"id":"mastery-rule","version":"1.0","digest":"sha256:mastery-rule"}]',
   'runtime-model', 'runtime-parameters', '1.0', '00000000-0000-0000-0000-000000000201',
   now(), now(), 'sha256:manifest-2');

insert into studymeta_v2.input_manifest_items (
  learner_id, input_manifest_id, ordinal, item_kind, evidence_id, included
) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000401', 0, 'evidence', '00000000-0000-0000-0000-000000000304', true),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000402', 0, 'evidence', '00000000-0000-0000-0000-000000000304', true);

-- Composite ownership rejects cross-learner references.
select studymeta_v2_test.expect_rejection('cross-learner manifest item', $$insert into studymeta_v2.input_manifest_items (learner_id,input_manifest_id,ordinal,item_kind,evidence_id,included) values ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000401',1,'evidence','00000000-0000-0000-0000-000000000304',true)$$);

update studymeta_v2.input_manifests set sealed_at = now()
where id in ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000402');

select studymeta_v2_test.expect_rejection('sealed manifest insert', $$insert into studymeta_v2.input_manifest_items (learner_id,input_manifest_id,ordinal,item_kind,event_id,included) values ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000401',1,'event','00000000-0000-0000-0000-000000000302',true)$$);
select studymeta_v2_test.expect_rejection('sealed manifest update', $$update studymeta_v2.input_manifest_items set included=false,exclusion_reason_code='fixture' where input_manifest_id='00000000-0000-0000-0000-000000000401'$$);
select studymeta_v2_test.expect_rejection('sealed manifest delete', $$delete from studymeta_v2.input_manifest_items where input_manifest_id='00000000-0000-0000-0000-000000000401'$$);
select studymeta_v2_test.expect_rejection('manifest reseal', $$update studymeta_v2.input_manifests set sealed_at=now() where id='00000000-0000-0000-0000-000000000401'$$);

insert into studymeta_v2.calculation_runs (
  id, learner_id, input_manifest_id, run_kind, status, started_at, completed_at
) values
  ('00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000401', 'initial', 'completed', now(), now()),
  ('00000000-0000-0000-0000-000000000412', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000402', 'initial', 'completed', now(), now());

insert into studymeta_v2.state_targets (
  id, learner_id, target_kind, domain_id, scope_id, knowledge_level, skill_id, skill_version
) values
  ('00000000-0000-0000-0000-000000000421', '00000000-0000-0000-0000-000000000011', 'knowledge', 'runtime-domain', 'runtime-scope', 'skill', 'runtime-skill', '1.0'),
  ('00000000-0000-0000-0000-000000000422', '00000000-0000-0000-0000-000000000011', 'knowledge', 'runtime-domain', 'runtime-scope', 'skill', 'runtime-skill-two', '1.0');

select studymeta_v2_test.expect_rejection('duplicate logical state target', $$insert into studymeta_v2.state_targets (id,learner_id,target_kind,domain_id,scope_id,knowledge_level,skill_id,skill_version) values ('00000000-0000-0000-0000-000000000423','00000000-0000-0000-0000-000000000011','knowledge','runtime-domain','runtime-scope','skill','runtime-skill','1.0')$$);

insert into studymeta_v2.state_estimates (
  id, learner_id, state_target_id, state_type, state_definition_version, value, status,
  scale_definition_id, scale_definition_version, evidence_count, observation_count,
  state_update_rule_id, state_update_rule_version, model_version,
  parameter_set_id, parameter_set_version, validation_snapshot_id,
  state_update_validation_assessment_id, operational_policy_version, operational_mode,
  calculation_run_id, input_manifest_id, calculation_input_hash, channel, as_of, computed_at
) values ('00000000-0000-0000-0000-000000000431',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000421',
  'procedural_mastery', '1.0', '{"band":"fixture"}', 'estimated',
  'mastery-scale', '1.0', 1, 1, 'mastery-rule', '1.0', 'runtime-model',
  'runtime-parameters', '1.0', '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000105', 'runtime-policy', 'research_only',
  '00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000401',
  'sha256:manifest-1', 'production', now(), now());

-- E/G: rule validation and parameter versions must match the exact rule and snapshot.
select studymeta_v2_test.expect_rejection('E wrong State rule assessment', $$insert into studymeta_v2.state_estimates select '00000000-0000-0000-0000-000000000432',learner_id,state_target_id,state_type,state_definition_version,value,status,unknown_reason,scale_definition_id,scale_definition_version,estimate_confidence,confidence_method_version,evidence_count,observation_count,effective_sample_size,state_update_rule_id,state_update_rule_version,model_version,parameter_set_id,parameter_set_version,validation_snapshot_id,'00000000-0000-0000-0000-000000000106',operational_policy_version,operational_mode,calculation_run_id,input_manifest_id,calculation_input_hash,channel,as_of,computed_at,recorded_at,supersedes_state_estimate_id,limitations,null from studymeta_v2.state_estimates where id='00000000-0000-0000-0000-000000000431'$$);
select studymeta_v2_test.expect_rejection('G mismatched parameter version', $$insert into studymeta_v2.state_estimates select '00000000-0000-0000-0000-000000000433',learner_id,state_target_id,state_type,state_definition_version,value,status,unknown_reason,scale_definition_id,scale_definition_version,estimate_confidence,confidence_method_version,evidence_count,observation_count,effective_sample_size,state_update_rule_id,state_update_rule_version,model_version,parameter_set_id,'2.0',validation_snapshot_id,state_update_validation_assessment_id,operational_policy_version,operational_mode,calculation_run_id,input_manifest_id,calculation_input_hash,channel,as_of,computed_at,recorded_at,supersedes_state_estimate_id,limitations,null from studymeta_v2.state_estimates where id='00000000-0000-0000-0000-000000000431'$$);

insert into studymeta_v2.estimate_evidence (learner_id, state_estimate_id, evidence_id, use_status)
values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000431', '00000000-0000-0000-0000-000000000304', 'used');
update studymeta_v2.state_estimates set sealed_at = now() where id='00000000-0000-0000-0000-000000000431';

select studymeta_v2_test.expect_rejection('sealed estimate insert', $$insert into studymeta_v2.estimate_evidence values ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000431','00000000-0000-0000-0000-000000000304','excluded','fixture')$$);
select studymeta_v2_test.expect_rejection('sealed estimate update', $$update studymeta_v2.estimate_evidence set use_status='excluded',reason_code='fixture' where state_estimate_id='00000000-0000-0000-0000-000000000431'$$);
select studymeta_v2_test.expect_rejection('sealed estimate delete', $$delete from studymeta_v2.estimate_evidence where state_estimate_id='00000000-0000-0000-0000-000000000431'$$);
select studymeta_v2_test.expect_rejection('estimate reseal', $$update studymeta_v2.state_estimates set sealed_at=now() where id='00000000-0000-0000-0000-000000000431'$$);

insert into studymeta_v2.state_evaluations (
  id, learner_id, state_target_id, state_type, channel, trigger_type, trigger_event_id,
  run_id, processing_status, decision, after_estimate_id, validation_snapshot_id,
  input_manifest_id, request_id, started_at, completed_at
) values ('00000000-0000-0000-0000-000000000441',
  '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000421',
  'procedural_mastery', 'production', 'event', '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000411', 'completed', 'updated',
  '00000000-0000-0000-0000-000000000431', '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000442', now(), now());

-- H/I: evaluation coordinates and run/manifest pairs cannot be mixed.
select studymeta_v2_test.expect_rejection('H evaluation target mismatch', $$insert into studymeta_v2.state_evaluations select '00000000-0000-0000-0000-000000000443',learner_id,'00000000-0000-0000-0000-000000000422',state_type,channel,trigger_type,trigger_event_id,run_id,processing_status,decision,reason_codes,reason_detail,before_estimate_id,after_estimate_id,candidate_estimate_id,changed_fields,validation_snapshot_id,policy_version,input_manifest_id,'00000000-0000-0000-0000-000000000443',started_at,completed_at from studymeta_v2.state_evaluations where id='00000000-0000-0000-0000-000000000441'$$);
select studymeta_v2_test.expect_rejection('I evaluation run manifest mismatch', $$insert into studymeta_v2.state_evaluations select '00000000-0000-0000-0000-000000000444',learner_id,state_target_id,state_type,channel,trigger_type,trigger_event_id,run_id,processing_status,decision,reason_codes,reason_detail,before_estimate_id,after_estimate_id,candidate_estimate_id,changed_fields,validation_snapshot_id,policy_version,'00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000444',started_at,completed_at from studymeta_v2.state_evaluations where id='00000000-0000-0000-0000-000000000441'$$);

-- RLS/private-by-default precondition: neither application role has schema or
-- table privileges. The runner also performs real SET ROLE queries that must fail.
do $$
begin
  if has_schema_privilege('anon', 'studymeta_v2', 'USAGE')
     or has_schema_privilege('authenticated', 'studymeta_v2', 'USAGE')
     or has_table_privilege('anon', 'studymeta_v2.learners', 'SELECT')
     or has_table_privilege('authenticated', 'studymeta_v2.learners', 'SELECT') then
    raise exception 'private-by-default privilege check failed';
  end if;
  raise notice 'PASS private-by-default privilege precondition';
end;
$$;

-- A rollback marker proves the fixture transaction leaves the migrated database clean.
select 'runtime validation completed; rolling back fixture' as result;
rollback;

do $$
begin
  if exists (select 1 from auth.users where id='00000000-0000-0000-0000-000000000001') then
    raise exception 'runtime fixture survived rollback';
  end if;
  if exists (select 1 from information_schema.schemata where schema_name='studymeta_v2_test') then
    raise exception 'runtime helper schema survived rollback';
  end if;
  raise notice 'PASS rollback cleanliness';
end;
$$;
