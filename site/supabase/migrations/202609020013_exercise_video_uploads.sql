-- Public exercise videos are limited to small MP4 clips. Storage enforces the
-- same 5 MB limit as the exercise form, so clients cannot bypass it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-videos', 'exercise-videos', true, 5242880, array['video/mp4']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists exercise_videos_insert_own on storage.objects;
create policy exercise_videos_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'exercise-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists exercise_videos_delete_own on storage.objects;
create policy exercise_videos_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'exercise-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
