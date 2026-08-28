create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  preferred_explanation_depth text,
  preferred_pace text,
  preferred_interaction_style text,
  example_preference text,
  hint_preference text,
  direct_answer_preference text,
  general_learning_goal text,
  preferred_language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.domain_states (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  domain text not null,
  calibration text,
  intervention_response jsonb not null default '{}'::jsonb,
  state_confidence double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint domain_states_student_domain_key unique (student_id, domain),
  constraint domain_states_intervention_response_object
    check (jsonb_typeof(intervention_response) = 'object'),
  constraint domain_states_state_confidence_range
    check (state_confidence is null or state_confidence between 0 and 1)
);

create table if not exists public.learner_states (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  domain text not null,
  skill_id text not null,
  skill_name text not null,
  conceptual_mastery double precision,
  procedural_mastery double precision,
  retrievability double precision,
  transferability double precision,
  help_need double precision,
  misconceptions jsonb not null default '[]'::jsonb,
  state_confidence double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_states_student_domain_skill_key
    unique (student_id, domain, skill_id),
  constraint learner_states_conceptual_mastery_range
    check (conceptual_mastery is null or conceptual_mastery between 0 and 1),
  constraint learner_states_procedural_mastery_range
    check (procedural_mastery is null or procedural_mastery between 0 and 1),
  constraint learner_states_retrievability_range
    check (retrievability is null or retrievability between 0 and 1),
  constraint learner_states_transferability_range
    check (transferability is null or transferability between 0 and 1),
  constraint learner_states_help_need_range
    check (help_need is null or help_need between 0 and 1),
  constraint learner_states_state_confidence_range
    check (state_confidence is null or state_confidence between 0 and 1),
  constraint learner_states_misconceptions_array
    check (jsonb_typeof(misconceptions) = 'array')
);

create table if not exists public.learning_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  domain text not null,
  skill_id text not null,
  source text not null,
  event_type text not null default 'observation',
  raw_event jsonb not null,
  evidence jsonb not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint learning_events_source_allowed
    check (source in ('chatgpt', 'claude', 'camera', 'quiz', 'manual')),
  constraint learning_events_raw_event_object
    check (jsonb_typeof(raw_event) = 'object'),
  constraint learning_events_evidence_array
    check (jsonb_typeof(evidence) = 'array')
);

create index if not exists learner_states_lookup_idx
  on public.learner_states (student_id, domain, skill_id);

create index if not exists learning_events_recent_idx
  on public.learning_events (student_id, domain, skill_id, occurred_at desc);

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

drop trigger if exists student_profiles_set_updated_at on public.student_profiles;
create trigger student_profiles_set_updated_at
before update on public.student_profiles
for each row execute function public.set_updated_at();

drop trigger if exists domain_states_set_updated_at on public.domain_states;
create trigger domain_states_set_updated_at
before update on public.domain_states
for each row execute function public.set_updated_at();

drop trigger if exists learner_states_set_updated_at on public.learner_states;
create trigger learner_states_set_updated_at
before update on public.learner_states
for each row execute function public.set_updated_at();

alter table public.students enable row level security;
alter table public.student_profiles enable row level security;
alter table public.domain_states enable row level security;
alter table public.learner_states enable row level security;
alter table public.learning_events enable row level security;

comment on table public.student_profiles is
  'Global learner preferences. Preferences are distinct from measured intervention effectiveness.';
comment on table public.domain_states is
  'Per-student, per-domain state. Calculation is owned outside the MCP layer.';
comment on table public.learner_states is
  'Per-student, per-skill state. Calculation is owned outside the MCP layer.';
comment on table public.learning_events is
  'Append-only raw learning events with structured evidence kept in a separate JSONB field.';
