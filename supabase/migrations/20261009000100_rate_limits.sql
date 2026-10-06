-- Rate limits for actions that make something reachable by other people. Each limited action records an
-- event; past the limit in the window, the write fails with 'rate_limited'. Events older than the window
-- are cleared as new ones come in, so the table stays small. The client can't read or write it.
create table if not exists public.rate_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  at timestamptz not null default now()
);
create index if not exists rate_events_lookup on public.rate_events (user_id, action, at);
alter table public.rate_events enable row level security;
alter table public.rate_events force row level security;
revoke all on public.rate_events from anon, authenticated;

-- ponytail: count-then-insert, so two writes racing at the limit can both pass; it bounds abuse, not exact counts.
create or replace function public._rate_limit(what text, max_count int, per interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n int;
begin
  if uid is null then return; end if; -- the database owner and migrations aren't limited
  delete from public.rate_events where user_id = uid and action = what and at < now() - per;
  select count(*) into n from public.rate_events where user_id = uid and action = what;
  if n >= max_count then
    raise exception 'rate_limited' using hint = format('At most %s per %s. Try again later.', max_count, per);
  end if;
  insert into public.rate_events (user_id, action) values (uid, what);
end;
$$;
revoke all on function public._rate_limit(text, int, interval) from public, anon, authenticated;

-- Publishing or updating a share link: 30 an hour. AFTER, so an upsert that updates counts once.
create or replace function public.limit_share_publishing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._rate_limit('share', 30, interval '1 hour');
  return null;
end;
$$;
drop trigger if exists limit_publishing on public.shares;
create trigger limit_publishing after insert or update on public.shares
  for each row execute function public.limit_share_publishing();
