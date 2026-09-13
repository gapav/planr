-- Stations blocks: a bolk whose activities run in parallel rather than in
-- sequence. The team is split into as many groups as there are stations and
-- rotates between them, so the minutes belong to the block — one rotation —
-- and not to each activity.
--
-- The stations themselves are the block's own `session_items`: station order is
-- `position`, and `assigned_coach_id` finally means what a coach expects it to
-- mean, namely who mans that station.

create type public.session_block_kind as enum ('sequence', 'stations');

alter table public.session_blocks
  add column kind public.session_block_kind not null default 'sequence',
  add column rotation_minutes integer check (rotation_minutes between 1 and 60),
  -- A rotation only means anything on a stations block, and a stations block
  -- without one has no duration at all.
  add constraint session_blocks_rotation_requires_stations
    check ((kind = 'stations') = (rotation_minutes is not null));

/*
 * Every station lasts one rotation, so `duration_minutes` on a station item is
 * not the coach's to set — it is the block's rotation, mirrored down. Keeping
 * the copy rather than deriving it at read time is what lets `blockDuration`,
 * the time budget, the session view, the workout runner and the morning digest
 * all keep summing item minutes and still get `stations × rotation` right,
 * without any of them learning a second formula. The trigger pair below is what
 * makes the copy impossible to drift from the block.
 */
create or replace function public.sync_station_item_duration() returns trigger
language plpgsql set search_path = public as $$
declare
  rotation integer;
begin
  select b.rotation_minutes into rotation
  from public.session_blocks b
  where b.id = new.block_id and b.kind = 'stations';
  if rotation is not null then new.duration_minutes := rotation; end if;
  return new;
end;
$$;

create or replace function public.sync_station_durations_from_block() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.session_items
  set duration_minutes = new.rotation_minutes
  where block_id = new.id and duration_minutes is distinct from new.rotation_minutes;
  return null;
end;
$$;

drop trigger if exists items_sync_station_duration on public.session_items;
create trigger items_sync_station_duration
before insert or update of block_id, duration_minutes on public.session_items
for each row execute function public.sync_station_item_duration();

-- Fires after the block is written, so the items see the new rotation. A
-- session that is `in_progress` is locked by `prevent_in_progress_session_changes`
-- on the block itself, which is the right answer: the rotation cannot change
-- once the workout has started, so this cascade never runs against locked rows.
drop trigger if exists blocks_sync_station_durations on public.session_blocks;
create trigger blocks_sync_station_durations
after update of kind, rotation_minutes on public.session_blocks
for each row when (new.kind = 'stations')
execute function public.sync_station_durations_from_block();

/*
 * `copy_session` names the block columns it copies, so without this a copied
 * stations block would come back as an ordinary one — the plan intact on the
 * face of it, but run in sequence and no longer asking for a group per station.
 * Redefined here whole rather than patched, since 202609020032 has shipped.
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
  insert into public.session_items (block_id, kind, exercise_id, title, description, media_url, thumbnail_url, duration_minutes, coaching_notes, assigned_coach_id, position, updated_by)
  select copied.id, item.kind, item.exercise_id, item.title, item.description, item.media_url, item.thumbnail_url, item.duration_minutes, item.coaching_notes,
         -- A coach who has since left the team would be refused by
         -- `validate_session_item_coach` and take the whole copy down with them,
         -- so the new plan starts out unassigned where the old one named them.
         case when exists (
           select 1 from public.team_memberships membership
           where membership.team_id = source.team_id and membership.profile_id = item.assigned_coach_id
         ) then item.assigned_coach_id end,
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

-- Make the new schema visible to PostgREST immediately after a manual SQL Editor run.
notify pgrst, 'reload schema';
