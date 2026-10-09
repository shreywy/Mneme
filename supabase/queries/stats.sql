-- Usage numbers for signed-in accounts. Used by `npm run stats`. Signed-out (guest) use stays on people's
-- devices and isn't counted here.
select
  (select count(*) from auth.users) as accounts,
  (select count(*) from auth.users where created_at > now() - interval '7 days') as new_accounts_7d,
  (select count(*) from auth.users where created_at > now() - interval '30 days') as new_accounts_30d,
  (select count(distinct user_id) from public.reviews where updated_at > now() - interval '1 day') as studied_today,
  (select count(distinct user_id) from public.reviews where updated_at > now() - interval '7 days') as studied_7d,
  (select count(distinct user_id) from public.reviews where updated_at > now() - interval '30 days') as studied_30d,
  (select count(*) from public.decks where not deleted) as decks,
  (select count(*) from public.items where not deleted) as cards,
  (select count(*) from public.reviews where updated_at > now() - interval '7 days') as answers_7d,
  (select count(*) from public.reviews) as answers_all_time,
  (select count(*) from public.notes where not deleted) as notes_pages,
  (select count(*) from public.sheets where not deleted) as pages,
  (select count(*) from public.shares) as share_links,
  (select count(*) from public.feedback where status = 'new') as feedback_waiting;
