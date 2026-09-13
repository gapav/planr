-- Apply manually after the existing team_fixtures migration.
-- Existing member/admin RLS and grants continue to protect this metadata.
alter table public.team_fixtures
  add column if not exists our_team_colors jsonb not null default '{}'::jsonb;

alter table public.team_fixtures
  add constraint team_fixtures_colours_object
  check (jsonb_typeof(our_team_colors) = 'object' and octet_length(our_team_colors::text) <= 4096);

comment on column public.team_fixtures.our_team_colors is
  'Own team names mapped to Grep palette IDs. Latest imported assignment is used across that workspace.';

notify pgrst, 'reload schema';
