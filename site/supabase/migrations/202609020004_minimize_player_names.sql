create or replace function public.minimize_team_player_name() returns trigger
language plpgsql set search_path = public as $$
declare
  name_parts text[];
  part_count integer;
begin
  name_parts := regexp_split_to_array(trim(new.full_name), E'\\s+');
  part_count := coalesce(array_length(name_parts, 1), 0);

  if part_count > 1 then
    new.full_name := name_parts[1] || ' ' || upper(left(name_parts[part_count], 1)) || '.';
  elsif part_count = 1 then
    new.full_name := name_parts[1];
  end if;

  return new;
end;
$$;

-- Minimize player names that may already have been imported.
with minimized as (
  select
    id,
    regexp_split_to_array(trim(full_name), E'\\s+') as name_parts
  from public.team_players
)
update public.team_players player
set full_name = case
  when array_length(minimized.name_parts, 1) > 1
    then minimized.name_parts[1] || ' ' || upper(left(minimized.name_parts[array_length(minimized.name_parts, 1)], 1)) || '.'
  else minimized.name_parts[1]
end
from minimized
where player.id = minimized.id;

-- Remove identifiers that are not needed for planning sessions.
drop index if exists public.team_players_team_email_key;
drop index if exists public.team_players_team_external_id_key;
alter table public.team_players drop column if exists email;
alter table public.team_players drop column if exists external_id;

drop trigger if exists team_players_minimize_name on public.team_players;
create trigger team_players_minimize_name
before insert or update of full_name on public.team_players
for each row execute function public.minimize_team_player_name();

revoke execute on function public.minimize_team_player_name() from public, anon, authenticated;
