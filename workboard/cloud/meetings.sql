-- Team communication is independent of the learner model and board graph.
begin;
alter table public.workboard_presence add column if not exists board_id text;
create table if not exists public.workboard_rooms (
 id uuid primary key, board_id text not null references public.workboard_boards(id),
 title text not null, created_by uuid not null references public.workboard_members(id),
 created_at timestamptz not null default now(), ended_at timestamptz,
 recording boolean not null default false, summary jsonb not null default '{}',
 summary_version integer not null default 0, summary_by text, summary_at timestamptz,
 links jsonb not null default '[]'
);
create table if not exists public.workboard_chat (
 id uuid primary key, board_id text not null references public.workboard_boards(id),
 channel text not null, room_id uuid references public.workboard_rooms(id) on delete cascade,
 user_id uuid not null references public.workboard_members(id), author text not null,
 text text not null default '', reply_to uuid references public.workboard_chat(id),
 attachments jsonb not null default '[]', created_at timestamptz not null default now()
);
create index if not exists workboard_chat_scope on public.workboard_chat(board_id,channel,created_at);
create table if not exists public.workboard_call_peers (
 id uuid primary key, room_id uuid not null references public.workboard_rooms(id) on delete cascade,
 user_id uuid not null references public.workboard_members(id), name text not null,
 muted boolean not null default false, sharing boolean not null default false,
 seen_at timestamptz not null default now(), joined_at timestamptz not null default now()
);
create index if not exists workboard_call_peers_room on public.workboard_call_peers(room_id,seen_at);
create table if not exists public.workboard_call_signals (
 id bigint generated always as identity primary key,
 room_id uuid not null references public.workboard_rooms(id) on delete cascade,
 sender uuid not null, recipient uuid not null, payload jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists workboard_call_signals_recipient on public.workboard_call_signals(room_id,recipient,id);
create table if not exists public.workboard_media (
 id uuid primary key, board_id text not null references public.workboard_boards(id),
 room_id uuid references public.workboard_rooms(id) on delete cascade,
 user_id uuid not null references public.workboard_members(id), author text not null,
 kind text not null check(kind in ('audio','attachment')), name text not null,
 mime text not null, size bigint not null, object_path text unique not null,
 started_at timestamptz, duration double precision,
 created_at timestamptz not null default now(), expires_at timestamptz, deleted_at timestamptz,
 ready boolean not null default false,
 transcript jsonb, transcript_version integer not null default 0,
 transcript_by text, transcript_at timestamptz
);
create index if not exists workboard_media_room on public.workboard_media(board_id,room_id,created_at);
create table if not exists public.workboard_meeting_notices (
 id uuid primary key default gen_random_uuid(), board_id text not null references public.workboard_boards(id),
 room_id uuid not null references public.workboard_rooms(id) on delete cascade,
 stage text not null, title text not null, created_at timestamptz not null default now(),
 unique(room_id,stage)
);
create table if not exists public.workboard_meeting_reads (
 notice_id uuid not null references public.workboard_meeting_notices(id) on delete cascade,
 user_id uuid not null references public.workboard_members(id), read_at timestamptz not null default now(),
 primary key(notice_id,user_id)
);
create table if not exists public.workboard_meeting_edits (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.workboard_rooms(id) on delete cascade,
 actor text not null, kind text not null, before_value jsonb not null, after_value jsonb not null,
 created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['rooms','chat','call_peers','call_signals','media','meeting_notices','meeting_reads','meeting_edits'] loop
 execute format('alter table public.workboard_%I enable row level security',t);
 execute format('revoke all on public.workboard_%I from anon,authenticated',t);
 execute format('grant all on public.workboard_%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.workboard_call_signals_id_seq to service_role;

-- Lock the room for membership admission and recording transitions.
create or replace function public.workboard_join_call(p_room uuid,p_peer uuid,p_user uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare r workboard_rooms; n text;
begin
 select * into r from workboard_rooms where id=p_room for update;
 if not found or r.ended_at is not null then return jsonb_build_object('error','closed'); end if;
 select username into n from workboard_members where id=p_user and enabled;
 if n is null then return jsonb_build_object('error','unauthorized'); end if;
 if exists(select 1 from workboard_call_peers where id=p_peer and (user_id<>p_user or room_id<>p_room)) then return jsonb_build_object('error','owner'); end if;
 if exists(select 1 from workboard_call_peers where room_id=p_room and user_id=p_user and id<>p_peer and seen_at>now()-interval '45 seconds') then return jsonb_build_object('error','duplicate'); end if;
 if (select count(*) from workboard_call_peers where room_id=p_room and id<>p_peer and seen_at>now()-interval '45 seconds')>=3 then return jsonb_build_object('error','full'); end if;
 insert into workboard_call_peers(id,room_id,user_id,name) values(p_peer,p_room,p_user,n)
 on conflict(id) do update set seen_at=now();
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.workboard_join_call(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.workboard_join_call(uuid,uuid,uuid) to service_role;

create or replace function public.workboard_save_meeting_summary(p_room uuid,p_version integer,p_value jsonb,p_actor text)
returns boolean language plpgsql security invoker set search_path=public as $$
declare old_value jsonb;
begin
 select summary into old_value from workboard_rooms where id=p_room and summary_version=p_version for update;
 if not found then return false; end if;
 update workboard_rooms set summary=p_value,summary_version=summary_version+1,summary_by=p_actor,summary_at=now() where id=p_room;
 insert into workboard_meeting_edits(room_id,actor,kind,before_value,after_value) values(p_room,p_actor,'summary',old_value,p_value);
 return true;
end $$;
revoke all on function public.workboard_save_meeting_summary(uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.workboard_save_meeting_summary(uuid,integer,jsonb,text) to service_role;
commit;
