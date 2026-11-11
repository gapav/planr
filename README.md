# Grep

Grep is a collaborative handball session planner for coaches, built with
Next.js and Supabase. Coaches plan sessions together, run them live and keep
an exercise library; accounts are invitation-only. It runs at
https://grep.team.

The repository is called `planr` for historical reasons; the product is Grep.

## What's where

- [`site/`](site/): the app. Its own README, [`site/README.md`](site/README.md),
  covers features, local setup and Supabase configuration.
- [`DEPLOYMENT.md`](DEPLOYMENT.md): where Grep runs (production, development,
  previews), the launch runbook and the migration ledger.
- [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md): the backup and restore
  runbook.
- [`Makefile`](Makefile) and [`scripts/`](scripts/): the backup, restore and
  doctor scripts behind `make`.
- [`docs/`](docs/): [`decisions.md`](docs/decisions.md) (numbered,
  append-only) and [`v1-plan.md`](docs/v1-plan.md) (the v1 checklist,
  archived).
- [`.github/`](.github/): CI, the Claude agent workflow, and the issue and PR
  templates.
- [`.claude/`](.claude/): skills, agents and per-area rules for Claude Code.
- [`CLAUDE.md`](CLAUDE.md): the working rules for agents, and the best
  overview of the architecture.

## How work flows

Work is tracked as GitHub issues on the project board: Backlog → Ready →
In progress → In review → Done ([decision 1](docs/decisions.md)).

- `/spec` turns an idea into an issue with a scope and checkable "Done when"
  lines.
- Labelling an issue `agent` has Claude build it in Actions and open a PR;
  for work built locally, `/ship` opens the PR.
- `/release` takes a PR to production.

**Merging a PR deploys production, so a PR's migrations are applied before it
merges.** Its *Before merging* list says which. The maintainer applies
them; agents never touch a database.

## Quick start

```bash
cd site && npm install && npm run dev   # http://localhost:3000
```

Environment variables, Supabase setup and the rest:
[`site/README.md`](site/README.md).

## Backups

Supabase Free takes no backups. These are the whole safety net:

- `make doctor`: check that this machine can take and restore a backup.
- `make backup`: guided, read-only backup of a Supabase project.
- `make restore`: guided restore into a Supabase project.

Read [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md) before you need it.
