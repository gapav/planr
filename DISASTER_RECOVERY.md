# Disaster recovery

Supabase's free tier takes **no backups**. Vercel holds no data. If the
production project is deleted, corrupted, or permanently paused, the only thing
standing between the club and starting over is a backup you took yourself.

This document is the runbook. The commands are `make backup` and `make restore`,
and both walk you through numbered steps rather than doing everything at once —
the day you need `restore` is not the day to be reading a script for the first
time.

```bash
make doctor    # can this machine take and restore a backup?
make backup    # guided backup (read-only)
make restore   # guided restore
```

No password is ever stored. Each script prompts for it, reads it without echo,
and hands it to `pg_dump`/`psql` through the environment — never on a command
line (where `ps` would show it), never into a file, never into shell history.

---

## What has to be backed up, and why

The project is four separate things, and a backup of only the first one does not
restore a working app.

| | Lives in | Captured by |
|---|---|---|
| **Schema** — tables, RLS policies, RPCs, triggers | Postgres `public` | `schema.sql` |
| **Application data** — teams, sessions, exercises, players | Postgres `public` | `data.sql` |
| **Coach accounts** — including password hashes | Postgres `auth.users` | `data.sql` |
| **Uploaded media** — exercise videos, team logos | Storage buckets (blobs) | `storage/` |
| **Hooks into platform schemas** — see below | `auth`, `storage`, `realtime` | `platform_objects.sql` |

Everything below the first row is routinely missed:

- **`supabase db dump` excludes the `auth` schema by default.** A dump taken the
  obvious way restores a working schema with zero coaches able to sign in.
  `make backup` dumps data with the `auth` schema included, so password hashes
  come back and everyone signs in exactly as before — no re-invites.
- **`pg_dump` cannot see Storage files at all.** They are blobs behind an HTTP
  API. `storage.objects` rows describe them; the bytes are elsewhere.
  `make backup` downloads them through the Storage API separately.
- **A schema dump skips the platform schemas — but this app puts things there.**
  This is the subtle one. Supabase owns `auth`, `storage` and `realtime`, so
  every schema dump excludes them. The migrations nevertheless attach app-owned
  objects *inside* them:

  | Object | On | From |
  |---|---|---|
  | `auth_user_created` | `auth.users` | `202609020001` — creates the `profiles` row |
  | `auth_user_password_changed` | `auth.users` | `202609020026` — clears `must_set_password` |
  | `auth_user_before_delete` | `auth.users` | `202609020030` — account-deletion guard |
  | `exercise_videos_*` policies | `storage.objects` | `202609020013`, `202609020026` |
  | `team_logos_*` policies | `storage.objects` | `202609020017` |
  | `grep_realtime_read` / `_write` | `realtime.messages` | `202609020001` |

  Restore without these and nothing looks broken until the first coach signs in
  (no profile row is created), uploads a video (RLS denies it), or opens a
  session alongside someone else (realtime is silent). `make backup`
  reconstructs them from the system catalog into `platform_objects.sql`, and
  `make restore` applies it right after the schema.

### Two things no backup can hold

Environment variables (`SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `CRON_SECRET`)
and the Supabase auth settings. The first live in Vercel and a password manager;
the second are in `site/supabase/config.toml` and are pushed with
`supabase config push`. `make restore` ends by listing both.

---

## Prerequisites, and two traps worth knowing before a crisis

Run `make doctor`. It checks all of this and tells you what to install.

**1. `supabase db dump` needs Docker.** The CLI shells out to `pg_dump` inside a
container. If Docker is not installed, the command in older docs fails with
`docker: command not found`. These scripts call a local `pg_dump` directly
instead:

```bash
brew install postgresql@17
```

Keg-only, so it shadows nothing, and the scripts find it without any `PATH`
changes. Version 17 matches the server (Postgres 17.6).

**2. The Direct connection host is IPv6-only.** `db.<ref>.supabase.co` publishes
an `AAAA` record and no `A` record. On an IPv4-only network — most home and
café Wi-Fi — connections to it simply hang with no useful error.

Use the **Session pooler** URI instead: Dashboard → **Connect** → *Session
pooler*. It resolves over IPv4, runs on port 5432, and supports `pg_dump`.

> Do **not** use the *Transaction pooler* (port 6543). Transaction-mode pooling
> cannot hold the session state `pg_dump` needs. Both scripts warn if you paste
> the wrong one.

Both scripts ask you to paste the URI straight from the dashboard, `[YOUR-PASSWORD]`
placeholder and all, then ask for the password separately.

---

## Taking a backup

```bash
make backup
```

Eight steps: check tools → connect → choose a destination → roles → schema →
data → Storage files → manifest. It only ever reads.

You get a dated folder under `backups/` (gitignored):

```
backups/fbbqdutatetfkybvlozx-20260913T140000Z/
├── MANIFEST.txt     what was taken, from where, at which repo commit
├── roles.sql        cluster roles
├── schema.sql       the schema as production really is
├── platform_objects.sql  triggers/policies this app puts in auth, storage, realtime
├── data.sql         every row, including auth.users
├── inventory.txt    per-table row counts, to verify a restore against
├── storage/         the actual files from every bucket
└── SHA256SUMS
```

`schema.sql` is worth keeping for a second reason: it is the schema as
production *actually is*, which is stronger evidence than what the migrations
claim. Diffing it across two backups shows exactly what a release changed.

### When to run it

- **Before every schema change.** Non-negotiable — migrations are applied by
  hand in the SQL editor and there is no undo.
- **Monthly** in season.
- **After bulk imports** — a roster import is hard to redo.

### Afterwards

The backup contains coach email addresses and auth identities. Keep it private,
and **keep a copy somewhere other than this laptop**. A backup on the only disk
you own is not a backup.

---

## Restoring

```bash
make restore
```

Ten steps. Steps 1–5 only read; nothing is written to the target until step 6,
and writing to production requires typing `OVERWRITE PRODUCTION` in full.

Restore into a **brand-new, empty** Supabase project. Create it in the
dashboard, save the new database password, wait for *Active*, then run the
command.

### Do not paste `prod_bootstrap.sql` into the project first

This is the one genuinely counter-intuitive part.

`schema.sql` from the backup is the better source — it is what production really
looked like. Applying the bootstrap as well would mean two schema definitions
fighting, and worse, the bootstrap contains **one-time cleanup migrations that
delete rows**:

- `202609020028` deletes *every* unaccepted team invitation, unconditionally.
- `202609020029` deletes never-signed-in `auth.users` created before
  2026-09-12 09:30 UTC.

Run either after restoring data and they will quietly delete records you were
trying to bring back. `make restore` never touches the bootstrap.

### What restore does about Storage

`data.sql` brings back the `storage.objects` rows, but not the bytes. Step 8
clears those rows and re-uploads the files, which recreates them. This is
lossless here because both buckets' RLS policies key off the **path prefix**
(`storage.foldername(name)[1]` — the user id or team id), not the object owner.

### Verifying

Step 9 diffs live row counts against `inventory.txt` from the backup and prints
any table that disagrees. A clean restore matches exactly.

---

## Rehearse it once

An unverified backup is a guess. Once — ideally soon — create a throwaway
Supabase project, run `make restore` into it, and watch step 9 report matching
row counts. It costs an hour and converts a hope into a fact.

---

## The bootstrap script

`site/supabase/prod_bootstrap.sql` is generated, not written: it is
`site/supabase/migrations/*.sql` concatenated in filename order, so a brand-new
empty project can be built from one paste into the SQL editor.

```bash
make bootstrap    # regenerate it, then assert it matches the migrations
```

`site/scripts/build-bootstrap.test.ts` fails the suite if the checked-in file
has drifted, so a migration added without regenerating cannot ship quietly.

**Its role in disaster recovery is narrow.** The bootstrap rebuilds an *empty*
project's schema. It restores no data, no accounts and no files, and — because
of the two deleting migrations above — it is the wrong tool for rebuilding a
project from a backup. Use it to stand up a new dev environment; use
`make restore` to recover.

### Known wrinkle: a duplicate version number

Two migrations share the version `202609020032`:

- `202609020032_reopen_and_copy_session.sql`
- `202609020032_session_digest_email.sql`

Harmless today — they touch disjoint objects, so the order between them does not
change the result, and filename sort order happens to match the order they were
applied in production. But it means "which ran first" cannot be answered from
the filenames. If the project ever adopts `supabase db push` and its migration
history table, this has to be resolved first — renaming the later one to
`202609020033_` is the fix. `make doctor` flags it on every run.
