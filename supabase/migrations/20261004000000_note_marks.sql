-- Highlights, annotations and bookmarks on notes pages. Same shape and rules as the other synced tables:
-- one row per mark, the client's document in `doc`, owner-only access.
create table if not exists public.note_marks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 300),
  doc jsonb not null default '{}'::jsonb check (pg_column_size(doc) < 32768),
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  note_id text generated always as (doc ->> 'noteId') stored,
  primary key (user_id, id)
);
create index if not exists note_marks_user_updated_idx on public.note_marks (user_id, updated_at);
create index if not exists note_marks_note_idx on public.note_marks (user_id, note_id);
drop trigger if exists touch_updated_at on public.note_marks;
create trigger touch_updated_at before insert or update on public.note_marks for each row execute function public.touch_updated_at();

alter table public.note_marks enable row level security;
alter table public.note_marks force row level security;
drop policy if exists "owner can do anything with own rows" on public.note_marks;
create policy "owner can do anything with own rows" on public.note_marks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.note_marks from anon;
grant select, insert, update, delete on public.note_marks to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'note_marks') then
    alter publication supabase_realtime add table public.note_marks;
  end if;
end $$;
