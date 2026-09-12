-- Production bootstrap script for Plannr
-- GENERATED FILE — do not edit by hand. Run `npm run db:bootstrap` after
-- adding a migration. supabase/migrations/ stays the source of truth; this
-- file is only their concatenation in filename order, so a brand-new, empty
-- production Supabase project can be built with a single SQL Editor paste.
--
-- Why the explicit COMMITs below: the SQL Editor runs a multi-statement paste
-- as a single implicit transaction, and the migrations listed here add an enum
-- value via ALTER TYPE ... ADD VALUE, which Postgres cannot use until that
-- transaction commits. Each is followed by a COMMIT that closes the
-- transaction; everything after it runs in a fresh implicit one.
--   202609020006
--   202609020009

-- ============================================================
-- 202609020001_initial.sql
-- ============================================================
create extension if not exists pgcrypto;
create extension if not exists citext;

do $$ begin
  create type public.team_role as enum ('admin', 'coach');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.session_status as enum ('draft', 'published');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.session_item_kind as enum ('exercise', 'custom');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.exercise_media_kind as enum ('image', 'youtube', 'vimeo', 'video');
exception when duplicate_object then null; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null,
  full_name text not null default 'Coach',
  avatar_url text,
  is_global_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 120),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_memberships (
  team_id uuid not null references public.teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.team_role not null default 'coach',
  joined_at timestamptz not null default now(),
  primary key (team_id, profile_id)
);

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid() unique,
  team_id uuid not null references public.teams(id) on delete cascade,
  email citext not null,
  role public.team_role not null default 'coach',
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 140),
  description text not null check (char_length(trim(description)) >= 10),
  media_url text not null check (media_url ~ '^https://'),
  media_kind public.exercise_media_kind not null,
  thumbnail_url text,
  created_by uuid not null references public.profiles(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null default 'Untitled session',
  starts_at timestamptz,
  venue text not null default '',
  planned_duration_minutes integer not null default 90 check (planned_duration_minutes between 1 and 360),
  objective text not null default '',
  notes text not null default '',
  status public.session_status not null default 'draft',
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.session_blocks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 100),
  position integer not null check (position >= 0),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, position) deferrable initially deferred
);

create table public.session_items (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.session_blocks(id) on delete cascade,
  kind public.session_item_kind not null,
  exercise_id uuid references public.exercises(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 140),
  description text not null default '',
  media_url text,
  thumbnail_url text,
  duration_minutes integer not null default 10 check (duration_minutes between 1 and 180),
  coaching_notes text not null default '',
  position integer not null check (position >= 0),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (block_id, position) deferrable initially deferred
);

create index idx_memberships_profile on public.team_memberships(profile_id, team_id);
create index idx_invitations_team on public.team_invitations(team_id, accepted_at);
create index idx_invitations_email on public.team_invitations(email, accepted_at);
create index idx_exercises_active_created on public.exercises(created_at desc) where archived_at is null;
create index idx_exercises_author on public.exercises(created_by);
create index idx_sessions_team_status_start on public.sessions(team_id, status, starts_at);
create index idx_sessions_team_updated on public.sessions(team_id, updated_at desc);
create index idx_blocks_session_position on public.session_blocks(session_id, position);
create index idx_items_block_position on public.session_items(block_id, position);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger teams_touch before update on public.teams for each row execute function public.touch_updated_at();
create trigger exercises_touch before update on public.exercises for each row execute function public.touch_updated_at();
create trigger sessions_touch before update on public.sessions for each row execute function public.touch_updated_at();
create trigger blocks_touch before update on public.session_blocks for each row execute function public.touch_updated_at();
create trigger items_touch before update on public.session_items for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, 'Coach'), '@', 1)))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
create trigger auth_user_created after insert or update of email on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_global_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_global_admin from public.profiles where id = auth.uid()), false)
$$;
create or replace function public.is_team_member(target_team_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.team_memberships where team_id = target_team_id and profile_id = auth.uid())
$$;
create or replace function public.is_team_admin(target_team_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.team_memberships where team_id = target_team_id and profile_id = auth.uid() and role = 'admin')
$$;
create or replace function public.shares_team(target_profile_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.team_memberships mine
    join public.team_memberships theirs on theirs.team_id = mine.team_id
    where mine.profile_id = auth.uid() and theirs.profile_id = target_profile_id
  )
$$;
create or replace function public.can_access_session(target_session_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.sessions where id = target_session_id and public.is_team_member(team_id))
$$;
create or replace function public.can_access_block(target_block_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.session_blocks where id = target_block_id and public.can_access_session(session_id))
$$;
create or replace function public.can_access_session_topic(topic text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare target_id uuid;
begin
  if topic !~ '^session:[0-9a-fA-F-]{36}$' then return false; end if;
  target_id := split_part(topic, ':', 2)::uuid;
  return public.can_access_session(target_id);
exception when others then return false;
end;
$$;

create or replace function public.create_team(team_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_team_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(team_name)) < 3 then raise exception 'Team name is too short'; end if;
  insert into public.teams(name, created_by) values (trim(team_name), auth.uid()) returning id into new_team_id;
  insert into public.team_memberships(team_id, profile_id, role) values (new_team_id, auth.uid(), 'admin');
  return new_team_id;
end;
$$;

create or replace function public.accept_team_invitation(invitation_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare invitation public.team_invitations%rowtype; current_email citext;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  current_email := lower(coalesce(auth.jwt() ->> 'email', ''))::citext;
  select * into invitation from public.team_invitations where token = invitation_token for update;
  if not found then raise exception 'Invitation not found'; end if;
  if invitation.accepted_at is not null then raise exception 'Invitation has already been used'; end if;
  if invitation.expires_at <= now() then raise exception 'Invitation has expired'; end if;
  if lower(invitation.email::text)::citext <> current_email then raise exception 'Invitation belongs to another email address'; end if;
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
  if not found or not public.is_team_member(target.team_id) then raise exception 'Session not found'; end if;
  if length(trim(target.title)) = 0 then raise exception 'Add a session title'; end if;
  if target.starts_at is null then raise exception 'Choose a date and time'; end if;
  if not exists(select 1 from public.session_blocks where session_id = target.id) then raise exception 'Add at least one block'; end if;
  update public.sessions set status = 'published', updated_by = auth.uid() where id = target.id;
end;
$$;

create or replace function public.reorder_session_blocks(target_session_id uuid, ordered_block_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_session(target_session_id) then raise exception 'Session not found'; end if;
  if array_length(ordered_block_ids, 1) is distinct from (select count(*)::integer from public.session_blocks where session_id = target_session_id) then raise exception 'Block list is incomplete'; end if;
  set constraints session_blocks_session_id_position_key deferred;
  update public.session_blocks b set position = ordering.position - 1, updated_by = auth.uid()
  from unnest(ordered_block_ids) with ordinality as ordering(id, position)
  where b.id = ordering.id and b.session_id = target_session_id;
end;
$$;
create or replace function public.reorder_block_items(target_block_id uuid, ordered_item_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_block(target_block_id) then raise exception 'Block not found'; end if;
  if array_length(ordered_item_ids, 1) is distinct from (select count(*)::integer from public.session_items where block_id = target_block_id) then raise exception 'Item list is incomplete'; end if;
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
    then raise exception 'Every team must keep at least one admin'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger protect_last_admin before delete or update of role on public.team_memberships for each row execute function public.protect_last_team_admin();

create or replace function public.validate_session_publish_transition() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'published' and old.status = 'draft' then
    if length(trim(new.title)) = 0 then raise exception 'Add a session title'; end if;
    if new.starts_at is null then raise exception 'Choose a date and time'; end if;
    if not exists(select 1 from public.session_blocks where session_id = new.id) then raise exception 'Add at least one block'; end if;
  end if;
  return new;
end;
$$;
create trigger validate_publish before update of status on public.sessions for each row execute function public.validate_session_publish_transition();

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.team_invitations enable row level security;
alter table public.exercises enable row level security;
alter table public.sessions enable row level security;
alter table public.session_blocks enable row level security;
alter table public.session_items enable row level security;

create policy profiles_read_shared on public.profiles for select to authenticated using (id = auth.uid() or public.shares_team(id) or public.is_global_admin());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy teams_read_member on public.teams for select to authenticated using (public.is_team_member(id));
create policy teams_update_admin on public.teams for update to authenticated using (public.is_team_admin(id)) with check (public.is_team_admin(id));
create policy teams_delete_admin on public.teams for delete to authenticated using (public.is_team_admin(id));
create policy memberships_read_team on public.team_memberships for select to authenticated using (public.is_team_member(team_id));
create policy memberships_add_admin on public.team_memberships for insert to authenticated with check (public.is_team_admin(team_id));
create policy memberships_update_admin on public.team_memberships for update to authenticated using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));
create policy memberships_delete_admin on public.team_memberships for delete to authenticated using (public.is_team_admin(team_id));
create policy invitations_read on public.team_invitations for select to authenticated using (public.is_team_admin(team_id) or lower(email::text) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy invitations_add_admin on public.team_invitations for insert to authenticated with check (public.is_team_admin(team_id) and invited_by = auth.uid());
create policy invitations_delete_admin on public.team_invitations for delete to authenticated using (public.is_team_admin(team_id));
create policy exercises_public_read on public.exercises for select to anon, authenticated using (archived_at is null or created_by = auth.uid() or public.is_global_admin());
create policy exercises_add_signed_in on public.exercises for insert to authenticated with check (created_by = auth.uid());
create policy exercises_edit_owner on public.exercises for update to authenticated using (created_by = auth.uid() or public.is_global_admin()) with check (created_by = auth.uid() or public.is_global_admin());
create policy sessions_read_team on public.sessions for select to authenticated using (public.is_team_member(team_id));
create policy sessions_add_team on public.sessions for insert to authenticated with check (public.is_team_member(team_id) and created_by = auth.uid() and updated_by = auth.uid());
create policy sessions_edit_team on public.sessions for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id) and updated_by = auth.uid());
create policy sessions_delete_team on public.sessions for delete to authenticated using (public.is_team_member(team_id));
create policy blocks_read_team on public.session_blocks for select to authenticated using (public.can_access_session(session_id));
create policy blocks_add_team on public.session_blocks for insert to authenticated with check (public.can_access_session(session_id) and updated_by = auth.uid());
create policy blocks_edit_team on public.session_blocks for update to authenticated using (public.can_access_session(session_id)) with check (public.can_access_session(session_id) and updated_by = auth.uid());
create policy blocks_delete_team on public.session_blocks for delete to authenticated using (public.can_access_session(session_id));
create policy items_read_team on public.session_items for select to authenticated using (public.can_access_block(block_id));
create policy items_add_team on public.session_items for insert to authenticated with check (public.can_access_block(block_id) and updated_by = auth.uid());
create policy items_edit_team on public.session_items for update to authenticated using (public.can_access_block(block_id)) with check (public.can_access_block(block_id) and updated_by = auth.uid());
create policy items_delete_team on public.session_items for delete to authenticated using (public.can_access_block(block_id));

revoke all on all tables in schema public from anon, authenticated;
grant select on public.exercises to anon, authenticated;
grant insert, update on public.exercises to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.team_memberships to authenticated;
grant select, insert, delete on public.team_invitations to authenticated;
grant select, insert, update, delete on public.sessions, public.session_blocks, public.session_items to authenticated;
revoke execute on function public.create_team(text), public.accept_team_invitation(uuid), public.publish_session(uuid), public.reorder_session_blocks(uuid, uuid[]), public.reorder_block_items(uuid, uuid[]) from public, anon;
grant execute on function public.create_team(text), public.accept_team_invitation(uuid), public.publish_session(uuid), public.reorder_session_blocks(uuid, uuid[]), public.reorder_block_items(uuid, uuid[]) to authenticated;

create or replace function public.broadcast_session_change() returns trigger
language plpgsql security definer set search_path = public, realtime as $$
declare target_session_id uuid;
begin
  if tg_table_name = 'sessions' then target_session_id := coalesce(new.id, old.id);
  elsif tg_table_name = 'session_blocks' then target_session_id := coalesce(new.session_id, old.session_id);
  else select session_id into target_session_id from public.session_blocks where id = coalesce(new.block_id, old.block_id); end if;
  if target_session_id is not null then
    perform realtime.broadcast_changes('session:' || target_session_id::text, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger sessions_broadcast after insert or update or delete on public.sessions for each row execute function public.broadcast_session_change();
create trigger blocks_broadcast after insert or update or delete on public.session_blocks for each row execute function public.broadcast_session_change();
create trigger items_broadcast after insert or update or delete on public.session_items for each row execute function public.broadcast_session_change();

-- Supabase owns this managed table and enables RLS on it by default.
-- Project migrations may add authorization policies but cannot alter the table.
create policy grep_realtime_read on realtime.messages for select to authenticated using (public.can_access_session_topic(realtime.topic()));
create policy grep_realtime_write on realtime.messages for insert to authenticated with check (public.can_access_session_topic(realtime.topic()));

-- After the first owner signs in, promote them once from the SQL editor:
-- update public.profiles set is_global_admin = true where email = 'owner@example.com';

-- ============================================================
-- 202609020002_exercise_categories.sql
-- ============================================================
alter table public.exercises
  add column if not exists category text not null default 'Angrep'
  check (category in ('Forsvar', 'Angrep', 'Målvakt', 'Fysisk', 'Leker'));

create index if not exists idx_exercises_active_category
  on public.exercises(category, created_at desc)
  where archived_at is null;

-- Make the new column available to PostgREST immediately when this migration
-- is run directly in the hosted Supabase SQL editor.
notify pgrst, 'reload schema';

-- ============================================================
-- 202609020003_player_rosters_and_live_sessions.sql
-- ============================================================
do $$ begin
  create type public.session_grouping_kind as enum ('teams', 'pairs');
exception when duplicate_object then null; end $$;

create table public.team_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 140),
  email citext,
  jersey_number text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index team_players_team_email_key on public.team_players(team_id, email) where email is not null;
create unique index team_players_team_external_id_key on public.team_players(team_id, external_id) where external_id is not null;
create index team_players_team_name on public.team_players(team_id, full_name);

create table public.session_attendance (
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.team_players(id) on delete cascade,
  is_present boolean not null default false,
  checked_in_at timestamptz,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (session_id, player_id)
);

create table public.session_groupings (
  session_id uuid not null references public.sessions(id) on delete cascade,
  kind public.session_grouping_kind not null,
  groups jsonb not null default '[]'::jsonb check (jsonb_typeof(groups) = 'array'),
  generated_by uuid not null references public.profiles(id),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, kind)
);

create trigger team_players_touch before update on public.team_players for each row execute function public.touch_updated_at();
create trigger attendance_touch before update on public.session_attendance for each row execute function public.touch_updated_at();
create trigger groupings_touch before update on public.session_groupings for each row execute function public.touch_updated_at();

create or replace function public.player_belongs_to_session(target_session_id uuid, target_player_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.team_players player
    join public.sessions session on session.team_id = player.team_id
    where session.id = target_session_id and player.id = target_player_id
  )
$$;

alter table public.team_players enable row level security;
alter table public.session_attendance enable row level security;
alter table public.session_groupings enable row level security;

create policy team_players_read_member on public.team_players for select to authenticated using (public.is_team_member(team_id));
create policy team_players_add_admin on public.team_players for insert to authenticated with check (public.is_team_admin(team_id));
create policy team_players_edit_admin on public.team_players for update to authenticated using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));
create policy team_players_delete_admin on public.team_players for delete to authenticated using (public.is_team_admin(team_id));

create policy attendance_read_team on public.session_attendance for select to authenticated using (public.can_access_session(session_id));
create policy attendance_add_team on public.session_attendance for insert to authenticated with check (
  public.can_access_session(session_id)
  and updated_by = auth.uid()
  and public.player_belongs_to_session(session_id, player_id)
);
create policy attendance_edit_team on public.session_attendance for update to authenticated using (public.can_access_session(session_id)) with check (public.can_access_session(session_id) and public.player_belongs_to_session(session_id, player_id) and updated_by = auth.uid());
create policy attendance_delete_team on public.session_attendance for delete to authenticated using (public.can_access_session(session_id));

create policy groupings_read_team on public.session_groupings for select to authenticated using (public.can_access_session(session_id));
create policy groupings_add_team on public.session_groupings for insert to authenticated with check (public.can_access_session(session_id) and generated_by = auth.uid());
create policy groupings_edit_team on public.session_groupings for update to authenticated using (public.can_access_session(session_id)) with check (public.can_access_session(session_id) and generated_by = auth.uid());
create policy groupings_delete_team on public.session_groupings for delete to authenticated using (public.can_access_session(session_id));

revoke all on public.team_players, public.session_attendance, public.session_groupings from anon, authenticated;
grant select, insert, update, delete on public.team_players, public.session_attendance, public.session_groupings to authenticated;
revoke execute on function public.player_belongs_to_session(uuid, uuid) from public, anon;
grant execute on function public.player_belongs_to_session(uuid, uuid) to authenticated;

-- ============================================================
-- 202609020004_minimize_player_names.sql
-- ============================================================
create or replace function public.minimize_team_player_name() returns trigger
language plpgsql set search_path = public as $$
declare
  name_parts text[];
  part_count integer;
begin
  name_parts := regexp_split_to_array(trim(new.full_name), E'\\s+');
  part_count := coalesce(array_length(name_parts, 1), 0);

  if part_count > 1 then
    new.full_name := name_parts[1] || ' ' || upper(left(name_parts[part_count], 1)) || '.';
  elsif part_count = 1 then
    new.full_name := name_parts[1];
  end if;

  return new;
end;
$$;

-- Minimize player names that may already have been imported.
with minimized as (
  select
    id,
    regexp_split_to_array(trim(full_name), E'\\s+') as name_parts
  from public.team_players
)
update public.team_players player
set full_name = case
  when array_length(minimized.name_parts, 1) > 1
    then minimized.name_parts[1] || ' ' || upper(left(minimized.name_parts[array_length(minimized.name_parts, 1)], 1)) || '.'
  else minimized.name_parts[1]
end
from minimized
where player.id = minimized.id;

-- Remove identifiers that are not needed for planning sessions.
drop index if exists public.team_players_team_email_key;
drop index if exists public.team_players_team_external_id_key;
alter table public.team_players drop column if exists email;
alter table public.team_players drop column if exists external_id;

drop trigger if exists team_players_minimize_name on public.team_players;
create trigger team_players_minimize_name
before insert or update of full_name on public.team_players
for each row execute function public.minimize_team_player_name();

revoke execute on function public.minimize_team_player_name() from public, anon, authenticated;

-- ============================================================
-- 202609020005_optional_exercise_media.sql
-- ============================================================
-- Exercises can be shared as text-only coaching instructions.
alter table public.exercises
  alter column media_url drop not null,
  alter column media_kind drop not null;

-- Make the updated columns available to PostgREST when run in the SQL editor.
notify pgrst, 'reload schema';

-- ============================================================
-- 202609020006_in_progress_session_status.sql
-- ============================================================
alter type public.session_status add value if not exists 'in_progress';

-- ============================================================
-- Commit the enum addition from 202609020006 before it is used below.
-- ============================================================
commit;

-- ============================================================
-- 202609020007_start_session_workflow.sql
-- ============================================================
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

-- ============================================================
-- 202609020008_session_block_notes.sql
-- ============================================================
alter table public.session_blocks
  add column if not exists notes text not null default '';

notify pgrst, 'reload schema';

-- ============================================================
-- 202609020009_completed_session_status.sql
-- ============================================================
-- A finished workout leaves the live view and becomes a locked record.
-- The value is added on its own so the transaction can commit before
-- 202609020010 uses it.
alter type public.session_status add value if not exists 'completed';

-- ============================================================
-- Commit the enum addition from 202609020009 before it is used below.
-- ============================================================
commit;

-- ============================================================
-- 202609020010_finish_session_workflow.sql
-- ============================================================
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

-- ============================================================
-- 202609020011_password_auth.sql
-- ============================================================
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

-- ============================================================
-- 202609020012_shooting_skills_exercise_category.sql
-- ============================================================
alter table public.exercises
  drop constraint if exists exercises_category_check;

alter table public.exercises
  add constraint exercises_category_check
  check (category in ('Forsvar', 'Angrep', 'Skuddferdigheter', 'Målvakt', 'Fysisk', 'Leker'));

-- Make the updated constraint visible to PostgREST immediately when this
-- migration is run directly in the hosted Supabase SQL editor.
notify pgrst, 'reload schema';

-- ============================================================
-- 202609020013_exercise_video_uploads.sql
-- ============================================================
-- Public exercise videos are limited to small MP4 clips. Storage enforces the
-- same 5 MB limit as the exercise form, so clients cannot bypass it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-videos', 'exercise-videos', true, 5242880, array['video/mp4']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists exercise_videos_insert_own on storage.objects;
create policy exercise_videos_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'exercise-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists exercise_videos_delete_own on storage.objects;
create policy exercise_videos_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'exercise-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- 202609020014_undo_session_start.sql
-- ============================================================
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

-- ============================================================
-- 202609020016_norwegian_messages_image_uploads_and_skip_setup.sql
-- ============================================================
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

-- ============================================================
-- 202609020017_team_logos.sql
-- ============================================================
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

-- ============================================================
-- 202609020018_admin_roles.sql
-- ============================================================
-- Global admin and team admin become two different things.
--
-- Until now the only way to own a team was to join it: `create_team` inserted
-- the caller into `team_memberships` as a team admin, so the person who
-- administers the platform showed up in every team's coach list. This splits
-- the two roles apart:
--
--   * global admin (`profiles.is_global_admin`) creates teams, appoints their
--     trainers, changes team roles, removes members and deletes teams — without
--     ever being a member, and so without appearing in the team overview.
--   * team admin (`team_memberships.role = 'admin'`) runs one team: invites
--     coaches, manages the roster and club logo, plans sessions. Unchanged.
--
-- Reach is deliberately limited to administration. The select policies on
-- sessions, blocks, items, players, attendance and groupings are *not* widened,
-- so a global admin still cannot read the plans or the (already
-- privacy-minimized) player data of a team they do not coach.

-- `create_team` gains a second argument, which makes it a different function
-- object. Leaving the old one in place would make `create_team('Name')`
-- ambiguous, so drop it first and re-grant the new signature below.
drop function if exists public.create_team(text);

create or replace function public.create_team(team_name text, first_admin_email text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_team_id uuid; invited_email citext;
begin
  if auth.uid() is null then raise exception 'Du må være logget inn'; end if;
  -- Teams are handed out by the platform owner, not self-served by coaches.
  if not public.is_global_admin() then raise exception 'Du må være systemadministrator for å opprette lag'; end if;
  if char_length(trim(team_name)) < 3 then raise exception 'Lagnavnet er for kort'; end if;
  insert into public.teams(name, created_by) values (trim(team_name), auth.uid()) returning id into new_team_id;
  -- Deliberately no membership row for the caller. The team's own admin is
  -- invited instead, and claims the seat on first sign-in via
  -- `claimableInvitations` / `accept_team_invitation`.
  invited_email := lower(trim(coalesce(first_admin_email, '')))::citext;
  if length(invited_email::text) > 0 then
    insert into public.team_invitations(team_id, email, role, invited_by)
    values (new_team_id, invited_email, 'admin', auth.uid());
  end if;
  return new_team_id;
end;
$$;

revoke execute on function public.create_team(text, text) from public, anon;
grant execute on function public.create_team(text, text) to authenticated;

-- The read path for the admin console.
--
-- An RPC rather than a widened `select` policy on teams/memberships: the
-- provider's `loadPrivateData` selects `team_memberships` unfiltered and builds
-- the sidebar team switcher from whatever comes back, so widening that policy
-- would drop every team in the database into the global admin's switcher.
create or replace function public.admin_list_teams() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_global_admin() then raise exception 'Du må være systemadministrator'; end if;
  select coalesce(jsonb_agg(entry order by sort_name), '[]'::jsonb) into result
  from (
    select
      team.name as sort_name,
      jsonb_build_object(
        'id', team.id,
        'name', team.name,
        'logo_url', team.logo_url,
        'created_at', team.created_at,
        'members', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', profile.id, 'email', profile.email, 'full_name', profile.full_name, 'role', membership.role
          ) order by profile.full_name)
          from public.team_memberships membership
          join public.profiles profile on profile.id = membership.profile_id
          where membership.team_id = team.id
        ), '[]'::jsonb),
        'invitations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', invitation.id, 'email', invitation.email, 'role', invitation.role,
            'token', invitation.token, 'expires_at', invitation.expires_at
          ) order by invitation.created_at)
          from public.team_invitations invitation
          where invitation.team_id = team.id
            and invitation.accepted_at is null
            and invitation.expires_at > now()
        ), '[]'::jsonb)
      ) as entry
    from public.teams team
  ) listed;
  return result;
end;
$$;

revoke execute on function public.admin_list_teams() from public, anon;
grant execute on function public.admin_list_teams() to authenticated;

-- A global admin must be able to empty a team they own — and, right after this
-- migration, to remove their own legacy membership from a team where they are
-- still the only admin. Without this they stay stuck in the coach list.
create or replace function public.protect_last_team_admin() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists(select 1 from public.teams where id = old.team_id) then return old; end if;
  if public.is_global_admin() then return case when tg_op = 'DELETE' then old else new end; end if;
  if old.role = 'admin' then
    if (tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role <> 'admin')) and
      not exists(select 1 from public.team_memberships where team_id = old.team_id and profile_id <> old.profile_id and role = 'admin')
    then raise exception 'Hvert lag må ha minst én administrator'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Team administration, now reachable by the global admin for any team. Note
-- that the matching `select` policies stay membership-scoped on purpose; the
-- console reads through `admin_list_teams()` instead.
drop policy if exists teams_update_admin on public.teams;
create policy teams_update_admin on public.teams for update to authenticated
  using (public.is_team_admin(id) or public.is_global_admin())
  with check (public.is_team_admin(id) or public.is_global_admin());

drop policy if exists teams_delete_admin on public.teams;
create policy teams_delete_admin on public.teams for delete to authenticated
  using (public.is_team_admin(id) or public.is_global_admin());

drop policy if exists memberships_add_admin on public.team_memberships;
create policy memberships_add_admin on public.team_memberships for insert to authenticated
  with check (public.is_team_admin(team_id) or public.is_global_admin());

drop policy if exists memberships_update_admin on public.team_memberships;
create policy memberships_update_admin on public.team_memberships for update to authenticated
  using (public.is_team_admin(team_id) or public.is_global_admin())
  with check (public.is_team_admin(team_id) or public.is_global_admin());

drop policy if exists memberships_delete_admin on public.team_memberships;
create policy memberships_delete_admin on public.team_memberships for delete to authenticated
  using (public.is_team_admin(team_id) or public.is_global_admin());

drop policy if exists invitations_add_admin on public.team_invitations;
create policy invitations_add_admin on public.team_invitations for insert to authenticated
  with check ((public.is_team_admin(team_id) or public.is_global_admin()) and invited_by = auth.uid());

drop policy if exists invitations_delete_admin on public.team_invitations;
create policy invitations_delete_admin on public.team_invitations for delete to authenticated
  using (public.is_team_admin(team_id) or public.is_global_admin());

-- Make the new function signatures visible to PostgREST immediately after a
-- manual SQL Editor run, otherwise `create_team` keeps its old argument list.
notify pgrst, 'reload schema';

-- ============================================================
-- 202609020019_team_fixtures.sql
-- ============================================================
-- Kampkalender: the club's match schedule, imported from a tournament export.
--
-- A division report lists every team in the group, so the coach picks which of
-- them are the club's own before importing. `our_teams` records that pick per
-- match, which is what lets one calendar carry the sub-teams an age group is
-- split into (Rød, Blå, Grønn …) and still show a derby between two of them as
-- a single match.
create table public.team_fixtures (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  match_number text not null check (char_length(trim(match_number)) between 1 and 120),
  starts_at timestamptz not null,
  home_team text not null check (char_length(trim(home_team)) between 1 and 140),
  away_team text not null check (char_length(trim(away_team)) between 1 and 140),
  our_teams text[] not null check (cardinality(our_teams) between 1 and 8),
  result text not null default '' check (char_length(result) <= 40),
  venue text not null default '' check (char_length(venue) <= 200),
  organizer text not null default '' check (char_length(organizer) <= 200),
  tournament text not null default '' check (char_length(tournament) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The match number is the schedule's own identity, so re-importing an updated
-- export corrects the existing rows instead of doubling the calendar.
create unique index team_fixtures_team_match_key on public.team_fixtures(team_id, match_number);
create index team_fixtures_team_start on public.team_fixtures(team_id, starts_at);

create trigger team_fixtures_touch before update on public.team_fixtures for each row execute function public.touch_updated_at();

alter table public.team_fixtures enable row level security;

-- Read for the whole coaching team, written only by a team admin — the same
-- split the player roster uses, since both are club data one person maintains.
create policy team_fixtures_read_member on public.team_fixtures for select to authenticated using (public.is_team_member(team_id));
create policy team_fixtures_add_admin on public.team_fixtures for insert to authenticated with check (public.is_team_admin(team_id));
create policy team_fixtures_edit_admin on public.team_fixtures for update to authenticated using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));
create policy team_fixtures_delete_admin on public.team_fixtures for delete to authenticated using (public.is_team_admin(team_id));

revoke all on public.team_fixtures from anon, authenticated;
grant select, insert, update, delete on public.team_fixtures to authenticated;

-- ============================================================
-- 202609020020_warmup_routines.sql
-- ============================================================
-- Kampoppvarming: the standing routine a team runs before a match.
--
-- A training session is a one-off plan; a warm-up is the same handful of
-- activities before every match, adjusted a few times a season. So it belongs
-- to the team, not to the fixture: the calendar shows the routine against each
-- match rather than storing a near-identical copy 22 times a year.
--
-- `name` and `is_default` are here from the start so a small set of named
-- routines ("Kort halltid", "Bortekamp") stays a UI change plus a nullable
-- warmup_routine_id on team_fixtures, not a migration of live rows.
create table public.warmup_routines (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null default 'Kampoppvarming' check (char_length(trim(name)) between 1 and 80),
  is_default boolean not null default true,
  -- How long before kick-off the squad meets at the hall. The warm-up itself
  -- starts at kick-off minus the sum of its activities, which is derived.
  meet_minutes_before integer not null default 60 check (meet_minutes_before between 0 and 300),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One routine per team is the default; the index is what keeps a second one
-- from silently becoming ambiguous once named routines arrive.
create unique index warmup_routines_team_default_key on public.warmup_routines(team_id) where is_default;
create index warmup_routines_team on public.warmup_routines(team_id);

-- Activities copy the exercise's display data at insert time, exactly as
-- session items do, so editing the library never rewrites a routine that has
-- already been drilled.
create table public.warmup_items (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.warmup_routines(id) on delete cascade,
  kind public.session_item_kind not null,
  exercise_id uuid references public.exercises(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 140),
  description text not null default '',
  media_url text,
  thumbnail_url text,
  duration_minutes integer not null default 5 check (duration_minutes between 1 and 180),
  coaching_notes text not null default '',
  position integer not null check (position >= 0),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (routine_id, position) deferrable initially deferred
);

create index warmup_items_routine_position on public.warmup_items(routine_id, position);

create trigger warmup_routines_touch before update on public.warmup_routines for each row execute function public.touch_updated_at();
create trigger warmup_items_touch before update on public.warmup_items for each row execute function public.touch_updated_at();

create or replace function public.can_access_warmup_routine(target_routine_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.warmup_routines routine
    where routine.id = target_routine_id and public.is_team_member(routine.team_id)
  )
$$;

alter table public.warmup_routines enable row level security;
alter table public.warmup_items enable row level security;

-- The warm-up is coaching content, like a session plan, so every coach on the
-- team may change it — unlike the roster and the match import, which are club
-- records only an admin maintains.
create policy warmup_routines_read_member on public.warmup_routines for select to authenticated using (public.is_team_member(team_id));
create policy warmup_routines_add_member on public.warmup_routines for insert to authenticated with check (public.is_team_member(team_id) and created_by = auth.uid() and updated_by = auth.uid());
create policy warmup_routines_edit_member on public.warmup_routines for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id) and updated_by = auth.uid());
create policy warmup_routines_delete_member on public.warmup_routines for delete to authenticated using (public.is_team_member(team_id));

create policy warmup_items_read_member on public.warmup_items for select to authenticated using (public.can_access_warmup_routine(routine_id));
create policy warmup_items_add_member on public.warmup_items for insert to authenticated with check (public.can_access_warmup_routine(routine_id) and updated_by = auth.uid());
create policy warmup_items_edit_member on public.warmup_items for update to authenticated using (public.can_access_warmup_routine(routine_id)) with check (public.can_access_warmup_routine(routine_id) and updated_by = auth.uid());
create policy warmup_items_delete_member on public.warmup_items for delete to authenticated using (public.can_access_warmup_routine(routine_id));

-- Ordering is an RPC for the same reason block items are: the positions must
-- stay consistent, which a sequence of client-side row updates cannot promise.
create or replace function public.reorder_warmup_items(target_routine_id uuid, ordered_item_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_warmup_routine(target_routine_id) then raise exception 'Oppvarmingen finnes ikke'; end if;
  if array_length(ordered_item_ids, 1) is distinct from (select count(*)::integer from public.warmup_items where routine_id = target_routine_id) then raise exception 'Aktivitetslisten er ufullstendig'; end if;
  set constraints warmup_items_routine_id_position_key deferred;
  update public.warmup_items item set position = ordering.position - 1, updated_by = auth.uid()
  from unnest(ordered_item_ids) with ordinality as ordering(id, position)
  where item.id = ordering.id and item.routine_id = target_routine_id;
end;
$$;

revoke all on public.warmup_routines, public.warmup_items from anon, authenticated;
grant select, insert, update, delete on public.warmup_routines, public.warmup_items to authenticated;
revoke execute on function public.can_access_warmup_routine(uuid) from public, anon;
grant execute on function public.can_access_warmup_routine(uuid) to authenticated;
revoke execute on function public.reorder_warmup_items(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_warmup_items(uuid, uuid[]) to authenticated;

-- ============================================================
-- 202609020021_membership_is_global_admin_only.sql
-- ============================================================
-- Team administration becomes a global-admin-only power.
--
-- 202609020018 split the two admin roles apart but left a team admin able to
-- invite coaches, change their team role and remove them. In practice that
-- half-works: an invitation row only reserves a seat, and the account behind it
-- still has to be created by hand in the Supabase dashboard
-- (Authentication → Users → Send invitation), which a team admin has no access
-- to. A team admin could therefore invite someone who could never sign in.
--
-- So membership is now handed out in exactly one place — the /admin console —
-- and the team admin keeps what they can actually finish on their own: the
-- roster, the club logo, the match calendar and the plans.
--
--   * `is_team_admin` still gates teams, players, fixtures, warmup routines and
--     everything session-scoped. Those policies are untouched.
--   * `team_memberships` and `team_invitations` writes now require
--     `is_global_admin()`.
--
-- Note the shape of the refusal: RLS filters an UPDATE/DELETE rather than
-- raising, so a team admin's attempt changes nothing instead of erroring. The
-- app no longer offers the controls at all; this is the boundary behind them.

drop policy if exists memberships_add_admin on public.team_memberships;
create policy memberships_add_admin on public.team_memberships for insert to authenticated
  with check (public.is_global_admin());

drop policy if exists memberships_update_admin on public.team_memberships;
create policy memberships_update_admin on public.team_memberships for update to authenticated
  using (public.is_global_admin())
  with check (public.is_global_admin());

drop policy if exists memberships_delete_admin on public.team_memberships;
create policy memberships_delete_admin on public.team_memberships for delete to authenticated
  using (public.is_global_admin());

drop policy if exists invitations_add_admin on public.team_invitations;
create policy invitations_add_admin on public.team_invitations for insert to authenticated
  with check (public.is_global_admin() and invited_by = auth.uid());

drop policy if exists invitations_delete_admin on public.team_invitations;
create policy invitations_delete_admin on public.team_invitations for delete to authenticated
  using (public.is_global_admin());

-- The team-admin half of `invitations_read` existed to render the pending list
-- on /team, which is gone. What remains is the onboarding path: a coach selects
-- the invitation addressed to their own email — token included — and claims it
-- through `claimableInvitations`. `admin_list_teams()` is security definer and
-- reads the console's list regardless.
drop policy if exists invitations_read on public.team_invitations;
create policy invitations_read on public.team_invitations for select to authenticated
  using (public.is_global_admin() or lower(email::text) = lower(coalesce(auth.jwt() ->> 'email', '')));

notify pgrst, 'reload schema';

-- ============================================================
-- 202609020022_exercise_favorites.sql
-- ============================================================
-- Favoritter: each coach's own shortlist of library exercises.
--
-- The library is shared and world-readable, so a heart cannot be a column on
-- `exercises` — it belongs to the coach, not to the exercise, and marking one
-- must never write to a row another coach owns. It is therefore its own table,
-- one row per coach per exercise, readable and writable by that coach alone.
--
-- Archiving is deliberately untouched: an archived exercise keeps its hearts
-- (the library query already filters `archived_at`), while deleting the
-- exercise or the profile cascades them away.
create table public.exercise_favorites (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, exercise_id)
);

-- The primary key already indexes the coach's own list; this one serves the
-- reverse lookup a cascade from `exercises` needs.
create index idx_exercise_favorites_exercise on public.exercise_favorites(exercise_id);

alter table public.exercise_favorites enable row level security;

-- A favourite is private: nobody sees, adds or removes another coach's hearts,
-- global admin included. There is no update policy — a heart is only ever
-- inserted or deleted.
create policy exercise_favorites_read_own on public.exercise_favorites for select to authenticated using (profile_id = auth.uid());
create policy exercise_favorites_add_own on public.exercise_favorites for insert to authenticated with check (profile_id = auth.uid());
create policy exercise_favorites_delete_own on public.exercise_favorites for delete to authenticated using (profile_id = auth.uid());

revoke all on public.exercise_favorites from anon, authenticated;
grant select, insert, delete on public.exercise_favorites to authenticated;

-- A brand-new table is invisible to PostgREST until it re-reads the schema.
notify pgrst, 'reload schema';

-- ============================================================
-- 202609020023_exercise_age_groups.sql
-- ============================================================
-- Aldersgrupper: which age bands a library exercise suits.
--
-- An exercise is rarely written for one band — the same shooting drill runs for
-- 10-12 and 13-15 with a different tempo — so this is an array rather than a
-- second `category`-style single value. The values are stable keys ('6-9'), not
-- display strings; the UI appends "år".
--
-- An empty array means "not stated" — what every exercise written before this
-- migration gets, rather than a backfilled guess. Picking a band in the UI shows
-- only the exercises that list it, so an untagged exercise stays visible under
-- "Alle aldre" until an author tags it.
alter table public.exercises
  add column if not exists age_groups text[] not null default '{}';

alter table public.exercises
  drop constraint if exists exercises_age_groups_check;

alter table public.exercises
  add constraint exercises_age_groups_check
  check (age_groups <@ array['6-9', '10-12', '13-15']::text[]);

-- No index: the browser loads the whole active library in one `select *` and
-- filters in memory (`filterExercises`), so an age filter never reaches Postgres.

-- Make the new column available to PostgREST immediately when this migration
-- is run directly in the hosted Supabase SQL editor.
notify pgrst, 'reload schema';

-- ============================================================
-- 202609020024_month_focus.sql
-- ============================================================
-- Månedens fokus: one short note per team per calendar month, shown above the
-- month's sessions in the calendar.
--
-- The month is stored as the 'YYYY-MM' key the calendar already groups by
-- rather than a date or a range. That key is derived in the browser from the
-- coach's own zone, so storing a timestamp here would only invite a second,
-- disagreeing answer to "which month is this session in?".
--
-- Unlike the roster and the match import, this is coaching content: every coach
-- on the team writes it, the same split `warmup_routines` uses.
create table public.team_month_focus (
  team_id uuid not null references public.teams(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  note text not null check (char_length(trim(note)) between 1 and 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (team_id, month)
);

-- No secondary index: the primary key is the only way this table is ever read,
-- and the browser loads every row for the coach's teams in one go.

create trigger team_month_focus_touch before update on public.team_month_focus for each row execute function public.touch_updated_at();

alter table public.team_month_focus enable row level security;

-- An empty note is a deleted row, not a stored blank — the check constraint
-- above enforces it, and the client deletes rather than writing ''. That keeps
-- "has a focus" a single question everywhere.
create policy team_month_focus_read_member on public.team_month_focus for select to authenticated using (public.is_team_member(team_id));
create policy team_month_focus_add_member on public.team_month_focus for insert to authenticated with check (public.is_team_member(team_id));
create policy team_month_focus_edit_member on public.team_month_focus for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy team_month_focus_delete_member on public.team_month_focus for delete to authenticated using (public.is_team_member(team_id));

revoke all on public.team_month_focus from anon, authenticated;
grant select, insert, update, delete on public.team_month_focus to authenticated;

-- Make the new table available to PostgREST immediately when this migration is
-- run directly in the hosted Supabase SQL editor.
notify pgrst, 'reload schema';

-- ============================================================
-- 202609020025_session_item_coach.sql
-- ============================================================
-- Ansvarlig trener per aktivitet.
--
-- A session is run by the whole coaching team, not by whoever wrote the plan:
-- one coach takes the shooting station while another runs the goalkeepers. The
-- assignment belongs to the plan rather than to the exercise, exactly like
-- `duration_minutes` and `coaching_notes`, so it lives on the item row and is
-- never copied back into the library.
--
-- Nullable throughout: most activities are run by everybody, and forcing a name
-- on each one would turn a useful hint into paperwork.
alter table public.session_items
  add column if not exists assigned_coach_id uuid references public.profiles(id) on delete set null;

-- Only ever read as part of the item row the plan already loads, so no index:
-- the session is fetched whole by block, and nothing queries "what is this
-- coach responsible for" yet.

-- The browser talks to PostgREST directly, so nothing stops a crafted request
-- from naming a profile outside the team — which would leak a name into a plan
-- and, worse, hand the item to somebody who cannot see it. The check has to sit
-- in the database. `security definer` because the assigned coach's membership
-- row is not necessarily one the writer may select.
--
-- A coach later removed from the team keeps their name on the items they were
-- given: clearing them here would mean writing to session rows that
-- `prevent_in_progress_session_changes` locks, so a membership delete would
-- start failing. The UI resolves an unknown id to a neutral placeholder
-- instead (`coachAssignmentOptions` in lib/session.ts).
create or replace function public.validate_session_item_coach() returns trigger
language plpgsql security definer set search_path = public as $$
declare target_team_id uuid;
begin
  if new.assigned_coach_id is null then return new; end if;
  -- An untouched assignment survives every other edit, including one made after
  -- the named coach left the team.
  if tg_op = 'UPDATE' and new.assigned_coach_id is not distinct from old.assigned_coach_id then return new; end if;
  select session.team_id into target_team_id
  from public.session_blocks block
  join public.sessions session on session.id = block.session_id
  where block.id = new.block_id;
  if not exists (
    select 1 from public.team_memberships
    where team_id = target_team_id and profile_id = new.assigned_coach_id
  ) then
    raise exception 'Ansvarlig trener må være trener på laget';
  end if;
  return new;
end;
$$;

drop trigger if exists items_validate_coach on public.session_items;
create trigger items_validate_coach before insert or update on public.session_items
for each row execute function public.validate_session_item_coach();

revoke execute on function public.validate_session_item_coach() from public, anon, authenticated;

-- Make the new column visible to PostgREST immediately after a manual SQL
-- Editor run.
notify pgrst, 'reload schema';

-- ============================================================
-- 202609020026_auth_hardening.sql
-- ============================================================
-- Auth hardening for a workspace that is no longer only its author's.
--
-- Three of the boundaries below were safe only because of a Supabase dashboard
-- setting rather than because of anything in this schema. That is the wrong
-- place for them to live: a setting can be toggled by accident, and nothing in
-- the repository would say so. Each rule is restated here so the database holds
-- it regardless of how the project is configured.
--
--   1. An account whose email address has never been proven cannot claim a team
--      seat. `accept_team_invitation` matches the invitation against
--      `auth.jwt() ->> 'email'`, and `invitations_read` hands the invitation
--      token to whoever that address belongs to. Both are exactly right *if*
--      the address is confirmed. With signup open and confirmation off, signing
--      up as a coach's address is enough to take over their team, so the
--      confirmation is now a precondition rather than an assumption.
--
--   2. The public exercise library is writable by coaches, not by anyone who
--      holds a session. `exercises_add_signed_in` asked only for
--      `authenticated`, which is every account that exists — and the same was
--      true of uploads into the public `exercise-videos` bucket. Both now ask
--      for a team seat, which is the thing that actually makes someone a coach
--      here.
--
--   3. The forced password change is enforced by the database. Migration
--      202609020011 granted `must_set_password` to `authenticated` so the
--      browser could clear the flag, which also let the browser clear it
--      *without* changing any password. The flag now falls when the password
--      actually changes, and the column is no longer writable from a session.
--
-- None of this changes what a legitimate coach can do.

-- 1. A proven email address ------------------------------------------------

-- `security definer` because `auth.users` is not readable from a session. Only
-- ever asked about the caller, so it exposes nothing about anybody else.
create or replace function public.email_is_confirmed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null)
$$;
revoke execute on function public.email_is_confirmed() from public, anon;
grant execute on function public.email_is_confirmed() to authenticated;

-- Replaced whole, keeping the signature, grants and the Norwegian wording
-- migration 202609020016 gave it. The only change is the new guard.
create or replace function public.accept_team_invitation(invitation_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare invitation public.team_invitations%rowtype; current_email citext;
begin
  if auth.uid() is null then raise exception 'Du må være logget inn'; end if;
  if not public.email_is_confirmed() then raise exception 'Bekreft e-postadressen din først'; end if;
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

-- The token in this row is a bearer credential for a team seat. Reading it by
-- address is the onboarding path (`claimableInvitations`), so the address has
-- to have been proven first. The global-admin branch is unchanged.
drop policy if exists invitations_read on public.team_invitations;
create policy invitations_read on public.team_invitations for select to authenticated
  using (
    public.is_global_admin()
    or (public.email_is_confirmed() and lower(email::text) = lower(coalesce(auth.jwt() ->> 'email', '')))
  );

-- 2. Writing to the shared library is for coaches ---------------------------

create or replace function public.has_any_team() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.team_memberships where profile_id = auth.uid())
$$;
revoke execute on function public.has_any_team() from public, anon;
grant execute on function public.has_any_team() to authenticated;

-- A coach who has signed in but not yet claimed their invitation has no seat
-- for the moment it takes the provider to claim it, and is refused here. That
-- is the correct answer for that moment: they are not on a team yet.
drop policy if exists exercises_add_signed_in on public.exercises;
create policy exercises_add_signed_in on public.exercises for insert to authenticated
  with check (created_by = auth.uid() and (public.has_any_team() or public.is_global_admin()));

-- `exercise-videos` is a public bucket with a 5 MB cap and no quota of its own,
-- so an account that is not a coach could fill the project's storage with
-- world-readable files. Same rule as the row it illustrates.
drop policy if exists exercise_videos_insert_own on storage.objects;
create policy exercise_videos_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'exercise-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (public.has_any_team() or public.is_global_admin())
);

-- 3. The forced password change is the database's rule ----------------------

-- Fires on the real event — the stored password changing — so it covers the
-- invite flow, the recovery flow and a dashboard reset alike, and cannot be
-- reached from a session at all.
--
-- To put a coach back on the forced screen (they no longer have to be, now that
-- resets are self-service), set the flag from the SQL editor:
--   update public.profiles set must_set_password = true where email = '…';
create or replace function public.clear_must_set_password() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set must_set_password = false where id = new.id and must_set_password;
  return new;
end;
$$;

drop trigger if exists auth_user_password_changed on auth.users;
create trigger auth_user_password_changed
after update of encrypted_password on auth.users
for each row when (old.encrypted_password is distinct from new.encrypted_password)
execute function public.clear_must_set_password();

-- 202609020011 granted this column so `setPassword` could clear it. The trigger
-- above does that now, and a session has no reason to write it.
revoke update (must_set_password) on public.profiles from authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- 202609020027_passwordless_team_invitations.sql
-- ============================================================
-- Passwordless sign-in and team-admin coach invitations.
--
-- Magic links establish the Supabase session directly, so a newly invited
-- coach no longer owes the application a password. Team administrators may
-- reserve coach seats on their own team; only a global administrator can
-- reserve an administrator seat or manage memberships after acceptance.

-- Keep the legacy column for rolling deploy compatibility, but make it inert.
alter table public.profiles alter column must_set_password set default false;
update public.profiles set must_set_password = false where must_set_password;

drop trigger if exists auth_user_password_changed on auth.users;
drop function if exists public.clear_must_set_password();

-- A team administrator needs the pending rows for their own team. An invited
-- coach still sees only the row addressed to their confirmed email.
drop policy if exists invitations_read on public.team_invitations;
create policy invitations_read on public.team_invitations for select to authenticated
  using (
    public.is_global_admin()
    or public.is_team_admin(team_id)
    or (public.email_is_confirmed() and lower(email::text) = lower(coalesce(auth.jwt() ->> 'email', '')))
  );

drop policy if exists invitations_add_admin on public.team_invitations;
create policy invitations_add_admin on public.team_invitations for insert to authenticated
  with check (
    invited_by = auth.uid()
    and (
      public.is_global_admin()
      or (public.is_team_admin(team_id) and role = 'coach')
    )
  );

drop policy if exists invitations_delete_admin on public.team_invitations;
create policy invitations_delete_admin on public.team_invitations for delete to authenticated
  using (
    accepted_at is null
    and (public.is_global_admin() or public.is_team_admin(team_id))
  );

notify pgrst, 'reload schema';

-- ============================================================
-- 202609020028_clear_legacy_pending_invitations.sql
-- ============================================================
-- One-time cutover cleanup for the passwordless invitation flow.
--
-- These rows were created before Grep could mint and deliver its own magic
-- links. Remove only invitations that have never been accepted so the app
-- starts the new flow with an empty pending list. Existing Auth users,
-- profiles, memberships, and accepted invitation history are left untouched.
--
-- This deletion is intentional and irreversible: apply it only after
-- 202609020027_passwordless_team_invitations.sql.
delete from public.team_invitations
where accepted_at is null;

notify pgrst, 'reload schema';

-- ============================================================
-- 202609020029_clear_never_signed_in_auth_users.sql
-- ============================================================
-- One-time removal of legacy Auth accounts that never signed in.
--
-- Migration 202609020028 removed their pending team-invitation rows, but an
-- invitation and an Auth account are separate records. Remove the unused Auth
-- identities created before the passwordless cutover. The profiles trigger
-- uses ON DELETE CASCADE, so their unused public profile (and any manually
-- assigned membership) disappears with the Auth user.
--
-- Safeguards:
--   * an account that has ever signed in is never touched;
--   * a global administrator is never touched;
--   * an account referenced as the author of app data or owner of a Storage
--     object is left for manual review; and
--   * the fixed cutoff makes this safe to re-run after new invitations begin.
delete from auth.users as auth_user
where auth_user.last_sign_in_at is null
  and auth_user.created_at < timestamptz '2026-09-12 09:30:00+00'
  and not exists (
    select 1
    from public.profiles as profile
    where profile.id = auth_user.id
      and profile.is_global_admin
  )
  and not exists (
    select 1
    from storage.objects as object
    where object.owner_id::text = auth_user.id::text
  )
  and not exists (
    select 1 from public.teams where created_by = auth_user.id
  )
  and not exists (
    select 1 from public.team_invitations
    where invited_by = auth_user.id or accepted_by = auth_user.id
  )
  and not exists (
    select 1 from public.exercises where created_by = auth_user.id
  )
  and not exists (
    select 1 from public.sessions
    where created_by = auth_user.id or updated_by = auth_user.id
  )
  and not exists (
    select 1 from public.session_blocks where updated_by = auth_user.id
  )
  and not exists (
    select 1 from public.session_items where updated_by = auth_user.id
  )
  and not exists (
    select 1 from public.session_attendance where updated_by = auth_user.id
  )
  and not exists (
    select 1 from public.session_groupings where generated_by = auth_user.id
  )
  and not exists (
    select 1 from public.warmup_routines
    where created_by = auth_user.id or updated_by = auth_user.id
  )
  and not exists (
    select 1 from public.warmup_items where updated_by = auth_user.id
  );

notify pgrst, 'reload schema';

-- ============================================================
-- 202609020030_account_lifecycle.sql
-- ============================================================
-- Separate team access from the lifetime of a Grep login account.
--
-- Removing a team_memberships row only removes access to that team. Permanent
-- account deletion is a separate global-admin operation: the Auth identity and
-- private preferences disappear, while a minimal "Slettet bruker" profile is
-- retained so sessions, exercises and audit history keep valid authorship.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

-- `profiles.id` still equals `auth.users.id` for every active account, and the
-- auth_user_created trigger continues to enforce that direction. The reverse
-- foreign key must go: deleting an Auth identity should retain an anonymized
-- profile as a historical actor rather than cascade through authored content.
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

comment on column public.profiles.deleted_at is
  'When set, the Auth identity was permanently deleted and this row is an anonymized historical actor.';

-- Signed-in coaches may resolve the deliberately non-personal tombstone when
-- authored content joins profiles. Active profiles remain team-scoped.
drop policy if exists profiles_read_shared on public.profiles;
create policy profiles_read_shared on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_team(id) or public.is_global_admin() or deleted_at is not null);

-- The existing membership trigger protects the last team administrator. A
-- permanent account deletion is initiated above that level and must be able to
-- revoke every membership (the global console already highlights a team
-- left without an administrator). The transaction-local marker is set only by
-- the private Auth deletion trigger below.
create or replace function public.protect_last_team_admin() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('grep.account_deletion_profile_id', true) = old.profile_id::text then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if not exists(select 1 from public.teams where id = old.team_id) then
    return old;
  end if;
  if public.is_global_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if old.role = 'admin' then
    if (tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role <> 'admin')) and
      not exists(
        select 1 from public.team_memberships
        where team_id = old.team_id and profile_id <> old.profile_id and role = 'admin'
      )
    then
      raise exception 'Hvert lag må ha minst én administrator';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.handle_deleted_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  tombstone_email public.citext := ('deleted+' || old.id::text || '@deleted.invalid')::public.citext;
begin
  -- A platform owner must first transfer or revoke that authority explicitly.
  -- This also protects the last global admin from a mistaken dashboard click.
  if exists (
    select 1 from public.profiles
    where id = old.id and is_global_admin
  ) then
    raise exception 'En systemadministrator kan ikke slettes permanent';
  end if;

  -- Access and private preferences disappear with the login account.
  perform set_config('grep.account_deletion_profile_id', old.id::text, true);
  delete from public.team_memberships where profile_id = old.id;
  perform set_config('grep.account_deletion_profile_id', '', true);
  delete from public.exercise_favorites where profile_id = old.id;
  update public.session_items set assigned_coach_id = null where assigned_coach_id = old.id;

  -- An unused invitation is no longer actionable. Accepted invitations remain
  -- as audit history, but must not retain the deleted person's email address.
  delete from public.team_invitations
  where accepted_at is null
    and lower(email::text) = lower(coalesce(old.email, ''));

  update public.team_invitations
  set email = tombstone_email
  where accepted_at is not null
    and lower(email::text) = lower(coalesce(old.email, ''));

  -- Keep only the stable id needed by historical foreign keys.
  update public.profiles
  set email = tombstone_email,
      full_name = 'Slettet bruker',
      avatar_url = null,
      is_global_admin = false,
      must_set_password = false,
      deleted_at = now()
  where id = old.id;

  return old;
end;
$$;

drop trigger if exists auth_user_before_delete on auth.users;
create trigger auth_user_before_delete
before delete on auth.users
for each row execute function public.handle_deleted_auth_user();

-- One account directory for the system-administration screen. It intentionally
-- joins Auth users, so historical tombstones never appear as active accounts.
-- Keeping this behind a security-definer RPC avoids exposing auth.users or
-- widening the normal team-scoped profile policies.
create or replace function public.admin_list_accounts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_global_admin() then
    raise exception 'Du må være systemadministrator';
  end if;

  select coalesce(jsonb_agg(account_entry order by sort_name, sort_email), '[]'::jsonb)
  into result
  from (
    select
      lower(profile.full_name) as sort_name,
      lower(auth_user.email) as sort_email,
      jsonb_build_object(
        'id', profile.id,
        'email', auth_user.email,
        'full_name', profile.full_name,
        'is_global_admin', profile.is_global_admin,
        'created_at', auth_user.created_at,
        'last_sign_in_at', auth_user.last_sign_in_at,
        'files_owned', (
          select count(*)
          from storage.objects object
          where object.owner_id::text = profile.id::text
        ),
        'memberships', coalesce((
          select jsonb_agg(jsonb_build_object(
            'team_id', team.id,
            'team_name', team.name,
            'role', membership.role
          ) order by team.name)
          from public.team_memberships membership
          join public.teams team on team.id = membership.team_id
          where membership.profile_id = profile.id
        ), '[]'::jsonb)
      ) as account_entry
    from auth.users auth_user
    join public.profiles profile on profile.id = auth_user.id
    where profile.deleted_at is null
  ) listed;

  return result;
end;
$$;

revoke execute on function public.admin_list_accounts() from public, anon;
grant execute on function public.admin_list_accounts() to authenticated;

-- Accounts created for an invitation but never used should not live forever.
-- This deliberately ignores accounts with a live invitation, a membership, a
-- global-admin role or owned Storage objects. The tombstone trigger preserves
-- any non-personal authored content if a legacy account somehow has some.
create or replace function public.purge_abandoned_auth_accounts() returns integer
language plpgsql security definer set search_path = '' as $$
declare purged_count integer;
begin
  with candidates as (
    select auth_user.id
    from auth.users auth_user
    join public.profiles profile on profile.id = auth_user.id
    where auth_user.last_sign_in_at is null
      and auth_user.created_at < now() - interval '30 days'
      and not profile.is_global_admin
      and not exists (
        select 1 from public.team_memberships membership
        where membership.profile_id = auth_user.id
      )
      and not exists (
        select 1 from public.team_invitations invitation
        where lower(invitation.email::text) = lower(coalesce(auth_user.email, ''))
          and invitation.accepted_at is null
          and invitation.expires_at > now()
      )
      and not exists (
        select 1 from storage.objects object
        where object.owner_id::text = auth_user.id::text
      )
  ), deleted as (
    delete from auth.users auth_user
    using candidates
    where auth_user.id = candidates.id
    returning auth_user.id
  )
  select count(*)::integer into purged_count from deleted;

  return purged_count;
end;
$$;

revoke execute on function public.purge_abandoned_auth_accounts() from public, anon, authenticated;

-- Supabase Cron is optional. Projects that already enabled pg_cron get the
-- cleanup daily; elsewhere the function remains ready to schedule later.
do $$
declare job_missing boolean;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select not exists (select 1 from cron.job where jobname = $1)'
      into job_missing
      using 'grep-purge-abandoned-auth-accounts';
    if job_missing then
      perform cron.schedule(
        'grep-purge-abandoned-auth-accounts',
        '17 3 * * *',
        'select public.purge_abandoned_auth_accounts()'
      );
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';

-- ============================================================
-- 202609020031_require_auth_for_exercises.sql
-- ============================================================
-- The exercise library belongs to the signed-in coaching workspace. Keep the
-- page guard and the data boundary aligned so anonymous clients cannot bypass
-- the UI and query the table through PostgREST.
drop policy if exists exercises_public_read on public.exercises;
drop policy if exists exercises_authenticated_read on public.exercises;
create policy exercises_authenticated_read on public.exercises for select to authenticated
  using (archived_at is null or created_by = auth.uid() or public.is_global_admin());

revoke select on public.exercises from anon;

notify pgrst, 'reload schema';

-- ============================================================
-- 202609020032_reopen_and_copy_session.sql
-- ============================================================
-- Gjenåpne en avsluttet økt, og kopier en økt til et nytt utkast.
--
-- Two inverses the lifecycle was missing. `finish_session` had no counterpart,
-- so a workout finished by mistake — or one finished before the plan was
-- corrected — was a dead end: `prevent_in_progress_session_changes` locks every
-- row of a completed session. And there was no way to reuse a plan: a coach who
-- runs the same session next week had to rebuild it block by block.

-- The mirror image of `undo_session_start`, one state further along: the plan
-- returns to "ready to start" with its attendance and groups intact, so it can
-- be corrected and run again. Like every other transition against a locked
-- session it opens `plannr.unlocked_session` for this session id, for the
-- length of this transaction only.
create or replace function public.reopen_session(target_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target public.sessions%rowtype;
begin
  select * into target from public.sessions where id = target_session_id for update;

  if not found or not public.is_team_member(target.team_id) then
    raise exception 'Økten ble ikke funnet';
  end if;
  if target.status <> 'completed' then
    raise exception 'Bare en avsluttet økt kan gjenåpnes';
  end if;

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

revoke execute on function public.reopen_session(uuid) from public, anon;
grant execute on function public.reopen_session(uuid) to authenticated;

-- Copying is one RPC rather than three round-trips from the browser because it
-- is one transaction: a plan that arrived without its blocks, or blocks without
-- their activities, would be worse than no copy at all. The source is only read,
-- so a session in any state can be copied — a finished one most of all.
--
-- What comes along: the plan and everything in it. What does not: the date
-- (the caller names a new one, or none), the status (always a fresh draft), and
-- attendance and groups, which are the record of one particular evening rather
-- than part of the plan.
create or replace function public.copy_session(
  source_session_id uuid,
  new_title text default null,
  new_starts_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  source public.sessions%rowtype;
  copy_id uuid;
  copy_title text;
begin
  select * into source from public.sessions where id = source_session_id;

  if not found or not public.is_team_member(source.team_id) then
    raise exception 'Økten ble ikke funnet';
  end if;

  copy_title := coalesce(nullif(btrim(coalesce(new_title, '')), ''), source.title);

  insert into public.sessions (team_id, title, starts_at, venue, planned_duration_minutes, objective, notes, status, created_by, updated_by)
  values (source.team_id, copy_title, new_starts_at, source.venue, source.planned_duration_minutes, source.objective, source.notes, 'draft', auth.uid(), auth.uid())
  returning id into copy_id;

  -- `position` is unique per session and copied verbatim, so it is also the map
  -- from a source block to the block just made from it. The activities are
  -- inserted in the same statement, from the source blocks the data-modifying
  -- CTE does not touch.
  with copied_blocks as (
    insert into public.session_blocks (session_id, title, notes, position, updated_by)
    select copy_id, source_block.title, source_block.notes, source_block.position, auth.uid()
    from public.session_blocks source_block
    where source_block.session_id = source_session_id
    returning id, position
  )
  insert into public.session_items (block_id, kind, exercise_id, title, description, media_url, thumbnail_url, duration_minutes, coaching_notes, assigned_coach_id, position, updated_by)
  select copied.id, item.kind, item.exercise_id, item.title, item.description, item.media_url, item.thumbnail_url, item.duration_minutes, item.coaching_notes,
         -- A coach who has since left the team would be refused by
         -- `validate_session_item_coach` and take the whole copy down with them,
         -- so the new plan starts out unassigned where the old one named them.
         case when exists (
           select 1 from public.team_memberships membership
           where membership.team_id = source.team_id and membership.profile_id = item.assigned_coach_id
         ) then item.assigned_coach_id end,
         item.position, auth.uid()
  from public.session_blocks source_block
  join copied_blocks copied on copied.position = source_block.position
  join public.session_items item on item.block_id = source_block.id
  where source_block.session_id = source_session_id;

  return copy_id;
end;
$$;

revoke execute on function public.copy_session(uuid, text, timestamptz) from public, anon;
grant execute on function public.copy_session(uuid, text, timestamptz) to authenticated;

-- Make the new RPCs visible to PostgREST immediately after a manual SQL Editor run.
notify pgrst, 'reload schema';
