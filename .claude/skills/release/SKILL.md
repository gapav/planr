---
name: release
description: Take a pull request to production — check it, list the migrations, settings and environment variables production needs before it merges, walk the maintainer through applying them in order (dev, backup, prod), record them in the ledger, then merge, which deploys. Never applies anything itself.
argument-hint: "[pull request number]"
disable-model-invocation: true
allowed-tools: Bash(npm test) Bash(npm run lint) Bash(npm run build) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git fetch *) Bash(gh pr view *) Bash(gh pr diff *) Bash(gh pr checks *) Bash(gh issue view *)
---

# Release to production

Merging a pull request into `main` deploys `https://grep.team` (see “Where
Grep runs” in `DEPLOYMENT.md`), so the merge button is the release. The
database goes first, the frontend second — never the other way round: a
frontend that writes a column the database lacks fails with
`Could not find the '<column>' column of '<table>' in the schema cache`.

1. **What is going out.** `gh pr view $ARGUMENTS` (the PR, its *Before
   merging* list and the issue it closes), `gh pr checks` (CI must be green),
   and `gh pr diff --name-only`. Without an argument, list the open PRs and
   ask which. If the maintainer instead has commits on a local `main`
   (`git fetch origin` and `git log --oneline origin/main..main`), the same
   steps apply to them, and step 5 is a push rather than a merge.
2. **What production still needs**, from the PR's *Before merging* list, the
   ledger and the diff — trust the diff over the list:
   - migrations in the diff that are `pending` or `unknown` for prod, and any
     file in `site/supabase/migrations/` missing from the ledger;
   - new environment variables (`site/.env.example`, `process.env.` in the
     diff) — set in Vercel Production before the merge;
   - changes to `site/supabase/config.toml` — the maintainer compares with
     `npm --prefix site run supabase:config:diff:prod` and applies them;
   - changes to `site/vercel.json` (the cron).

   If none, say so and go to step 5.
3. **Apply, in order, by the maintainer.** For each migration, in filename
   order: run it on `planr-dev` in the SQL editor; then `make backup` (it
   prompts for the password — suggest `! make backup`); then run it on
   `grep-prod`. Wait for the maintainer to confirm each one. Never mark one
   the maintainer hasn't confirmed, and never run anything against a
   database yourself.
4. **Record it.** On the PR's branch, mark each confirmed migration `applied`
   in the ledger and tick the PR's *Before merging* lines; commit
   `ledger: … (#N)` and push the branch, once the maintainer says so.
5. **Merge** once the maintainer says go: they press the button, or
   `gh pr merge N --squash` with their yes. The issue closes and the board
   moves it to Done.
6. **After.** Give the smoke checks from `DEPLOYMENT.md` section 8 that this
   change touches (the morning email has a `?dry=1`). Anything that fails
   becomes a new issue.
