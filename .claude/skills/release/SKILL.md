---
name: release
description: Take finished work to production — check the tree, list the migrations, settings and environment variables production still needs, walk the maintainer through applying them in order (dev, backup, prod), update the ledger, then push main, which deploys. Never applies anything itself.
disable-model-invocation: true
allowed-tools: Bash(npm test) Bash(npm run lint) Bash(npm run build) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git fetch *)
---

# Release to production

A push to `main` deploys `https://grep.team` (see “Where Grep runs” in
`DEPLOYMENT.md`). The database goes first, the frontend second — never the
other way round: a frontend that writes a column the database lacks fails
with `Could not find the '<column>' column of '<table>' in the schema cache`.

1. **What is going out.** `git fetch origin`, `git status`, and
   `git log --oneline origin/main..main`. List the work items those commits
   name and their open manual steps. Uncommitted changes stop the release
   until the maintainer commits or sets them aside.
2. **Checks** from `site/`: `npm run lint`, `npm test`, `npm run build`
   (the suite also fails on a drifted `prod_bootstrap.sql`).
3. **What production still needs**, from the ledger and the diff since
   `origin/main`:
   - migrations `pending` or `unknown` for prod, and any file in
     `site/supabase/migrations/` missing from the ledger;
   - new environment variables (`site/.env.example`, `process.env.` in the
     diff) — set in Vercel Production before the push;
   - changes to `site/supabase/config.toml` — the maintainer compares with
     `npm --prefix site run supabase:config:diff:prod` and applies them;
   - changes to `site/vercel.json` (the cron).

   If none, say so and go to step 5.
4. **Apply, in order, by the maintainer.** For each migration, in filename
   order: run it on `planr-dev` in the SQL editor; then `make backup` (it
   prompts for the password — suggest `! make backup`); then run it on
   `grep-prod`. Wait for the maintainer to confirm each one, then mark it
   `applied` in the ledger. Never mark one the maintainer hasn't confirmed,
   and never run anything against a database yourself.
5. **Push** once the maintainer says go: commit the ledger update
   (`release: …`), then `git push origin main`.
6. **After.** Give the smoke checks from `DEPLOYMENT.md` section 8 that this
   release touches (the morning email has a `?dry=1`), add a dated
   “released” log line to each item, and set it `done` if nothing else is
   open.
