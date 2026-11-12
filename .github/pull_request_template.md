Closes #

**Version:** patch / minor / major

<!-- Keep one word (decision 7):
     patch — a fix, or nothing a coach would notice. package.json and
             site/lib/changelog.ts stay as they are; coaches are not told.
     minor — something a coach can now see or do. Bump site/package.json (and
             site/package-lock.json) to the next x.Y.0 and add an entry at the
             top of RELEASES in site/lib/changelog.ts: that version, today's
             date, and highlights drafted from the issue — short Norwegian about
             what the coach can do now. The maintainer approves the wording.
     major — as minor, to the next X.0.0. Only when the maintainer says so. -->

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
