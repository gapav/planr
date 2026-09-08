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
