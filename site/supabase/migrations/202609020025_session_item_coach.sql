-- Ansvarlig trener per aktivitet.
--
-- A session is run by the whole coaching team, not by whoever wrote the plan:
-- one coach takes the shooting station while another runs the goalkeepers. The
-- assignment belongs to the plan rather than to the exercise, exactly like
-- `duration_minutes` and `coaching_notes`, so it lives on the item row and is
-- never copied back into the library.
--
-- Nullable throughout: most activities are run by everybody, and forcing a name
-- on each one would turn a useful hint into paperwork.
alter table public.session_items
  add column if not exists assigned_coach_id uuid references public.profiles(id) on delete set null;

-- Only ever read as part of the item row the plan already loads, so no index:
-- the session is fetched whole by block, and nothing queries "what is this
-- coach responsible for" yet.

-- The browser talks to PostgREST directly, so nothing stops a crafted request
-- from naming a profile outside the team — which would leak a name into a plan
-- and, worse, hand the item to somebody who cannot see it. The check has to sit
-- in the database. `security definer` because the assigned coach's membership
-- row is not necessarily one the writer may select.
--
-- A coach later removed from the team keeps their name on the items they were
-- given: clearing them here would mean writing to session rows that
-- `prevent_in_progress_session_changes` locks, so a membership delete would
-- start failing. The UI resolves an unknown id to a neutral placeholder
-- instead (`coachAssignmentOptions` in lib/session.ts).
create or replace function public.validate_session_item_coach() returns trigger
language plpgsql security definer set search_path = public as $$
declare target_team_id uuid;
begin
  if new.assigned_coach_id is null then return new; end if;
  -- An untouched assignment survives every other edit, including one made after
  -- the named coach left the team.
  if tg_op = 'UPDATE' and new.assigned_coach_id is not distinct from old.assigned_coach_id then return new; end if;
  select session.team_id into target_team_id
  from public.session_blocks block
  join public.sessions session on session.id = block.session_id
  where block.id = new.block_id;
  if not exists (
    select 1 from public.team_memberships
    where team_id = target_team_id and profile_id = new.assigned_coach_id
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

-- Make the new column visible to PostgREST immediately after a manual SQL
-- Editor run.
notify pgrst, 'reload schema';
