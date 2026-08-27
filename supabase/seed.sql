insert into public.students (id, display_name)
values ('00000000-0000-4000-8000-000000000001', 'Demo Student')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.student_profiles (
  student_id,
  preferred_explanation_depth,
  preferred_pace,
  preferred_interaction_style,
  example_preference,
  preferred_language
)
values (
  '00000000-0000-4000-8000-000000000001',
  'detailed',
  'step_by_step',
  'socratic',
  'example_first',
  'ko'
)
on conflict (student_id) do update set
  preferred_explanation_depth = excluded.preferred_explanation_depth,
  preferred_pace = excluded.preferred_pace,
  preferred_interaction_style = excluded.preferred_interaction_style,
  example_preference = excluded.example_preference,
  preferred_language = excluded.preferred_language;

insert into public.domain_states (
  student_id,
  domain,
  calibration,
  intervention_response,
  state_confidence
)
values (
  '00000000-0000-4000-8000-000000000001',
  'calculus',
  null,
  '{}'::jsonb,
  null
)
on conflict (student_id, domain) do update set
  calibration = excluded.calibration,
  intervention_response = excluded.intervention_response,
  state_confidence = excluded.state_confidence;

insert into public.learner_states (
  student_id,
  domain,
  skill_id,
  skill_name,
  conceptual_mastery,
  procedural_mastery,
  retrievability,
  transferability,
  help_need,
  misconceptions,
  state_confidence
)
values (
  '00000000-0000-4000-8000-000000000001',
  'calculus',
  'chain_rule',
  'Chain Rule',
  0.82,
  0.70,
  0.40,
  0.30,
  0.35,
  '[]'::jsonb,
  0.70
)
on conflict (student_id, domain, skill_id) do update set
  skill_name = excluded.skill_name,
  conceptual_mastery = excluded.conceptual_mastery,
  procedural_mastery = excluded.procedural_mastery,
  retrievability = excluded.retrievability,
  transferability = excluded.transferability,
  help_need = excluded.help_need,
  misconceptions = excluded.misconceptions,
  state_confidence = excluded.state_confidence;

insert into public.learning_events (
  id,
  student_id,
  domain,
  skill_id,
  source,
  event_type,
  raw_event,
  evidence,
  occurred_at
)
values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  'calculus',
  'chain_rule',
  'manual',
  'problem_attempt',
  '{"description":"Student solved a Chain Rule problem without a hint."}'::jsonb,
  '[{"type":"correct","value":true,"extractor_confidence":1.0},{"type":"independent_success","value":true,"extractor_confidence":0.95}]'::jsonb,
  now() - interval '1 day'
)
on conflict (id) do update set
  raw_event = excluded.raw_event,
  evidence = excluded.evidence,
  occurred_at = excluded.occurred_at;
