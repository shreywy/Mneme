-- Ink on pages (Text notes): one row per pen or highlighter stroke, same shape as every synced table.
do $$
declare t text := 'sheet_ink';
begin
  execute format($f$
    create table if not exists public.%1$I (
      user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
      id text not null check (char_length(id) between 1 and 300),
      doc jsonb not null default '{}'::jsonb check (pg_column_size(doc) < 262144),
      deleted boolean not null default false,
      updated_at timestamptz not null default clock_timestamp(),
      primary key (user_id, id)
    )$f$, t);
  execute format('create index if not exists %1$I on public.%2$I (user_id, updated_at)', t || '_user_updated_idx', t);
  execute format('drop trigger if exists touch_updated_at on public.%1$I', t);
  execute format('create trigger touch_updated_at before insert or update on public.%1$I for each row execute function public.touch_updated_at()', t);
  execute format('alter table public.%1$I enable row level security', t);
  execute format('alter table public.%1$I force row level security', t);
  execute format('drop policy if exists "owner can do anything with own rows" on public.%1$I', t);
  execute format($f$create policy "owner can do anything with own rows" on public.%1$I for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$f$, t);
  execute format('revoke all on public.%1$I from anon', t);
  execute format('grant select, insert, update, delete on public.%1$I to authenticated', t);
  execute format('drop trigger if exists count_storage on public.%1$I', t);
  execute format('create trigger count_storage after insert or update or delete on public.%1$I for each row execute function public.count_sync_storage()', t);
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
    execute format('alter publication supabase_realtime add table public.%I', t);
  end if;
end;
$$;

alter table public.sheet_ink add column if not exists sheet_id text generated always as (doc ->> 'sheetId') stored;
create index if not exists sheet_ink_sheet_idx on public.sheet_ink (user_id, sheet_id);

-- Pages can be shared by link like decks and notes.
alter table public.shares drop constraint if exists shares_kind_check;
alter table public.shares add constraint shares_kind_check check (kind in ('deck', 'note', 'sheet'));
