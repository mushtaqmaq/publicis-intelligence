-- Row-level security negative tests. Every row here is made up. A failed expectation raises and stops the run.
\set ON_ERROR_STOP on
insert into auth.users(id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d'), ('00000000-0000-0000-0000-00000000000e');
insert into organizations(id, name, slug) values ('10000000-0000-0000-0000-000000000001', 'Org One', 'org-one'), ('10000000-0000-0000-0000-000000000002', 'Org Two', 'org-two');
insert into profiles(user_id, organization_id, email, role, active) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'viewer@one.test', 'viewer', true),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'admin@one.test', 'admin', true),
  ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000002', 'viewer@two.test', 'viewer', true),
  ('00000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001', 'gone@one.test', 'viewer', false),
  ('00000000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-000000000001', 'member@one.test', 'viewer', true);
insert into sources(id, organization_id, kind, name) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'gdelt', 'Sample GDELT');
insert into signals(id, organization_id, source_id, canonical_url, title, editorial_state) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'https://example.com/sample/1', 'Approved sample', 'approved'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'https://example.com/sample/2', 'Draft sample', 'draft');
insert into clients(id, organization_id, name) values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Sample Client');
insert into client_members(client_id, user_id) values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000e');
insert into boards(id, organization_id, owner_id, title) values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Viewer board');

create schema t;
create or replace function t.expect(label text, got bigint, want bigint) returns void language plpgsql as $$ begin if got is distinct from want then raise exception 'FAIL %: got %, wanted %', label, got, want; end if; raise notice 'ok   %', label; end $$;
create or replace function t.denied(label text, q text) returns void language plpgsql as $$ begin begin execute q; exception when insufficient_privilege or check_violation then raise notice 'ok   % (refused)', label; return; end; raise exception 'FAIL %: the statement was allowed', label; end $$;
grant usage on schema t to anon, authenticated;

-- anonymous: nothing at all
set role anon;
select t.denied('anonymous cannot read signals', 'select count(*) from signals');
select t.denied('anonymous cannot read profiles', 'select count(*) from profiles');
reset role;

-- viewer in org one
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select t.expect('viewer sees only approved signals', (select count(*) from signals), 1);
select t.expect('viewer sees only their own profile', (select count(*) from profiles), 1);
select t.expect('viewer sees their own organisation only', (select count(*) from organizations), 1);
select t.expect('viewer cannot see source settings', (select count(*) from sources), 0);
select t.expect('viewer who is not a client member sees no client', (select count(*) from clients), 0);
select t.expect('viewer sees their own board', (select count(*) from boards), 1);
select t.denied('viewer cannot insert a signal', $q$insert into signals(organization_id, source_id, canonical_url, title) values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'https://example.com/x', 'x')$q$);
select t.denied('viewer cannot promote themselves', $q$update profiles set role = 'admin'$q$);
select t.denied('viewer cannot delete a signal', 'delete from signals');
select t.denied('viewer cannot create a board for someone else', $q$insert into boards(organization_id, owner_id, title) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'x')$q$);

-- admin in org one
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select t.expect('admin sees drafts too', (select count(*) from signals), 2);
select t.expect('admin sees source settings', (select count(*) from sources), 1);
select t.expect('admin sees the client', (select count(*) from clients), 1);
select t.expect('admin does not see another person''s personal board', (select count(*) from boards), 0);
select t.denied('even an admin cannot write signals from the browser', 'delete from signals');

-- client member, other organisation, inactive user
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select t.expect('client member sees their client', (select count(*) from clients), 1);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select t.expect('another organisation sees none of these signals', (select count(*) from signals), 0);
select t.expect('another organisation sees none of these clients', (select count(*) from clients), 0);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select t.expect('an inactive user sees no signals', (select count(*) from signals), 0);
select t.expect('an inactive user sees no organisation', (select count(*) from organizations), 0);
reset role;
select 'ALL RLS CHECKS PASSED' as result;
