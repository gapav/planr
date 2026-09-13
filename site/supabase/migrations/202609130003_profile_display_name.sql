-- The coach's screen name.
--
-- `handle_new_user` seeds `full_name` from the email local part, because an
-- account exists before anyone has asked its owner what to call them. That
-- placeholder is what every avatar, byline and morning letter shows, so the
-- coach now renames themselves from /team → Innstillinger. Nothing about auth
-- changes: `update (full_name, avatar_url, must_set_password)` was already
-- granted to `authenticated` by `202609020011`, and the `profiles_update_self`
-- policy already limits the rename to the coach's own row.
--
-- What is new is that the column is now user input, so the database states the
-- same rule the form does. Existing rows are tidied first, or the constraint
-- could not be added: whitespace collapsed, and anything left too short falls
-- back to the default name.

update public.profiles
set full_name = regexp_replace(btrim(full_name), '\s+', ' ', 'g')
where full_name is distinct from regexp_replace(btrim(full_name), '\s+', ' ', 'g');

update public.profiles
set full_name = 'Trener'
where char_length(full_name) < 2;

update public.profiles
set full_name = left(full_name, 60)
where char_length(full_name) > 60;

alter table public.profiles
  add constraint profiles_full_name_length
  check (char_length(full_name) between 2 and 60);

-- Normalizing in the database as well keeps the stored name tidy whatever the
-- writer is — the app, a dashboard edit, or a future import. On insert a name
-- too short for the constraint falls back to the default, because the seeded
-- name is the email local part and an address like `o@klubb.no` must not fail
-- account creation. On update it is left alone, so a rename that breaks the
-- rule is refused out loud rather than silently replaced.
create or replace function public.normalize_profile_full_name() returns trigger
language plpgsql set search_path = public as $$
begin
  new.full_name := regexp_replace(btrim(coalesce(new.full_name, '')), '\s+', ' ', 'g');
  if tg_op = 'INSERT' and char_length(new.full_name) < 2 then
    new.full_name := 'Trener';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_normalize_full_name on public.profiles;
create trigger profiles_normalize_full_name
before insert or update of full_name on public.profiles
for each row execute function public.normalize_profile_full_name();
