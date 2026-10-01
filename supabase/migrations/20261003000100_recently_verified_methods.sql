-- Supabase stamps a session made from an emailed code as "otp", "magiclink" or (first sign-in)
-- "email/signup" depending on the flow. All three prove the user just read their inbox.
create or replace function public.recently_verified(window_seconds int default 600)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as m
    where m ->> 'method' in ('otp', 'magiclink', 'email/signup')
      and (m ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - window_seconds
  )
$$;
