---
name: ship
description: Finish a change built locally — run lint, tests and build, have it reviewed against its issue's “Done when” (and any migration by db-reviewer), then commit on a branch and open a pull request whose body says what must happen before merging. Commits and pushes the branch only when told; never pushes main.
argument-hint: "[issue number]"
disable-model-invocation: true
allowed-tools: Bash(npm test) Bash(npm run lint) Bash(npm run build) Bash(npm run db:bootstrap) Bash(npx vitest run *) Bash(git status *) Bash(git diff *) Bash(git log *) Bash(git branch *) Bash(gh issue view *) Bash(gh pr view *)
---

# Ship a change

Changes reach production through pull requests: merging one deploys
(decision 1). The agent in Actions finishes its own work the same way; this
skill is for what was built in a local session.

1. **Find the issue**: `$ARGUMENTS`, or the number in the branch name
   (`agent/N-…`, `N-…`). Read it with `gh issue view N --comments`. If there
   is none, say so and ship the diff without one only if the maintainer
   agrees.
2. **See the change**: `git status` and `git diff` (untracked files too).
   If the work sits on `main`, it moves to a branch named `N-short-name`
   before anything is committed.
3. **If anything under `site/supabase/migrations/` changed**, run
   `npm run db:bootstrap` from `site/` first, check
   `supabase/tests/rls.test.sql` covers any change to grants, policies, roles
   or data access, with `select plan(N)` bumped, and that each new file sorts
   after every migration on `origin/main`.
4. **Run the checks** from `site/`: `npm run lint`, `npm test`,
   `npm run build`. Fix failures and run them again; report each with its
   result line.
5. **Review**, in parallel:
   - the `spec-reviewer` agent, given the issue's number and text, the list
     of changed files and the diff;
   - the `db-reviewer` agent as well if anything under `site/supabase/` or
     `site/app/api/` changed.

   Fix the correctness gaps they find. For any finding you don't fix, say why.
6. **Report**: the checks and their results, what the reviewers found and
   what you fixed, and the pull request you would open — title
   `summary (#N)`, body filled in from `.github/pull_request_template.md`,
   with every “Done when” line ticked or explained and the *Before merging*
   steps (exact migration files, in order; environment variables; settings).
7. **Only when the maintainer says so**: stage the change's files by name
   (not `git add -A`), commit `summary (#N)`, `git push -u origin <branch>`,
   and `gh pr create --base main` with that title and body. Never push `main`:
   a push there deploys production.
8. **Move the issue's card to In review**, as the agent in Actions does once
   it has opened its PR (`.github/workflows/claude.yml`). From the repo root:
   `GITHUB_REPOSITORY=gapav/planr .github/scripts/project-status.sh N "In review"`.
   It needs a `gh` login with the `project` scope; if it fails, say so and
   leave the card for the maintainer rather than retrying. Skip this step
   when the change was shipped without an issue.
