-- Team appearance only; authentication IDs and historical authors stay unchanged.
begin;
create table if not exists public.workboard_profiles (
  board_id text not null references public.workboard_boards(id) on delete cascade,
  user_id uuid not null references public.workboard_members(id) on delete cascade,
  display_name text not null check(char_length(display_name) between 1 and 32),
  photo_data text check(octet_length(photo_data) <= 350000),
  character_data text check(octet_length(character_data) <= 350000),
  has_photo boolean generated always as (photo_data is not null) stored,
  has_character boolean generated always as (character_data is not null) stored,
  companion_enabled boolean not null default true,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key(board_id,user_id)
);
alter table public.workboard_profiles enable row level security;
revoke all on public.workboard_profiles from anon, authenticated;
grant all on public.workboard_profiles to service_role;
commit;
