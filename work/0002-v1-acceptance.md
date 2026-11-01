---
id: 0002
title: Close v1's last two acceptance checks
status: ready
created: 2026-11-01
depends-on: []
decisions: []
migrations: []
---

## Why

Two acceptance lines in the v1 plan (`docs/v1-plan.md`) were never ticked,
and only a person can settle them. Moved here when the plan was archived.

## Scope

In: running the pgTAP suite against the current schema; the two-browser
collaboration check.

Out: new assertions (a failure becomes its own item).

## Done when

- [ ] `supabase test db` passes on a disposable local instance — the result
      line, with `plan(244)` or whatever the file says by then.
- [ ] Two browsers, two accounts on the same team, both on
      `/sessions/<id>/edit`, pass all four steps below.

## Manual steps

- [ ] The pgTAP suite. It mutates a database, so never against production
      and never unattended: `cd site && supabase start && supabase test db`.
      If it fails on a count, `select plan(N)` at the top is the number of
      assertions in the file.
- [ ] Two-client collaboration (a second profile in the dashboard, or a
      private window signed in as another coach):
      1. Type in a block title in one — the other shows it without a reload.
      2. Drag a block, then an activity, in one — the order and the totals
         follow in the other.
      3. Watch the avatars: each coach surfaces on the block they are
         editing.
      4. Kill the wifi on one for ten seconds. It shows «Kobler til på nytt …»,
         and on reconnect it catches up rather than overwriting what the
         other one did.

## Log

- 2026-11-01 moved from the v1 plan's acceptance checklist.
