alter table public.sessions
  add column if not exists started_at timestamptz,
  add column if not exists grouping_kind public.session_grouping_kind;

create or replace function public.start_session(
  target_session_id uuid,
  selected_grouping_kind public.session_grouping_kind
) returns void
language plpgsql security definer set search_path = public as $$
declare
  target public.sessions%rowtype;
  selected_groups jsonb;
  present_count integer;
  grouped_count integer;
  grouped_total_count integer;
begin
  select * into target from public.sessions where id = target_session_id for update;

  if not found or not public.is_team_member(target.team_id) then
    raise exception 'Session not found';
  end if;
  if target.status <> 'published' then
    raise exception 'Only a published session can be started';
  end if;

  select groups into selected_groups
  from public.session_groupings
  where session_id = target_session_id and kind = selected_grouping_kind;

  if selected_groups is null or jsonb_array_length(selected_groups) = 0 then
    raise exception 'Generate groups before starting the workout';
  end if;

  select count(*) into present_count
  from public.session_attendance
  where session_id = target_session_id and is_present;

  select count(distinct grouped_player.id) into grouped_count
  from jsonb_array_elements(selected_groups) as generated_group,
       jsonb_array_elements_text(generated_group -> 'playerIds') as grouped_player(id)
  join public.session_attendance attendance
    on attendance.session_id = target_session_id
   and attendance.player_id::text = grouped_player.id
   and attendance.is_present;

  select count(*) into grouped_total_count
  from jsonb_array_elements(selected_groups) as generated_group,
       jsonb_array_elements_text(generated_group -> 'playerIds') as grouped_player(id);

  if present_count < 2 or grouped_count <> present_count or grouped_total_count <> present_count then
    raise exception 'Attendance changed — generate groups again';
  end if;

  update public.sessions
  set status = 'in_progress',
      started_at = now(),
      grouping_kind = selected_grouping_kind,
      updated_by = auth.uid()
  where id = target_session_id;
end;
$$;

revoke execute on function public.start_session(uuid, public.session_grouping_kind) from public, anon;
grant execute on function public.start_session(uuid, public.session_grouping_kind) to authenticated;

create or replace function public.prevent_in_progress_session_changes() returns trigger
language plpgsql set search_path = public as $$
declare
  target_session_id uuid;
begin
  if tg_table_name = 'sessions' then
    target_session_id := case when tg_op = 'DELETE' then old.id else new.id end;
  elsif tg_table_name = 'session_blocks' then
    target_session_id := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
  elsif tg_table_name = 'session_items' then
    select session_id into target_session_id
    from public.session_blocks
    where id = case when tg_op = 'DELETE' then old.block_id else new.block_id end;
  else
    target_session_id := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
  end if;

  if exists(
    select 1 from public.sessions
    where id = target_session_id and status = 'in_progress'
  ) then
    raise exception 'This workout is in progress and is locked';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists sessions_lock_in_progress on public.sessions;
create trigger sessions_lock_in_progress
before update or delete on public.sessions
for each row execute function public.prevent_in_progress_session_changes();

drop trigger if exists blocks_lock_in_progress on public.session_blocks;
create trigger blocks_lock_in_progress
before insert or update or delete on public.session_blocks
for each row execute function public.prevent_in_progress_session_changes();

drop trigger if exists items_lock_in_progress on public.session_items;
create trigger items_lock_in_progress
before insert or update or delete on public.session_items
for each row execute function public.prevent_in_progress_session_changes();

drop trigger if exists attendance_lock_in_progress on public.session_attendance;
create trigger attendance_lock_in_progress
before insert or update or delete on public.session_attendance
for each row execute function public.prevent_in_progress_session_changes();

drop trigger if exists groupings_lock_in_progress on public.session_groupings;
create trigger groupings_lock_in_progress
before insert or update or delete on public.session_groupings
for each row execute function public.prevent_in_progress_session_changes();

revoke execute on function public.prevent_in_progress_session_changes() from public, anon, authenticated;

-- Make the new RPC visible to PostgREST immediately after a manual SQL Editor run.
notify pgrst, 'reload schema';
