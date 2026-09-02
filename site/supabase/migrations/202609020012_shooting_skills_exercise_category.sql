alter table public.exercises
  drop constraint if exists exercises_category_check;

alter table public.exercises
  add constraint exercises_category_check
  check (category in ('Forsvar', 'Angrep', 'Skuddferdigheter', 'Målvakt', 'Fysisk', 'Leker'));

-- Make the updated constraint visible to PostgREST immediately when this
-- migration is run directly in the hosted Supabase SQL editor.
notify pgrst, 'reload schema';
