alter table public.exercises
  add column if not exists category text not null default 'Angrep'
  check (category in ('Forsvar', 'Angrep', 'Målvakt', 'Fysisk', 'Leker'));

create index if not exists idx_exercises_active_category
  on public.exercises(category, created_at desc)
  where archived_at is null;

-- Make the new column available to PostgREST immediately when this migration
-- is run directly in the hosted Supabase SQL editor.
notify pgrst, 'reload schema';
