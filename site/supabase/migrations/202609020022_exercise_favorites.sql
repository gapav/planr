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
