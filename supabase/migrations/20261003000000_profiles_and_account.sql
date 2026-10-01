-- Profiles, profile pictures, and account deletion.

-- ---------- profiles ----------
-- One row per user. Owner-only for now; when public decks arrive, a read policy for other users
-- can expose username and avatar (and nothing else lives here).
create table public.profiles (
  id uuid primary key default auth.uid() references auth.users on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_.-]{3,24}$'),
  -- {"kind":"letter","color":"#4F6B3A"} | {"kind":"icon","icon":"flame","color":"…"} | {"kind":"image","path":"<uid>/avatar.webp","v":<ms>}
  avatar jsonb not null default '{"kind":"letter"}' check (pg_column_size(avatar) < 1024),
  updated_at timestamptz not null default clock_timestamp()
);
-- Usernames are unique regardless of case: "Shrey" and "shrey" can't both exist.
create unique index profiles_username_key on public.profiles (lower(username));
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
create policy "owner can read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "owner can create own profile" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "owner can update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

-- Is a username free? Callable before saving, without exposing anyone's profile.
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles p where lower(p.username) = lower(name) and p.id <> auth.uid())
$$;
revoke all on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

-- ---------- profile pictures ----------
-- Public bucket (pictures are shown to the owner's other devices, later to other users); each user
-- may only write inside a folder named after their own id. 100 KB cap; the app uploads ~20 KB WebP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 102400, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "users upload their own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users replace their own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users delete their own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users list their own avatar" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- re-authentication ----------
-- True when the current session came from entering an emailed code in the last 10 minutes.
-- Supabase records how a session was created in the JWT's "amr" claim.
create or replace function public.recently_verified(window_seconds int default 600)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as m
    where m ->> 'method' = 'otp'
      and (m ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - window_seconds
  )
$$;
revoke all on function public.recently_verified(int) from public, anon;
grant execute on function public.recently_verified(int) to authenticated;

-- ---------- account deletion ----------
-- Deletes the caller's auth user; every table's user_id foreign key cascades, so all their rows go too.
-- Refuses unless the caller has just confirmed an emailed code, so a stolen session alone can't do it.
-- The app removes the profile picture from storage first (storage files aren't removed by SQL).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not public.recently_verified() then
    raise exception 'confirm with an emailed code first' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
