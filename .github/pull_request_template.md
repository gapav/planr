Closes #

## What changed

## Done when

<!-- The issue's "Done when" lines. Tick what is proven and put the evidence
     beside it: the command and its result line, the test name, the screenshot.
     Say why for any line left open. -->

- [ ]

## Checks

<!-- From site/: npm run lint, npm test, npm run build — the result line of
     each. What spec-reviewer (and db-reviewer, for site/supabase/ or
     site/app/api/) found, and what was fixed. -->

## Before merging

<!-- Merging deploys production, and the database goes first. List every step
     only the maintainer can do, in order — or write "Nothing." -->

- [ ] Migration `site/supabase/migrations/…sql` (one line per file, in order)
- [ ] `make migrate-dev`, then `make migrate-prod` (backs up first) — paste the closing `supabase migration list`
- [ ] Environment variable `…` set in Vercel Production
