---
name: release
description: Take a pull request to production — check it, list the migrations, settings and environment variables production needs before it merges, walk the maintainer through `make migrate-dev` and `make migrate-prod`, then merge, which deploys. Never applies anything itself.
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
2. **What production still needs**, from the PR's *Before merging* list and
   the diff — trust the diff over the list:
   - every new file in `site/supabase/migrations/` in the diff (whether it is
     applied yet is the projects' own history: step 3 shows it);
   - new environment variables (`site/.env.example`, `process.env.` in the
     diff) — set in Vercel Production before the merge;
   - changes to `site/supabase/config.toml` — the maintainer compares with
     `npm --prefix site run supabase:config:diff:prod` and applies them;
   - changes to `site/vercel.json` (the cron).

   If none, say so and go to step 5.
3. **Apply, by the maintainer.** With the PR's branch checked out, they run
   `make migrate-dev` in their own terminal (it prompts for the password, so
   not through `!`): it shows the pending files, which should be exactly the
   ones from step 2, and applies them after a typed confirmation. Then
   `make migrate-prod`, which takes a full `make backup` first and stops if
   it fails. Each ends with `supabase migration list`; ask for that output.
   If either refuses (empty history, an out-of-order file), stop and read
   the reason with the maintainer — never work around it. You never run
   `make migrate*` yourself; settings deny it.
4. **Record it.** Tick the PR's *Before merging* lines with the
   `migration list` output the maintainer gave you. There is no ledger to
   update: the projects' history is the record (decision 2).
5. **Merge** once the maintainer says go: they press the button, or
   `gh pr merge N --squash` with their yes. The issue closes and the board
   moves it to Done.
6. **After.** Give the smoke checks from `DEPLOYMENT.md` section 8 that this
   change touches (the morning email has a `?dry=1`). Anything that fails
   becomes a new issue.
