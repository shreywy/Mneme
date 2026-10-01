-- Row-level security tests. Runs inside a transaction that is always rolled back, so nothing persists.
-- Two throwaway users, A and B. Every check raises an exception if A can see or change B's data.
begin;

insert into auth.users (id, aud, role, email, instance_id)
values
  ('00000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'rls-a@test.invalid', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'rls-b@test.invalid', '00000000-0000-0000-0000-000000000000');

-- B writes a private deck.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
insert into public.decks (id, doc) values ('deck-b', '{"title":"B secret"}');
insert into public.items (id, doc) values ('deck-b|t1', '{"deckId":"deck-b","kind":"term"}');
insert into public.note_marks (id, doc) values ('mark-b', '{"noteId":"n1","kind":"note","text":"B private"}');

do $$
declare n int;
begin
  -- B sees its own rows, and user_id defaulted to B.
  select count(*) into n from public.decks where id = 'deck-b' and user_id = '00000000-0000-4000-8000-00000000000b';
  if n <> 1 then raise exception 'FAIL: B cannot see its own deck'; end if;
end $$;

-- Switch to A.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.decks;
  if n <> 0 then raise exception 'FAIL: A can read B''s decks (% rows)', n; end if;
  select count(*) into n from public.items;
  if n <> 0 then raise exception 'FAIL: A can read B''s items'; end if;
  select count(*) into n from public.note_marks;
  if n <> 0 then raise exception 'FAIL: A can read B''s highlights and annotations'; end if;
  update public.note_marks set doc = '{"text":"pwned"}' where id = 'mark-b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A changed B''s annotation'; end if;

  update public.decks set doc = '{"title":"pwned"}' where id = 'deck-b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A updated B''s deck'; end if;

  delete from public.decks where id = 'deck-b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A deleted B''s deck'; end if;

  -- A cannot write a row owned by B.
  begin
    insert into public.decks (user_id, id, doc) values ('00000000-0000-4000-8000-00000000000b', 'forged', '{}');
    raise exception 'FAIL: A inserted a row owned by B';
  exception when insufficient_privilege then null; -- expected: RLS with check blocks it
  end;

  -- A can use the same id for its own row without touching B's.
  insert into public.decks (id, doc) values ('deck-b', '{"title":"A copy"}');
  select count(*) into n from public.decks;
  if n <> 1 then raise exception 'FAIL: A should see exactly its own deck'; end if;
end $$;

-- Anonymous visitors see nothing at all.
reset role;
set local role anon;
do $$
begin
  perform 1 from public.decks;
  raise exception 'FAIL: anon can query decks';
exception when insufficient_privilege then null; -- expected
end $$;

reset role;
-- B's deck is unchanged.
do $$
declare t text;
begin
  select doc ->> 'title' into t from public.decks where user_id = '00000000-0000-4000-8000-00000000000b' and id = 'deck-b';
  if t is distinct from 'B secret' then raise exception 'FAIL: B''s deck was changed to %', t; end if;
end $$;

-- ---------- profiles ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
insert into public.profiles (username) values ('Bee');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.profiles;
  if n <> 0 then raise exception 'FAIL: A can read B''s profile'; end if;

  update public.profiles set username = 'pwned' where id = '00000000-0000-4000-8000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A renamed B'; end if;

  begin
    insert into public.profiles (id, username) values ('00000000-0000-4000-8000-00000000000b', 'forged');
    raise exception 'FAIL: A created a profile for B';
  exception when insufficient_privilege or unique_violation then null; -- expected
  end;

  if public.username_available('bee') then raise exception 'FAIL: "bee" shows as free though B is "Bee"'; end if;

  begin
    insert into public.profiles (username) values ('BEE');
    raise exception 'FAIL: usernames are not case-insensitively unique';
  exception when unique_violation then null; -- expected
  end;

  begin
    insert into public.profiles (username) values ('a b!');
    raise exception 'FAIL: a username with spaces was accepted';
  exception when check_violation then null; -- expected
  end;

  insert into public.profiles (username) values ('Aye');
end $$;

-- ---------- account deletion needs a fresh emailed code ----------
-- B's session without an OTP sign-in in the last 10 minutes: refused.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000b', 'role', 'authenticated',
  'amr', json_build_array(json_build_object('method', 'oauth', 'timestamp', extract(epoch from now())::bigint)))::text, true);
do $$
begin
  perform public.delete_my_account();
  raise exception 'FAIL: deleted an account without a fresh code';
exception when insufficient_privilege then null; -- expected
end $$;

-- An OTP from an hour ago doesn't count either.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000b', 'role', 'authenticated',
  'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint - 3600)))::text, true);
do $$
begin
  perform public.delete_my_account();
  raise exception 'FAIL: an hour-old code was accepted';
exception when insufficient_privilege then null; -- expected
end $$;

-- recently_verified() accepts a fresh emailed-code login however Supabase labels it.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000a', 'role', 'authenticated',
  'amr', json_build_array(json_build_object('method', 'magiclink', 'timestamp', extract(epoch from now())::bigint)))::text, true);
do $$ begin if not public.recently_verified() then raise exception 'FAIL: a fresh magiclink login was not accepted'; end if; end $$;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000a', 'role', 'authenticated',
  'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
do $$ begin if public.recently_verified() then raise exception 'FAIL: a password login counted as an emailed code'; end if; end $$;

-- A fresh code: B is deleted, and every row B owned goes with it. A is untouched.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-00000000000b', 'role', 'authenticated',
  'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select public.delete_my_account();

reset role;
do $$
declare n int;
begin
  select count(*) into n from auth.users where id = '00000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'FAIL: B still exists'; end if;
  select count(*) into n from public.decks where user_id = '00000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'FAIL: B''s decks survived deletion'; end if;
  select count(*) into n from public.profiles where id = '00000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'FAIL: B''s profile survived deletion'; end if;
  select count(*) into n from public.profiles where id = '00000000-0000-4000-8000-00000000000a';
  if n <> 1 then raise exception 'FAIL: A''s profile was affected'; end if;
end $$;

select 'RLS tests passed' as result;
rollback;
