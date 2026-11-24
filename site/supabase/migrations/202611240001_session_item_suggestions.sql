-- «Foreslå alternativ»: a coach proposes a replacement exercise on an
-- activity in a colleague's plan (issue #52, decision 14).
--
-- Sessions are planned by one coach and run by a coaching team. A colleague
-- who thinks an exercise should be swapped could only edit the plan behind the
-- author's back or say so outside Grep. A suggestion is a row of its own
-- rather than a field on the activity because there can be several — one per
-- coach — and each has an author, a comment and a life of its own: it is
-- accepted («Bytt»), dismissed («Avvis») or withdrawn («Trekk tilbake»).
--
-- The row holds only the exercise id. Title, thumbnail and media come from the
-- library on screen, as they do for the activity itself, and accepting copies
-- the exercise's display data onto the activity the way adding it does.
--
-- What makes this plan content, and how each rule is kept:
--
--   * Access is the activity's: `can_access_session_item` goes item → block →
--     session → team, built from the helpers in 202609020001. A global admin
--     reads every team's suggestions, as they read every plan (202609250001),
--     and writes none.
--   * A coach writes only in their own name (`suggested_by = auth.uid()`), and
--     changes only their own suggestion. Any coach on the team may delete one:
--     dismissing a colleague's suggestion and withdrawing one's own are the
--     same delete.
--   * The lock: `prevent_in_progress_session_changes` covers the table, so
--     nothing is suggested, changed, dismissed or accepted once a workout has
--     started or finished. Deleting the session or the activity still
--     cascades here: by then the parent rows are gone, so the lock finds no
--     session to hold.
--   * Realtime: `broadcast_session_change` learns the table, so another
--     coach's open plan reloads and shows a suggestion the moment it is made.
--   * `copy_session` names the tables it copies and this is not one of them:
--     a copied plan starts without suggestions. Nothing to change there.
--   * Accepting is one `security definer` RPC, so the swap and the deletion of
--     the suggestion happen in one transaction or not at all.
--
-- Safe to run twice: `if not exists`, `drop … if exists` before `create`, and
-- `create or replace` for every function.

create table if not exists public.session_item_suggestions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.session_items(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  suggested_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  comment text not null default '' check (char_length(comment) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One suggestion per coach per activity; suggesting again is an upsert on it.
  unique (item_id, suggested_by)
);

-- The unique constraint already indexes `item_id` first. Deleting an exercise
-- cascades here, so that lookup gets an index of its own.
create index if not exists idx_session_item_suggestions_exercise on public.session_item_suggestions(exercise_id);

drop trigger if exists session_item_suggestions_touch on public.session_item_suggestions;
create trigger session_item_suggestions_touch before update on public.session_item_suggestions
for each row execute function public.touch_updated_at();

-- The activity's own access rule, for a table that hangs off the activity.
create or replace function public.can_access_session_item(target_item_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.session_items where id = target_item_id and public.can_access_block(block_id))
$$;

revoke execute on function public.can_access_session_item(uuid) from public, anon;
grant execute on function public.can_access_session_item(uuid) to authenticated;

-- Rules a policy cannot state, because they compare the row with others:
--
--   * Only an exercise activity takes suggestions — a free-text one has no
--     exercise to swap.
--   * The suggestion cannot name the exercise the activity already has.
--   * The exercise has to be one the coach can see in the library: not one
--     somebody else has archived. (The definer reads past RLS, so this is the
--     `exercises_authenticated_read` rule, stated here.)
--   * A suggestion stays on its activity and with its author — the column
--     grant already says so; this is the same rule for any definer writing
--     the table. A coach who wants another activity suggests there.
create or replace function public.validate_session_item_suggestion() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target_item public.session_items%rowtype;
  target_exercise public.exercises%rowtype;
begin
  -- First, so a coach outside the team gets one answer whatever the item is.
  if not public.can_access_session_item(new.item_id) then
    raise exception 'Aktiviteten ble ikke funnet';
  end if;
  if tg_op = 'UPDATE' and (new.item_id <> old.item_id or new.suggested_by <> old.suggested_by) then
    raise exception 'Et forslag kan ikke flyttes';
  end if;
  new.comment := btrim(coalesce(new.comment, ''));

  select * into target_item from public.session_items where id = new.item_id;
  if not found then raise exception 'Aktiviteten ble ikke funnet'; end if;
  if target_item.kind <> 'exercise' then
    raise exception 'Bare øvelser kan få forslag til alternativ';
  end if;
  if target_item.exercise_id is not distinct from new.exercise_id then
    raise exception 'Øvelsen er allerede i planen';
  end if;

  if tg_op = 'INSERT' or new.exercise_id <> old.exercise_id then
    select * into target_exercise from public.exercises where id = new.exercise_id;
    if not found or not (target_exercise.archived_at is null or target_exercise.created_by = auth.uid()) then
      raise exception 'Øvelsen ble ikke funnet';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists session_item_suggestions_validate on public.session_item_suggestions;
create trigger session_item_suggestions_validate before insert or update on public.session_item_suggestions
for each row execute function public.validate_session_item_suggestion();

revoke execute on function public.validate_session_item_suggestion() from public, anon, authenticated;

-- The lock, taught where a suggestion's session is: item → block → session.
-- Everything else is 202609020016 unchanged.
create or replace function public.prevent_in_progress_session_changes() returns trigger
language plpgsql set search_path = public as $$
declare
  target_session_id uuid;
  locked_status public.session_status;
begin
  if tg_table_name = 'sessions' then
    target_session_id := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name = 'session_blocks' then
    target_session_id := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
  elsif tg_table_name = 'session_items' then
    select session_id into target_session_id from public.session_blocks
    where id = case when tg_op = 'DELETE' then old.block_id else new.block_id end;
  elsif tg_table_name = 'session_item_suggestions' then
    select block.session_id into target_session_id
    from public.session_items item
    join public.session_blocks block on block.id = item.block_id
    where item.id = case when tg_op = 'DELETE' then old.item_id else new.item_id end;
  else
    target_session_id := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
  end if;
  if target_session_id is not null
     and coalesce(current_setting('plannr.unlocked_session', true), '') = target_session_id::text
  then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select status into locked_status from public.sessions
  where id = target_session_id and status in ('in_progress', 'completed');
  if locked_status = 'in_progress' then
    raise exception 'Denne økten pågår og er låst';
  elsif locked_status = 'completed' and not (tg_table_name = 'sessions' and tg_op = 'DELETE') then
    raise exception 'Denne økten er avsluttet og låst';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.prevent_in_progress_session_changes() from public, anon, authenticated;

drop trigger if exists session_item_suggestions_lock_in_progress on public.session_item_suggestions;
create trigger session_item_suggestions_lock_in_progress
before insert or update or delete on public.session_item_suggestions
for each row execute function public.prevent_in_progress_session_changes();

-- Realtime, taught the same path. Everything else is 202609020001 unchanged.
-- A suggestion removed by its activity's deletion finds no activity left and
-- sends nothing; the activity's own delete has already said so.
create or replace function public.broadcast_session_change() returns trigger
language plpgsql security definer set search_path = public, realtime as $$
declare target_session_id uuid;
begin
  if tg_table_name = 'sessions' then target_session_id := coalesce(new.id, old.id);
  elsif tg_table_name = 'session_blocks' then target_session_id := coalesce(new.session_id, old.session_id);
  elsif tg_table_name = 'session_item_suggestions' then
    select block.session_id into target_session_id
    from public.session_items item
    join public.session_blocks block on block.id = item.block_id
    where item.id = coalesce(new.item_id, old.item_id);
  else select session_id into target_session_id from public.session_blocks where id = coalesce(new.block_id, old.block_id); end if;
  if target_session_id is not null then
    perform realtime.broadcast_changes('session:' || target_session_id::text, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists session_item_suggestions_broadcast on public.session_item_suggestions;
create trigger session_item_suggestions_broadcast after insert or update or delete on public.session_item_suggestions
for each row execute function public.broadcast_session_change();

-- Policies -------------------------------------------------------------------

alter table public.session_item_suggestions enable row level security;

drop policy if exists session_item_suggestions_read_team on public.session_item_suggestions;
create policy session_item_suggestions_read_team on public.session_item_suggestions for select to authenticated
  using (public.can_access_session_item(item_id));

drop policy if exists session_item_suggestions_read_global_admin on public.session_item_suggestions;
create policy session_item_suggestions_read_global_admin on public.session_item_suggestions for select to authenticated
  using (public.is_global_admin());

drop policy if exists session_item_suggestions_add_team on public.session_item_suggestions;
create policy session_item_suggestions_add_team on public.session_item_suggestions for insert to authenticated
  with check (public.can_access_session_item(item_id) and suggested_by = auth.uid());

drop policy if exists session_item_suggestions_edit_own on public.session_item_suggestions;
create policy session_item_suggestions_edit_own on public.session_item_suggestions for update to authenticated
  using (public.can_access_session_item(item_id) and suggested_by = auth.uid())
  with check (public.can_access_session_item(item_id) and suggested_by = auth.uid());

drop policy if exists session_item_suggestions_delete_team on public.session_item_suggestions;
create policy session_item_suggestions_delete_team on public.session_item_suggestions for delete to authenticated
  using (public.can_access_session_item(item_id));

revoke all on public.session_item_suggestions from anon, authenticated;
grant select, delete on public.session_item_suggestions to authenticated;
-- The timestamps are the database's to write.
grant insert (id, item_id, exercise_id, suggested_by, comment) on public.session_item_suggestions to authenticated;
-- Re-suggesting replaces the coach's own row — an upsert on
-- `(item_id, suggested_by)` that changes only these two columns, which the app
-- writes as an update of that row. Nothing else about a suggestion changes.
grant update (exercise_id, comment) on public.session_item_suggestions to authenticated;

-- An exercise archived after it was suggested still shows on the card, marked
-- as archived, and can still be swapped in (issue #52). The library hides an
-- archived exercise from everybody but its author, so this read is added for
-- exactly the exercises suggested in a plan the coach can read. The inner
-- query runs under the coach's own RLS on suggestions, so it reveals nothing
-- outside their teams. It only ever adds archived rows, and says so first, so
-- the ordinary library read does not pay for the lookup.
drop policy if exists exercises_read_suggested on public.exercises;
create policy exercises_read_suggested on public.exercises for select to authenticated
  using (archived_at is not null and exists (select 1 from public.session_item_suggestions suggestion where suggestion.exercise_id = exercises.id));

-- Accepting --------------------------------------------------------------------

-- «Bytt»: the activity takes the suggested exercise — its id and the display
-- data a new activity would copy — and keeps everything that belongs to the
-- plan: position, minutes, stikkord and coaches. The suggestion goes, and so
-- does any other one that now names the exercise the activity has. The rest
-- stay: they are still alternatives for the same slot.
--
-- The update runs as the caller (`updated_by = auth.uid()`), so the activity's
-- own triggers broadcast it and check it as they would any edit.
create or replace function public.accept_item_suggestion(target_suggestion_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  suggestion public.session_item_suggestions%rowtype;
  target_item_id uuid;
  target_item public.session_items%rowtype;
  target_exercise public.exercises%rowtype;
  target_status public.session_status;
begin
  select item_id into target_item_id from public.session_item_suggestions where id = target_suggestion_id;
  if not found or not public.can_access_session_item(target_item_id) then
    raise exception 'Forslaget ble ikke funnet';
  end if;

  -- Rows are locked in the order deleting the activity takes them — the
  -- activity, then its suggestions — so the two cannot deadlock. The session
  -- is held `for share`, so a `start_session` running alongside waits for the
  -- swap rather than starting a workout under it.
  select * into target_item from public.session_items where id = target_item_id for update;
  select * into suggestion from public.session_item_suggestions where id = target_suggestion_id for update;
  if not found then
    raise exception 'Forslaget ble ikke funnet';
  end if;
  select session.status into target_status
  from public.session_blocks block
  join public.sessions session on session.id = block.session_id
  where block.id = target_item.block_id
  for share of session;
  if target_status = 'in_progress' then
    raise exception 'Denne økten pågår og er låst';
  elsif target_status = 'completed' then
    raise exception 'Denne økten er avsluttet og låst';
  end if;

  -- What the coach may read: the library's rule, plus the suggested-exercise
  -- read above, which a suggestion on their own team's plan always satisfies.
  -- So a missing exercise is refused here and an archived one is not.
  select * into target_exercise from public.exercises where id = suggestion.exercise_id;
  if not found then
    raise exception 'Øvelsen ble ikke funnet';
  end if;

  update public.session_items
  set kind = 'exercise',
      exercise_id = target_exercise.id,
      title = left(target_exercise.name, 140),
      description = target_exercise.description,
      media_url = target_exercise.media_url,
      thumbnail_url = target_exercise.thumbnail_url,
      updated_by = auth.uid()
  where id = target_item.id;

  delete from public.session_item_suggestions
  where item_id = target_item.id
    and (id = target_suggestion_id or exercise_id = target_exercise.id);
end;
$$;

revoke execute on function public.accept_item_suggestion(uuid) from public, anon;
grant execute on function public.accept_item_suggestion(uuid) to authenticated;

-- Make the new table and function visible to PostgREST immediately after a
-- manual SQL Editor run.
notify pgrst, 'reload schema';
