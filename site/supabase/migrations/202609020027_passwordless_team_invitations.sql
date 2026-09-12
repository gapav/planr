-- Passwordless sign-in and team-admin coach invitations.
--
-- Magic links establish the Supabase session directly, so a newly invited
-- coach no longer owes the application a password. Team administrators may
-- reserve coach seats on their own team; only a global administrator can
-- reserve an administrator seat or manage memberships after acceptance.

-- Keep the legacy column for rolling deploy compatibility, but make it inert.
alter table public.profiles alter column must_set_password set default false;
update public.profiles set must_set_password = false where must_set_password;

drop trigger if exists auth_user_password_changed on auth.users;
drop function if exists public.clear_must_set_password();

-- A team administrator needs the pending rows for their own team. An invited
-- coach still sees only the row addressed to their confirmed email.
drop policy if exists invitations_read on public.team_invitations;
create policy invitations_read on public.team_invitations for select to authenticated
  using (
    public.is_global_admin()
    or public.is_team_admin(team_id)
    or (public.email_is_confirmed() and lower(email::text) = lower(coalesce(auth.jwt() ->> 'email', '')))
  );

drop policy if exists invitations_add_admin on public.team_invitations;
create policy invitations_add_admin on public.team_invitations for insert to authenticated
  with check (
    invited_by = auth.uid()
    and (
      public.is_global_admin()
      or (public.is_team_admin(team_id) and role = 'coach')
    )
  );

drop policy if exists invitations_delete_admin on public.team_invitations;
create policy invitations_delete_admin on public.team_invitations for delete to authenticated
  using (
    accepted_at is null
    and (public.is_global_admin() or public.is_team_admin(team_id))
  );

notify pgrst, 'reload schema';
