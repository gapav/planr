-- One-time removal of legacy Auth accounts that never signed in.
--
-- Migration 202609020028 removed their pending team-invitation rows, but an
-- invitation and an Auth account are separate records. Remove the unused Auth
-- identities created before the passwordless cutover. The profiles trigger
-- uses ON DELETE CASCADE, so their unused public profile (and any manually
-- assigned membership) disappears with the Auth user.
--
-- Safeguards:
--   * an account that has ever signed in is never touched;
--   * a global administrator is never touched;
--   * an account referenced as the author of app data or owner of a Storage
--     object is left for manual review; and
--   * the fixed cutoff makes this safe to re-run after new invitations begin.
delete from auth.users as auth_user
where auth_user.last_sign_in_at is null
  and auth_user.created_at < timestamptz '2026-09-12 09:30:00+00'
  and not exists (
    select 1
    from public.profiles as profile
    where profile.id = auth_user.id
      and profile.is_global_admin
  )
  and not exists (
    select 1
    from storage.objects as object
    where object.owner_id::text = auth_user.id::text
  )
  and not exists (
    select 1 from public.teams where created_by = auth_user.id
  )
  and not exists (
    select 1 from public.team_invitations
    where invited_by = auth_user.id or accepted_by = auth_user.id
  )
  and not exists (
    select 1 from public.exercises where created_by = auth_user.id
  )
  and not exists (
    select 1 from public.sessions
    where created_by = auth_user.id or updated_by = auth_user.id
  )
  and not exists (
    select 1 from public.session_blocks where updated_by = auth_user.id
  )
  and not exists (
    select 1 from public.session_items where updated_by = auth_user.id
  )
  and not exists (
    select 1 from public.session_attendance where updated_by = auth_user.id
  )
  and not exists (
    select 1 from public.session_groupings where generated_by = auth_user.id
  )
  and not exists (
    select 1 from public.warmup_routines
    where created_by = auth_user.id or updated_by = auth_user.id
  )
  and not exists (
    select 1 from public.warmup_items where updated_by = auth_user.id
  );

notify pgrst, 'reload schema';
