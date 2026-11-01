---
name: ship
description: Finish a work item — run lint, tests and build, have the change reviewed against the item's “Done when” (and any migration by db-reviewer), tick what is proven, update the item's status and log and the migration ledger, list the manual steps left, and propose a commit. Commits only when told to; never pushes.
argument-hint: "[work item id]"
disable-model-invocation: true
allowed-tools: Bash(npm test) Bash(npm run lint) Bash(npm run build) Bash(npm run db:bootstrap) Bash(npx vitest run *) Bash(git status *) Bash(git diff *) Bash(git log *)
---

# Ship a work item

1. **Find the item**: `work/$ARGUMENTS-*.md`, or else the one with status
   `doing`. If there is none, say so and ship the diff without an item only if
   the maintainer agrees.
2. **See the change**: `git status` and `git diff` (untracked files too).
3. **If anything under `site/supabase/migrations/` changed**, run
   `npm run db:bootstrap` from `site/` first, and check
   `supabase/tests/rls.test.sql` covers any change to grants, policies, roles
   or data access, with `select plan(N)` bumped.
4. **Run the checks** from `site/`: `npm run lint`, `npm test`,
   `npm run build`. Fix failures and run them again; report each with its
   result line.
5. **Review**, in parallel:
   - the `spec-reviewer` agent, given the item's path, the list of changed
     files and the diff;
   - the `db-reviewer` agent as well if anything under `site/supabase/` or
     `site/app/api/` changed.

   Fix the correctness gaps they find. For any finding you don't fix, say why.
6. **Update the item**: tick each “Done when” line that is now proven, with
   the evidence beside it (the command and its result, the test name, the
   screenshot). Add a dated log line. Status becomes `review`: an item is
   `done` only once it is in production, which is `/release`'s job. For each
   new migration, add a `pending` row (dev and prod) to the ledger in
   `DEPLOYMENT.md` and a manual step to apply it; for each new environment
   variable, a manual step to set it in Vercel.
7. **Report**: the checks and their results, what the reviewers found and
   what you fixed, the manual steps left (exact files, in order), and a
   commit message — `NNNN: summary`, then a short body.
8. **Commit only when the maintainer says so.** Stage the change's files by
   name, not `git add -A`. Don't push: a push to `main` deploys production.
