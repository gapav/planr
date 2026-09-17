-- Samlinger: named shortlists of library exercises, shared by the coaching team.
--
-- Favoritter (202609020022) stays exactly as it is and is deliberately not
-- folded into this table. A heart is private — "nobody sees another coach's
-- hearts, global admin included" — while a samling is coaching content the
-- staff works from together ("Oktober 2026 fokus"), the same split
-- `warmup_routines` and `team_month_focus` already make. Merging the two would
-- have meant publishing every existing private heart to a teammate, and there
-- is no principled answer to which of a two-team coach's teams would receive
-- them. So: one concept per lifetime, two tables, one single-select group in
-- the rail.
--
-- There is no position column, and that is a decision rather than an omission.
-- A samling is a filter over the library, not a plan; the moment it carries an
-- order it starts competing with `sessions`, which already owns "these
-- activities, in this order, on this date".
create table public.exercise_collections (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Two samlinger called "Oktober" and "oktober" are the same samling to everyone
-- but Postgres, so the uniqueness is on the folded, trimmed name. This is also
-- what makes a rename collide loudly instead of quietly producing a duplicate.
create unique index exercise_collections_team_name_key on public.exercise_collections(team_id, lower(trim(name)));
create index exercise_collections_team on public.exercise_collections(team_id);

-- Membership is a set, not a list: the primary key is the whole story, and an
-- "add" that runs twice is the same row rather than a duplicate. That is what
-- lets two coaches curate one samling at the same time without a merge — every
-- write is an insert or a delete of one known key.
create table public.exercise_collection_items (
  collection_id uuid not null references public.exercise_collections(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, exercise_id)
);

-- The primary key already indexes a samling's own contents; this one serves the
-- reverse lookup a cascade from `exercises` needs.
create index exercise_collection_items_exercise on public.exercise_collection_items(exercise_id);

-- Archiving is untouched, exactly as it is for favourites: an archived exercise
-- keeps its place in a samling (the library query already filters
-- `archived_at`), while deleting the exercise cascades it away.

create trigger exercise_collections_touch before update on public.exercise_collections for each row execute function public.touch_updated_at();

-- The items table has no team_id of its own, so every policy on it would
-- otherwise re-derive membership through a subquery that is itself subject to
-- the parent's RLS. `can_access_block` solves the same problem the same way.
create or replace function public.can_access_collection(target_collection_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.exercise_collections collection
    where collection.id = target_collection_id and public.is_team_member(collection.team_id)
  )
$$;

alter table public.exercise_collections enable row level security;
alter table public.exercise_collection_items enable row level security;

-- A samling is coaching content, so every coach on the team may make, rename,
-- fill and delete one — the split `warmup_routines` uses, not the admin-only
-- one the roster and the match import use. `created_by` records who started it
-- and is never rewritten by a rename.
create policy exercise_collections_read_member on public.exercise_collections for select to authenticated using (public.is_team_member(team_id));
create policy exercise_collections_add_member on public.exercise_collections for insert to authenticated with check (public.is_team_member(team_id) and created_by = auth.uid());
create policy exercise_collections_edit_member on public.exercise_collections for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy exercise_collections_delete_member on public.exercise_collections for delete to authenticated using (public.is_team_member(team_id));

-- There is no update policy on the membership rows: an exercise is only ever
-- put into a samling or taken out of it.
create policy exercise_collection_items_read_member on public.exercise_collection_items for select to authenticated using (public.can_access_collection(collection_id));
create policy exercise_collection_items_add_member on public.exercise_collection_items for insert to authenticated with check (public.can_access_collection(collection_id));
create policy exercise_collection_items_delete_member on public.exercise_collection_items for delete to authenticated using (public.can_access_collection(collection_id));

revoke all on public.exercise_collections, public.exercise_collection_items from anon, authenticated;
grant select, insert, update, delete on public.exercise_collections to authenticated;
grant select, insert, delete on public.exercise_collection_items to authenticated;
revoke execute on function public.can_access_collection(uuid) from public, anon;
grant execute on function public.can_access_collection(uuid) to authenticated;

-- A brand-new table is invisible to PostgREST until it re-reads the schema.
notify pgrst, 'reload schema';
