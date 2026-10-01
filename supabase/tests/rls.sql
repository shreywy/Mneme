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

select 'RLS tests passed' as result;
rollback;
