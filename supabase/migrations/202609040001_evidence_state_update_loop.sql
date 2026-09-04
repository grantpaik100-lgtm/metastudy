alter table public.learning_events
  add column if not exists skill_name text,
  add column if not exists source_provider text,
  add column if not exists problem_id text,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists idempotency_key text;

alter table public.learning_events
  drop constraint if exists learning_events_source_allowed;
alter table public.learning_events
  add constraint learning_events_source_allowed
  check (
    source in (
      'chatgpt', 'claude', 'external_ai', 'ai_tutor', 'learning_app', 'lms',
      'camera', 'quiz', 'manual'
    )
  );

alter table public.learning_events
  drop constraint if exists learning_events_time_order;
alter table public.learning_events
  add constraint learning_events_time_order
  check (started_at is null or ended_at is null or ended_at >= started_at);

create unique index if not exists learning_events_idempotency_idx
  on public.learning_events (student_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.derived_evidence (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  domain text not null,
  skill_id text not null,
  evidence_type text not null,
  value jsonb,
  source_event_id uuid not null references public.learning_events(id) on delete cascade,
  source_event_ids uuid[] not null,
  observed_at timestamptz not null,
  extractor text not null default 'source_reported',
  extractor_version text not null default 'unknown',
  extraction_confidence double precision not null,
  definition_version text not null default 'studymeta-evidence-v1',
  missing_reason text,
  ordinal integer not null,
  created_at timestamptz not null default now(),
  constraint derived_evidence_confidence_range
    check (extraction_confidence between 0 and 1),
  constraint derived_evidence_source_ordinal_key
    unique (source_event_id, ordinal)
);

create index if not exists derived_evidence_lookup_idx
  on public.derived_evidence (student_id, domain, skill_id, observed_at desc);

create table if not exists public.learner_state_estimates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  domain text not null,
  skill_id text not null,
  state_type text not null,
  value double precision,
  status text not null,
  confidence double precision,
  evidence_count integer not null default 0,
  effective_sample_size double precision not null default 0,
  last_updated timestamptz not null default now(),
  model_version text not null,
  supporting_event_ids uuid[] not null default '{}'::uuid[],
  limitation text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_state_estimates_key
    unique (student_id, domain, skill_id, state_type),
  constraint learner_state_estimates_type_allowed
    check (state_type in ('procedural_mastery', 'help_need', 'retrievability', 'transferability')),
  constraint learner_state_estimates_status_allowed
    check (status in ('verified', 'experimental', 'insufficient_evidence', 'withheld')),
  constraint learner_state_estimates_value_range
    check (value is null or value between 0 and 1),
  constraint learner_state_estimates_confidence_range
    check (confidence is null or confidence between 0 and 1),
  constraint learner_state_estimates_evidence_count_nonnegative
    check (evidence_count >= 0),
  constraint learner_state_estimates_effective_sample_nonnegative
    check (effective_sample_size >= 0)
);

create index if not exists learner_state_estimates_lookup_idx
  on public.learner_state_estimates (student_id, domain, skill_id, state_type);

drop trigger if exists learner_state_estimates_set_updated_at
  on public.learner_state_estimates;
create trigger learner_state_estimates_set_updated_at
before update on public.learner_state_estimates
for each row execute function public.set_updated_at();

create or replace function public.copy_event_evidence_to_derived()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  item_ordinal bigint;
begin
  delete from public.derived_evidence where source_event_id = new.id;
  for item, item_ordinal in
    select value, ordinality
    from jsonb_array_elements(new.evidence) with ordinality
  loop
    insert into public.derived_evidence (
      student_id,
      domain,
      skill_id,
      evidence_type,
      value,
      source_event_id,
      source_event_ids,
      observed_at,
      extractor,
      extractor_version,
      extraction_confidence,
      definition_version,
      missing_reason,
      ordinal
    ) values (
      new.student_id,
      new.domain,
      new.skill_id,
      item ->> 'type',
      item -> 'value',
      new.id,
      array[new.id],
      new.occurred_at,
      coalesce(item ->> 'extractor', 'source_reported'),
      coalesce(item ->> 'extractor_version', 'unknown'),
      coalesce((item ->> 'extractor_confidence')::double precision, 0),
      coalesce(item ->> 'definition_version', 'studymeta-evidence-v1'),
      item ->> 'missing_reason',
      item_ordinal::integer
    )
    on conflict (source_event_id, ordinal) do update set
      evidence_type = excluded.evidence_type,
      value = excluded.value,
      observed_at = excluded.observed_at,
      extractor = excluded.extractor,
      extractor_version = excluded.extractor_version,
      extraction_confidence = excluded.extraction_confidence,
      definition_version = excluded.definition_version,
      missing_reason = excluded.missing_reason;
  end loop;
  return new;
end;
$$;

drop trigger if exists learning_events_copy_derived_evidence
  on public.learning_events;
create trigger learning_events_copy_derived_evidence
after insert or update of evidence, occurred_at on public.learning_events
for each row execute function public.copy_event_evidence_to_derived();

insert into public.derived_evidence (
  student_id,
  domain,
  skill_id,
  evidence_type,
  value,
  source_event_id,
  source_event_ids,
  observed_at,
  extractor,
  extractor_version,
  extraction_confidence,
  definition_version,
  missing_reason,
  ordinal
)
select
  event.student_id,
  event.domain,
  event.skill_id,
  item.value ->> 'type',
  item.value -> 'value',
  event.id,
  array[event.id],
  event.occurred_at,
  coalesce(item.value ->> 'extractor', 'source_reported'),
  coalesce(item.value ->> 'extractor_version', 'unknown'),
  coalesce((item.value ->> 'extractor_confidence')::double precision, 0),
  coalesce(item.value ->> 'definition_version', 'studymeta-evidence-v1'),
  item.value ->> 'missing_reason',
  item.ordinality::integer
from public.learning_events as event
cross join lateral jsonb_array_elements(event.evidence) with ordinality as item(value, ordinality)
on conflict (source_event_id, ordinal) do nothing;

alter table public.derived_evidence enable row level security;
alter table public.learner_state_estimates enable row level security;

drop policy if exists derived_evidence_select_own on public.derived_evidence;
create policy derived_evidence_select_own
on public.derived_evidence for select
to authenticated
using (student_id = public.current_student_id());

drop policy if exists derived_evidence_insert_own on public.derived_evidence;
drop policy if exists derived_evidence_delete_own on public.derived_evidence;

drop policy if exists learner_state_estimates_select_own on public.learner_state_estimates;
create policy learner_state_estimates_select_own
on public.learner_state_estimates for select
to authenticated
using (student_id = public.current_student_id());

drop policy if exists learner_state_estimates_insert_own on public.learner_state_estimates;
drop policy if exists learner_state_estimates_update_own on public.learner_state_estimates;

drop policy if exists learner_states_insert_own on public.learner_states;
drop policy if exists learner_states_update_own on public.learner_states;

revoke insert, update, delete on public.derived_evidence from authenticated;
revoke insert, update, delete on public.learner_state_estimates from authenticated;
revoke insert, update, delete on public.learner_states from authenticated;
grant select on public.derived_evidence to authenticated;
grant select on public.learner_state_estimates to authenticated;

comment on table public.derived_evidence is
  'Versioned Evidence derived from immutable raw learning events. Low-confidence rows are preserved but may be withheld from State updates.';
comment on table public.learner_state_estimates is
  'Per-State estimates with evidence sufficiency, model version, provenance and explicit verified/experimental/insufficient/withheld status.';
comment on column public.learning_events.evidence is
  'Legacy event-local Evidence snapshot. derived_evidence is the authoritative versioned Evidence layer.';
