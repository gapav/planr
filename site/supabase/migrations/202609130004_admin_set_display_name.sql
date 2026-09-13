-- A system administrator renames a coach.
--
-- Accounts are created from the Supabase dashboard, so `full_name` starts as
-- the email local part — "gard.pavels.hoivang" in the admin's own team list.
-- The coach can fix that themselves from /team → Innstillinger (202609130003),
-- but the administrator who onboards them should not have to wait for it.
--
-- An RPC rather than a second update policy on `profiles`: the column grant is
-- table-wide, so a policy letting a global admin update another coach's row
-- would hand them `avatar_url` and the personal `session_digest_email` opt-out
-- along with the name. This grants exactly one column on exactly one row, and
-- re-checks the caller's own `is_global_admin` inside the database, where the
-- client cannot skip it.
--
-- The normalizing trigger and the length constraint from 202609130003 apply
-- here too, so the administrator cannot store a name the coach could not.
create or replace function public.admin_set_display_name(profile_id uuid, display_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_global_admin() then raise exception 'Du må være systemadministrator'; end if;
  update public.profiles set full_name = display_name
  where id = profile_id and deleted_at is null;
  if not found then raise exception 'Fant ikke kontoen'; end if;
end;
$$;

revoke execute on function public.admin_set_display_name(uuid, text) from public, anon;
grant execute on function public.admin_set_display_name(uuid, text) to authenticated;

notify pgrst, 'reload schema';
