-- Grep holds no data about players (decision 12, issue #42).
--
-- Until now each team kept a roster (`team_players`, minimised to
-- «Firstname L.» plus jersey number by `202609020004`), every session kept who
-- was present (`session_attendance`) and the groups drawn from them
-- (`session_groupings`, with the kind used recorded in
-- `sessions.grouping_kind`). Coaches plan and run sessions; Grep does not need
-- to know who the players are. Dropping the tables removes every player row
-- from the database rather than hiding it, which is the point: there is
-- nothing left to leak, and no setup step between a coach and the session.
--
-- Order matters. Every function that still names the tables, the column or
-- the type is replaced first, so nothing is left pointing at a dropped object:
--
--   1. `start_session(uuid)` — one way to start, with the checks
--      `start_session_without_setup` has had. The two old entry points,
--      `start_session(uuid, session_grouping_kind)` and
--      `start_session_without_setup(uuid)`, are dropped.
--   2. `undo_session_start` and `reopen_session` without `grouping_kind`.
--      `copy_session` (last replaced in `202610140001`) and the lock trigger
--      `prevent_in_progress_session_changes` name neither the tables nor the
--      column, so they stay as they are.
--   3. The tables (their policies and triggers, the name-minimising one
--      included, go with them), then `player_belongs_to_session` and
--      `minimize_team_player_name`, the column and the type.
--
-- `202609020029` still names the attendance and grouping tables, but it is a
-- one-time cleanup that ran long ago; it runs before this file in a fresh
-- bootstrap, when the tables still exist.
--
-- Safe to run twice: `create or replace` for the functions, `if exists` on
-- every drop.

-- 1. Starting a session ------------------------------------------------------

create or replace function public.start_session(target_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target public.sessions%rowtype;
begin
  select * into target from public.sessions where id = target_session_id for update;

  if not found or not public.is_team_member(target.team_id) then
    raise exception 'Økten ble ikke funnet';
  end if;
  if target.status <> 'published' then
    raise exception 'Bare en publisert økt kan startes';
  end if;

  update public.sessions
  set status = 'in_progress',
      started_at = now(),
      completed_at = null,
      updated_by = auth.uid()
  where id = target_session_id;
end;
$$;

revoke execute on function public.start_session(uuid) from public, anon;
grant execute on function public.start_session(uuid) to authenticated;

drop function if exists public.start_session(uuid, public.session_grouping_kind);
drop function if exists public.start_session_without_setup(uuid);

-- 2. The ways back -----------------------------------------------------------

create or replace function public.undo_session_start(target_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target public.sessions%rowtype;
begin
  select * into target from public.sessions where id = target_session_id for update;
  if not found or not public.is_team_member(target.team_id) then raise exception 'Økten ble ikke funnet'; end if;
  if target.status <> 'in_progress' then raise exception 'Bare en pågående økt kan tilbakestilles'; end if;
  perform set_config('plannr.unlocked_session', target_session_id::text, true);
  update public.sessions
  set status = 'published', started_at = null, completed_at = null, updated_by = auth.uid()
  where id = target_session_id;
  perform set_config('plannr.unlocked_session', '', true);
end;
$$;

revoke execute on function public.undo_session_start(uuid) from public, anon;
grant execute on function public.undo_session_start(uuid) to authenticated;

create or replace function public.reopen_session(target_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target public.sessions%rowtype;
begin
  select * into target from public.sessions where id = target_session_id for update;

  if not found or not public.is_team_member(target.team_id) then
    raise exception 'Økten ble ikke funnet';
  end if;
  if target.status <> 'completed' then
    raise exception 'Bare en avsluttet økt kan gjenåpnes';
  end if;

  perform set_config('plannr.unlocked_session', target_session_id::text, true);
  update public.sessions
  set status = 'published',
      started_at = null,
      completed_at = null,
      updated_by = auth.uid()
  where id = target_session_id;
  perform set_config('plannr.unlocked_session', '', true);
end;
$$;

revoke execute on function public.reopen_session(uuid) from public, anon;
grant execute on function public.reopen_session(uuid) to authenticated;

-- 3. The player data itself --------------------------------------------------

-- Attendance and groupings first: attendance references team_players.
drop table if exists public.session_attendance;
drop table if exists public.session_groupings;
drop table if exists public.team_players;

drop function if exists public.player_belongs_to_session(uuid, uuid);
drop function if exists public.minimize_team_player_name();

alter table public.sessions drop column if exists grouping_kind;
drop type if exists public.session_grouping_kind;

-- Make the changes visible to PostgREST immediately after a manual SQL Editor run.
notify pgrst, 'reload schema';
