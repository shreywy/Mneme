-- Two-step sign-in (an authenticator app, TOTP). Once someone has a verified authenticator, their data
-- can only be reached from a session that also passed the authenticator check (aal2): a stolen email
-- code or OAuth login on its own gets nothing. Accounts without one are unaffected.

-- Whether this session is allowed through: it passed the second step, or there is no second step.
create or replace function public.second_step_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
    or not exists (select 1 from auth.mfa_factors where user_id = (select auth.uid()) and status = 'verified')
$$;
revoke all on function public.second_step_ok() from public, anon;
grant execute on function public.second_step_ok() to authenticated;

-- A restrictive policy is ANDed with the owner-only policies already on each table.
-- Adding a policy locks its table, so take every lock up front, in one order, and give up after 15 s
-- rather than deadlock with an app that's syncing while this runs (if it times out, push again).
do $$
declare t text;
begin
  perform set_config('lock_timeout', '15s', true);
  lock table public.folders, public.decks, public.items, public.card_states, public.reviews, public.deck_records, public.notes,
    public.deck_note_links, public.user_settings, public.note_marks, public.sheets, public.sheet_blocks, public.sheet_ink,
    public.shares, public.profiles, public.storage_usage, public.account_events in access exclusive mode;
  foreach t in array array['folders', 'decks', 'items', 'card_states', 'reviews', 'deck_records', 'notes', 'deck_note_links',
    'user_settings', 'note_marks', 'sheets', 'sheet_blocks', 'sheet_ink', 'shares', 'profiles', 'storage_usage', 'account_events'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "second step when set up" on public.%I', t);
    execute format('create policy "second step when set up" on public.%I as restrictive for all to authenticated using ((select public.second_step_ok())) with check ((select public.second_step_ok()))', t);
  end loop;
end;
$$;

drop policy if exists "pictures and avatars: second step when set up" on storage.objects;
create policy "pictures and avatars: second step when set up" on storage.objects as restrictive for all to authenticated
  using (bucket_id not in ('pictures', 'avatars') or (select public.second_step_ok()))
  with check (bucket_id not in ('pictures', 'avatars') or (select public.second_step_ok()));

-- The account functions need it too.
create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, last_active timestamptz, user_agent text, ip text, current boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.second_step_ok() then raise exception 'second step needed' using errcode = '42501'; end if;
  return query
  select s.id, s.created_at, greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'utc'), s.user_agent, host(s.ip),
         s.id::text = coalesce((select auth.jwt()) ->> 'session_id', '')
  from auth.sessions s
  where s.user_id = (select auth.uid())
  order by 3 desc;
end;
$$;

create or replace function public.end_session(session uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  agent text;
begin
  if uid is null or not public.second_step_ok() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from auth.sessions where id = session and user_id = uid returning user_agent into agent;
  if not found then return false; end if;
  perform public._log_event(uid, 'device_signed_out', jsonb_build_object('device', left(coalesce(agent, ''), 300)));
  return true;
end;
$$;

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
  if not public.second_step_ok() then
    raise exception 'enter the code from your authenticator app first' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end
$$;
