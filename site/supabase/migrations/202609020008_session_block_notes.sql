alter table public.session_blocks
  add column if not exists notes text not null default '';

notify pgrst, 'reload schema';
