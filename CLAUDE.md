# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

All application code lives in `site/`. At the root:

- `DEPLOYMENT.md` — **where Grep runs** (production, development, previews),
  the launch runbook, and **applying migrations** (`make migrate-*`; what is
  applied where is each project's own `supabase migration list`).
- `DISASTER_RECOVERY.md`, the `Makefile` and `scripts/*.sh` — backup,
  restore, and `make migrate-dev` / `migrate-prod` / `migrate-baseline`.
- `docs/` — `decisions.md` (numbered, append-only, from November 2026) and
  `v1-plan.md` (the v1 checklist, archived).
- `.github/` — CI (lint, test, build on every PR), the Claude agent
  workflow, and the issue and PR templates.
- `.claude/rules/` — notes for one area each, loaded when you open its files.

Work is tracked as **GitHub issues on the project board** (Backlog → Ready →
In progress → In review → Done), not in files (decision 1). `/spec` writes an
issue; labelling it `agent` has Claude build it in Actions and open a PR
(`@claude` in a comment asks for changes); `/ship` turns a locally built
change into a PR; `/release` takes a PR to production. **Merging a PR deploys
production**, so every migration it carries is applied before the merge —
the maintainer runs `make migrate-dev`, then `make migrate-prod` (which backs
up first) — and the PR's *Before merging* list says which files.

The stray root `app/` directory (nothing but a `.DS_Store`) is untracked — ignore it.

`site/AGENTS.md` (aliased by `site/CLAUDE.md`) holds the detailed working rules and is auto-loaded when editing files there. Its non-negotiables are repeated below because they are easy to violate.

Spenst (`~/code/spenst`) copies Grep's visual layer — tokens, shell, UI
primitives — as code and shares nothing else. Nothing here depends on it.

## Commands

Run everything from `site/` with `npm`:

```bash
npm run dev            # next dev, pinned to port 3000: the dev project's sign-in redirects expect it
npm run build          # next build --webpack (Webpack is deliberate; keeps builds working in constrained envs)
npm run lint           # eslint (flat config)
npm test               # vitest run
npm run test:watch
npx vitest run lib/session.test.ts          # single file
npx vitest run -t "derives upcoming and past"  # single test by name
npm run db:bootstrap   # regenerate supabase/prod_bootstrap.sql (`make bootstrap` at the root does this and checks it)
```

After adding or editing a migration, run `npm run db:bootstrap`:
`scripts/build-bootstrap.test.ts` fails the suite when the checked-in
`prod_bootstrap.sql` has drifted from `supabase/migrations/`.

Running the app against `planr-dev`, signing in on localhost, and trying the
server routes: the `run-locally` skill.

`supabase test db` runs the pgTAP RLS suite but needs a disposable local Supabase CLI instance — only run it when the user explicitly asks and confirms.

## Disaster recovery

Supabase Free takes no backups. `make backup` / `make restore` (repo root,
`scripts/*.sh`) are the whole safety net; `make doctor` checks the machine can
run them. Full runbook in `DISASTER_RECOVERY.md`.

Three facts that are easy to get wrong and expensive to discover late:

- `supabase db dump` needs **Docker** and **excludes the `auth` schema**, and
  `pg_dump` cannot see **Storage blobs** at all. A backup missing `auth.users`
  restores a schema nobody can sign into. `make backup` covers all three.
- The direct host `db.<ref>.supabase.co` is **IPv6-only**. Use the Session
  pooler (port 5432); the transaction pooler (6543) cannot run `pg_dump`.
- **A restore ends with `make migrate-baseline`.** Backups leave out
  `supabase_migrations`, so a restored project looks un-migrated; `migrate-*`
  refuses to push into it until the baseline has run (decision 3).
- **Never apply `prod_bootstrap.sql` when restoring from a backup.** It contains
  one-time cleanup migrations that delete rows — `202609020028` drops every
  unaccepted invitation, `202609020029` drops never-signed-in auth users. The
  bootstrap is for standing up an *empty* project, nothing else.

Never put a database password on a command line or in a file; the scripts prompt
for it and pass it through the environment.

## Hard rules

- **Never mutate a database.** No `supabase db push/reset/start`, no `supabase migration …`, no `make migrate*`, no applying migrations — settings deny them all. The maintainer applies migrations with `make migrate-dev`, then `make migrate-prod` (decision 2). Make schema changes only by adding/editing files in `site/supabase/migrations/`, and never claim a migration has been applied. Treat shipped migrations as immutable — anything on `origin/main` is applied in production, and a hook refuses the edit (it asks for one committed only on your branch, which `/release` may already have applied) — add a forward migration instead, regenerate the bootstrap (above), and tell the user exactly which files are new and in what order. The Supabase CLI in `site/` is linked to **production** (`grep-prod`), so any `supabase db …` command would act on real data.
- **A push to `main` deploys production** (Vercel's production branch). Commit and push only when told.
- **This is Next.js 16**, not the version in your training data. `middleware.ts` is now `proxy.ts` (exporting `proxy`), and page props use the generated `LayoutProps<"/">` / `PageProps` types. Read the relevant guide under `site/node_modules/next/dist/docs/` before changing framework code.
- **Player data is privacy-minimized by design.** Imports keep only `"Firstname L."` plus jersey number — enforced both in `lib/roster.ts` (`minimizePlayerName`) and by a DB trigger (`202609020004`). Do not widen this without an explicit instruction.
- Keep secrets out of `NEXT_PUBLIC_*`. Only the site URL, Supabase URL and publishable key are public. `SUPABASE_SECRET_KEY` is read by exactly three routes — `app/api/admin/auth-link`, `app/api/admin/accounts` and `app/api/cron/daily-session-digest` — each for something RLS cannot express (see *Security model*). `RESEND_API_KEY`/`RESEND_FROM` are read by the routes that send mail: auth-link, the cron, `app/api/support` and `app/api/interest`. `CRON_SECRET` is read only by the cron. Do not read the secret key anywhere else, and do not add another privileged route without a reason that survives the "why can't RLS do this?" question.
- Update `supabase/tests/rls.test.sql` whenever grants, policies, roles, or data-access behavior change.

## Architecture

### One client-side data layer

`components/app-provider.tsx` is the whole application state and data layer: auth, teams, exercises, sessions, invitations, players, attendance, groupings, plus every mutation. Pages are thin and consume it through `useGrep()`. There are no server actions and almost no server components — the App Router routes are shells around client components.

Consequences to respect when adding features:
- Snake_case DB rows are mapped to camelCase domain types by the `map*` functions at the top of the provider; `lib/types.ts` is the single source of domain shapes.
- Most mutations follow the same shape: **optimistic local `setState` → `persist(() => supabase…)`**. `persist` drives `saveState` (`saved`/`saving`/`offline`/`error`), surfaces `notice`, and throws on failure. A new mutation should roll its optimistic state back when `persist` throws (see `addExercise`, `publishSession`): a refusal left on screen reads as saved. Several older fine-grained edits (`updateItem`, `deleteBlock`, …) still don't. The exceptions apply state only once the server has answered: the lifecycle RPCs (`startWorkout`, `finishWorkout`, `undoWorkoutStart`, `reopenSession`), `copySession`, and the two imports (`importPlayers`, `importFixtures`).
- `loadPrivateData` refetches *everything* for the signed-in user in one parallel batch. Realtime and post-RPC refreshes reuse it rather than doing targeted merges.

### Demo mode

If `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are absent, `isSupabaseConfigured` is false: the Supabase client factories return `null`, the provider seeds itself from `lib/demo-data.ts`, and `persist(null)` is a no-op. Every new mutation must handle the `supabase === null` branch or preview mode breaks. Demo data is non-persistent; Supabase is the production source of truth.

### Auth

Passwordless and invitation-only: `/sign-in` sends a magic link with
`shouldCreateUser: false`, and an account only comes into being from an
invitation, minted by `app/api/admin/auth-link/route.ts` once the seat is
reserved through RLS. The browser client (`lib/supabase/client.ts`) is the
only writer of the auth cookie — `proxy.ts` is a pass-through on purpose.
The full account, including why a team admin is never handed an existing
account's link, is in `.claude/rules/auth.md`.

### Security model lives in Postgres, not in the app

There is essentially no API layer. The browser talks to PostgREST directly, so **RLS policies and grants are the authorization boundary**. The exceptions are the routes holding `SUPABASE_SECRET_KEY`: `app/api/admin/auth-link/route.ts` (see *Auth* above), which exists only because creating an `auth.users` row is an admin operation RLS cannot express, `app/api/admin/accounts/route.ts`, which deletes one, and `app/api/cron/daily-session-digest/route.ts`, which runs with no signed-in user at all. `app/api/support/route.ts` (the help button in the sidebar footer and account menu) reads `RESEND_*` but no secret key: it verifies the caller's token, takes name, address and teams from their own RLS, and mails `GREP_SUPPORT_TO` (default the owner) with the coach as Reply-To — the body carries only the message and page, never a sender or recipient. `app/api/interest/route.ts` is the public form on `/velkommen`: no account, no Supabase key, it can only mail `GREP_INTEREST_TO` (default the owner), and it is rate-limited per process. `app/api/media/thumbnail/route.ts` is the Vimeo proxy (see *Media*). `supabase/migrations/202609020001_initial.sql` revokes all table access and re-grants narrowly, and defines the `is_team_member` / `is_team_admin` / `can_access_session` / `can_access_block` / `is_global_admin` helpers that every policy is built from. Since `202609020031` nothing is readable by `anon` — the exercise library included. A global admin can read every team's sessions, blocks and items (`202609250001`) but write none of them; the provider keeps those plans in `adminSessions`, away from the coach screens.

Anything needing a transaction or a check the client must not be able to skip is a `security definer` RPC with `search_path` pinned, `revoke`d from `anon` and granted to `authenticated`: `create_team`, `accept_team_invitation`, `publish_session`, `start_session`, `start_session_without_setup`, `undo_session_start`, `finish_session`, `reopen_session`, `copy_session`, `reorder_session_blocks`, `reorder_block_items`, `reorder_warmup_items`, and the console's `admin_list_teams` / `admin_list_accounts` / `admin_set_display_name`, which re-check `is_global_admin()` themselves. Reordering in particular is an RPC so positions stay consistent — do not reimplement it as client-side row updates.

### Realtime collaboration

DB triggers (`broadcast_session_change`) push every session/block/item write to a **private** Realtime topic `session:<sessionId>`; `realtime.messages` policies gate that topic through `can_access_session_topic`. `hooks/use-session-realtime.ts` calls `supabase.realtime.setAuth(...)`, subscribes with `private: true`, tracks Presence keyed by user id (surfacing which block each collaborator is on), and responds to *any* broadcast by calling `reloadSession` — broadcast payloads are a change signal, not a diff to apply.

### Session lifecycle

`draft → published → in_progress → completed`, with the ways back
(`undo_session_start`, `reopen_session`) and `copy_session` as RPCs. Once a
workout starts, `prevent_in_progress_session_changes` locks the plan. The
Drafts/Upcoming/Past tabs are derived, not stored (`deriveSessionTab`), and
items copy the exercise's display data while the library wins on screen.
Details in `.claude/rules/sessions.md`.

### The morning session email

One Vercel cron job, `app/api/cron/daily-session-digest`, authenticated by
`CRON_SECRET` and reading with `SUPABASE_SECRET_KEY`. Drafts never mail, nor
does a plan less than 80 % built, and sending is idempotent. Details in
`.claude/rules/morning-email.md`.

### Exercise topics

Six topics (`EXERCISE_CATEGORIES`, `exercises.category`), each with a fixed list
of subtopics (`EXERCISE_SUBTOPICS` in `lib/types.ts`, `exercises.subtopics`).
The list is written twice — in `lib/types.ts` and in the
`exercises_subtopics_check` constraint — so a change to it is a migration
plus that edit, and `lib/exercise-subtopics.test.ts` fails if the two differ.
An untagged exercise sits under its topic, never under a subtopic; the
filter rules are in `lib/exercises.ts` (`matchesTopics`). Decision 4.

### Media

`lib/media.ts` parses image / YouTube / Vimeo / direct-video URLs and derives thumbnails client-side. Vimeo is the exception: it needs `app/api/media/thumbnail/route.ts`, which proxies oEmbed and validates that the returned host is `*.vimeocdn.com`.

### Styling

Tailwind v4 (`@import "tailwindcss"` in `app/globals.css`) with the palette as CSS custom properties on `:root` (`--ink`, `--paper`, `--accent`, …). Classes are composed with `cn()` (clsx + tailwind-merge) from `lib/utils.ts`. Shared primitives are in `components/ui.tsx`; the app honors `prefers-reduced-motion`.

**Light and dark.** `<html data-theme>` always holds the *resolved* theme (`light`/`dark`, never `system`), set before first paint by the inline `themeScript` in the root layout and afterwards by `saveThemePreference` (`lib/theme.ts`). The choice is per device (localStorage `grep-theme`), not per account; the switch sits in the sidebar footer and under *For deg* on /team. `globals.css` has exactly one dark block, `@media screen { :root[data-theme="dark"] }`, which redefines tokens and nothing else — `screen` so printing stays light. Rules that follow from it:

- **Never write a colour in a component.** No `[#hex]`, `bg-white`, `text-white`, `bg-red-50`: use a token (`--surface-raised`, `--on-accent`, `--danger-bg`, …). `lib/theme-tokens.test.ts` fails on literals; only `bg-black` (video letterbox) and white/black *with an opacity* (overlays on photos and on `--chrome`) are allowed. A new colour is a new token on `:root` **and** in the dark block — the same test checks that and runs contrast on the key pairs in both themes.
- **Pair fills with their label token.** `--ink` flips, so text on an ink fill is `--paper`, not white. Fills that are bright in both themes (apricot, lime) take `--on-bright`; `--accent-fill` takes `--on-accent`. Bands meant to stay dark in both themes (live-session header, Tidskontroll, sign-in hero) use `--chrome`/`--on-chrome`.
- `--accent` is the purple as text/borders/rings; `--accent-fill` is the purple under a white label. They differ in dark.
- Colours that stay hex on purpose: team accents in `lib/team-palette.ts` (stored by the importer; their tints are `--team-*-tint` variables), coach avatar colours (`readableInk` measures them), and the emails (`lib/email-shell.ts`, `lib/session-email.ts`), which are always light.

Printing a plan («Skriv ut») is the `@media print` block at the foot of
`globals.css` with `data-print` attributes in `session-view.tsx` — see
`.claude/rules/print.md`.

## Tests

Vitest + jsdom + Testing Library, `globals: true`, `@/*` aliased to `site/`. Tests sit beside their modules as `*.test.ts(x)`. Most cover the pure logic in `lib/`, which is where rules worth testing should live — pull them out of the provider rather than test through it (there is no provider test; `planRosterImport` is the pattern). Most screens have a component test too (`components/*.test.tsx`, `app/**/page.test.tsx`), with `useGrep` mocked via `vi.mock("./app-provider")`. The API routes have route tests (`app/api/**/route.test.ts`) that run in the node environment (`// @vitest-environment node`) with `@supabase/supabase-js` mocked. New behavior in `lib/` should come with a focused test; scale wider verification (`lint`, `build`) to the risk of the change, and report any check you did not run.
