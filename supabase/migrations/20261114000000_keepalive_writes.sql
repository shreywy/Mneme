-- keepalive() used to run `select now()`, which touches no table. Supabase's inactivity scan didn't count it
-- (a pause warning came on 2026-11-14 with the twice-weekly ping still succeeding), so each ping now writes
-- one row. Only keepalive() writes it: anon and authenticated get nothing on the table.
create table if not exists public.keepalive_pings (
  id int primary key default 1 check (id = 1),
  at timestamptz not null default now(),
  pings bigint not null default 1
);
alter table public.keepalive_pings enable row level security;
alter table public.keepalive_pings force row level security;
revoke all on public.keepalive_pings from anon, authenticated;

-- Anyone can call it (the workflow uses the public key), so it writes at most once a minute.
create or replace function public.keepalive()
returns timestamptz
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.keepalive_pings as k (id) values (1)
  on conflict (id) do update set at = now(), pings = k.pings + 1
    where k.at < now() - interval '1 minute';
  select at from public.keepalive_pings where id = 1;
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
