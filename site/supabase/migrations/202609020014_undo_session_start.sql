-- Let a coach recover from starting the wrong workout or briefly testing the
-- live runner. Attendance and generated groups remain available for setup.
create or replace function public.undo_session_start(target_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target public.sessions%rowtype;
begin
  select * into target from public.sessions where id = target_session_id for update;

  if not found or not public.is_team_member(target.team_id) then
    raise exception 'Session not found';
  end if;
  if target.status <> 'in_progress' then
    raise exception 'Only a workout in progress can be reset';
  end if;

  -- The existing lock trigger allows only the session named in this
  -- transaction-local setting to change.
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

revoke execute on function public.undo_session_start(uuid) from public, anon;
grant execute on function public.undo_session_start(uuid) to authenticated;

-- Make the new RPC visible to PostgREST immediately after a manual SQL Editor run.
notify pgrst, 'reload schema';
