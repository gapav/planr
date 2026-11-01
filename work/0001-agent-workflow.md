---
id: 0001
title: Agent workflow — deployment facts, ledger, rules, skills, reviewers
status: review
created: 2026-11-01
depends-on: []
decisions: []
migrations: []
---

## Why

Agents had to ask where Grep runs and which migrations are applied, the hard
rules were prose only (and the Supabase CLI is linked to production), and
`CLAUDE.md` and the v1 plan had drifted apart from the code and each other.
The same setup as Spenst's work item 0002.

## Scope

In: “Where Grep runs” and the migration ledger in `DEPLOYMENT.md`;
`.claude/settings.json` (allow, ask and deny rules, the migration hook);
`.claude/rules/` (Supabase conventions, plus the auth, session lifecycle,
morning email and print sections moved out of `CLAUDE.md`); the `spec`,
`ship` and `release` skills; the `spec-reviewer` and `db-reviewer` agents;
`IMPLEMENTATION_PLAN.md` archived as `docs/v1-plan.md`; `docs/decisions.md`;
`work/`. Two stale lines fixed: `CLAUDE.md` said `DEPLOYMENT.md` predates
magic links (it doesn't), and `site/README.md` called the library public.

Out: any code change; back-filling old decisions; a Stop hook.

## Done when

- [x] The ledger lists all 42 migrations, `applied` in dev and prod — as
      confirmed by the maintainer on 2026-11-01.
- [x] The hook refuses an edit to an `applied` migration and lets a new file
      through — piped test inputs: the real ledger refused `202609020001` and
      `202610140001` (exit 2) and passed a new file; a scratch ledger passed
      `pending`, asked for `unknown` and for a file missing from it.
- [ ] In a Grep session, reading `site/.env.local` is denied, `supabase db
      push` is denied, and `git push` asks.
- [ ] In a Grep session, `/spec` and the two agents are loaded; `/ship` and
      `/release` are in the `/` menu.
- [x] `CLAUDE.md` is shorter and nothing was lost — 22,356 → 14,703
      characters; the four moved sections are verbatim in `.claude/rules/`
      (checked against `HEAD`), and every rule's `paths:` glob matches files.
- [x] Tests pass (no code changed) — 774 passed, 1 skipped
      (`lib/__preview.test.ts`, which skips without its environment
      variables).

## Manual steps

- [ ] Open Claude Code in `~/code/plannr` once and check the two open lines
      above.
- [ ] Commit (`0001: agent workflow — …`) and push. A push deploys
      production, but nothing the build reads has changed (under `site/`,
      only `README.md` and `AGENTS.md`).

## Log

- 2026-11-01 built from a Spenst session. The settings can only be tried in
  a session started in this repository.
