-- The devices signed in to your account, a way to sign one out, and a log of account events you can read.

-- Your sessions (one per signed-in browser), newest activity first. `current` marks the one asking.
create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, last_active timestamptz, user_agent text, ip text, current boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select s.id, s.created_at, greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'utc'), s.user_agent, host(s.ip),
         s.id::text = coalesce((select auth.jwt()) ->> 'session_id', '')
  from auth.sessions s
  where s.user_id = (select auth.uid())
  order by 3 desc;
end;
$$;
revoke all on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;

-- Account events: written only by the database (triggers and the functions below), readable only by
-- their owner, kept for 180 days.
create table if not exists public.account_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('share_created', 'share_updated', 'share_stopped', 'device_signed_out')),
  detail jsonb not null default '{}'
);
create index if not exists account_events_recent on public.account_events (user_id, at desc);
alter table public.account_events enable row level security;
alter table public.account_events force row level security;
drop policy if exists "owner reads own events" on public.account_events;
create policy "owner reads own events" on public.account_events for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.account_events from anon, authenticated;
grant select on public.account_events to authenticated;

create or replace function public._log_event(uid uuid, what text, info jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- An account being deleted takes its rows with it; nothing to log for it.
  if uid is null or not exists (select 1 from auth.users where id = uid) then return; end if;
  insert into public.account_events (user_id, kind, detail) values (uid, what, info);
  delete from public.account_events where user_id = uid and at < now() - interval '180 days';
end;
$$;
revoke all on function public._log_event(uuid, text, jsonb) from public, anon, authenticated;

-- Signs out one of your devices: its refresh tokens go, so it's signed out within the hour (when its
-- current access token runs out). Returns whether there was such a session.
create or replace function public.end_session(session uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  agent text;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from auth.sessions where id = session and user_id = uid returning user_agent into agent;
  if not found then return false; end if;
  perform public._log_event(uid, 'device_signed_out', jsonb_build_object('device', left(coalesce(agent, ''), 300)));
  return true;
end;
$$;
revoke all on function public.end_session(uuid) from public, anon;
grant execute on function public.end_session(uuid) to authenticated;

-- Share links: made, updated (a new copy published), turned off.
create or replace function public.log_share_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public._log_event(new.owner, 'share_created', jsonb_build_object('kind', new.kind, 'title', new.title));
  elsif tg_op = 'UPDATE' and new.payload is distinct from old.payload then
    perform public._log_event(new.owner, 'share_updated', jsonb_build_object('kind', new.kind, 'title', new.title));
  elsif tg_op = 'DELETE' then
    perform public._log_event(old.owner, 'share_stopped', jsonb_build_object('kind', old.kind, 'title', old.title));
  end if;
  return null;
end;
$$;
drop trigger if exists log_events on public.shares;
create trigger log_events after insert or update or delete on public.shares
  for each row execute function public.log_share_event();
