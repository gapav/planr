begin;
create extension if not exists pgtap with schema extensions;
select plan(145);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
values
  ('10000000-0000-0000-0000-000000000001', 'admin@example.com', '', now(), '{"full_name":"Admin Coach"}', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000002', 'coach@example.com', '', now(), '{"full_name":"Team Coach"}', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000003', 'outsider@example.com', '', now(), '{"full_name":"Other Coach"}', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000004', 'owner@example.com', '', now(), '{"full_name":"Platform Owner"}', 'authenticated', 'authenticated');

-- 202609020018 split the platform owner from the teams they hand out. Creating
-- a team is a global-admin action and no longer joins the creator to it, so the
-- team admin is seated by the invitation the same call writes.
update public.profiles set is_global_admin = true where id = '10000000-0000-0000-0000-000000000004';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@example.com","role":"authenticated"}', true);
select throws_ok($$ select public.create_team('Rogue Team') $$, 'P0001', 'Du må være systemadministrator for å opprette lag', 'a coach cannot create a team of their own');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","email":"owner@example.com","role":"authenticated"}', true);
select lives_ok($$ select public.create_team('Test Team', 'admin@example.com') $$, 'a global admin can create a team and invite its first administrator');
reset role;

select is((select count(*)::integer from public.team_memberships), 0, 'creating a team leaves the global admin off it');
select is((select role::text from public.team_invitations where email = 'admin@example.com'), 'admin', 'the first trainer is invited as the team administrator');

select set_config('plannr.test_team', (select id::text from public.teams where created_by = '10000000-0000-0000-0000-000000000004'), true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@example.com","role":"authenticated"}', true);
select lives_ok($$ select public.accept_team_invitation((select token from public.team_invitations where email = 'admin@example.com')) $$, 'the invited trainer claims the team administrator seat');
reset role;

insert into public.sessions (id, team_id, title, starts_at, status, created_by, updated_by)
select '30000000-0000-0000-0000-000000000001', id, 'Live workflow test', now(), 'published', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'
from public.teams where id = current_setting('plannr.test_team')::uuid;

insert into public.sessions (id, team_id, title, starts_at, status, created_by, updated_by)
select '30000000-0000-0000-0000-000000000002', id, 'Skip setup workflow test', now(), 'published', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'
from public.teams where id = current_setting('plannr.test_team')::uuid;

insert into public.team_players (id, team_id, full_name)
select player.id::uuid, team.id, player.full_name
from public.teams team
cross join (values
  ('40000000-0000-0000-0000-000000000001', 'Ada L.'),
  ('40000000-0000-0000-0000-000000000002', 'Mina B.')
) as player(id, full_name)
where team.id = current_setting('plannr.test_team')::uuid;

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
select is((select age_groups from public.exercises where id = '20000000-0000-0000-0000-000000000001'), '{}'::text[], 'an exercise saved without age groups states none rather than guessing');
select throws_ok($$ insert into public.exercises (name, description, age_groups, media_url, media_kind, created_by) values ('Invalid age group', 'This exercise has an unsupported age group.', array['16-18'], 'https://example.com/invalid.jpg', 'image', '10000000-0000-0000-0000-000000000001') $$, '23514', null, 'exercise age groups are limited to the supported bands');
select lives_ok($$ insert into public.exercises (id, name, description, age_groups, media_url, media_kind, created_by) values ('20000000-0000-0000-0000-000000000002', 'Multi-age exercise', 'This exercise suits two age bands.', array['10-12', '13-15'], 'https://example.com/exercise.jpg', 'image', '10000000-0000-0000-0000-000000000001') $$, 'an exercise can list several supported age groups');

set local role anon;
select is((select count(*)::integer from public.exercises where id = '20000000-0000-0000-0000-000000000001'), 1, 'anonymous visitors can read active exercises');
select throws_ok($$ insert into public.exercises(name, description, media_url, media_kind, created_by) values ('Blocked', 'Anonymous writes are blocked.', 'https://example.com/x.jpg', 'image', '10000000-0000-0000-0000-000000000003') $$, '42501', null, 'anonymous visitors cannot add exercises');
select throws_ok($$ select count(*) from public.exercise_favorites $$, '42501', null, 'anonymous visitors cannot read favourites');
select throws_ok($$ insert into public.exercise_favorites (profile_id, exercise_id) values ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001') $$, '42501', null, 'anonymous visitors cannot heart an exercise');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","email":"outsider@example.com","role":"authenticated"}', true);
select is((select count(*)::integer from public.teams), 0, 'an unrelated coach cannot read another team');
select is((select count(*)::integer from public.sessions), 0, 'an unrelated coach cannot read another team session');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('exercise-videos', '10000000-0000-0000-0000-000000000003/own-video.mp4') $$, 'a coach can upload into their own video folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('exercise-videos', '10000000-0000-0000-0000-000000000001/other-video.mp4') $$, '42501', null, 'a coach cannot upload into another coach folder');
select lives_ok($$ delete from storage.objects where bucket_id = 'exercise-videos' and name = '10000000-0000-0000-0000-000000000003/own-video.mp4' $$, 'a coach can discard their own uploaded video');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('team-logos', '%s/logo.png') $$, current_setting('plannr.test_team')), '42501', null, 'a coach outside the team cannot upload a club logo for it');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('team-logos', 'not-a-team-id/logo.png') $$, '42501', null, 'a club-logo folder that is not a team id is denied, not an invalid-uuid error');
reset role;

select is((select file_size_limit from storage.buckets where id = 'exercise-videos'), 5242880::bigint, 'exercise media uploads are capped at 5 MB');
select is((select allowed_mime_types from storage.buckets where id = 'exercise-videos'), array['video/mp4', 'image/jpeg', 'image/png', 'image/webp']::text[], 'exercise uploads allow MP4 and supported image formats');
select is((select file_size_limit from storage.buckets where id = 'team-logos'), 2097152::bigint, 'club logos are capped at 2 MB');
select is((select allowed_mime_types from storage.buckets where id = 'team-logos'), array['image/jpeg', 'image/png', 'image/webp']::text[], 'club logos are limited to raster image formats');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@example.com","role":"authenticated"}', true);
select lives_ok($$ update public.exercises set description = 'An updated public exercise description.' where id = '20000000-0000-0000-0000-000000000001' $$, 'the exercise author can edit their exercise');
-- Favoritter (202609020022): a heart belongs to the coach who set it, so it is
-- writable only for their own profile and invisible to everyone else.
select lives_ok($$ insert into public.exercise_favorites (profile_id, exercise_id) values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001') $$, 'a coach can heart a library exercise');
select throws_ok($$ insert into public.exercise_favorites (profile_id, exercise_id) values ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001') $$, '42501', null, 'a coach cannot heart an exercise on behalf of another coach');
select is((select count(*)::integer from public.exercise_favorites), 1, 'the coach sees their own favourite');
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('team-logos', '%s/logo.png') $$, current_setting('plannr.test_team')), 'a team admin can upload a club logo into their team folder');
select lives_ok($$ update public.teams set logo_url = 'https://cdn.example.com/storage/v1/object/public/team-logos/logo.png' $$, 'a team admin can set the club logo');
select throws_ok($$ update public.teams set logo_url = 'http://cdn.example.com/logo.png' $$, '23514', null, 'a club logo must be an HTTPS URL');
select lives_ok($$ update public.teams set logo_url = null $$, 'a team admin can clear the club logo');
select lives_ok($$ delete from storage.objects where bucket_id = 'team-logos' $$, 'a team admin can delete their club logo file');
-- 202609020027 lets a team administrator reserve coach seats, but not grant
-- another administrator seat. Membership management remains global-admin only.
select lives_ok(format($$ insert into public.team_invitations (team_id, email, role, invited_by, expires_at) values ('%s', 'recruit@example.com', 'coach', '10000000-0000-0000-0000-000000000001', now() + interval '7 days') $$, current_setting('plannr.test_team')), 'a team admin can invite a coach to their own team');
select throws_ok(format($$ insert into public.team_invitations (team_id, email, role, invited_by, expires_at) values ('%s', 'other-admin@example.com', 'admin', '10000000-0000-0000-0000-000000000001', now() + interval '7 days') $$, current_setting('plannr.test_team')), '42501', null, 'a team admin cannot grant another administrator seat');
select lives_ok($$ delete from public.team_invitations where email = 'recruit@example.com' $$, 'a team admin can revoke a pending invitation');
select is((select count(*)::integer from public.team_invitations where email = 'recruit@example.com'), 0, 'revoking removes the pending invitation');
select lives_ok($$ update public.team_memberships set role = 'coach' where profile_id = '10000000-0000-0000-0000-000000000001' $$, 'a team role change by a team admin is filtered away rather than raised');
select is((select role::text from public.team_memberships where profile_id = '10000000-0000-0000-0000-000000000001'), 'admin', 'a team admin cannot change a team role');
select lives_ok($$ delete from public.team_memberships where profile_id = '10000000-0000-0000-0000-000000000001' $$, 'a membership delete by a team admin is filtered away rather than raised');
select is((select count(*)::integer from public.team_memberships where profile_id = '10000000-0000-0000-0000-000000000001'), 1, 'a team admin cannot remove a member from their own team');
select lives_ok($$ select public.start_session('30000000-0000-0000-0000-000000000001', 'teams') $$, 'a published session with current groups can start');
select throws_ok($$ update public.sessions set title = 'Changed while live', updated_by = '10000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-000000000001' $$, 'P0001', 'Denne økten pågår og er låst', 'an in-progress plan is locked');
select throws_ok($$ update public.session_attendance set is_present = false, updated_by = '10000000-0000-0000-0000-000000000001' where session_id = '30000000-0000-0000-0000-000000000001' and player_id = '40000000-0000-0000-0000-000000000001' $$, 'P0001', 'Denne økten pågår og er låst', 'in-progress attendance is locked');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","email":"outsider@example.com","role":"authenticated"}', true);
-- `exercises_edit_owner` refuses a foreign edit by filtering the row out of the
-- update rather than raising, so each attempt has to be checked by its effect.
select lives_ok($$ update public.exercises set description = 'Rewritten by another coach entirely.' where id = '20000000-0000-0000-0000-000000000001' $$, 'an edit of another coach exercise is filtered away rather than raised');
select is((select description from public.exercises where id = '20000000-0000-0000-0000-000000000001'), 'An updated public exercise description.', 'a coach cannot edit an exercise another coach created');
select lives_ok($$ update public.exercises set archived_at = now() where id = '20000000-0000-0000-0000-000000000001' $$, 'an archive of another coach exercise is filtered away rather than raised');
select is((select archived_at from public.exercises where id = '20000000-0000-0000-0000-000000000001'), null::timestamptz, 'a coach cannot archive an exercise another coach created');
select is((select count(*)::integer from public.exercise_favorites), 0, 'a coach cannot read another coach favourites');
select lives_ok($$ delete from public.exercise_favorites where exercise_id = '20000000-0000-0000-0000-000000000001' $$, 'a delete of another coach favourite is filtered away rather than raised');
select throws_ok($$ select public.undo_session_start('30000000-0000-0000-0000-000000000001') $$, 'P0001', 'Økten ble ikke funnet', 'an unrelated coach cannot reset another team workout');
select throws_ok($$ select public.start_session_without_setup('30000000-0000-0000-0000-000000000002') $$, 'P0001', 'Økten ble ikke funnet', 'an unrelated coach cannot skip setup for another team workout');
reset role;

update public.profiles set is_global_admin = true where id = '10000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","email":"outsider@example.com","role":"authenticated"}', true);
select lives_ok($$ update public.exercises set description = 'Cleaned up by the global admin.' where id = '20000000-0000-0000-0000-000000000001' $$, 'a global admin can edit an exercise another coach created');
select is((select description from public.exercises where id = '20000000-0000-0000-0000-000000000001'), 'Cleaned up by the global admin.', 'the global admin edit reaches the row');
reset role;
update public.profiles set is_global_admin = false where id = '10000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@example.com","role":"authenticated"}', true);
select is((select count(*)::integer from public.exercise_favorites where profile_id = '10000000-0000-0000-0000-000000000001'), 1, 'another coach delete never reached the favourite');
select lives_ok($$ delete from public.exercise_favorites where exercise_id = '20000000-0000-0000-0000-000000000001' $$, 'a coach can remove their own favourite');
select lives_ok($$ select public.start_session_without_setup('30000000-0000-0000-0000-000000000002') $$, 'a published workout can start without attendance or groups');
select is((select status::text || ':' || coalesce(grouping_kind::text, 'none') from public.sessions where id = '30000000-0000-0000-0000-000000000002'), 'in_progress:none', 'skipping setup starts the workout without a grouping kind');
select lives_ok($$ select public.undo_session_start('30000000-0000-0000-0000-000000000001') $$, 'an in-progress workout can return to setup');
select is((select status::text from public.sessions where id = '30000000-0000-0000-0000-000000000001'), 'published', 'resetting marks the session ready to start');
select ok((select started_at is null from public.sessions where id = '30000000-0000-0000-0000-000000000001'), 'resetting clears when the workout started');
select lives_ok($$ update public.sessions set title = 'Corrected after test start', updated_by = '10000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-000000000001' $$, 'a reset workout is editable again');
select lives_ok($$ select public.start_session('30000000-0000-0000-0000-000000000001', 'teams') $$, 'a reset workout can be started again with its saved attendance and groups');
select lives_ok($$ select public.finish_session('30000000-0000-0000-0000-000000000001') $$, 'an in-progress workout can be finished');
select is((select status::text from public.sessions where id = '30000000-0000-0000-0000-000000000001'), 'completed', 'finishing marks the session completed');
select ok((select completed_at is not null from public.sessions where id = '30000000-0000-0000-0000-000000000001'), 'finishing records when the workout ended');
select throws_ok($$ update public.sessions set title = 'Changed after the whistle', updated_by = '10000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-000000000001' $$, 'P0001', 'Denne økten er avsluttet og låst', 'a finished plan stays locked');
select throws_ok($$ select public.finish_session('30000000-0000-0000-0000-000000000001') $$, 'P0001', 'Bare en pågående økt kan avsluttes', 'a finished workout cannot be finished twice');
select lives_ok($$ delete from public.sessions where id = '30000000-0000-0000-0000-000000000001' $$, 'a finished session can still be deleted with its attendance and groups');

-- 202609020011 narrowed the profiles update grant. profiles_update_self still
-- passes for these statements, so a column grant is the only thing stopping a
-- coach from promoting themselves.
select lives_ok($$ update public.profiles set full_name = 'Renamed Admin' where id = '10000000-0000-0000-0000-000000000001' $$, 'a coach can rename themselves');
select throws_ok($$ update public.profiles set must_set_password = false where id = '10000000-0000-0000-0000-000000000001' $$, '42501', null, 'the retired password flag is not writable from a browser session');
select throws_ok($$ update public.profiles set is_global_admin = true where id = '10000000-0000-0000-0000-000000000001' $$, '42501', null, 'a coach cannot make themselves a global admin');
reset role;

-- The Supabase-dashboard onboarding leans entirely on invitations_read: a coach
-- who never received an /invite link must still be able to select the row
-- addressed to their own email — token included — and claim it unaided. That
-- token must stay invisible to everyone else.
insert into public.team_invitations (team_id, email, role, token, invited_by, expires_at)
select id, 'coach@example.com', 'coach', '50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', now() + interval '7 days'
from public.teams where id = current_setting('plannr.test_team')::uuid;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","email":"outsider@example.com","role":"authenticated"}', true);
select is((select count(*)::integer from public.team_invitations), 0, 'an unrelated coach cannot see an invitation addressed to someone else');
reset role;

-- A team administrator can list the pending invitations for their own team so
-- /team can resend or revoke them.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@example.com","role":"authenticated"}', true);
select is((select count(*)::integer from public.team_invitations where email = 'coach@example.com'), 1, 'a team admin can see a pending invitation for their own team');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","email":"coach@example.com","role":"authenticated"}', true);
select is((select token::text from public.team_invitations where email = 'coach@example.com'), '50000000-0000-0000-0000-000000000001', 'an invited coach can read their own invitation token without holding the link');
select lives_ok($$ select public.accept_team_invitation('50000000-0000-0000-0000-000000000001') $$, 'an invited coach can accept an invitation they found for themselves');
select is((select count(*)::integer from public.team_memberships where profile_id = '10000000-0000-0000-0000-000000000002'), 1, 'accepting the invitation puts the coach on the team');
select throws_ok($$ select public.accept_team_invitation('50000000-0000-0000-0000-000000000001') $$, 'P0001', 'Invitasjonen er allerede brukt', 'an invitation cannot be claimed twice');
reset role;

-- 202609020018: the platform owner administers every team without joining one,
-- and without reaching the plans or the player data of a team they do not coach.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","email":"owner@example.com","role":"authenticated"}', true);
select is((select count(*)::integer from public.teams), 0, 'a global admin reads no team through the membership policies');
select is((select count(*)::integer from public.sessions), 0, 'a global admin cannot read the sessions of a team they do not coach');
select is((select count(*)::integer from public.team_players), 0, 'a global admin cannot read the roster of a team they do not coach');
select is(jsonb_array_length(public.admin_list_teams()), 1, 'the admin console reads every team through its own RPC instead');
select lives_ok(format($$ insert into public.team_memberships (team_id, profile_id, role) values ('%s', '10000000-0000-0000-0000-000000000003', 'coach') $$, current_setting('plannr.test_team')), 'a global admin can add a trainer to a team they are not on');
select lives_ok(format($$ update public.team_memberships set role = 'admin' where team_id = '%s' and profile_id = '10000000-0000-0000-0000-000000000003' $$, current_setting('plannr.test_team')), 'a global admin can change a trainer role on a team they are not on');
select lives_ok(format($$ delete from public.team_memberships where team_id = '%s' and profile_id = '10000000-0000-0000-0000-000000000003' $$, current_setting('plannr.test_team')), 'a global admin can remove a trainer from a team they are not on');
select lives_ok(format($$ update public.teams set name = 'Test Team renamed by the owner' where id = '%s' $$, current_setting('plannr.test_team')), 'a global admin can rename any team');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","email":"outsider@example.com","role":"authenticated"}', true);
select throws_ok($$ select public.admin_list_teams() $$, 'P0001', 'Du må være systemadministrator', 'the admin console is refused to everyone else');
select throws_ok(format($$ insert into public.team_memberships (team_id, profile_id, role) values ('%s', '10000000-0000-0000-0000-000000000003', 'admin') $$, current_setting('plannr.test_team')), '42501', null, 'a coach cannot add themselves to a team');
reset role;

-- 202609020019 added the match calendar. It is club data one person maintains,
-- so the whole coaching team reads it and only a team admin writes it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@example.com","role":"authenticated"}', true);
select lives_ok(format($$ insert into public.team_fixtures (id, team_id, match_number, starts_at, home_team, away_team, our_teams, venue, tournament) values ('60000000-0000-0000-0000-000000000001', '%s', '41041006001', now() + interval '3 days', 'Langhus Gul', 'Nesodden Gul', array['Langhus Gul'], 'Langhushallen', 'Kortbaneserie Jenter 10') $$, current_setting('plannr.test_team')), 'a team admin can import a match');
select throws_ok(format($$ insert into public.team_fixtures (team_id, match_number, starts_at, home_team, away_team, our_teams) values ('%s', '41041006001', now(), 'Langhus Gul', 'Ski Rod', array['Langhus Gul']) $$, current_setting('plannr.test_team')), '23505', null, 're-importing the same match number updates one row rather than doubling the calendar');
select throws_ok(format($$ insert into public.team_fixtures (team_id, match_number, starts_at, home_team, away_team, our_teams) values ('%s', '41041006099', now(), 'Langhus Gul', 'Ski Rod', array[]::text[]) $$, current_setting('plannr.test_team')), '23514', null, 'a match must record which of our teams plays it');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","email":"coach@example.com","role":"authenticated"}', true);
select is((select count(*)::integer from public.team_fixtures), 1, 'a coach on the team can read the match calendar');
select throws_ok(format($$ insert into public.team_fixtures (team_id, match_number, starts_at, home_team, away_team, our_teams) values ('%s', '41041006002', now(), 'Langhus Gul', 'Ski Rod', array['Langhus Gul']) $$, current_setting('plannr.test_team')), '42501', null, 'a coach who is not an admin cannot import matches');
select lives_ok($$ delete from public.team_fixtures where id = '60000000-0000-0000-0000-000000000001' $$, 'a delete by a non-admin coach is filtered rather than raised');
select is((select count(*)::integer from public.team_fixtures), 1, 'the match survives a non-admin delete');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","email":"outsider@example.com","role":"authenticated"}', true);
select is((select count(*)::integer from public.team_fixtures), 0, 'an unrelated coach cannot read another team match calendar');
reset role;

-- 202609020020 added the pre-match warm-up. Unlike the roster and the match
-- import, it is coaching content: every coach on the team may change it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@example.com","role":"authenticated"}', true);
select lives_ok(format($$ insert into public.warmup_routines (id, team_id, created_by, updated_by) values ('70000000-0000-0000-0000-000000000001', '%s', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001') $$, current_setting('plannr.test_team')), 'a coach can set up the team warm-up');
select throws_ok(format($$ insert into public.warmup_routines (team_id, created_by, updated_by) values ('%s', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001') $$, current_setting('plannr.test_team')), '23505', null, 'a team has only one default warm-up routine');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","email":"coach@example.com","role":"authenticated"}', true);
select is((select count(*)::integer from public.warmup_routines), 1, 'a coach on the team can read the warm-up');
select lives_ok($$ insert into public.warmup_items (id, routine_id, kind, title, duration_minutes, position, updated_by) values ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'custom', 'Loepsserie', 5, 0, '10000000-0000-0000-0000-000000000002') $$, 'a coach who is not an admin can add a warm-up activity');
select lives_ok($$ insert into public.warmup_items (id, routine_id, kind, title, duration_minutes, position, updated_by) values ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'custom', 'Pasningsmoenster', 6, 1, '10000000-0000-0000-0000-000000000002') $$, 'a second warm-up activity takes the next position');
select lives_ok($$ select public.reorder_warmup_items('70000000-0000-0000-0000-000000000001', array['71000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000001']::uuid[]) $$, 'a coach can reorder the warm-up');
select is((select title from public.warmup_items where position = 0), 'Pasningsmoenster', 'reordering renumbers the activities');
select throws_ok($$ select public.reorder_warmup_items('70000000-0000-0000-0000-000000000001', array['71000000-0000-0000-0000-000000000001']::uuid[]) $$, 'P0001', 'Aktivitetslisten er ufullstendig', 'a partial reorder is refused rather than dropping an activity');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","email":"outsider@example.com","role":"authenticated"}', true);
select is((select count(*)::integer from public.warmup_routines), 0, 'an unrelated coach cannot read another team warm-up');
select is((select count(*)::integer from public.warmup_items), 0, 'an unrelated coach cannot read another team warm-up activities');
select throws_ok($$ select public.reorder_warmup_items('70000000-0000-0000-0000-000000000001', array['71000000-0000-0000-0000-000000000001']::uuid[]) $$, 'P0001', 'Oppvarmingen finnes ikke', 'an unrelated coach cannot reorder another team warm-up');
reset role;

-- 202609020024 added the month focus. Like the warm-up it is coaching content
-- rather than club administration, so every coach on the team writes it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","email":"coach@example.com","role":"authenticated"}', true);
select lives_ok(format($$ insert into public.team_month_focus (team_id, month, note, updated_by) values ('%s', '2026-09', 'Forsvar 6-0 med aktiv midtblokk.', '10000000-0000-0000-0000-000000000002') $$, current_setting('plannr.test_team')), 'a coach who is not an admin can set the month focus');
select throws_ok(format($$ insert into public.team_month_focus (team_id, month, note) values ('%s', '2026-10', '   ') $$, current_setting('plannr.test_team')), '23514', null, 'a blank focus is refused rather than stored as an empty note');
select throws_ok(format($$ insert into public.team_month_focus (team_id, month, note) values ('%s', 'september 2026', 'Kontringer.') $$, current_setting('plannr.test_team')), '23514', null, 'the month must be the YYYY-MM key the calendar groups by');
select throws_ok(format($$ insert into public.team_month_focus (team_id, month, note) values ('%s', '2026-09', 'Et annet fokus.') $$, current_setting('plannr.test_team')), '23505', null, 'a team has one focus per month, not a list of them');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@example.com","role":"authenticated"}', true);
select lives_ok(format($$ update public.team_month_focus set note = 'Kontring ut av forsvaret.' where team_id = '%s' and month = '2026-09' $$, current_setting('plannr.test_team')), 'another coach on the team can rewrite the focus');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","email":"outsider@example.com","role":"authenticated"}', true);
select is((select count(*)::integer from public.team_month_focus), 0, 'an unrelated coach cannot read another team month focus');
select throws_ok(format($$ insert into public.team_month_focus (team_id, month, note) values ('%s', '2026-11', 'Fremmed fokus.') $$, current_setting('plannr.test_team')), '42501', null, 'an unrelated coach cannot set another team month focus');
reset role;

-- 202609020025 put a responsible coach on each activity. The browser writes it
-- straight to PostgREST, so the "must be on this team" rule is a trigger rather
-- than a client-side check.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@example.com","role":"authenticated"}', true);
select lives_ok(format($$ insert into public.sessions (id, team_id, title, starts_at, status, created_by, updated_by) values ('30000000-0000-0000-0000-000000000003', '%s', 'Coach assignment test', now(), 'draft', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001') $$, current_setting('plannr.test_team')), 'a coach can draft a session for their own team');
select lives_ok($$ insert into public.session_blocks (id, session_id, title, position, updated_by) values ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'Hoveddel', 0, '10000000-0000-0000-0000-000000000001') $$, 'a coach can add a block to their own session');
select lives_ok($$ insert into public.session_items (id, block_id, kind, title, duration_minutes, position, updated_by) values ('32000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'custom', 'Kontring', 10, 0, '10000000-0000-0000-0000-000000000001') $$, 'an activity starts without a responsible coach');
select ok((select assigned_coach_id is null from public.session_items where id = '32000000-0000-0000-0000-000000000001'), 'an activity nobody was given belongs to the whole coaching team');
select lives_ok($$ update public.session_items set assigned_coach_id = '10000000-0000-0000-0000-000000000002', updated_by = '10000000-0000-0000-0000-000000000001' where id = '32000000-0000-0000-0000-000000000001' $$, 'a coach can hand an activity to another coach on the team');
select throws_ok($$ update public.session_items set assigned_coach_id = '10000000-0000-0000-0000-000000000003', updated_by = '10000000-0000-0000-0000-000000000001' where id = '32000000-0000-0000-0000-000000000001' $$, 'P0001', 'Ansvarlig trener må være trener på laget', 'an activity cannot be handed to a coach outside the team');
select throws_ok($$ insert into public.session_items (block_id, kind, title, duration_minutes, position, assigned_coach_id, updated_by) values ('31000000-0000-0000-0000-000000000001', 'custom', 'Skudd', 10, 1, '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001') $$, 'P0001', 'Ansvarlig trener må være trener på laget', 'the platform owner is not a coach on the team either');
select lives_ok($$ update public.session_items set coaching_notes = 'Tre runder.', updated_by = '10000000-0000-0000-0000-000000000001' where id = '32000000-0000-0000-0000-000000000001' $$, 'an untouched assignment does not have to be re-validated on every edit');
select is((select assigned_coach_id::text from public.session_items where id = '32000000-0000-0000-0000-000000000001'), '10000000-0000-0000-0000-000000000002', 'the assignment survives an edit of the rest of the activity');
select lives_ok($$ delete from public.sessions where id = '30000000-0000-0000-0000-000000000003' $$, 'the assignment test session is removed with its blocks and activities');
reset role;

-- 202609020026 moved the confirmation and shared-library rules into the schema.
-- 202609020027 retires the forced-password flag because every account now uses
-- passwordless links.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
values ('10000000-0000-0000-0000-000000000005', 'pending@example.com', 'first-hash', null, '{"full_name":"Unconfirmed Coach"}', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","email":"owner@example.com","role":"authenticated"}', true);
select lives_ok(format($$ insert into public.team_invitations (team_id, email, role, invited_by) values ('%s', 'pending@example.com', 'coach', '10000000-0000-0000-0000-000000000004') $$, current_setting('plannr.test_team')), 'the platform owner reserves a seat for a coach who has not signed in yet');
reset role;

select set_config('plannr.pending_token', (select token::text from public.team_invitations where email = 'pending@example.com'), true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","email":"pending@example.com","role":"authenticated"}', true);
select is((select count(*)::integer from public.team_invitations), 0, 'an unconfirmed address cannot read the invitation token addressed to it');
select throws_ok(format($$ select public.accept_team_invitation('%s') $$, current_setting('plannr.pending_token')), 'P0001', 'Bekreft e-postadressen din først', 'an unconfirmed address cannot claim the seat it was offered');
select throws_ok($$ insert into public.exercises (name, description, media_url, media_kind, created_by) values ('Spam', 'Written by an account with no team.', 'https://example.com/x.jpg', 'image', '10000000-0000-0000-0000-000000000005') $$, '42501', null, 'an account with no team cannot write to the shared exercise library');
reset role;

update auth.users set email_confirmed_at = now() where id = '10000000-0000-0000-0000-000000000005';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","email":"pending@example.com","role":"authenticated"}', true);
select lives_ok(format($$ select public.accept_team_invitation('%s') $$, current_setting('plannr.pending_token')), 'the same coach claims the seat once the address is confirmed');
select lives_ok($$ insert into public.exercises (name, description, media_url, media_kind, created_by) values ('Coached', 'Written by a coach on a team.', 'https://example.com/x.jpg', 'image', '10000000-0000-0000-0000-000000000005') $$, 'a coach on a team can write to the shared exercise library');
select throws_ok($$ update public.profiles set must_set_password = true where id = '10000000-0000-0000-0000-000000000005' $$, '42501', null, 'a coach cannot re-enable the retired password flag');
reset role;

select ok((select not must_set_password from public.profiles where id = '10000000-0000-0000-0000-000000000005'), 'a passwordless account never owes a password');

-- 202609020030 separates team membership from account deletion. The global
-- directory contains Auth identities only, while permanent deletion leaves an
-- anonymized profile behind so authored club content keeps valid references.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","email":"owner@example.com","role":"authenticated"}', true);
select is(jsonb_array_length(public.admin_list_accounts()), 5, 'the global admin can list every active Auth account, including accounts with no team');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","email":"outsider@example.com","role":"authenticated"}', true);
select throws_ok($$ select public.admin_list_accounts() $$, 'P0001', 'Du må være systemadministrator', 'a coach cannot open the global account directory');
reset role;

select throws_ok(
  $$ delete from auth.users where id = '10000000-0000-0000-0000-000000000004' $$,
  'P0001',
  'En systemadministrator kan ikke slettes permanent',
  'a global-admin Auth identity is protected from permanent deletion'
);

-- Make the deletion target the last team administrator. Account deletion sits
-- above the ordinary membership invariant and must still revoke every seat.
update public.team_memberships set role = 'admin' where profile_id = '10000000-0000-0000-0000-000000000005';
update public.team_memberships set role = 'coach' where profile_id = '10000000-0000-0000-0000-000000000001';
select lives_ok(
  $$ delete from auth.users where id = '10000000-0000-0000-0000-000000000005' $$,
  'a non-admin Auth identity can be permanently deleted even after authoring content'
);
select is((select count(*)::integer from auth.users where id = '10000000-0000-0000-0000-000000000005'), 0, 'permanent deletion removes the Auth identity');
select is((select full_name from public.profiles where id = '10000000-0000-0000-0000-000000000005'), 'Slettet bruker', 'the historical profile is anonymized');
select ok((select deleted_at is not null from public.profiles where id = '10000000-0000-0000-0000-000000000005'), 'the tombstone records when deletion happened');
select is((select count(*)::integer from public.team_memberships where profile_id = '10000000-0000-0000-0000-000000000005'), 0, 'permanent deletion revokes every team membership');
select is((select count(*)::integer from public.team_memberships where role = 'admin'), 0, 'permanent deletion may leave a team awaiting a replacement administrator');
select is((select count(*)::integer from public.exercises where created_by = '10000000-0000-0000-0000-000000000005'), 1, 'authored exercises survive account deletion');
select like((select email::text from public.team_invitations where accepted_by = '10000000-0000-0000-0000-000000000005'), 'deleted+%@deleted.invalid', 'accepted invitation history no longer retains the deleted email address');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","email":"coach@example.com","role":"authenticated"}', true);
select is((select full_name from public.profiles where id = '10000000-0000-0000-0000-000000000005'), 'Slettet bruker', 'signed-in coaches can resolve the anonymized author on retained content');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","email":"owner@example.com","role":"authenticated"}', true);
select is(jsonb_array_length(public.admin_list_accounts()), 4, 'an anonymized tombstone is absent from the active account directory');
reset role;

select * from finish();
rollback;
