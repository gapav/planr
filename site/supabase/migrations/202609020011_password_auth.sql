-- Password sign-in replaces magic links. An administrator creates a coach's
-- account in the Supabase dashboard with a temporary password, so the first
-- sign-in has to force them to choose their own.
alter table public.profiles
  add column if not exists must_set_password boolean not null default true;

-- Accounts that predate this migration already chose their own credentials.
update public.profiles set must_set_password = false;

-- The table-wide update grant let any authenticated user set is_global_admin on
-- their own row, which profiles_update_self permits. Narrow it to the columns a
-- coach may actually write about themselves.
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, must_set_password) on public.profiles to authenticated;
