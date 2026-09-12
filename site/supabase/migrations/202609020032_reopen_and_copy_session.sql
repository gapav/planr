-- Gjenåpne en avsluttet økt, og kopier en økt til et nytt utkast.
--
-- Two inverses the lifecycle was missing. `finish_session` had no counterpart,
-- so a workout finished by mistake — or one finished before the plan was
-- corrected — was a dead end: `prevent_in_progress_session_changes` locks every
-- row of a completed session. And there was no way to reuse a plan: a coach who
-- runs the same session next week had to rebuild it block by block.

-- The mirror image of `undo_session_start`, one state further along: the plan
-- returns to "ready to start" with its attendance and groups intact, so it can
-- be corrected and run again. Like every other transition against a locked
-- session it opens `plannr.unlocked_session` for this session id, for the
-- length of this transaction only.
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
      grouping_kind = null,
      updated_by = auth.uid()
  where id = target_session_id;
  perform set_config('plannr.unlocked_session', '', true);
end;
$$;

revoke execute on function public.reopen_session(uuid) from public, anon;
grant execute on function public.reopen_session(uuid) to authenticated;

-- Copying is one RPC rather than three round-trips from the browser because it
-- is one transaction: a plan that arrived without its blocks, or blocks without
-- their activities, would be worse than no copy at all. The source is only read,
-- so a session in any state can be copied — a finished one most of all.
--
-- What comes along: the plan and everything in it. What does not: the date
-- (the caller names a new one, or none), the status (always a fresh draft), and
-- attendance and groups, which are the record of one particular evening rather
-- than part of the plan.
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
    insert into public.session_blocks (session_id, title, notes, position, updated_by)
    select copy_id, source_block.title, source_block.notes, source_block.position, auth.uid()
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

-- Make the new RPCs visible to PostgREST immediately after a manual SQL Editor run.
notify pgrst, 'reload schema';
