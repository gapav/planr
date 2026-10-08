-- Fokus is a run of weeks, not a calendar month.
--
-- A team's focus rarely starts on the first and ends on the thirtieth: a
-- defensive block runs three weeks up to a cup, a pre-season theme six. So a
-- focus is now a period like a phase in the season plan — a Monday, a number
-- of weeks, a name for the bar in the season overview, one sentence on what it
-- is for, and its points one per line. Whatever focus is running today is the
-- one the Økter page, the front page and the morning email show.
--
-- The days are plain dates in the club's calendar, as the season overview lays
-- its week columns out; a session belongs to a focus when the day it starts on
-- (in the coach's zone) falls inside it.
--
-- Two focuses on one team never overlap, so "the current focus" always has one
-- answer. The builder refuses an overlap before it is sent (`overlappingFocus`
-- in lib/focus.ts) and the exclusion constraint below refuses it here.
create extension if not exists btree_gist with schema extensions;

create table public.team_focus_periods (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  note text not null default '' check (char_length(note) <= 400),
  notes text not null default '' check (char_length(notes) <= 1000),
  starts_on date not null check (extract(isodow from starts_on) = 1),
  weeks smallint not null check (weeks between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint team_focus_periods_no_overlap exclude using gist (team_id with =, daterange(starts_on, starts_on + weeks * 7) with &&)
);

-- The exclusion constraint's GiST index already leads with team_id, which is
-- the only filter the browser and the morning job ever read by.

create trigger team_focus_periods_touch before update on public.team_focus_periods for each row execute function public.touch_updated_at();

alter table public.team_focus_periods enable row level security;

-- Coaching content, written by every coach on the team — the same split as
-- `team_month_focus` before it and `warmup_routines`.
create policy team_focus_periods_read_member on public.team_focus_periods for select to authenticated using (public.is_team_member(team_id));
create policy team_focus_periods_add_member on public.team_focus_periods for insert to authenticated with check (public.is_team_member(team_id));
create policy team_focus_periods_edit_member on public.team_focus_periods for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy team_focus_periods_delete_member on public.team_focus_periods for delete to authenticated using (public.is_team_member(team_id));

revoke all on public.team_focus_periods from anon, authenticated;
grant select, insert, update, delete on public.team_focus_periods to authenticated;

-- Carry every month focus over as the weeks of that month. A week belongs to
-- the month its Thursday is in — the rule the season overview draws its month
-- headings by — so neighbouring months become neighbouring periods and never
-- overlap. A month focus had only its sentence (and, if 202610080002 was run,
-- perhaps a name and points); the name is read through `to_jsonb` so this runs
-- whether or not that column exists. Without a name, a short sentence becomes
-- the name and a long one is cut to fit, keeping the whole sentence as the note.
insert into public.team_focus_periods (team_id, title, note, notes, starts_on, weeks, created_at, updated_at, updated_by)
select
  f.team_id,
  coalesce(nullif(trim(to_jsonb(f) ->> 'title'), ''), left(trim(f.note), 80)),
  case when nullif(trim(to_jsonb(f) ->> 'title'), '') is null and char_length(trim(f.note)) <= 80 then '' else trim(f.note) end,
  coalesce(to_jsonb(f) ->> 'notes', ''),
  first_thursday - 3,
  ((last_day - first_thursday) / 7 + 1)::smallint,
  f.created_at,
  f.updated_at,
  f.updated_by
from public.team_month_focus f
cross join lateral (select to_date(f.month || '-01', 'YYYY-MM-DD') as first_day) d
cross join lateral (select
  d.first_day + ((4 - extract(isodow from d.first_day)::integer + 7) % 7) as first_thursday,
  (d.first_day + interval '1 month' - interval '1 day')::date as last_day) t;

-- `team_month_focus` is left in place, unread, so nothing is lost if this needs
-- another look. A later migration can drop it.

-- Make the new table visible to PostgREST immediately after a manual SQL Editor run.
notify pgrst, 'reload schema';
