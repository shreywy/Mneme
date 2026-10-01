-- Mneme sync schema.
--
-- The app is local-first: the browser keeps its own IndexedDB copy and syncs rows here.
-- Every synced store has one table with the same shape:
--   user_id     owner (defaults to the caller, enforced by row-level security)
--   id          the row's key in the browser database
--   doc         the browser row as JSON
--   deleted     tombstone, so deletions reach the user's other devices
--   updated_at  set by the server on every write; clients pull "everything newer than my cursor"
-- Frequently queried fields are exposed as generated, indexed columns.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

-- Creates one synced table with its index, trigger and owner-only RLS policy.
create or replace function public._mneme_sync_table(tbl text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format($f$
    create table if not exists public.%1$I (
      user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
      id text not null check (char_length(id) between 1 and 300),
      doc jsonb not null default '{}'::jsonb check (pg_column_size(doc) < 262144),
      deleted boolean not null default false,
      updated_at timestamptz not null default clock_timestamp(),
      primary key (user_id, id)
    )$f$, tbl);
  execute format('create index if not exists %1$I on public.%2$I (user_id, updated_at)', tbl || '_user_updated_idx', tbl);
  execute format('drop trigger if exists touch_updated_at on public.%1$I', tbl);
  execute format('create trigger touch_updated_at before insert or update on public.%1$I for each row execute function public.touch_updated_at()', tbl);
  execute format('alter table public.%1$I enable row level security', tbl);
  execute format('alter table public.%1$I force row level security', tbl);
  execute format('drop policy if exists "owner can do anything with own rows" on public.%1$I', tbl);
  execute format($f$
    create policy "owner can do anything with own rows" on public.%1$I
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()))$f$, tbl);
  execute format('revoke all on public.%1$I from anon', tbl);
  execute format('grant select, insert, update, delete on public.%1$I to authenticated', tbl);
end;
$$;

select public._mneme_sync_table(t) from unnest(array[
  'folders', 'decks', 'items', 'card_states', 'reviews', 'deck_records', 'notes', 'deck_note_links', 'user_settings'
]) as t;

drop function public._mneme_sync_table(text);

-- Readable columns for the data people actually query (and for the schema diagram).
alter table public.folders add column if not exists name text generated always as (doc ->> 'name') stored;
alter table public.folders add column if not exists parent_id text generated always as (doc ->> 'parentId') stored;
alter table public.decks add column if not exists title text generated always as (doc ->> 'title') stored;
alter table public.decks add column if not exists folder_id text generated always as (doc ->> 'folderId') stored;
alter table public.items add column if not exists deck_id text generated always as (doc ->> 'deckId') stored;
alter table public.items add column if not exists kind text generated always as (doc ->> 'kind') stored;
alter table public.card_states add column if not exists deck_id text generated always as (doc ->> 'deckId') stored;
alter table public.reviews add column if not exists deck_id text generated always as (doc ->> 'deckId') stored;
alter table public.deck_records add column if not exists deck_id text generated always as (doc ->> 'deckId') stored;
alter table public.notes add column if not exists title text generated always as (doc ->> 'title') stored;
alter table public.deck_note_links add column if not exists note_id text generated always as (doc ->> 'noteId') stored;
alter table public.deck_note_links add column if not exists deck_id text generated always as (doc ->> 'deckId') stored;

create index if not exists items_deck_idx on public.items (user_id, deck_id);
create index if not exists card_states_deck_idx on public.card_states (user_id, deck_id);
create index if not exists reviews_deck_idx on public.reviews (user_id, deck_id);

-- Live updates across devices: the client subscribes to its own rows (RLS applies to Realtime too).
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['folders', 'decks', 'items', 'card_states', 'reviews', 'deck_records', 'notes', 'deck_note_links', 'user_settings'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
