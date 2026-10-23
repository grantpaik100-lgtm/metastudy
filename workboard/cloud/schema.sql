-- Independent workboard tables. No learner data or existing Auth settings are changed.
begin;
create table if not exists public.workboard_members (
  id uuid primary key, username text unique not null,
  password_hash text not null, password_changed boolean not null default false,
  enabled boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.workboard_boards (
  id text primary key, board jsonb not null, rev bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.workboard_changes (
  board_id text not null references public.workboard_boards(id), rev bigint not null,
  request_id uuid not null, user_id uuid not null references public.workboard_members(id),
  actor text not null, channel text not null, reason text not null default '',
  operations jsonb not null, before_board jsonb not null, after_board jsonb not null,
  created_at timestamptz not null default now(),
  primary key(board_id, rev), unique(board_id, request_id)
);
create table if not exists public.workboard_sessions (
  token_hash text primary key, user_id uuid not null references public.workboard_members(id),
  kind text not null check(kind in ('web','access','refresh','personal')),
  client_id text, family_id uuid not null, label text not null default '',
  scope text not null, resource text not null, expires_at timestamptz not null,
  consumed boolean not null default false, created_at timestamptz not null default now()
);
create index if not exists workboard_sessions_user on public.workboard_sessions(user_id);
create table if not exists public.workboard_oauth_clients (
  id text primary key, name text not null, redirect_uris jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.workboard_oauth_codes (
  code_hash text primary key, user_id uuid not null references public.workboard_members(id),
  client_id text not null references public.workboard_oauth_clients(id),
  redirect_uri text not null, challenge text not null, scope text not null, resource text not null,
  expires_at timestamptz not null, consumed boolean not null default false
);
create table if not exists public.workboard_presence (
  client_id text primary key, user_id uuid not null references public.workboard_members(id),
  name text not null, color text not null, editing text, mode text,
  seen_at timestamptz not null default now()
);
create table if not exists public.workboard_rate_limits (
  key text primary key, hits integer not null, expires_at timestamptz not null
);

-- Browser and MCP clients never receive the service key or direct SQL privileges.
alter table public.workboard_members enable row level security;
alter table public.workboard_boards enable row level security;
alter table public.workboard_changes enable row level security;
alter table public.workboard_sessions enable row level security;
alter table public.workboard_oauth_clients enable row level security;
alter table public.workboard_oauth_codes enable row level security;
alter table public.workboard_presence enable row level security;
alter table public.workboard_rate_limits enable row level security;
revoke all on public.workboard_members, public.workboard_boards, public.workboard_changes,
  public.workboard_sessions, public.workboard_oauth_clients, public.workboard_oauth_codes,
  public.workboard_presence, public.workboard_rate_limits from anon, authenticated;
grant all on public.workboard_members, public.workboard_boards, public.workboard_changes,
  public.workboard_sessions, public.workboard_oauth_clients, public.workboard_oauth_codes,
  public.workboard_presence, public.workboard_rate_limits to service_role;

-- Keep only affected records in history; full snapshots are reserved for imports.
create or replace function public.workboard_audit_slice(p_board jsonb,p_operations jsonb)
returns jsonb language sql immutable set search_path=public as $$
select case when exists(select 1 from jsonb_array_elements(p_operations) op where op->>'type'='replace') then p_board
else jsonb_build_object('projectName',p_board->'projectName','items',coalesce((
  select jsonb_agg(jsonb_build_object('collection',collection,'item',item-'history')) from (
    select 'screens' as collection,value as item from jsonb_array_elements(coalesce(p_board->'screens','[]'))
    union all select 'experiments',value from jsonb_array_elements(coalesce(p_board->'experiments','[]'))
    union all select 'links',value from jsonb_array_elements(coalesce(p_board->'links','[]'))
    union all select 'spatial.nodes',value from jsonb_array_elements(coalesce(p_board#>'{spatial,nodes}','[]'))
    union all select 'spatial.edges',value from jsonb_array_elements(coalesce(p_board#>'{spatial,edges}','[]'))
  ) items where exists(select 1 from jsonb_array_elements(p_operations) op
    where coalesce(op->>'id',op#>>'{item,id}') in (item->>'id',item->>'from',item->>'to'))
),'[]')) end;
$$;
revoke all on function public.workboard_audit_slice(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.workboard_audit_slice(jsonb,jsonb) to service_role;

create or replace function public.workboard_commit(
  p_board_id text, p_expected_rev bigint, p_board jsonb, p_request_id uuid,
  p_user_id uuid, p_channel text, p_reason text, p_operations jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare current_board workboard_boards; previous_change workboard_changes; member_name text;
begin
  select username into member_name from workboard_members where id=p_user_id and enabled;
  if member_name is null then raise exception 'Member unavailable'; end if;
  select * into current_board from workboard_boards where id=p_board_id for update;
  if not found then raise exception 'Board unavailable'; end if;
  select * into previous_change from workboard_changes where board_id=p_board_id and request_id=p_request_id;
  if found then
    if previous_change.user_id<>p_user_id then raise exception 'Request owner mismatch'; end if;
    if previous_change.operations#>>'{0,requestHash}' is distinct from p_operations#>>'{0,requestHash}' then return jsonb_build_object('error','idempotency_conflict'); end if;
    return jsonb_build_object('ok',true,'rev',previous_change.rev,'duplicate',true);
  end if;
  if current_board.rev<>p_expected_rev then return jsonb_build_object('conflict',true); end if;
  update workboard_boards set board=p_board, rev=rev+1, updated_at=now() where id=p_board_id;
  insert into workboard_changes(board_id,rev,request_id,user_id,actor,channel,reason,operations,before_board,after_board)
    values(p_board_id,current_board.rev+1,p_request_id,p_user_id,member_name,p_channel,
      left(p_reason,2000),p_operations,workboard_audit_slice(current_board.board,p_operations),workboard_audit_slice(p_board,p_operations));
  return jsonb_build_object('ok',true,'rev',current_board.rev+1);
end $$;

create or replace function public.workboard_rate_limit(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path = public as $$
declare count_hits integer;
begin
  insert into workboard_rate_limits(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
  on conflict(key) do update set
    hits=case when workboard_rate_limits.expires_at<=now() then 1 else workboard_rate_limits.hits+1 end,
    expires_at=case when workboard_rate_limits.expires_at<=now() then now()+make_interval(secs=>p_seconds) else workboard_rate_limits.expires_at end
  returning hits into count_hits;
  return count_hits<=p_limit;
end $$;

create or replace function public.workboard_change_password(p_user_id uuid,p_expected_hash text,p_hash text)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  update workboard_members set password_hash=p_hash,password_changed=true
    where id=p_user_id and password_hash=p_expected_hash and enabled;
  if not found then return false; end if;
  delete from workboard_sessions where user_id=p_user_id;
  delete from workboard_oauth_codes where user_id=p_user_id;
  return true;
end $$;
revoke all on function public.workboard_commit(text,bigint,jsonb,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.workboard_rate_limit(text,integer,integer) from public,anon,authenticated;
revoke all on function public.workboard_change_password(uuid,text,text) from public,anon,authenticated;
grant execute on function public.workboard_commit(text,bigint,jsonb,uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.workboard_rate_limit(text,integer,integer) to service_role;
grant execute on function public.workboard_change_password(uuid,text,text) to service_role;
commit;
notify pgrst, 'reload schema';
