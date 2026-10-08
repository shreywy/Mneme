-- Feedback from the sidebar's Send feedback button. Anyone can send it, signed in or not, through
-- send_feedback(); nobody can read it through the API. It's read and triaged with the CLI
-- (`npm run feedback`, see docs/feedback.md), which marks each row with what was done about it.
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- Null when sent signed out. Deleting the account deletes what it sent.
  user_id uuid references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bug', 'idea', 'other')),
  message text not null check (char_length(message) between 3 and 4000),
  -- Where it was sent from, with ids taken out (/write/:id).
  page text check (char_length(page) <= 200),
  -- Browser, screen size, build and recent errors.
  about jsonb not null default '{}' check (octet_length(about::text) <= 4000),
  status text not null default 'new' check (status in ('new', 'fixed', 'asked', 'declined', 'spam')),
  -- What was done about it: a commit, a reason, a question asked.
  note text
);
create index if not exists feedback_new on public.feedback (created_at) where status = 'new';
create index if not exists feedback_user on public.feedback (user_id);
alter table public.feedback enable row level security;
alter table public.feedback force row level security;
revoke all on public.feedback from anon, authenticated;

-- ponytail: signed-out feedback shares one hourly allowance rather than a per-person one, so nothing
-- about the sender (like an IP address) is kept. A flood can block other signed-out senders for an hour,
-- never signed-in ones.
create or replace function public.send_feedback(kind text, message text, page text default null, about jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n int;
begin
  if uid is not null then
    perform public._rate_limit('feedback', 10, interval '1 hour');
  else
    select count(*) into n from public.feedback where user_id is null and created_at > now() - interval '1 hour';
    if n >= 30 then
      raise exception 'rate_limited' using hint = 'Too much feedback from signed-out visitors this hour. Try again later, or sign in.';
    end if;
  end if;
  insert into public.feedback (user_id, kind, message, page, about)
  values (uid, kind, btrim(message), left(page, 200), coalesce(about, '{}'));
end;
$$;
revoke all on function public.send_feedback(text, text, text, jsonb) from public;
grant execute on function public.send_feedback(text, text, text, jsonb) to anon, authenticated;
