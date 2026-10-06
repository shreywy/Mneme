-- Pictures on pages, for signed-in accounts. A private bucket: each account can read, add and delete
-- only the files in its own folder (`<user id>/<picture id>.<ext>`). Nothing is public; other devices
-- download with the owner's session, and share links carry signed links that expire.
-- Each account gets 50 MB of pictures, checked before every upload. There is no update policy:
-- a picture never changes once stored, so it can't be swapped behind a share link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pictures', 'pictures', false, 4194304, array['image/webp', 'image/jpeg', 'image/png', 'image/gif', 'image/avif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Bytes of pictures the signed-in user already has. A function, so the upload policy doesn't query the
-- table it guards.
create or replace function public.picture_bytes()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects
  where bucket_id = 'pictures' and (storage.foldername(name))[1] = (select auth.uid())::text
$$;
revoke all on function public.picture_bytes() from public, anon;
grant execute on function public.picture_bytes() to authenticated;

drop policy if exists "pictures: owner reads" on storage.objects;
create policy "pictures: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "pictures: owner adds within allowance" on storage.objects;
create policy "pictures: owner adds within allowance" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pictures'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and public.picture_bytes() < 52428800
  );

drop policy if exists "pictures: owner deletes" on storage.objects;
create policy "pictures: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'pictures' and (storage.foldername(name))[1] = (select auth.uid())::text);
