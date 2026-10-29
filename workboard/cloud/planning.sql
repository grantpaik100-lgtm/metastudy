begin;
create table if not exists public.workboard_plan_items (
 id uuid primary key, board_id text not null references public.workboard_boards(id) on delete cascade,
 kind text not null check(kind in ('phase','goal','task','event')), parent_id uuid references public.workboard_plan_items(id),
 title text not null check(char_length(title) between 1 and 160), notes text not null default '',
 owner_id uuid references public.workboard_members(id), start_date date, due_date date, start_time text, due_time text,
 category text not null default 'team' check(category in ('team','startup')), event_type text not null default '기타',
 url text not null default '', status text not null default 'todo' check(status in ('todo','doing','done','cancelled')),
 archived boolean not null default false, version integer not null default 1,
 created_by uuid not null references public.workboard_members(id), updated_by uuid not null references public.workboard_members(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(due_date is null or start_date is null or due_date>=start_date)
);
create index if not exists workboard_plan_items_board on public.workboard_plan_items(board_id);
create table if not exists public.workboard_plan_edits (
 id bigint generated always as identity primary key, board_id text not null references public.workboard_boards(id) on delete cascade,
 item_id uuid not null references public.workboard_plan_items(id) on delete cascade,
 actor text not null, channel text not null, before_value jsonb, after_value jsonb not null, created_at timestamptz not null default now()
);
create index if not exists workboard_plan_edits_item on public.workboard_plan_edits(board_id,item_id,id desc);
create table if not exists public.workboard_polls (
 id uuid primary key, board_id text not null references public.workboard_boards(id) on delete cascade, experiment_id text not null,
 question text not null, options jsonb not null check(jsonb_array_length(options) between 2 and 6), ends_at timestamptz,
 closed boolean not null default false, version integer not null default 1, created_by uuid not null references public.workboard_members(id),
 created_at timestamptz not null default now()
);
create index if not exists workboard_polls_experiment on public.workboard_polls(board_id,experiment_id);
create table if not exists public.workboard_votes (
 poll_id uuid not null references public.workboard_polls(id) on delete cascade,
 user_id uuid not null references public.workboard_members(id) on delete cascade, choice integer not null,
 primary key(poll_id,user_id)
);
-- Deliberately no author, account identifier, IP, or precise creation timestamp.
-- Feedback is outside board state/audit exports, so public revision history cannot reveal its author.
create table if not exists public.workboard_anonymous_feedback (
 id uuid primary key, board_id text not null references public.workboard_boards(id) on delete cascade,
 experiment_id text not null, body text not null check(char_length(body) between 1 and 3000)
);
create index if not exists workboard_feedback_experiment on public.workboard_anonymous_feedback(board_id,experiment_id);
alter table public.workboard_plan_items enable row level security;
alter table public.workboard_plan_edits enable row level security;
alter table public.workboard_polls enable row level security;
alter table public.workboard_votes enable row level security;
alter table public.workboard_anonymous_feedback enable row level security;
revoke all on public.workboard_plan_items,public.workboard_plan_edits,public.workboard_polls,public.workboard_votes,public.workboard_anonymous_feedback from anon,authenticated;
grant all on public.workboard_plan_items,public.workboard_plan_edits,public.workboard_polls,public.workboard_votes,public.workboard_anonymous_feedback to service_role;
grant usage,select on sequence public.workboard_plan_edits_id_seq to service_role;

create or replace function public.workboard_save_plan_item(p_board text,p_id uuid,p_version integer,p_user uuid,p_actor text,p_channel text,p_value jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare old_row workboard_plan_items; new_row workboard_plan_items; parent_row workboard_plan_items; parent_uuid uuid;
begin
 -- Serialize hierarchy changes too: archiving a parent cannot race creation of a child.
 perform pg_advisory_xact_lock(hashtext('plan:'||p_board));
 select * into old_row from workboard_plan_items where id=p_id for update;
 if found then
  if old_row.board_id<>p_board or old_row.version<>p_version then return jsonb_build_object('error','conflict'); end if;
  if old_row.kind<>p_value->>'kind' then return jsonb_build_object('error','kind'); end if;
 elsif p_version<>0 then return jsonb_build_object('error','conflict'); end if;
 parent_uuid=nullif(p_value->>'parent_id','')::uuid;
 if parent_uuid is not null then
  select * into parent_row from workboard_plan_items where id=parent_uuid and board_id=p_board and not archived;
  if not found or not ((p_value->>'kind'='goal' and parent_row.kind='phase') or (p_value->>'kind'='task' and parent_row.kind='goal')) then return jsonb_build_object('error','parent'); end if;
 end if;
 if (p_value->>'archived')::boolean and exists(select 1 from workboard_plan_items where parent_id=p_id and not archived) then return jsonb_build_object('error','children'); end if;
 insert into workboard_plan_items(id,board_id,kind,parent_id,title,notes,owner_id,start_date,due_date,start_time,due_time,category,event_type,url,status,archived,version,created_by,updated_by)
 values(p_id,p_board,p_value->>'kind',parent_uuid,p_value->>'title',p_value->>'notes',nullif(p_value->>'owner_id','')::uuid,nullif(p_value->>'start_date','')::date,nullif(p_value->>'due_date','')::date,nullif(p_value->>'start_time',''),nullif(p_value->>'due_time',''),p_value->>'category',p_value->>'event_type',p_value->>'url',p_value->>'status',(p_value->>'archived')::boolean,1,p_user,p_user)
 on conflict(id) do update set parent_id=excluded.parent_id,title=excluded.title,notes=excluded.notes,owner_id=excluded.owner_id,start_date=excluded.start_date,due_date=excluded.due_date,start_time=excluded.start_time,due_time=excluded.due_time,category=excluded.category,event_type=excluded.event_type,url=excluded.url,status=excluded.status,archived=excluded.archived,version=workboard_plan_items.version+1,updated_by=p_user,updated_at=now()
 returning * into new_row;
 insert into workboard_plan_edits(board_id,item_id,actor,channel,before_value,after_value) values(p_board,p_id,p_actor,p_channel,case when old_row.id is null then null else to_jsonb(old_row) end,to_jsonb(new_row));
 return jsonb_build_object('item',to_jsonb(new_row));
end $$;
create or replace function public.workboard_cast_vote(p_board text,p_poll uuid,p_user uuid,p_choice integer)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare poll workboard_polls;
begin
 select * into poll from workboard_polls where id=p_poll and board_id=p_board for update;
 if not found then return jsonb_build_object('error','missing'); end if;
 if poll.closed or poll.ends_at<=clock_timestamp() then return jsonb_build_object('error','closed'); end if;
 if p_choice is null then delete from workboard_votes where poll_id=p_poll and user_id=p_user;
 else
  if p_choice<0 or p_choice>=jsonb_array_length(poll.options) then return jsonb_build_object('error','choice'); end if;
  insert into workboard_votes(poll_id,user_id,choice) values(p_poll,p_user,p_choice) on conflict(poll_id,user_id) do update set choice=excluded.choice;
 end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.workboard_save_plan_item(text,uuid,integer,uuid,text,text,jsonb),public.workboard_cast_vote(text,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.workboard_save_plan_item(text,uuid,integer,uuid,text,text,jsonb),public.workboard_cast_vote(text,uuid,uuid,integer) to service_role;
commit;
