-- Flere ansvarlige trenere per aktivitet.
--
-- 202609020025 gave each activity one responsible coach, and a station proved
-- that one too few: the shooting station wants a coach feeding balls and one
-- watching the technique, and the goalkeepers are often taken by two. So the
-- single `assigned_coach_id` becomes a set, `assigned_coach_ids`.
--
-- An array on the item row rather than a join table, because the assignment is
-- still nothing more than a field of the plan: it is loaded with the row,
-- written by the same `update`, locked by the same trigger once the workout
-- starts, broadcast by the same realtime trigger, and copied with the row by
-- `copy_session`. A table of its own would need every one of those again.
--
-- Empty, not null, is "the whole coaching team" — still the common case.
alter table public.session_items
  add column if not exists assigned_coach_ids uuid[] not null default '{}';

-- A null inside the array would read as a coach nobody can look up, and the
-- cap is a ceiling no coaching team comes near, not a rule anybody plans to.
alter table public.session_items
  drop constraint if exists session_items_assigned_coach_ids_check;
alter table public.session_items
  add constraint session_items_assigned_coach_ids_check
  check (array_position(assigned_coach_ids, null) is null and cardinality(assigned_coach_ids) <= 20);

-- Carry every existing assignment across. A started or finished workout is
-- locked by `prevent_in_progress_session_changes`, so each session is unlocked
-- for this transaction the way the lifecycle RPCs do it — the plan's content
-- does not change, only the shape of the column holding it.
do $$
declare
  target record;
begin
  for target in
    select distinct block.session_id
    from public.session_items item
    join public.session_blocks block on block.id = item.block_id
    where item.assigned_coach_id is not null
  loop
    perform set_config('plannr.unlocked_session', target.session_id::text, true);
    update public.session_items item
    set assigned_coach_ids = array[item.assigned_coach_id]
    from public.session_blocks block
    where block.id = item.block_id
      and block.session_id = target.session_id
      and item.assigned_coach_id is not null
      and cardinality(item.assigned_coach_ids) = 0;
  end loop;
  perform set_config('plannr.unlocked_session', '', true);
end;
$$;

-- The same rule as before, for each coach: nobody outside the session's team.
-- Only the coaches a write *adds* are checked, so a coach who has since left
-- the team survives every other edit — including taking a colleague off the
-- same activity — exactly as the single assignment did. Duplicates are folded
-- away rather than refused; a coach ticked twice is still one coach.
create or replace function public.validate_session_item_coach() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target_team_id uuid;
  added uuid[];
begin
  new.assigned_coach_ids := array(
    select entry.coach_id
    from unnest(new.assigned_coach_ids) with ordinality as entry(coach_id, ord)
    group by entry.coach_id
    order by min(entry.ord)
  );
  if tg_op = 'UPDATE' then
    added := array(select coach_id from unnest(new.assigned_coach_ids) coach_id where coach_id <> all(old.assigned_coach_ids));
  else
    added := new.assigned_coach_ids;
  end if;
  if cardinality(added) = 0 then return new; end if;
  select session.team_id into target_team_id
  from public.session_blocks block
  join public.sessions session on session.id = block.session_id
  where block.id = new.block_id;
  if exists (
    select 1 from unnest(added) coach_id
    where not exists (
      select 1 from public.team_memberships
      where team_id = target_team_id and profile_id = coach_id
    )
  ) then
    raise exception 'Ansvarlig trener må være trener på laget';
  end if;
  return new;
end;
$$;

drop trigger if exists items_validate_coach on public.session_items;
create trigger items_validate_coach before insert or update on public.session_items
for each row execute function public.validate_session_item_coach();

revoke execute on function public.validate_session_item_coach() from public, anon, authenticated;

/*
 * `copy_session` names the item columns it copies, so it is redefined whole —
 * 202609130002 has shipped. A coach who has since left the team would be
 * refused by `validate_session_item_coach` and take the whole copy down with
 * them, so they are left off the new plan; the colleagues they shared the
 * activity with come along.
 */
create or replace function public.copy_session(
  source_session_id uuid,
  new_title text default null,
  new_starts_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  source public.sessions%rowtype;
  copy_id uuid;
  copy_title text;
begin
  select * into source from public.sessions where id = source_session_id;

  if not found or not public.is_team_member(source.team_id) then
    raise exception 'Økten ble ikke funnet';
  end if;

  copy_title := coalesce(nullif(btrim(coalesce(new_title, '')), ''), source.title);

  insert into public.sessions (team_id, title, starts_at, venue, planned_duration_minutes, objective, notes, status, created_by, updated_by)
  values (source.team_id, copy_title, new_starts_at, source.venue, source.planned_duration_minutes, source.objective, source.notes, 'draft', auth.uid(), auth.uid())
  returning id into copy_id;

  -- `position` is unique per session and copied verbatim, so it is also the map
  -- from a source block to the block just made from it. The activities are
  -- inserted in the same statement, from the source blocks the data-modifying
  -- CTE does not touch.
  with copied_blocks as (
    insert into public.session_blocks (session_id, title, notes, kind, rotation_minutes, position, updated_by)
    select copy_id, source_block.title, source_block.notes, source_block.kind, source_block.rotation_minutes, source_block.position, auth.uid()
    from public.session_blocks source_block
    where source_block.session_id = source_session_id
    returning id, position
  )
  insert into public.session_items (block_id, kind, exercise_id, title, description, media_url, thumbnail_url, duration_minutes, coaching_notes, assigned_coach_ids, position, updated_by)
  select copied.id, item.kind, item.exercise_id, item.title, item.description, item.media_url, item.thumbnail_url, item.duration_minutes, item.coaching_notes,
         array(
           select entry.coach_id
           from unnest(item.assigned_coach_ids) with ordinality as entry(coach_id, ord)
           where exists (
             select 1 from public.team_memberships membership
             where membership.team_id = source.team_id and membership.profile_id = entry.coach_id
           )
           order by entry.ord
         ),
         item.position, auth.uid()
  from public.session_blocks source_block
  join copied_blocks copied on copied.position = source_block.position
  join public.session_items item on item.block_id = source_block.id
  where source_block.session_id = source_session_id;

  return copy_id;
end;
$$;

revoke execute on function public.copy_session(uuid, text, timestamptz) from public, anon;
grant execute on function public.copy_session(uuid, text, timestamptz) to authenticated;

/*
 * Account deletion took the deleted coach off every activity with one
 * `update`, and redefining it for the array is also the moment to fix what that
 * update missed: an activity in a started or finished workout is locked, so
 * deleting anybody who had ever been given one failed with "Denne økten er
 * avsluttet og låst". Each affected session is now unlocked for its own update,
 * as the lifecycle RPCs do. Everything else is 202609020030 unchanged.
 */
create or replace function public.handle_deleted_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  tombstone_email public.citext := ('deleted+' || old.id::text || '@deleted.invalid')::public.citext;
  assigned record;
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

  for assigned in
    select distinct block.session_id
    from public.session_items item
    join public.session_blocks block on block.id = item.block_id
    where old.id = any(item.assigned_coach_ids)
  loop
    perform set_config('plannr.unlocked_session', assigned.session_id::text, true);
    update public.session_items item
    set assigned_coach_ids = array_remove(item.assigned_coach_ids, old.id)
    from public.session_blocks block
    where block.id = item.block_id
      and block.session_id = assigned.session_id
      and old.id = any(item.assigned_coach_ids);
  end loop;
  perform set_config('plannr.unlocked_session', '', true);

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

-- Nothing reads the single column any more: the functions above were the last
-- writers, and the app ships reading `assigned_coach_ids`.
alter table public.session_items drop column if exists assigned_coach_id;

-- Make the new column visible to PostgREST immediately after a manual SQL
-- Editor run.
notify pgrst, 'reload schema';
