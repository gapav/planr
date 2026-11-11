# Work

One file per change: `NNNN-short-name.md`, numbered in order and never
renumbered. Ideas that nobody has specced yet are one line each in
`backlog.md`; `/spec` turns one into a file. `/ship` finishes one, and
`/release` takes finished work to production.

## Status

| Status | Means |
|---|---|
| `spec` | Written down, not yet agreed |
| `ready` | Agreed; can be built |
| `doing` | Being built |
| `review` | Built and checked; waiting on manual steps, the maintainer's look, or a release |
| `done` | Every “Done when” line and manual step is ticked, and it is in production |
| `dropped` | Not doing it — the log says why |

## Rules

- **“Done when” lines are checkable**: a test, a command, a screenshot, a page
  to open. `/ship` ticks them with the evidence.
- **Manual steps** hold everything only the maintainer can do: apply a
  migration (to `planr-dev`, then `grep-prod`), change a Supabase or Vercel
  setting, set an environment variable, run a backup. An item stays in
  `review` until they are ticked.
- **Decisions** made along the way go to `docs/decisions.md` with the next
  number, and the item cites them by number.
- **Commits start with the id**: `0012: show the focus on the calendar`. A
  push to `main` deploys production, so finished work is pushed by
  `/release`, not along the way.
- **A done item is closed.** Follow-ups are new items, not edits to old ones.
- **GitHub issues are the other way in.** An issue labelled `agent` is built
  by Claude in Actions (`.github/workflows/claude.yml`): it writes the item
  here with `issue: N` in the front matter, builds it on an `agent/NNNN-…`
  branch, and opens a PR that closes the issue. The item arrives in `review`;
  `/release` takes it from there as usual.

## Template

```markdown
---
id: NNNN
title: Short title
status: spec
created: YYYY-MM-DD
depends-on: []
decisions: []
migrations: []
---

## Why

What problem this solves, for whom.

## Scope

In: …

Out: …

## Done when

- [ ] …

## Manual steps

- [ ] …

## Notes and open questions

## Log

- YYYY-MM-DD spec written
```
