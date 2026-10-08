-- Feedback nobody has dealt with yet, oldest first. Used by `npm run feedback`; see docs/feedback.md.
select id, created_at, kind, message, page, about, user_id is not null as signed_in
from public.feedback
where status = 'new'
order by created_at
limit 200;
