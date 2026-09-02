-- Exercises can be shared as text-only coaching instructions.
alter table public.exercises
  alter column media_url drop not null,
  alter column media_kind drop not null;

-- Make the updated columns available to PostgREST when run in the SQL editor.
notify pgrst, 'reload schema';
