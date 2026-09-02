begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
values
  ('10000000-0000-0000-0000-000000000001', 'admin@example.com', '', now(), '{"full_name":"Admin Coach"}', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000002', 'coach@example.com', '', now(), '{"full_name":"Team Coach"}', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000003', 'outsider@example.com', '', now(), '{"full_name":"Other Coach"}', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@example.com","role":"authenticated"}', true);
select lives_ok($$ select public.create_team('Test Team') $$, 'an authenticated coach can create a team');
reset role;

insert into public.sessions (id, team_id, title, starts_at, status, created_by, updated_by)
select '30000000-0000-0000-0000-000000000001', id, 'Live workflow test', now(), 'published', created_by, created_by
from public.teams where created_by = '10000000-0000-0000-0000-000000000001';

insert into public.team_players (id, team_id, full_name)
select player.id::uuid, team.id, player.full_name
from public.teams team
cross join (values
  ('40000000-0000-0000-0000-000000000001', 'Ada L.'),
  ('40000000-0000-0000-0000-000000000002', 'Mina B.')
) as player(id, full_name)
where team.created_by = '10000000-0000-0000-0000-000000000001';

insert into public.session_attendance (session_id, player_id, is_present, checked_in_at, updated_by)
values
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', true, now(), '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', true, now(), '10000000-0000-0000-0000-000000000001');

insert into public.session_groupings (session_id, kind, groups, generated_by)
values (
  '30000000-0000-0000-0000-000000000001',
  'teams',
  '[{"id":"team-1","label":"Team 1","playerIds":["40000000-0000-0000-0000-000000000001"]},{"id":"team-2","label":"Team 2","playerIds":["40000000-0000-0000-0000-000000000002"]}]'::jsonb,
  '10000000-0000-0000-0000-000000000001'
);

insert into public.exercises (id, name, description, media_url, media_kind, thumbnail_url, created_by)
values ('20000000-0000-0000-0000-000000000001', 'Public test exercise', 'A useful public exercise description.', 'https://example.com/exercise.jpg', 'image', 'https://example.com/exercise.jpg', '10000000-0000-0000-0000-000000000001');
select throws_ok($$ insert into public.exercises (name, description, category, media_url, media_kind, created_by) values ('Invalid category', 'This exercise has an invalid category.', 'Teknikk', 'https://example.com/invalid.jpg', 'image', '10000000-0000-0000-0000-000000000001') $$, '23514', null, 'exercise categories are limited to the supported values');

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
select lives_ok($$ select public.start_session('30000000-0000-0000-0000-000000000001', 'teams') $$, 'a published session with current groups can start');
select throws_ok($$ update public.sessions set title = 'Changed while live', updated_by = '10000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-000000000001' $$, 'P0001', 'This workout is in progress and is locked', 'an in-progress plan is locked');
select throws_ok($$ update public.session_attendance set is_present = false, updated_by = '10000000-0000-0000-0000-000000000001' where session_id = '30000000-0000-0000-0000-000000000001' and player_id = '40000000-0000-0000-0000-000000000001' $$, 'P0001', 'This workout is in progress and is locked', 'in-progress attendance is locked');
reset role;

select * from finish();
rollback;
