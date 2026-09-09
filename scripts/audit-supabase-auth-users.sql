-- READ ONLY. Run in Supabase SQL Editor before Stage 2A migration.
-- Replace the empty array locally; never commit real administrator emails.
with requested_emails(target, email) as (
  select input.ordinality::integer, lower(btrim(input.value))
  from unnest(array[]::text[]) with ordinality as input(value, ordinality)
  where btrim(value) <> ''
),
target_matches as (
  select requested.target, count(users.id) as match_count
  from requested_emails as requested
  left join auth.users as users on lower(users.email) = requested.email
  group by requested.target
),
identity_counts as (
  select
    (select count(*) from auth.users) as total_auth_users,
    (select count(distinct learners.auth_user_id) from studymeta_v2.learners as learners)
      as already_linked_count,
    (select count(distinct roles.auth_user_id)
       from studymeta_v2.account_roles as roles
      where roles.role = 'student' and roles.revoked_at is null)
      as already_active_student_count,
    (select count(*) from auth.users as users
      where not exists (
        select 1 from studymeta_v2.learners as learners
        where learners.auth_user_id = users.id
      )) as expected_new_learner_count,
    (select count(*) from auth.users as users
      where not exists (
        select 1 from studymeta_v2.account_roles as roles
        where roles.auth_user_id = users.id
          and roles.role = 'student'
          and roles.revoked_at is null
      )) as expected_new_student_role_count,
    (select count(*) from (
      select learners.auth_user_id
      from studymeta_v2.learners as learners
      group by learners.auth_user_id
      having count(*) <> 1
    ) as conflicts) as identity_conflict_count,
    (select count(*) from (
      select roles.auth_user_id
      from studymeta_v2.account_roles as roles
      where roles.role = 'student' and roles.revoked_at is null
      group by roles.auth_user_id
      having count(*) > 1
    ) as conflicts) as active_student_role_conflict_count
)
select
  identity_counts.*,
  coalesce((
    select jsonb_agg(
      jsonb_build_object('target', targets.target, 'match_count', targets.match_count)
      order by targets.target
    )
    from (
      select target, match_count from target_matches
    ) as targets
  ), '[]'::jsonb) as admin_targets,
  true as read_only
from identity_counts;
