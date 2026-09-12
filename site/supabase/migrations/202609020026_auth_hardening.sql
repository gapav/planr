-- Auth hardening for a workspace that is no longer only its author's.
--
-- Three of the boundaries below were safe only because of a Supabase dashboard
-- setting rather than because of anything in this schema. That is the wrong
-- place for them to live: a setting can be toggled by accident, and nothing in
-- the repository would say so. Each rule is restated here so the database holds
-- it regardless of how the project is configured.
--
--   1. An account whose email address has never been proven cannot claim a team
--      seat. `accept_team_invitation` matches the invitation against
--      `auth.jwt() ->> 'email'`, and `invitations_read` hands the invitation
--      token to whoever that address belongs to. Both are exactly right *if*
--      the address is confirmed. With signup open and confirmation off, signing
--      up as a coach's address is enough to take over their team, so the
--      confirmation is now a precondition rather than an assumption.
--
--   2. The public exercise library is writable by coaches, not by anyone who
--      holds a session. `exercises_add_signed_in` asked only for
--      `authenticated`, which is every account that exists — and the same was
--      true of uploads into the public `exercise-videos` bucket. Both now ask
--      for a team seat, which is the thing that actually makes someone a coach
--      here.
--
--   3. The forced password change is enforced by the database. Migration
--      202609020011 granted `must_set_password` to `authenticated` so the
--      browser could clear the flag, which also let the browser clear it
--      *without* changing any password. The flag now falls when the password
--      actually changes, and the column is no longer writable from a session.
--
-- None of this changes what a legitimate coach can do.

-- 1. A proven email address ------------------------------------------------

-- `security definer` because `auth.users` is not readable from a session. Only
-- ever asked about the caller, so it exposes nothing about anybody else.
create or replace function public.email_is_confirmed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null)
$$;
revoke execute on function public.email_is_confirmed() from public, anon;
grant execute on function public.email_is_confirmed() to authenticated;

-- Replaced whole, keeping the signature, grants and the Norwegian wording
-- migration 202609020016 gave it. The only change is the new guard.
create or replace function public.accept_team_invitation(invitation_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare invitation public.team_invitations%rowtype; current_email citext;
begin
  if auth.uid() is null then raise exception 'Du må være logget inn'; end if;
  if not public.email_is_confirmed() then raise exception 'Bekreft e-postadressen din først'; end if;
  current_email := lower(coalesce(auth.jwt() ->> 'email', ''))::citext;
  select * into invitation from public.team_invitations where token = invitation_token for update;
  if not found then raise exception 'Invitasjonen ble ikke funnet'; end if;
  if invitation.accepted_at is not null then raise exception 'Invitasjonen er allerede brukt'; end if;
  if invitation.expires_at <= now() then raise exception 'Invitasjonen har utløpt'; end if;
  if lower(invitation.email::text)::citext <> current_email then raise exception 'Invitasjonen tilhører en annen e-postadresse'; end if;
  insert into public.team_memberships(team_id, profile_id, role) values (invitation.team_id, auth.uid(), invitation.role)
  on conflict (team_id, profile_id) do update set role = excluded.role;
  update public.team_invitations set accepted_at = now(), accepted_by = auth.uid() where id = invitation.id;
  return invitation.team_id;
end;
$$;

-- The token in this row is a bearer credential for a team seat. Reading it by
-- address is the onboarding path (`claimableInvitations`), so the address has
-- to have been proven first. The global-admin branch is unchanged.
drop policy if exists invitations_read on public.team_invitations;
create policy invitations_read on public.team_invitations for select to authenticated
  using (
    public.is_global_admin()
    or (public.email_is_confirmed() and lower(email::text) = lower(coalesce(auth.jwt() ->> 'email', '')))
  );

-- 2. Writing to the shared library is for coaches ---------------------------

create or replace function public.has_any_team() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.team_memberships where profile_id = auth.uid())
$$;
revoke execute on function public.has_any_team() from public, anon;
grant execute on function public.has_any_team() to authenticated;

-- A coach who has signed in but not yet claimed their invitation has no seat
-- for the moment it takes the provider to claim it, and is refused here. That
-- is the correct answer for that moment: they are not on a team yet.
drop policy if exists exercises_add_signed_in on public.exercises;
create policy exercises_add_signed_in on public.exercises for insert to authenticated
  with check (created_by = auth.uid() and (public.has_any_team() or public.is_global_admin()));

-- `exercise-videos` is a public bucket with a 5 MB cap and no quota of its own,
-- so an account that is not a coach could fill the project's storage with
-- world-readable files. Same rule as the row it illustrates.
drop policy if exists exercise_videos_insert_own on storage.objects;
create policy exercise_videos_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'exercise-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (public.has_any_team() or public.is_global_admin())
);

-- 3. The forced password change is the database's rule ----------------------

-- Fires on the real event — the stored password changing — so it covers the
-- invite flow, the recovery flow and a dashboard reset alike, and cannot be
-- reached from a session at all.
--
-- To put a coach back on the forced screen (they no longer have to be, now that
-- resets are self-service), set the flag from the SQL editor:
--   update public.profiles set must_set_password = true where email = '…';
create or replace function public.clear_must_set_password() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set must_set_password = false where id = new.id and must_set_password;
  return new;
end;
$$;

drop trigger if exists auth_user_password_changed on auth.users;
create trigger auth_user_password_changed
after update of encrypted_password on auth.users
for each row when (old.encrypted_password is distinct from new.encrypted_password)
execute function public.clear_must_set_password();

-- 202609020011 granted this column so `setPassword` could clear it. The trigger
-- above does that now, and a session has no reason to write it.
revoke update (must_set_password) on public.profiles from authenticated;

notify pgrst, 'reload schema';
