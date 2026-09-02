-- Norwegian user-facing database messages, image uploads and starting a
-- workout without setup.
--
-- These three changes shipped together and are merged into one migration so
-- there is exactly one ordering: every function below is `create or replace`,
-- and split across files sharing a version number the last one applied would
-- win, which risks reinstating an English message.
--
-- Earlier migrations may already be applied, so functions are replaced whole
-- and keep their signatures, grants and behavior — only the messages change.

-- Keep the existing bucket so videos uploaded after migration 013 retain their
-- public URLs, and extend it with browser-safe image formats.
update storage.buckets
set allowed_mime_types = array[
  'video/mp4',
  'image/jpeg',
  'image/png',
  'image/webp'
]::text[],
    file_size_limit = 5242880
where id = 'exercise-videos';

-- Coaches may intentionally run a workout without tracking attendance or
-- generating groups. Existing setup data is preserved so Undo start can
-- return to it, but grouping_kind stays null to mark that it was not used.
create or replace function public.start_session_without_setup(target_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target public.sessions%rowtype;
begin
  select * into target from public.sessions where id = target_session_id for update;

  if not found or not public.is_team_member(target.team_id) then
    raise exception 'Økten ble ikke funnet';
  end if;
  if target.status <> 'published' then
    raise exception 'Bare en publisert økt kan startes';
  end if;

  update public.sessions
  set status = 'in_progress',
      started_at = now(),
      completed_at = null,
      grouping_kind = null,
      updated_by = auth.uid()
  where id = target_session_id;
end;
$$;

revoke execute on function public.start_session_without_setup(uuid) from public, anon;
grant execute on function public.start_session_without_setup(uuid) to authenticated;

alter table public.profiles alter column full_name set default 'Trener';

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Trener'), '@', 1)))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create or replace function public.create_team(team_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_team_id uuid;
begin
  if auth.uid() is null then raise exception 'Du må være logget inn'; end if;
  if char_length(trim(team_name)) < 3 then raise exception 'Lagnavnet er for kort'; end if;
  insert into public.teams(name, created_by) values (trim(team_name), auth.uid()) returning id into new_team_id;
  insert into public.team_memberships(team_id, profile_id, role) values (new_team_id, auth.uid(), 'admin');
  return new_team_id;
end;
$$;

create or replace function public.accept_team_invitation(invitation_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare invitation public.team_invitations%rowtype; current_email citext;
begin
  if auth.uid() is null then raise exception 'Du må være logget inn'; end if;
  current_email := lower(coalesce(auth.jwt() ->> 'email', ''))::citext;
  select * into invitation from public.team_invitations where token = invitation_token for update;
  if not found then raise exception 'Invitasjonen ble ikke funnet'; end if;
  if invitation.accepted_at is not null then raise exception 'Invitasjonen er allerede brukt'; end if;
  if invitation.expires_at <= now() then raise exception 'Invitasjonen har utløpt'; end if;
  if lower(invitation.email::text)::citext <> current_email then raise exception 'Invitasjonen tilhører en annen e-postadresse'; end if;
  insert into public.team_memberships(team_id, profile_id, role) values (invitation.team_id, auth.uid(), invitation.role)
  on conflict (team_id, profile_id) do update set role = excluded.role;
  update public.team_invitations set accepted_at = now(), accepted_by = auth.uid() where id = invitation.id;
  return invitation.team_id;
end;
$$;

create or replace function public.publish_session(target_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target public.sessions%rowtype;
begin
  select * into target from public.sessions where id = target_session_id for update;
  if not found or not public.is_team_member(target.team_id) then raise exception 'Økten ble ikke funnet'; end if;
  if length(trim(target.title)) = 0 then raise exception 'Legg til en økttittel'; end if;
  if target.starts_at is null then raise exception 'Velg dato og klokkeslett'; end if;
  if not exists(select 1 from public.session_blocks where session_id = target.id) then raise exception 'Legg til minst én bolk'; end if;
  update public.sessions set status = 'published', updated_by = auth.uid() where id = target.id;
end;
$$;

create or replace function public.reorder_session_blocks(target_session_id uuid, ordered_block_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_session(target_session_id) then raise exception 'Økten ble ikke funnet'; end if;
  if array_length(ordered_block_ids, 1) is distinct from (select count(*)::integer from public.session_blocks where session_id = target_session_id) then raise exception 'Listen over bolker er ufullstendig'; end if;
  set constraints session_blocks_session_id_position_key deferred;
  update public.session_blocks b set position = ordering.position - 1, updated_by = auth.uid()
  from unnest(ordered_block_ids) with ordinality as ordering(id, position)
  where b.id = ordering.id and b.session_id = target_session_id;
end;
$$;

create or replace function public.reorder_block_items(target_block_id uuid, ordered_item_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_block(target_block_id) then raise exception 'Bolken ble ikke funnet'; end if;
  if array_length(ordered_item_ids, 1) is distinct from (select count(*)::integer from public.session_items where block_id = target_block_id) then raise exception 'Listen over aktiviteter er ufullstendig'; end if;
  set constraints session_items_block_id_position_key deferred;
  update public.session_items i set position = ordering.position - 1, updated_by = auth.uid()
  from unnest(ordered_item_ids) with ordinality as ordering(id, position)
  where i.id = ordering.id and i.block_id = target_block_id;
end;
$$;

create or replace function public.protect_last_team_admin() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists(select 1 from public.teams where id = old.team_id) then return old; end if;
  if old.role = 'admin' then
    if (tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role <> 'admin')) and
      not exists(select 1 from public.team_memberships where team_id = old.team_id and profile_id <> old.profile_id and role = 'admin')
    then raise exception 'Hvert lag må ha minst én administrator'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.validate_session_publish_transition() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'published' and old.status = 'draft' then
    if length(trim(new.title)) = 0 then raise exception 'Legg til en økttittel'; end if;
    if new.starts_at is null then raise exception 'Velg dato og klokkeslett'; end if;
    if not exists(select 1 from public.session_blocks where session_id = new.id) then raise exception 'Legg til minst én bolk'; end if;
  end if;
  return new;
end;
$$;

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
  if not found or not public.is_team_member(target.team_id) then raise exception 'Økten ble ikke funnet'; end if;
  if target.status <> 'published' then raise exception 'Bare en publisert økt kan startes'; end if;

  select groups into selected_groups
  from public.session_groupings
  where session_id = target_session_id and kind = selected_grouping_kind;
  if selected_groups is null or jsonb_array_length(selected_groups) = 0 then raise exception 'Generer grupper før økten startes'; end if;

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
    raise exception 'Oppmøtet er endret — generer grupper på nytt';
  end if;
  update public.sessions
  set status = 'in_progress', started_at = now(), grouping_kind = selected_grouping_kind, updated_by = auth.uid()
  where id = target_session_id;
end;
$$;

create or replace function public.finish_session(target_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target public.sessions%rowtype;
begin
  select * into target from public.sessions where id = target_session_id for update;
  if not found or not public.is_team_member(target.team_id) then raise exception 'Økten ble ikke funnet'; end if;
  if target.status <> 'in_progress' then raise exception 'Bare en pågående økt kan avsluttes'; end if;
  perform set_config('plannr.unlocked_session', target_session_id::text, true);
  update public.sessions set status = 'completed', completed_at = now(), updated_by = auth.uid() where id = target_session_id;
  perform set_config('plannr.unlocked_session', '', true);
end;
$$;

create or replace function public.undo_session_start(target_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target public.sessions%rowtype;
begin
  select * into target from public.sessions where id = target_session_id for update;
  if not found or not public.is_team_member(target.team_id) then raise exception 'Økten ble ikke funnet'; end if;
  if target.status <> 'in_progress' then raise exception 'Bare en pågående økt kan tilbakestilles'; end if;
  perform set_config('plannr.unlocked_session', target_session_id::text, true);
  update public.sessions
  set status = 'published', started_at = null, completed_at = null, grouping_kind = null, updated_by = auth.uid()
  where id = target_session_id;
  perform set_config('plannr.unlocked_session', '', true);
end;
$$;

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

-- Make the changes visible to PostgREST immediately after a manual SQL Editor run.
notify pgrst, 'reload schema';
