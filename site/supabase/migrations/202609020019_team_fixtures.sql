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
