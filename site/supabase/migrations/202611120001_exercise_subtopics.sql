-- Undertema: a second level under each of the six exercise topics (issue #9,
-- decision 4).
--
-- Stored like `age_groups` (202609020023): a label array on the exercise, not a
-- topics table. The values are stable keys qualified by their topic
-- ('forsvar.teknikk', 'malvakt.teknikk' — "Teknikk" appears under both), and the
-- UI renders the Norwegian label from `EXERCISE_SUBTOPICS` in lib/types.ts. That
-- list and the one below are the same list; adding or renaming a subtopic is a
-- new migration and a change there.
--
-- An exercise may carry several subtopics, but only from its own topic, so the
-- check compares the array with the keys allowed for the row's `category`. An
-- empty array — what every existing exercise gets, with no backfill — means
-- "not tagged": the exercise still shows under its topic, never under a
-- subtopic. The maintainer tags the existing library by hand.
alter table public.exercises
  add column if not exists subtopics text[] not null default '{}';

alter table public.exercises
  drop constraint if exists exercises_subtopics_check;

alter table public.exercises
  add constraint exercises_subtopics_check
  check (subtopics <@ case category
    when 'Angrep' then array['angrep.ballbehandling', 'angrep.kast-og-mottak', 'angrep.finter', 'angrep.1-mot-1', 'angrep.sma-grupper']::text[]
    when 'Forsvar' then array['forsvar.teknikk', 'forsvar.1-mot-1', 'forsvar.sma-grupper']::text[]
    when 'Skuddferdigheter' then array['skudd.gulvet', 'skudd.lufta', 'skudd.posisjon']::text[]
    when 'Målvakt' then array['malvakt.teknikk', 'malvakt.motorikk', 'malvakt.fysisk']::text[]
    when 'Fysisk' then array['fysisk.koordinasjon', 'fysisk.hurtighet', 'fysisk.styrke', 'fysisk.utholdenhet', 'fysisk.skadeforebygging']::text[]
    when 'Leker' then array['leker.oppvarming', 'leker.smalagsspill']::text[]
    else '{}'::text[]
  end);

-- No index: the browser loads the whole active library and filters in memory
-- (`filterExercises`). RLS and grants are unchanged — the `exercises` policies
-- are row-level and `insert, update` are table grants, so they cover the column.

-- Make the new column available to PostgREST immediately.
notify pgrst, 'reload schema';
