-- Team administration becomes a global-admin-only power.
--
-- 202609020018 split the two admin roles apart but left a team admin able to
-- invite coaches, change their team role and remove them. In practice that
-- half-works: an invitation row only reserves a seat, and the account behind it
-- still has to be created by hand in the Supabase dashboard
-- (Authentication → Users → Send invitation), which a team admin has no access
-- to. A team admin could therefore invite someone who could never sign in.
--
-- So membership is now handed out in exactly one place — the /admin console —
-- and the team admin keeps what they can actually finish on their own: the
-- roster, the club logo, the match calendar and the plans.
--
--   * `is_team_admin` still gates teams, players, fixtures, warmup routines and
--     everything session-scoped. Those policies are untouched.
--   * `team_memberships` and `team_invitations` writes now require
--     `is_global_admin()`.
--
-- Note the shape of the refusal: RLS filters an UPDATE/DELETE rather than
-- raising, so a team admin's attempt changes nothing instead of erroring. The
-- app no longer offers the controls at all; this is the boundary behind them.

drop policy if exists memberships_add_admin on public.team_memberships;
create policy memberships_add_admin on public.team_memberships for insert to authenticated
  with check (public.is_global_admin());

drop policy if exists memberships_update_admin on public.team_memberships;
create policy memberships_update_admin on public.team_memberships for update to authenticated
  using (public.is_global_admin())
  with check (public.is_global_admin());

drop policy if exists memberships_delete_admin on public.team_memberships;
create policy memberships_delete_admin on public.team_memberships for delete to authenticated
  using (public.is_global_admin());

drop policy if exists invitations_add_admin on public.team_invitations;
create policy invitations_add_admin on public.team_invitations for insert to authenticated
  with check (public.is_global_admin() and invited_by = auth.uid());

drop policy if exists invitations_delete_admin on public.team_invitations;
create policy invitations_delete_admin on public.team_invitations for delete to authenticated
  using (public.is_global_admin());

-- The team-admin half of `invitations_read` existed to render the pending list
-- on /team, which is gone. What remains is the onboarding path: a coach selects
-- the invitation addressed to their own email — token included — and claims it
-- through `claimableInvitations`. `admin_list_teams()` is security definer and
-- reads the console's list regardless.
drop policy if exists invitations_read on public.team_invitations;
create policy invitations_read on public.team_invitations for select to authenticated
  using (public.is_global_admin() or lower(email::text) = lower(coalesce(auth.jwt() ->> 'email', '')));

notify pgrst, 'reload schema';
