-- Changing a rotation failed for any coach but the last one to touch each station.
--
-- `sync_station_durations_from_block` (202609130002) mirrors the rotation onto
-- every station with an `update` that runs as the coach who changed the block.
-- That update is checked against `items_edit_team`, whose `with check` demands
-- `updated_by = auth.uid()` — and the cascade leaves `updated_by` as it was. So
-- as soon as a station was written by a colleague, the copy was refused, the
-- whole statement rolled back with it, and the coach was told "Handlingen kunne
-- ikke fullføres" while the stepper went on showing the minutes nobody saved.
--
-- The coach was already allowed to change the block — RLS said so before this
-- trigger ever ran — and the cascade only ever touches that block's own items
-- with a value read from that row. It is bookkeeping, not an edit of anyone's
-- station, so it runs as definer rather than claiming authorship of the rows.
-- `prevent_in_progress_session_changes` is a trigger, not a policy, and still
-- fires on every item it touches.
create or replace function public.sync_station_durations_from_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.session_items
  set duration_minutes = new.rotation_minutes
  where block_id = new.id and duration_minutes is distinct from new.rotation_minutes;
  return null;
end;
$$;

revoke execute on function public.sync_station_durations_from_block() from public, anon, authenticated;
