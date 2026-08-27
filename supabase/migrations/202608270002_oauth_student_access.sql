create table if not exists public.student_auth_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists student_auth_links_student_id_idx
  on public.student_auth_links (student_id);

alter table public.student_auth_links enable row level security;

create or replace function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select student_id
  from public.student_auth_links
  where user_id = auth.uid()
  limit 1
$$;

revoke all on function public.current_student_id() from public;
grant execute on function public.current_student_id() to authenticated;

drop policy if exists student_auth_links_select_own on public.student_auth_links;
create policy student_auth_links_select_own
on public.student_auth_links for select
to authenticated
using (user_id = auth.uid());

drop policy if exists students_select_own on public.students;
create policy students_select_own
on public.students for select
to authenticated
using (id = public.current_student_id());

drop policy if exists student_profiles_select_own on public.student_profiles;
create policy student_profiles_select_own
on public.student_profiles for select
to authenticated
using (student_id = public.current_student_id());

drop policy if exists domain_states_select_own on public.domain_states;
create policy domain_states_select_own
on public.domain_states for select
to authenticated
using (student_id = public.current_student_id());

drop policy if exists learner_states_select_own on public.learner_states;
create policy learner_states_select_own
on public.learner_states for select
to authenticated
using (student_id = public.current_student_id());

drop policy if exists learning_events_select_own on public.learning_events;
create policy learning_events_select_own
on public.learning_events for select
to authenticated
using (student_id = public.current_student_id());

drop policy if exists learning_events_insert_own on public.learning_events;
create policy learning_events_insert_own
on public.learning_events for insert
to authenticated
with check (student_id = public.current_student_id());

grant select on public.student_auth_links to authenticated;
grant select on public.students to authenticated;
grant select on public.student_profiles to authenticated;
grant select on public.domain_states to authenticated;
grant select on public.learner_states to authenticated;
grant select, insert on public.learning_events to authenticated;

comment on table public.student_auth_links is
  'Maps each Supabase Auth user to a learner identity. Multiple authorized team accounts may share one demo learner.';
