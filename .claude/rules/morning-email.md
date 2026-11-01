---
paths:
  - "site/app/api/cron/**"
  - "site/lib/{session-digest,session-email,email-shell,auth-email}*.ts"
  - "site/components/session-digest-card.tsx"
  - "site/vercel.json"
---

# The morning session email

The one scheduled job: `app/api/cron/daily-session-digest/route.ts`, called by
Vercel Cron (`site/vercel.json`, `0 5 * * *`) and authenticated by `CRON_SECRET`
rather than by a user token — that early nobody is signed in, which is why it reads
with `SUPABASE_SECRET_KEY` like the auth-link route. Vercel schedules in UTC, so
the mail goes out at 07:00 Oslo time in summer and 06:00 in winter; "today" is
still worked out in `Europe/Oslo` (`clubDay`), so only the hour moves. It mails every coach on a
team training that day the whole plan. The rules live in `lib/session-digest.ts`
and the letter in `lib/session-email.ts`, both pure and tested; the route only
wires them together. `lib/email-shell.ts` is the envelope both it and
`lib/auth-email.ts` render into.

Three invariants: **drafts never mail** (the status filter is the only thing
preventing a letter about a session `start_session` would refuse), **nor does a
plan that is mostly empty** — `digestSessionsForDay` needs
`sessionPlanProgress` (the calendar's bar) at `DIGEST_MIN_PLAN_PROGRESS` (80 %)
or more, since publishing only requires one block — and **sending
is idempotent** — the job claims each (session, coach) pair in
`session_email_log` (migration `202609020033`) before sending and only mails the
claims the database granted, giving a claim back when a send fails. A run with
no Resend key claims nothing, so it stays a dry run. `?dry=1` reports recipients
without claiming. `profiles.session_digest_email` is the per-coach opt-out,
toggled from `/team`.
