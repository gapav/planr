-- Kampoppvarming: the standing routine a team runs before a match.
--
-- A training session is a one-off plan; a warm-up is the same handful of
-- activities before every match, adjusted a few times a season. So it belongs
-- to the team, not to the fixture: the calendar shows the routine against each
-- match rather than storing a near-identical copy 22 times a year.
--
-- `name` and `is_default` are here from the start so a small set of named
-- routines ("Kort halltid", "Bortekamp") stays a UI change plus a nullable
-- warmup_routine_id on team_fixtures, not a migration of live rows.
create table public.warmup_routines (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null default 'Kampoppvarming' check (char_length(trim(name)) between 1 and 80),
  is_default boolean not null default true,
  -- How long before kick-off the squad meets at the hall. The warm-up itself
  -- starts at kick-off minus the sum of its activities, which is derived.
  meet_minutes_before integer not null default 60 check (meet_minutes_before between 0 and 300),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One routine per team is the default; the index is what keeps a second one
-- from silently becoming ambiguous once named routines arrive.
create unique index warmup_routines_team_default_key on public.warmup_routines(team_id) where is_default;
create index warmup_routines_team on public.warmup_routines(team_id);

-- Activities copy the exercise's display data at insert time, exactly as
-- session items do, so editing the library never rewrites a routine that has
-- already been drilled.
create table public.warmup_items (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.warmup_routines(id) on delete cascade,
  kind public.session_item_kind not null,
  exercise_id uuid references public.exercises(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 140),
  description text not null default '',
  media_url text,
  thumbnail_url text,
  duration_minutes integer not null default 5 check (duration_minutes between 1 and 180),
  coaching_notes text not null default '',
  position integer not null check (position >= 0),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (routine_id, position) deferrable initially deferred
);

create index warmup_items_routine_position on public.warmup_items(routine_id, position);

create trigger warmup_routines_touch before update on public.warmup_routines for each row execute function public.touch_updated_at();
create trigger warmup_items_touch before update on public.warmup_items for each row execute function public.touch_updated_at();

create or replace function public.can_access_warmup_routine(target_routine_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.warmup_routines routine
    where routine.id = target_routine_id and public.is_team_member(routine.team_id)
  )
$$;

alter table public.warmup_routines enable row level security;
alter table public.warmup_items enable row level security;

-- The warm-up is coaching content, like a session plan, so every coach on the
-- team may change it — unlike the roster and the match import, which are club
-- records only an admin maintains.
create policy warmup_routines_read_member on public.warmup_routines for select to authenticated using (public.is_team_member(team_id));
create policy warmup_routines_add_member on public.warmup_routines for insert to authenticated with check (public.is_team_member(team_id) and created_by = auth.uid() and updated_by = auth.uid());
create policy warmup_routines_edit_member on public.warmup_routines for update to authenticated using (public.is_team_member(team_id)) with check (public.is_team_member(team_id) and updated_by = auth.uid());
create policy warmup_routines_delete_member on public.warmup_routines for delete to authenticated using (public.is_team_member(team_id));

create policy warmup_items_read_member on public.warmup_items for select to authenticated using (public.can_access_warmup_routine(routine_id));
create policy warmup_items_add_member on public.warmup_items for insert to authenticated with check (public.can_access_warmup_routine(routine_id) and updated_by = auth.uid());
create policy warmup_items_edit_member on public.warmup_items for update to authenticated using (public.can_access_warmup_routine(routine_id)) with check (public.can_access_warmup_routine(routine_id) and updated_by = auth.uid());
create policy warmup_items_delete_member on public.warmup_items for delete to authenticated using (public.can_access_warmup_routine(routine_id));

-- Ordering is an RPC for the same reason block items are: the positions must
-- stay consistent, which a sequence of client-side row updates cannot promise.
create or replace function public.reorder_warmup_items(target_routine_id uuid, ordered_item_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_warmup_routine(target_routine_id) then raise exception 'Oppvarmingen finnes ikke'; end if;
  if array_length(ordered_item_ids, 1) is distinct from (select count(*)::integer from public.warmup_items where routine_id = target_routine_id) then raise exception 'Aktivitetslisten er ufullstendig'; end if;
  set constraints warmup_items_routine_id_position_key deferred;
  update public.warmup_items item set position = ordering.position - 1, updated_by = auth.uid()
  from unnest(ordered_item_ids) with ordinality as ordering(id, position)
  where item.id = ordering.id and item.routine_id = target_routine_id;
end;
$$;

revoke all on public.warmup_routines, public.warmup_items from anon, authenticated;
grant select, insert, update, delete on public.warmup_routines, public.warmup_items to authenticated;
revoke execute on function public.can_access_warmup_routine(uuid) from public, anon;
grant execute on function public.can_access_warmup_routine(uuid) to authenticated;
revoke execute on function public.reorder_warmup_items(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_warmup_items(uuid, uuid[]) to authenticated;
