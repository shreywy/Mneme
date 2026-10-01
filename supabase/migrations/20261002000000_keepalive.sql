-- Free Supabase projects pause after a week without database activity.
-- A scheduled GitHub Action calls this so the project stays awake. It reads nothing.
create or replace function public.keepalive()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$ select now() $$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
