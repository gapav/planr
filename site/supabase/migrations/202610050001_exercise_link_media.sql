-- An exercise can point at a page Grep cannot show — an Instagram reel, a
-- TikTok, a club's drill page — which the app offers as a link to open rather
-- than drawing it as a picture. Session items copy only the url and the
-- thumbnail, so they need nothing new: an image is saved as its own thumbnail
-- and a link never is, which is how the app tells the two apart there.
alter type public.exercise_media_kind add value if not exists 'link';

-- Make the new value available to PostgREST when run in the SQL editor.
notify pgrst, 'reload schema';
