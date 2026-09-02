-- Club logo per team.
--
-- The logo is deliberately public: it is rendered in the sidebar, the session
-- calendar and the live workout view, all of which load the image straight from
-- storage with no session. Only a team admin can upload into the team's folder
-- or repoint the team row, and nothing about a logo is player data.

alter table public.teams add column if not exists logo_url text;

alter table public.teams drop constraint if exists teams_logo_url_check;
alter table public.teams add constraint teams_logo_url_check
  check (logo_url is null or (logo_url like 'https://%' and char_length(logo_url) <= 2048));

-- A separate bucket from `exercise-videos`, so that bucket's "first folder is
-- the uploader" rule keeps its meaning; here the first folder is the team.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Object names are free text, so a bare `folder::uuid` in the policy would
-- raise 22P02 on a malformed path instead of denying it, and `and` gives no
-- guarantee that a regex guard is evaluated before the cast. Do both here.
create or replace function public.is_team_logo_folder_admin(folder text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if folder is null or folder !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then return false; end if;
  return public.is_team_admin(folder::uuid);
end;
$$;

revoke execute on function public.is_team_logo_folder_admin(text) from public, anon;
grant execute on function public.is_team_logo_folder_admin(text) to authenticated;

drop policy if exists team_logos_insert_admin on storage.objects;
create policy team_logos_insert_admin
on storage.objects for insert to authenticated
with check (
  bucket_id = 'team-logos'
  and public.is_team_logo_folder_admin((storage.foldername(name))[1])
);

drop policy if exists team_logos_delete_admin on storage.objects;
create policy team_logos_delete_admin
on storage.objects for delete to authenticated
using (
  bucket_id = 'team-logos'
  and public.is_team_logo_folder_admin((storage.foldername(name))[1])
);

-- Make the new column visible to PostgREST immediately after a manual SQL
-- Editor run, otherwise `logo_url` reads back as an unknown column.
notify pgrst, 'reload schema';
