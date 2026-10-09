-- Totals for the README's live tiles (served as /stats.svg by functions/stats.svg.ts). Only counts, never
-- anything about a person. Signed-out use stays on people's devices and isn't counted.
-- ponytail: plain counts on every call; the endpoint caches for 30 minutes. Keep a running total if these get slow.
create or replace function public.public_stats()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'accounts', (select count(*) from auth.users),
    'accounts_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'studied_today', (select count(distinct user_id) from public.reviews where updated_at > now() - interval '1 day'),
    'studied_7d', (select count(distinct user_id) from public.reviews where updated_at > now() - interval '7 days'),
    'answers', (select count(*) from public.reviews where not deleted),
    'answers_7d', (select count(*) from public.reviews where not deleted and updated_at > now() - interval '7 days'),
    'decks', (select count(*) from public.decks where not deleted),
    'cards', (select count(*) from public.items where not deleted),
    'pages', (select count(*) from public.sheets where not deleted)
  );
$$;
revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
