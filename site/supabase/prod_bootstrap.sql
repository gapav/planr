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
