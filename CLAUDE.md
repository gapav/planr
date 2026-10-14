# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

All application code lives in `site/`. The repo root holds the docs — `IMPLEMENTATION_PLAN.md` (the product/architecture/acceptance checklist for the v1 build), `DISASTER_RECOVERY.md`, `DEPLOYMENT.md` — and the `Makefile` plus `scripts/*.sh` behind backup and restore. `DEPLOYMENT.md` predates magic-link sign-in and still describes password-only auth with no email at all; where it disagrees with this file or the code, it is the one that is out of date. The stray root `app/` directory (nothing but a `.DS_Store`) is untracked — ignore it.

`site/AGENTS.md` (aliased by `site/CLAUDE.md`) holds the detailed working rules and is auto-loaded when editing files there. Its non-negotiables are repeated below because they are easy to violate.

## Commands

Run everything from `site/` with `npm`:

```bash
npm run dev            # next dev
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
- **Never apply `prod_bootstrap.sql` when restoring from a backup.** It contains
  one-time cleanup migrations that delete rows — `202609020028` drops every
  unaccepted invitation, `202609020029` drops never-signed-in auth users. The
  bootstrap is for standing up an *empty* project, nothing else.

Never put a database password on a command line or in a file; the scripts prompt
for it and pass it through the environment.

## Hard rules

- **Never mutate a database.** No `supabase db push/reset/start`, no applying migrations. The user applies SQL manually in the Supabase dashboard. Make schema changes only by adding/editing files in `site/supabase/migrations/`, and never claim a migration has been applied. Treat already-shipped migrations as immutable — add a forward migration instead, regenerate the bootstrap (above), and tell the user exactly which file to run and in what order.
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

**Passwordless and invitation-only.** `/sign-in` sends a magic link (`requestMagicLink` → `signInWithOtp` with `shouldCreateUser: false`), so nobody can sign themselves up, and an unknown address gets the same confirmation as a known one. Password sign-in is offered only on localhost. A coach may still set a password («Bytt passord» in the account menu opens `/account/password`), but nothing requires one and there is no password reset: a coach who cannot get in asks for a new link, so there is nothing to recover. `/auth/confirm` accordingly accepts no `recovery` links. `profiles.must_set_password` has been inert since `202609020027` (default false, its trigger dropped); nothing diverts on it, though `/account/password` still reads it. `internalPath` keeps every `next` same-origin.

**Onboarding is driven from the app, not from the Supabase dashboard.** A global admin invites from `/admin` (`adminInviteMember`, and `createTeam` for a team's first administrator). A team admin may invite *coaches* to their own team from `/team` (`TeamInvitationsCard`, which calls the same `adminInviteMember`). Either way the seat is reserved through RLS first, then `app/api/admin/auth-link/route.ts` is called. That route verifies the caller's access token, checks `is_global_admin` or team-admin membership under their own RLS, refuses unless an unaccepted, unexpired invitation for that address and team already exists, and only then uses `SUPABASE_SECRET_KEY` to call `auth.admin.generateLink`. It builds the link itself from the returned `hashed_token` and sends it through the Resend HTTP API — so **no Supabase SMTP, email template or redirect allow-list entry is involved**, and the secret key never leaves the server. `generateLink` falls back from `invite` to `magiclink` when the address already has an account.

**A team admin is never handed the link for an account that already existed.** That fallback link signs in as its owner, and a team admin can reserve a seat for any address — the global admin's included. Such a coach is mailed when a mailer is configured; otherwise the route answers without a link, and the coach signs in as usual and the provider claims the seat for them. Only a global admin may receive an existing account's link, and only they may use the `login` intent. `route.test.ts` pins this.

The route serves two intents, `invite` and `login`, and nothing else — a coach who cannot get in requests a magic link on `/sign-in`, or a global admin sends a fresh `login` link from `/admin`.

Resend is optional, and a send that does not happen is not an error: minting the link is the route's job, delivering it a convenience on top. When `RESEND_API_KEY`/`RESEND_FROM` are unset, or the send fails, the route still answers 200 with `{ link, emailed: false, emailError }` (minus `link` under the team-admin rule above), and the console offers the link for the administrator to pass on by hand. A non-2xx means the link itself could not be made — so the client reads `emailed` from the payload rather than inferring it from the status. That fallback is the primary path until a sending domain is verified in Resend. It hands over the *auth* link, which signs the coach in and lands on the seat in one step; the card falls back to `/invite/<token>` only when there is none, which works only for someone who can already sign in.

Both kinds of link land on `app/auth/confirm/page.tsx`, which calls `verifyOtp` on the token hash — and only after a real click, because mail scanners open links and must not spend a one-time login. The page exists because `createBrowserClient` pins `flowType: "pkce"` *after* spreading its options — it cannot be overridden — while a dashboard-style link comes back through `/auth/v1/verify` as an implicit `#access_token=…` fragment, which auth-js rejects as "Not a valid PKCE flow url." and the coach silently lands signed out. `verifyOtp` needs no grant flow. The page waits for the provider's `user` to match the verified id before navigating, because `/account/password` answers a null user by bouncing to sign-in and spending the link for nothing. The auth-link route builds its URL itself (`confirmLinkUrl`); the magic links `/sign-in` asks for are mailed by Supabase, so their template must use the same token-hash form — it lives in `supabase/templates/magic-link.html` and is pushed to production through `supabase/config.toml`. Those need custom SMTP, since Supabase's built-in sender only delivers to project members: production has it, the development project does not.

The `/invite/<token>` link is a fallback, not the path. `invitations_read` lets a coach select the invitation addressed to their own email including its token, so the provider claims anything waiting for that address once the workspace loads (`claimableInvitations` in `lib/auth.ts`). Membership writes — adding, changing a role, removing — have been global-admin-only since `202609020021`; `202609020027` gave team admins back the invitations alone: reserving *coach* seats on their own team, and revoking any invitation there still pending. So `/team` is the roster, logo, coach list and, for a team admin, coach invitations; roles and removals live in `/admin`.

**The browser client is the only writer of the auth cookie.** `proxy.ts` is a pass-through: nothing server-side reads the session (`lib/supabase/server.ts` has no callers, there are no server actions), so refreshing there only added a second racer for one rotating refresh token — concurrent RSC/prefetch proxy runs lose the race, and @supabase/ssr answers a rejected refresh by clearing the auth cookies, silently signing out a healthy browser. Do not reintroduce a server-side refresh without deciding who the single writer is. Browser client: `lib/supabase/client.ts`; server: `lib/supabase/server.ts`.

### Security model lives in Postgres, not in the app

There is essentially no API layer. The browser talks to PostgREST directly, so **RLS policies and grants are the authorization boundary**. The exceptions are the routes holding `SUPABASE_SECRET_KEY`: `app/api/admin/auth-link/route.ts` (see *Auth* above), which exists only because creating an `auth.users` row is an admin operation RLS cannot express, `app/api/admin/accounts/route.ts`, which deletes one, and `app/api/cron/daily-session-digest/route.ts`, which runs with no signed-in user at all. `app/api/support/route.ts` (the help button in the sidebar footer and account menu) reads `RESEND_*` but no secret key: it verifies the caller's token, takes name, address and teams from their own RLS, and mails `GREP_SUPPORT_TO` (default the owner) with the coach as Reply-To — the body carries only the message and page, never a sender or recipient. `app/api/interest/route.ts` is the public form on `/velkommen`: no account, no Supabase key, it can only mail `GREP_INTEREST_TO` (default the owner), and it is rate-limited per process. `app/api/media/thumbnail/route.ts` is the Vimeo proxy (see *Media*). `supabase/migrations/202609020001_initial.sql` revokes all table access and re-grants narrowly, and defines the `is_team_member` / `is_team_admin` / `can_access_session` / `can_access_block` / `is_global_admin` helpers that every policy is built from. Since `202609020031` nothing is readable by `anon` — the exercise library included. A global admin can read every team's sessions, blocks and items (`202609250001`) but write none of them; the provider keeps those plans in `adminSessions`, away from the coach screens.

Anything needing a transaction or a check the client must not be able to skip is a `security definer` RPC with `search_path` pinned, `revoke`d from `anon` and granted to `authenticated`: `create_team`, `accept_team_invitation`, `publish_session`, `start_session`, `start_session_without_setup`, `undo_session_start`, `finish_session`, `reopen_session`, `copy_session`, `reorder_session_blocks`, `reorder_block_items`, `reorder_warmup_items`, and the console's `admin_list_teams` / `admin_list_accounts` / `admin_set_display_name`, which re-check `is_global_admin()` themselves. Reordering in particular is an RPC so positions stay consistent — do not reimplement it as client-side row updates.

### Realtime collaboration

DB triggers (`broadcast_session_change`) push every session/block/item write to a **private** Realtime topic `session:<sessionId>`; `realtime.messages` policies gate that topic through `can_access_session_topic`. `hooks/use-session-realtime.ts` calls `supabase.realtime.setAuth(...)`, subscribes with `private: true`, tracks Presence keyed by user id (surfacing which block each collaborator is on), and responds to *any* broadcast by calling `reloadSession` — broadcast payloads are a change signal, not a diff to apply.

### Session lifecycle

`draft → published → in_progress → completed`. The ways back are `undo_session_start` (in progress → published) and `reopen_session` (completed → published, keeping attendance and groups); `copy_session` starts a new draft from a plan in any state, leaving attendance and groups behind. The UI's Drafts/Upcoming/Past tabs are derived, not stored — see `deriveSessionTab` in `lib/session.ts` (in progress is always upcoming, completed always past, and a published plan is past once `startsAt + plannedDurationMinutes` has gone by). `validatePublish` gates publishing client-side, and `publish_session` plus `validate_session_publish_transition` re-check it in the DB — so the client can be overruled, which is why `publishSession` rolls back. Once `start_session` (or `start_session_without_setup`) succeeds, `prevent_in_progress_session_changes` locks the plan's rows, and keeps a completed plan locked too; each transition RPC lifts the lock for its own session for one transaction through `plannr.unlocked_session`. `start_session` itself re-validates that the saved groups still exactly match the present players. Dates are stored in UTC.

Session items (and warm-up routine items) **copy** the exercise's display data (title, description, media, thumbnail) at insert time, but the library wins on screen: `resolveSessionDisplay` / `resolveWarmupRoutineDisplay` in `lib/exercises.ts` overlay the current exercise as the provider hands `sessions` and `warmupRoutines` to consumers. Nothing is rewritten in the database, so the stored copy is the fallback once an exercise is archived or deleted, and an `in_progress` session stays locked. `durationMinutes` and `coachingNotes` belong to the plan; the title of a linked item is therefore read-only in the builder and the warm-up dialog.

### The morning session email

The one scheduled job: `app/api/cron/daily-session-digest/route.ts`, called by
Vercel Cron (`site/vercel.json`, `0 5 * * *`) and authenticated by `CRON_SECRET`
rather than by a user token — that early nobody is signed in, which is why it reads
with `SUPABASE_SECRET_KEY` like the auth-link route. Vercel schedules in UTC, so
the mail goes out at 07:00 Oslo time in summer and 06:00 in winter; "today" is
still worked out in `Europe/Oslo` (`clubDay`), so only the hour moves. It mails every coach on a
team training that day the whole plan. The rules live in `lib/session-digest.ts`
and the letter in `lib/session-email.ts`, both pure and tested; the route only
wires them together. `lib/email-shell.ts` is the envelope both it and
`lib/auth-email.ts` render into.

Three invariants: **drafts never mail** (the status filter is the only thing
preventing a letter about a session `start_session` would refuse), **nor does a
plan that is mostly empty** — `digestSessionsForDay` needs
`sessionPlanProgress` (the calendar's bar) at `DIGEST_MIN_PLAN_PROGRESS` (80 %)
or more, since publishing only requires one block — and **sending
is idempotent** — the job claims each (session, coach) pair in
`session_email_log` (migration `202609020033`) before sending and only mails the
claims the database granted, giving a claim back when a send fails. A run with
no Resend key claims nothing, so it stays a dry run. `?dry=1` reports recipients
without claiming. `profiles.session_digest_email` is the per-coach opt-out,
toggled from `/team`.

### Media

`lib/media.ts` parses image / YouTube / Vimeo / direct-video URLs and derives thumbnails client-side. Vimeo is the exception: it needs `app/api/media/thumbnail/route.ts`, which proxies oEmbed and validates that the returned host is `*.vimeocdn.com`.

### Styling

Tailwind v4 (`@import "tailwindcss"` in `app/globals.css`) with the palette as CSS custom properties on `:root` (`--ink`, `--paper`, `--accent`, …). Classes are composed with `cn()` (clsx + tailwind-merge) from `lib/utils.ts`. Shared primitives are in `components/ui.tsx`; the app honors `prefers-reduced-motion`.

**Light and dark.** `<html data-theme>` always holds the *resolved* theme (`light`/`dark`, never `system`), set before first paint by the inline `themeScript` in the root layout and afterwards by `saveThemePreference` (`lib/theme.ts`). The choice is per device (localStorage `grep-theme`), not per account; the switch sits in the sidebar footer and under *For deg* on /team. `globals.css` has exactly one dark block, `@media screen { :root[data-theme="dark"] }`, which redefines tokens and nothing else — `screen` so printing stays light. Rules that follow from it:

- **Never write a colour in a component.** No `[#hex]`, `bg-white`, `text-white`, `bg-red-50`: use a token (`--surface-raised`, `--on-accent`, `--danger-bg`, …). `lib/theme-tokens.test.ts` fails on literals; only `bg-black` (video letterbox) and white/black *with an opacity* (overlays on photos and on `--chrome`) are allowed. A new colour is a new token on `:root` **and** in the dark block — the same test checks that and runs contrast on the key pairs in both themes.
- **Pair fills with their label token.** `--ink` flips, so text on an ink fill is `--paper`, not white. Fills that are bright in both themes (apricot, lime) take `--on-bright`; `--accent-fill` takes `--on-accent`. Bands meant to stay dark in both themes (live-session header, Tidskontroll, sign-in hero) use `--chrome`/`--on-chrome`.
- `--accent` is the purple as text/borders/rings; `--accent-fill` is the purple under a white label. They differ in dark.
- Colours that stay hex on purpose: team accents in `lib/team-palette.ts` (stored by the importer; their tints are `--team-*-tint` variables), coach avatar colours (`readableInk` measures them), and the emails (`lib/email-shell.ts`, `lib/session-email.ts`), which are always light.

The `@media print` block at the foot of `globals.css` is how a plan reaches
someone with no account — «Skriv ut» in the session menu is just `window.print()`
on `/sessions/<id>`. It works off `data-print` attributes in `session-view.tsx`
rather than the utility classes, so the two move together: `hide` drops chrome,
`item` keeps an activity whole across a page break, `block-head` stops a heading
being orphaned, and `cue` gives the Stikkord box a border, because browsers only
print backgrounds if the reader asks for them.

## Tests

Vitest + jsdom + Testing Library, `globals: true`, `@/*` aliased to `site/`. Tests sit beside their modules as `*.test.ts(x)`. Most cover the pure logic in `lib/`, which is where rules worth testing should live — pull them out of the provider rather than test through it (there is no provider test; `planRosterImport` is the pattern). Most screens have a component test too (`components/*.test.tsx`, `app/**/page.test.tsx`), with `useGrep` mocked via `vi.mock("./app-provider")`. The API routes have route tests (`app/api/**/route.test.ts`) that run in the node environment (`// @vitest-environment node`) with `@supabase/supabase-js` mocked. New behavior in `lib/` should come with a focused test; scale wider verification (`lint`, `build`) to the risk of the change, and report any check you did not run.
