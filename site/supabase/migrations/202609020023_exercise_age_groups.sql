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
