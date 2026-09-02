begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
values
  ('10000000-0000-0000-0000-000000000001', 'admin@example.com', '', now(), '{"full_name":"Admin Coach"}', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000002', 'coach@example.com', '', now(), '{"full_name":"Team Coach"}', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000003', 'outsider@example.com', '', now(), '{"full_name":"Other Coach"}', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@example.com","role":"authenticated"}', true);
select lives_ok($$ select public.create_team('Test Team') $$, 'an authenticated coach can create a team');
reset role;

insert into public.exercises (id, name, description, media_url, media_kind, thumbnail_url, created_by)
values ('20000000-0000-0000-0000-000000000001', 'Public test exercise', 'A useful public exercise description.', 'https://example.com/exercise.jpg', 'image', 'https://example.com/exercise.jpg', '10000000-0000-0000-0000-000000000001');

set local role anon;
select is((select count(*)::integer from public.exercises where id = '20000000-0000-0000-0000-000000000001'), 1, 'anonymous visitors can read active exercises');
select throws_ok($$ insert into public.exercises(name, description, media_url, media_kind, created_by) values ('Blocked', 'Anonymous writes are blocked.', 'https://example.com/x.jpg', 'image', '10000000-0000-0000-0000-000000000003') $$, '42501', null, 'anonymous visitors cannot add exercises');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","email":"outsider@example.com","role":"authenticated"}', true);
select is((select count(*)::integer from public.teams), 0, 'an unrelated coach cannot read another team');
select is((select count(*)::integer from public.sessions), 0, 'an unrelated coach cannot read another team session');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@example.com","role":"authenticated"}', true);
select lives_ok($$ update public.exercises set description = 'An updated public exercise description.' where id = '20000000-0000-0000-0000-000000000001' $$, 'the exercise author can edit their exercise');
select throws_ok($$ delete from public.team_memberships where profile_id = '10000000-0000-0000-0000-000000000001' $$, 'P0001', 'Every team must keep at least one admin', 'the last team admin cannot be removed');
reset role;

select * from finish();
rollback;
