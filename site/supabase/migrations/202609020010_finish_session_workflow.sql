alter table public.sessions
  add column if not exists completed_at timestamptz;

-- Finishing is the only write allowed against an in-progress session, so it
-- opens the lock for exactly one session id, for the length of this
-- transaction only.
create or replace function public.finish_session(target_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target public.sessions%rowtype;
begin
  select * into target from public.sessions where id = target_session_id for update;

  if not found or not public.is_team_member(target.team_id) then
    raise exception 'Session not found';
  end if;
  if target.status <> 'in_progress' then
    raise exception 'Only a workout in progress can be finished';
  end if;

  perform set_config('plannr.unlocked_session', target_session_id::text, true);
  update public.sessions
  set status = 'completed',
      completed_at = now(),
      updated_by = auth.uid()
  where id = target_session_id;
  perform set_config('plannr.unlocked_session', '', true);
end;
$$;

revoke execute on function public.finish_session(uuid) from public, anon;
grant execute on function public.finish_session(uuid) to authenticated;

-- A finished workout stays locked: the plan, attendance and groups are the
-- record of what happened. Deleting the session row itself is still allowed so
-- a team can remove a workout entirely; the cascade reaches the child rows
-- after the parent is gone, so their triggers see no locked session.
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
    select session_id into target_session_id
    from public.session_blocks
    where id = case when tg_op = 'DELETE' then old.block_id else new.block_id end;
  else
    target_session_id := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
  end if;

  if target_session_id is not null
     and coalesce(current_setting('plannr.unlocked_session', true), '') = target_session_id::text
  then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select status into locked_status
  from public.sessions
  where id = target_session_id and status in ('in_progress', 'completed');

  if locked_status = 'in_progress' then
    raise exception 'This workout is in progress and is locked';
  elsif locked_status = 'completed' and not (tg_table_name = 'sessions' and tg_op = 'DELETE') then
    raise exception 'This workout is finished and is locked';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.prevent_in_progress_session_changes() from public, anon, authenticated;

-- Make the new RPC and column visible to PostgREST immediately after a manual SQL Editor run.
notify pgrst, 'reload schema';
