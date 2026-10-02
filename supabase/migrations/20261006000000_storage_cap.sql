-- Per-account storage allowance. Every synced row and share counts toward its owner's total
-- (the size of its JSON as text, plus a small per-row overhead). Writes that grow an account past
-- its cap are refused with 'storage_full'; deletes, tombstones and settings always go through.
-- cap_bytes null means no limit (set by hand for the admin account, never from the client).
-- The counting triggers run AFTER the write: an upsert that hits a conflict fires both the insert and
-- the update BEFORE triggers, but only the update AFTER trigger, so it is counted once.
create table if not exists public.storage_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  bytes bigint not null default 0,
  cap_bytes bigint default 20971520
);
alter table public.storage_usage enable row level security;
alter table public.storage_usage force row level security;
drop policy if exists "owner can read own usage" on public.storage_usage;
create policy "owner can read own usage" on public.storage_usage for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.storage_usage from anon, authenticated;
grant select on public.storage_usage to authenticated;

-- Adds delta bytes to an account. Shrinking never fails and never creates a row (an account being
-- deleted cascades through here after its usage row may already be gone).
create or replace function public._add_storage(uid uuid, delta bigint, enforce boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  used bigint;
  cap bigint;
begin
  if delta = 0 or uid is null then return; end if;
  if delta < 0 then
    update public.storage_usage set bytes = greatest(bytes + delta, 0) where user_id = uid;
    return;
  end if;
  insert into public.storage_usage as s (user_id, bytes) values (uid, delta)
  on conflict (user_id) do update set bytes = s.bytes + delta
  returning s.bytes, s.cap_bytes into used, cap;
  if enforce and cap is not null and used > cap then
    raise exception 'storage_full' using hint = 'Delete pages or decks you no longer need.';
  end if;
end;
$$;
revoke all on function public._add_storage(uuid, bigint, boolean) from public, anon, authenticated;

create or replace function public._sync_row_bytes(id text, doc jsonb, deleted boolean)
returns bigint
language sql
immutable
set search_path = ''
as $$ select (case when deleted then 0 else octet_length(doc::text) end + octet_length(id) + 40)::bigint $$;

create or replace function public.count_sync_storage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  delta bigint := 0;
  uid uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    delta := delta - public._sync_row_bytes(old.id, old.doc, old.deleted);
    uid := old.user_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    delta := delta + public._sync_row_bytes(new.id, new.doc, new.deleted);
    uid := new.user_id;
  end if;
  perform public._add_storage(uid, delta, tg_table_name <> 'user_settings');
  return null;
end;
$$;

create or replace function public.count_share_storage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  delta bigint := 0;
  uid uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    delta := delta - (octet_length(old.payload::text) + octet_length(old.title) + 40);
    uid := old.owner;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    delta := delta + (octet_length(new.payload::text) + octet_length(new.title) + 40);
    uid := new.owner;
  end if;
  perform public._add_storage(uid, delta, true);
  return null;
end;
$$;

-- Count what is already stored.
insert into public.storage_usage (user_id, bytes)
select user_id, sum(b) from (
  select user_id, public._sync_row_bytes(id, doc, deleted) as b from public.folders
  union all select user_id, public._sync_row_bytes(id, doc, deleted) from public.decks
  union all select user_id, public._sync_row_bytes(id, doc, deleted) from public.items
  union all select user_id, public._sync_row_bytes(id, doc, deleted) from public.card_states
  union all select user_id, public._sync_row_bytes(id, doc, deleted) from public.reviews
  union all select user_id, public._sync_row_bytes(id, doc, deleted) from public.deck_records
  union all select user_id, public._sync_row_bytes(id, doc, deleted) from public.notes
  union all select user_id, public._sync_row_bytes(id, doc, deleted) from public.deck_note_links
  union all select user_id, public._sync_row_bytes(id, doc, deleted) from public.user_settings
  union all select user_id, public._sync_row_bytes(id, doc, deleted) from public.note_marks
  union all select owner, octet_length(payload::text) + octet_length(title) + 40 from public.shares
) t
group by user_id
on conflict (user_id) do update set bytes = excluded.bytes;

do $$
declare t text;
begin
  foreach t in array array['folders', 'decks', 'items', 'card_states', 'reviews', 'deck_records', 'notes', 'deck_note_links', 'user_settings', 'note_marks'] loop
    execute format('drop trigger if exists count_storage on public.%I', t);
    execute format('create trigger count_storage after insert or update or delete on public.%I for each row execute function public.count_sync_storage()', t);
  end loop;
end;
$$;
drop trigger if exists count_storage on public.shares;
create trigger count_storage after insert or update or delete on public.shares
  for each row execute function public.count_share_storage();
