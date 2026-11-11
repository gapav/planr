---
name: run-locally
description: Run Grep on this machine — start and stop the dev server on port 3000, make sure it points at planr-dev and never at production, sign in on localhost, try the server routes and the morning email, and fix the usual failures. Use when asked to run, start, open or screenshot Grep locally, or to check a change in the running app.
---

# Run Grep locally

## Start and stop

- From `site/`: `npm run dev`, as a background command so the session stays
  free. It serves `http://localhost:3000`, and the port is pinned on purpose:
  the dev project's redirect allow-list (`supabase/config.toml`,
  `remotes.development.auth`) admits only `http://localhost:3000/**`. Spenst
  runs on 3001.
- When 3000 is taken, Next stops with `EADDRINUSE` instead of moving.
  `lsof -nP -iTCP:3000 -sTCP:LISTEN` finds the other server. Free the port;
  don't move Grep off it.
- Stop the server by stopping the background command.
- After pulling, a missing module means `npm install` first.

## Which data you are on

- **No `site/.env.local`: demo mode.** The sidebar says «Demomodus · ingen
  data lagres», the provider seeds from `lib/demo-data.ts`, any email opens
  the demo workspace, and nothing is saved.
- **`site/.env.local` must point at `planr-dev`** (`hgjboxsgemvgrlyemudt`).
  Agents are denied reading the file, because it holds the dev secret key.
  So before the first change that writes data, ask the maintainer to run
  `! grep NEXT_PUBLIC_SUPABASE_URL site/.env.local`. If it shows
  `fbbqdutatetfkybvlozx`, that is `grep-prod`: stop and say so, because
  anything done in the local app would land on real teams.

## Signing in on localhost

- **«Bruk passord på localhost»** on `/sign-in` signs in an existing
  `planr-dev` user who has a password. It shows only on localhost, and it is
  the usual way in.
- **A magic link from `/sign-in` doesn't work against `planr-dev`.** The dev
  project uses Supabase's built-in mail, which reaches only project members,
  and its default template comes back in a shape the browser client rejects,
  so the coach lands signed out (`site/README.md`, `.claude/rules/auth.md`).
  Links minted from `/admin` do work, because the auth-link route builds
  them itself.
- `/admin` needs `is_global_admin` on your `planr-dev` profile, which the
  maintainer sets once in the dev SQL editor.

## The server routes locally

- `/api/admin/auth-link`, `/api/admin/accounts` and the morning email need
  `SUPABASE_SECRET_KEY` in `.env.local` — the dev project's key, never
  production's.
- Without `RESEND_API_KEY` and `RESEND_FROM`, nothing is mailed: the console
  shows each invite link to pass on, and the morning email is a dry run.
- The morning email also needs `CRON_SECRET` in `.env.local`. The maintainer
  calls `/api/cron/daily-session-digest?dry=1` with it, as in
  `DEPLOYMENT.md` section 7, against `http://localhost:3000`. Don't read the
  secret yourself.

## After pulling new migrations

`Could not find the '<column>' column of '<table>' in the schema cache`
means `planr-dev` lacks a migration. Check the ledger at the end of
`DEPLOYMENT.md`: the maintainer applies anything `pending` for dev in the dev
SQL editor and marks it `applied`.

## Supabase settings for dev

`npm run supabase:config:diff:dev` shows how `planr-dev` differs from
`config.toml`; it changes nothing. Pushing is the maintainer's, after
reading the diff: `! npm run supabase:config:push:dev`. Agents are denied it.

## Checking a change

- Demo mode is fine for screens. Anything that saves, RLS, realtime or a
  server route needs `planr-dev`.
- Collaboration needs two browsers signed in as two coaches on one team —
  the steps are in issue #2.
- The dev server doesn't lint and doesn't fail on type errors, so
  `npm run lint` and `npm run build` still apply.

## Never

`supabase start`, `supabase db …` or `supabase link` — the CLI in `site/` is
linked to production — and never read `.env.local`. The settings deny all
of them.
