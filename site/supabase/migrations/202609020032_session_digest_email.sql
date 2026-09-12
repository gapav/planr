-- The morning digest: "dagens økt" in the coaches' inboxes on the day it runs.
--
-- A scheduled job (Vercel Cron -> app/api/cron/daily-session-digest) wakes up
-- once every morning, finds the sessions starting that day and mails each coach
-- on the team. Two things have to live in the database for that to be safe:
--
--   1. A per-coach opt-out, so turning the mail off does not require a trip to
--      the Supabase dashboard.
--   2. A record of what has already been sent, so the job can be run twice —
--      by a cron retry, a redeploy, or a curl while testing — without mailing
--      anyone the same session twice.
--
-- The job itself has no signed-in user, so it reads with the secret key and
-- bypasses RLS. That is precisely why the log's uniqueness lives here as a
-- primary key rather than as a check in the route: the database is the only
-- thing that can arbitrate between two runs racing each other.

alter table public.profiles
  add column if not exists session_digest_email boolean not null default true;

comment on column public.profiles.session_digest_email is
  'Whether this coach receives the morning "dagens økt" email. Opt-out, default on.';

-- 202609020011 replaced the table-wide update grant with a column list, so a
-- coach cannot raise their own privileges. The new column has to be added to
-- that list explicitly or the toggle silently fails under RLS.
grant update (session_digest_email) on public.profiles to authenticated;

create table if not exists public.session_email_log (
  session_id uuid not null references public.sessions(id) on delete cascade,
  kind text not null check (kind in ('daily_digest')),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  email citext not null,
  sent_at timestamptz not null default now(),
  primary key (session_id, kind, recipient_profile_id)
);

comment on table public.session_email_log is
  'One row per session per coach per email kind. The primary key is the idempotency guard: the digest job claims a row before sending and deletes its claim if the send fails.';

alter table public.session_email_log enable row level security;

-- Readable by the team the session belongs to — it answers "did the mail go
-- out?" without a dashboard. Nothing but the digest job writes here, and the
-- job uses the secret key, so no insert, update or delete policy exists.
create policy session_email_log_read_team on public.session_email_log for select to authenticated
  using (public.can_access_session(session_id));

revoke all on public.session_email_log from anon, authenticated;
grant select on public.session_email_log to authenticated;

-- The job's own lookup: every row for the sessions of one day.
create index if not exists idx_session_email_log_sent on public.session_email_log(sent_at desc);
