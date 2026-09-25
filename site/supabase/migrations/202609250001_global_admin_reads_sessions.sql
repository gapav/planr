-- The platform owner reads every team's training plans.
--
-- 202609020018 kept the global admin out of the plans of a team they do not
-- coach. That is relaxed for the plans themselves — the session, its blocks
-- and its activities — and for reading only:
--
--   * These are extra permissive SELECT policies, OR'd with the membership
--     ones. `can_access_session` / `can_access_block` are left alone, because
--     every insert/update/delete policy and the Realtime topic are built from
--     them; widening the helpers would hand out write access and live presence
--     along with the read.
--   * The roster, attendance and groupings stay team-only. A plan names no
--     players, so the admin sees what a team trains without seeing who.

create policy sessions_read_global_admin on public.sessions for select to authenticated
  using (public.is_global_admin());
create policy blocks_read_global_admin on public.session_blocks for select to authenticated
  using (public.is_global_admin());
create policy items_read_global_admin on public.session_items for select to authenticated
  using (public.is_global_admin());
