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
insert into public.sheets (id, doc) values ('sheet-b', '{"title":"B page"}');
insert into public.sheet_blocks (id, doc) values ('block-b', '{"sheetId":"sheet-b","kind":"text"}');
insert into public.sheet_ink (id, doc) values ('ink-b', '{"sheetId":"sheet-b","tool":"pen","pts":[4,4,32]}');

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
  select count(*) into n from public.sheets;
  if n <> 0 then raise exception 'FAIL: A can read B''s pages'; end if;
  select count(*) into n from public.sheet_blocks;
  if n <> 0 then raise exception 'FAIL: A can read B''s page blocks'; end if;
  update public.sheet_blocks set doc = '{"kind":"pwned"}' where id = 'block-b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A changed B''s page block'; end if;
  select count(*) into n from public.sheet_ink;
  if n <> 0 then raise exception 'FAIL: A can read B''s ink'; end if;
  update public.sheet_ink set doc = '{"tool":"pwned"}' where id = 'ink-b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A changed B''s ink'; end if;
  delete from public.sheet_ink where id = 'ink-b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A deleted B''s ink'; end if;

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

-- ---------- share links ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
insert into public.shares (id, kind, source_id, title, payload) values ('share-b-0123456789abcdef', 'deck', 'deck-b', 'B shared', '{"x":1}');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare n int; t text;
begin
  select count(*) into n from public.shares;
  if n <> 0 then raise exception 'FAIL: A can list B''s shares'; end if;
  update public.shares set title = 'pwned' where id = 'share-b-0123456789abcdef';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A changed B''s share'; end if;
  delete from public.shares where id = 'share-b-0123456789abcdef';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A deleted B''s share'; end if;
  select s.title into t from public.get_share('share-b-0123456789abcdef') s;
  if t is distinct from 'B shared' then raise exception 'FAIL: A cannot open B''s share by its link'; end if;
  select count(*) into n from public.get_share('no-such-share-0000000000');
  if n <> 0 then raise exception 'FAIL: an unknown share id returned something'; end if;
end $$;

reset role;
set local role anon;
do $$
declare t text;
begin
  select s.title into t from public.get_share('share-b-0123456789abcdef') s;
  if t is distinct from 'B shared' then raise exception 'FAIL: a signed-out visitor cannot open a share link'; end if;
  begin
    perform 1 from public.shares;
    raise exception 'FAIL: anon can query the shares table';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;

-- ---------- account deletion needs a fresh emailed code ----------
-- Storage allowance: counted per account, readable only by its owner, capped, never blocks deletes.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.storage_usage where user_id = '00000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'FAIL: A can see B''s storage usage'; end if;
  select count(*) into n from public.storage_usage;
  if n <> 1 then raise exception 'FAIL: A should see its own storage usage (% rows)', n; end if;
  begin
    update public.storage_usage set cap_bytes = null;
    raise exception 'FAIL: A lifted its own storage cap';
  exception when insufficient_privilege then null; -- expected
  end;
end $$;

-- Give A a tiny allowance (as the database owner), then try to go past it.
reset role;
update public.storage_usage set cap_bytes = bytes + 500 where user_id = '00000000-0000-4000-8000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare before bigint; after bigint;
begin
  select bytes into before from public.storage_usage;
  begin
    insert into public.decks (id, doc) values ('deck-big', jsonb_build_object('title', repeat('x', 2000)));
    raise exception 'FAIL: a write past the storage cap was accepted';
  exception when others then
    if sqlerrm <> 'storage_full' then raise; end if;
  end;
  insert into public.decks (id, doc) values ('deck-small', '{"t":1}');
  insert into public.decks (id, doc) values ('deck-small', '{"t":1}') on conflict (user_id, id) do update set doc = excluded.doc;
  select bytes into after from public.storage_usage;
  if after - before <> public._sync_row_bytes('deck-small', '{"t":1}', false) then
    raise exception 'FAIL: an upsert was counted wrongly (% bytes added)', after - before;
  end if;
end $$;

-- Full up: deletes and tombstones still go through and give the space back; settings still save.
reset role;
update public.storage_usage set cap_bytes = bytes where user_id = '00000000-0000-4000-8000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare before bigint; after bigint;
begin
  select bytes into before from public.storage_usage;
  update public.decks set doc = '{}', deleted = true where id = 'deck-small';
  select bytes into after from public.storage_usage;
  if after >= before then raise exception 'FAIL: a tombstone did not free space'; end if;
  delete from public.decks where id = 'deck-small';
  insert into public.user_settings (id, doc) values ('settings', jsonb_build_object('theme', repeat('x', 900)))
    on conflict (user_id, id) do update set doc = excluded.doc;
end $$;

-- No cap (the admin account): anything goes.
reset role;
update public.storage_usage set cap_bytes = null where user_id = '00000000-0000-4000-8000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
insert into public.decks (id, doc) values ('deck-big', jsonb_build_object('title', repeat('x', 5000)));

-- Pictures: A keeps one in A's folder. B can't see it, change it, or put files in A's folder.
insert into storage.objects (bucket_id, name, metadata) values ('pictures', '00000000-0000-4000-8000-00000000000a/p1.webp', '{"size": 1000}');
do $$
declare n int;
begin
  select count(*) into n from storage.objects where bucket_id = 'pictures';
  if n <> 1 then raise exception 'FAIL: A cannot see its own picture'; end if;
  if public.picture_bytes() <> 1000 then raise exception 'FAIL: A''s pictures counted as % bytes', public.picture_bytes(); end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from storage.objects where bucket_id = 'pictures';
  if n <> 0 then raise exception 'FAIL: B can see A''s pictures'; end if;
  if public.picture_bytes() <> 0 then raise exception 'FAIL: A''s pictures count against B'; end if;
  update storage.objects set name = '00000000-0000-4000-8000-00000000000b/stolen.webp' where bucket_id = 'pictures';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B moved A''s picture'; end if;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('pictures', '00000000-0000-4000-8000-00000000000a/swap.webp', '{"size": 1}');
    raise exception 'FAIL: B put a file in A''s picture folder';
  exception when insufficient_privilege then null; -- expected
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('pictures', 'loose.webp');
    raise exception 'FAIL: a picture outside any folder was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('pictures', '00000000-0000-4000-8000-00000000000b/a/deep.webp');
    raise exception 'FAIL: a picture in a subfolder was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A at the 50 MB allowance can't add more.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
insert into storage.objects (bucket_id, name, metadata) values ('pictures', '00000000-0000-4000-8000-00000000000a/big.webp', '{"size": 52428800}');
do $$
begin
  insert into storage.objects (bucket_id, name, metadata) values ('pictures', '00000000-0000-4000-8000-00000000000a/more.webp', '{"size": 10}');
  raise exception 'FAIL: a picture past the allowance was accepted';
exception when insufficient_privilege then null; -- expected
end $$;

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
  select count(*) into n from public.storage_usage where user_id = '00000000-0000-4000-8000-00000000000b';
  if n <> 0 then raise exception 'FAIL: B''s storage usage survived deletion'; end if;
  select count(*) into n from public.profiles where id = '00000000-0000-4000-8000-00000000000a';
  if n <> 1 then raise exception 'FAIL: A''s profile was affected'; end if;
end $$;

select 'RLS tests passed' as result;
rollback;
