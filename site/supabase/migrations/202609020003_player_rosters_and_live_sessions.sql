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
