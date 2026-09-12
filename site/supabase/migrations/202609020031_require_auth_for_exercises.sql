-- The exercise library belongs to the signed-in coaching workspace. Keep the
-- page guard and the data boundary aligned so anonymous clients cannot bypass
-- the UI and query the table through PostgREST.
drop policy if exists exercises_public_read on public.exercises;
drop policy if exists exercises_authenticated_read on public.exercises;
create policy exercises_authenticated_read on public.exercises for select to authenticated
  using (archived_at is null or created_by = auth.uid() or public.is_global_admin());

revoke select on public.exercises from anon;

notify pgrst, 'reload schema';
