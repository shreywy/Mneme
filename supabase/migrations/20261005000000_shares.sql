-- Share links: a read-only copy of a deck or notes page that anyone with the link can open.
-- The copy is a snapshot (no progress, highlights or annotations). Only its owner can see the table rows;
-- everyone else gets a share only through get_share(id), so shares can't be listed or guessed at.
create table if not exists public.shares (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{20,40}$'),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('deck', 'note')),
  source_id text not null check (char_length(source_id) between 1 and 300),
  title text not null check (char_length(title) between 1 and 200),
  payload jsonb not null check (pg_column_size(payload) < 3000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (owner, kind, source_id)
);
drop trigger if exists touch_updated_at on public.shares;
create trigger touch_updated_at before update on public.shares for each row execute function public.touch_updated_at();

alter table public.shares enable row level security;
alter table public.shares force row level security;
drop policy if exists "owner manages own shares" on public.shares;
create policy "owner manages own shares" on public.shares for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
revoke all on public.shares from anon;
grant select, insert, update, delete on public.shares to authenticated;

-- Open one share by its id. Works signed out. Returns nothing for an unknown id.
create or replace function public.get_share(share_id text)
returns table (kind text, title text, payload jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.kind, s.title, s.payload, s.updated_at from public.shares s where s.id = share_id
$$;
revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;
