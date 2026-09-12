-- Separate team access from the lifetime of a Grep login account.
--
-- Removing a team_memberships row only removes access to that team. Permanent
-- account deletion is a separate global-admin operation: the Auth identity and
-- private preferences disappear, while a minimal "Slettet bruker" profile is
-- retained so sessions, exercises and audit history keep valid authorship.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

-- `profiles.id` still equals `auth.users.id` for every active account, and the
-- auth_user_created trigger continues to enforce that direction. The reverse
-- foreign key must go: deleting an Auth identity should retain an anonymized
-- profile as a historical actor rather than cascade through authored content.
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

comment on column public.profiles.deleted_at is
  'When set, the Auth identity was permanently deleted and this row is an anonymized historical actor.';

-- Signed-in coaches may resolve the deliberately non-personal tombstone when
-- authored content joins profiles. Active profiles remain team-scoped.
drop policy if exists profiles_read_shared on public.profiles;
create policy profiles_read_shared on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_team(id) or public.is_global_admin() or deleted_at is not null);

-- The existing membership trigger protects the last team administrator. A
-- permanent account deletion is initiated above that level and must be able to
-- revoke every membership (the global console already highlights a team
-- left without an administrator). The transaction-local marker is set only by
-- the private Auth deletion trigger below.
create or replace function public.protect_last_team_admin() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('grep.account_deletion_profile_id', true) = old.profile_id::text then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if not exists(select 1 from public.teams where id = old.team_id) then
    return old;
  end if;
  if public.is_global_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if old.role = 'admin' then
    if (tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role <> 'admin')) and
      not exists(
        select 1 from public.team_memberships
        where team_id = old.team_id and profile_id <> old.profile_id and role = 'admin'
      )
    then
      raise exception 'Hvert lag må ha minst én administrator';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.handle_deleted_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  tombstone_email public.citext := ('deleted+' || old.id::text || '@deleted.invalid')::public.citext;
begin
  -- A platform owner must first transfer or revoke that authority explicitly.
  -- This also protects the last global admin from a mistaken dashboard click.
  if exists (
    select 1 from public.profiles
    where id = old.id and is_global_admin
  ) then
    raise exception 'En systemadministrator kan ikke slettes permanent';
  end if;

  -- Access and private preferences disappear with the login account.
  perform set_config('grep.account_deletion_profile_id', old.id::text, true);
  delete from public.team_memberships where profile_id = old.id;
  perform set_config('grep.account_deletion_profile_id', '', true);
  delete from public.exercise_favorites where profile_id = old.id;
  update public.session_items set assigned_coach_id = null where assigned_coach_id = old.id;

  -- An unused invitation is no longer actionable. Accepted invitations remain
  -- as audit history, but must not retain the deleted person's email address.
  delete from public.team_invitations
  where accepted_at is null
    and lower(email::text) = lower(coalesce(old.email, ''));

  update public.team_invitations
  set email = tombstone_email
  where accepted_at is not null
    and lower(email::text) = lower(coalesce(old.email, ''));

  -- Keep only the stable id needed by historical foreign keys.
  update public.profiles
  set email = tombstone_email,
      full_name = 'Slettet bruker',
      avatar_url = null,
      is_global_admin = false,
      must_set_password = false,
      deleted_at = now()
  where id = old.id;

  return old;
end;
$$;

drop trigger if exists auth_user_before_delete on auth.users;
create trigger auth_user_before_delete
before delete on auth.users
for each row execute function public.handle_deleted_auth_user();

-- One account directory for the system-administration screen. It intentionally
-- joins Auth users, so historical tombstones never appear as active accounts.
-- Keeping this behind a security-definer RPC avoids exposing auth.users or
-- widening the normal team-scoped profile policies.
create or replace function public.admin_list_accounts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Du må være systemadministrator';
  end if;

  select coalesce(jsonb_agg(account_entry order by sort_name, sort_email), '[]'::jsonb)
  into result
  from (
    select
      lower(profile.full_name) as sort_name,
      lower(auth_user.email) as sort_email,
      jsonb_build_object(
        'id', profile.id,
        'email', auth_user.email,
        'full_name', profile.full_name,
        'is_global_admin', profile.is_global_admin,
        'created_at', auth_user.created_at,
        'last_sign_in_at', auth_user.last_sign_in_at,
        'files_owned', (
          select count(*)
          from storage.objects object
          where object.owner_id::text = profile.id::text
        ),
        'memberships', coalesce((
          select jsonb_agg(jsonb_build_object(
            'team_id', team.id,
            'team_name', team.name,
            'role', membership.role
          ) order by team.name)
          from public.team_memberships membership
          join public.teams team on team.id = membership.team_id
          where membership.profile_id = profile.id
        ), '[]'::jsonb)
      ) as account_entry
    from auth.users auth_user
    join public.profiles profile on profile.id = auth_user.id
    where profile.deleted_at is null
  ) listed;

  return result;
end;
$$;

revoke execute on function public.admin_list_accounts() from public, anon;
grant execute on function public.admin_list_accounts() to authenticated;

-- Accounts created for an invitation but never used should not live forever.
-- This deliberately ignores accounts with a live invitation, a membership, a
-- global-admin role or owned Storage objects. The tombstone trigger preserves
-- any non-personal authored content if a legacy account somehow has some.
create or replace function public.purge_abandoned_auth_accounts() returns integer
language plpgsql security definer set search_path = '' as $$
declare purged_count integer;
begin
  with candidates as (
    select auth_user.id
    from auth.users auth_user
    join public.profiles profile on profile.id = auth_user.id
    where auth_user.last_sign_in_at is null
      and auth_user.created_at < now() - interval '30 days'
      and not profile.is_global_admin
      and not exists (
        select 1 from public.team_memberships membership
        where membership.profile_id = auth_user.id
      )
      and not exists (
        select 1 from public.team_invitations invitation
        where lower(invitation.email::text) = lower(coalesce(auth_user.email, ''))
          and invitation.accepted_at is null
          and invitation.expires_at > now()
      )
      and not exists (
        select 1 from storage.objects object
        where object.owner_id::text = auth_user.id::text
      )
  ), deleted as (
    delete from auth.users auth_user
    using candidates
    where auth_user.id = candidates.id
    returning auth_user.id
  )
  select count(*)::integer into purged_count from deleted;

  return purged_count;
end;
$$;

revoke execute on function public.purge_abandoned_auth_accounts() from public, anon, authenticated;

-- Supabase Cron is optional. Projects that already enabled pg_cron get the
-- cleanup daily; elsewhere the function remains ready to schedule later.
do $$
declare job_missing boolean;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select not exists (select 1 from cron.job where jobname = $1)'
      into job_missing
      using 'grep-purge-abandoned-auth-accounts';
    if job_missing then
      perform cron.schedule(
        'grep-purge-abandoned-auth-accounts',
        '17 3 * * *',
        'select public.purge_abandoned_auth_accounts()'
      );
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';
