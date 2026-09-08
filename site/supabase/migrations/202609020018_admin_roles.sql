-- Global admin and team admin become two different things.
--
-- Until now the only way to own a team was to join it: `create_team` inserted
-- the caller into `team_memberships` as a team admin, so the person who
-- administers the platform showed up in every team's coach list. This splits
-- the two roles apart:
--
--   * global admin (`profiles.is_global_admin`) creates teams, appoints their
--     trainers, changes team roles, removes members and deletes teams — without
--     ever being a member, and so without appearing in the team overview.
--   * team admin (`team_memberships.role = 'admin'`) runs one team: invites
--     coaches, manages the roster and club logo, plans sessions. Unchanged.
--
-- Reach is deliberately limited to administration. The select policies on
-- sessions, blocks, items, players, attendance and groupings are *not* widened,
-- so a global admin still cannot read the plans or the (already
-- privacy-minimized) player data of a team they do not coach.

-- `create_team` gains a second argument, which makes it a different function
-- object. Leaving the old one in place would make `create_team('Name')`
-- ambiguous, so drop it first and re-grant the new signature below.
drop function if exists public.create_team(text);

create or replace function public.create_team(team_name text, first_admin_email text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_team_id uuid; invited_email citext;
begin
  if auth.uid() is null then raise exception 'Du må være logget inn'; end if;
  -- Teams are handed out by the platform owner, not self-served by coaches.
  if not public.is_global_admin() then raise exception 'Du må være systemadministrator for å opprette lag'; end if;
  if char_length(trim(team_name)) < 3 then raise exception 'Lagnavnet er for kort'; end if;
  insert into public.teams(name, created_by) values (trim(team_name), auth.uid()) returning id into new_team_id;
  -- Deliberately no membership row for the caller. The team's own admin is
  -- invited instead, and claims the seat on first sign-in via
  -- `claimableInvitations` / `accept_team_invitation`.
  invited_email := lower(trim(coalesce(first_admin_email, '')))::citext;
  if length(invited_email::text) > 0 then
    insert into public.team_invitations(team_id, email, role, invited_by)
    values (new_team_id, invited_email, 'admin', auth.uid());
  end if;
  return new_team_id;
end;
$$;

revoke execute on function public.create_team(text, text) from public, anon;
grant execute on function public.create_team(text, text) to authenticated;

-- The read path for the admin console.
--
-- An RPC rather than a widened `select` policy on teams/memberships: the
-- provider's `loadPrivateData` selects `team_memberships` unfiltered and builds
-- the sidebar team switcher from whatever comes back, so widening that policy
-- would drop every team in the database into the global admin's switcher.
create or replace function public.admin_list_teams() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_global_admin() then raise exception 'Du må være systemadministrator'; end if;
  select coalesce(jsonb_agg(entry order by sort_name), '[]'::jsonb) into result
  from (
    select
      team.name as sort_name,
      jsonb_build_object(
        'id', team.id,
        'name', team.name,
        'logo_url', team.logo_url,
        'created_at', team.created_at,
        'members', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', profile.id, 'email', profile.email, 'full_name', profile.full_name, 'role', membership.role
          ) order by profile.full_name)
          from public.team_memberships membership
          join public.profiles profile on profile.id = membership.profile_id
          where membership.team_id = team.id
        ), '[]'::jsonb),
        'invitations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', invitation.id, 'email', invitation.email, 'role', invitation.role,
            'token', invitation.token, 'expires_at', invitation.expires_at
          ) order by invitation.created_at)
          from public.team_invitations invitation
          where invitation.team_id = team.id
            and invitation.accepted_at is null
            and invitation.expires_at > now()
        ), '[]'::jsonb)
      ) as entry
    from public.teams team
  ) listed;
  return result;
end;
$$;

revoke execute on function public.admin_list_teams() from public, anon;
grant execute on function public.admin_list_teams() to authenticated;

-- A global admin must be able to empty a team they own — and, right after this
-- migration, to remove their own legacy membership from a team where they are
-- still the only admin. Without this they stay stuck in the coach list.
create or replace function public.protect_last_team_admin() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists(select 1 from public.teams where id = old.team_id) then return old; end if;
  if public.is_global_admin() then return case when tg_op = 'DELETE' then old else new end; end if;
  if old.role = 'admin' then
    if (tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role <> 'admin')) and
      not exists(select 1 from public.team_memberships where team_id = old.team_id and profile_id <> old.profile_id and role = 'admin')
    then raise exception 'Hvert lag må ha minst én administrator'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Team administration, now reachable by the global admin for any team. Note
-- that the matching `select` policies stay membership-scoped on purpose; the
-- console reads through `admin_list_teams()` instead.
drop policy if exists teams_update_admin on public.teams;
create policy teams_update_admin on public.teams for update to authenticated
  using (public.is_team_admin(id) or public.is_global_admin())
  with check (public.is_team_admin(id) or public.is_global_admin());

drop policy if exists teams_delete_admin on public.teams;
create policy teams_delete_admin on public.teams for delete to authenticated
  using (public.is_team_admin(id) or public.is_global_admin());

drop policy if exists memberships_add_admin on public.team_memberships;
create policy memberships_add_admin on public.team_memberships for insert to authenticated
  with check (public.is_team_admin(team_id) or public.is_global_admin());

drop policy if exists memberships_update_admin on public.team_memberships;
create policy memberships_update_admin on public.team_memberships for update to authenticated
  using (public.is_team_admin(team_id) or public.is_global_admin())
  with check (public.is_team_admin(team_id) or public.is_global_admin());

drop policy if exists memberships_delete_admin on public.team_memberships;
create policy memberships_delete_admin on public.team_memberships for delete to authenticated
  using (public.is_team_admin(team_id) or public.is_global_admin());

drop policy if exists invitations_add_admin on public.team_invitations;
create policy invitations_add_admin on public.team_invitations for insert to authenticated
  with check ((public.is_team_admin(team_id) or public.is_global_admin()) and invited_by = auth.uid());

drop policy if exists invitations_delete_admin on public.team_invitations;
create policy invitations_delete_admin on public.team_invitations for delete to authenticated
  using (public.is_team_admin(team_id) or public.is_global_admin());

-- Make the new function signatures visible to PostgREST immediately after a
-- manual SQL Editor run, otherwise `create_team` keeps its old argument list.
notify pgrst, 'reload schema';
