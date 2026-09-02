# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

All application code lives in `site/`. The repo root holds only `README.md` and `IMPLEMENTATION_PLAN.md` (the product/architecture/acceptance checklist for the v1 build). The stray root `app/` directory is empty and untracked — ignore it.

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
```

`supabase test db` runs the pgTAP RLS suite but needs a disposable local Supabase CLI instance — only run it when the user explicitly asks and confirms.

## Hard rules

- **Never mutate a database.** No `supabase db push/reset/start`, no applying migrations. The user applies SQL manually in the Supabase dashboard. Make schema changes only by adding/editing files in `site/supabase/migrations/`, and never claim a migration has been applied. Treat already-shipped migrations as immutable — add a forward migration instead, and tell the user exactly which file to run and in what order.
- **This is Next.js 16**, not the version in your training data. `middleware.ts` is now `proxy.ts` (exporting `proxy`), and page props use the generated `LayoutProps<"/">` / `PageProps` types. Read the relevant guide under `site/node_modules/next/dist/docs/` before changing framework code.
- **Player data is privacy-minimized by design.** Imports keep only `"Firstname L."` plus jersey number — enforced both in `lib/roster.ts` (`minimizePlayerName`) and by a DB trigger (`202609020004`). Do not widen this without an explicit instruction.
- Keep secrets out of `NEXT_PUBLIC_*`. Only the site URL, Supabase URL and publishable key are public; there is no service-role key anywhere in the app.
- Update `supabase/tests/rls.test.sql` whenever grants, policies, roles, or data-access behavior change.

## Architecture

### One client-side data layer

`components/app-provider.tsx` is the whole application state and data layer: auth, teams, exercises, sessions, invitations, players, attendance, groupings, plus every mutation. Pages are thin and consume it through `useGrep()`. There are no server actions and almost no server components — the App Router routes are shells around client components.

Consequences to respect when adding features:
- Snake_case DB rows are mapped to camelCase domain types by the `map*` functions at the top of the provider; `lib/types.ts` is the single source of domain shapes.
- All mutations follow the same shape: **optimistic local `setState` → `persist(() => supabase…)`**. `persist` drives `saveState` (`saved`/`saving`/`offline`/`error`) and surfaces `notice`. Some mutations roll the optimistic state back on failure (see `addExercise`); match the surrounding pattern.
- `loadPrivateData` refetches *everything* for the signed-in user in one parallel batch. Realtime and post-RPC refreshes reuse it rather than doing targeted merges.

### Demo mode

If `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are absent, `isSupabaseConfigured` is false: the Supabase client factories return `null`, the provider seeds itself from `lib/demo-data.ts`, and `persist(null)` is a no-op. Every new mutation must handle the `supabase === null` branch or preview mode breaks. Demo data is non-persistent; Supabase is the production source of truth.

### Auth

Passwordless magic links. `signIn` calls `signInWithOtp` with a redirect to `/auth/confirm`, which handles both the PKCE `code` flow and the `token_hash` flow, then redirects to a same-origin `next`. `proxy.ts` runs `supabase.auth.getClaims()` on every non-asset request purely to refresh the session cookies (Server Components cannot set cookies — `lib/supabase/server.ts` swallows that error and relies on the proxy). Browser client: `lib/supabase/client.ts`; server: `lib/supabase/server.ts`.

### Security model lives in Postgres, not in the app

There is no API layer. The browser talks to PostgREST directly, so **RLS policies and grants are the authorization boundary**. `supabase/migrations/202609020001_initial.sql` revokes all table access and re-grants narrowly, and defines the `is_team_member` / `is_team_admin` / `can_access_session` / `can_access_block` / `is_global_admin` helpers that every policy is built from. Exercises are readable by `anon`; everything team-scoped is not.

Anything needing a transaction or a check the client must not be able to skip is a `security definer` RPC, `revoke`d from `anon` and granted to `authenticated`: `create_team`, `accept_team_invitation`, `publish_session`, `start_session`, `reorder_session_blocks`, `reorder_block_items`. Reordering in particular is an RPC so positions stay consistent — do not reimplement it as client-side row updates.

### Realtime collaboration

DB triggers (`broadcast_session_change`) push every session/block/item write to a **private** Realtime topic `session:<sessionId>`; `realtime.messages` policies gate that topic through `can_access_session_topic`. `hooks/use-session-realtime.ts` calls `supabase.realtime.setAuth(...)`, subscribes with `private: true`, tracks Presence keyed by user id (surfacing which block each collaborator is on), and responds to *any* broadcast by calling `reloadSession` — broadcast payloads are a change signal, not a diff to apply.

### Session lifecycle

`draft → published → in_progress`, with the UI's Drafts/Upcoming/Past tabs derived, not stored — see `deriveSessionTab` in `lib/session.ts` (past = `startsAt + plannedDurationMinutes` in the past). `validatePublish` gates publishing client-side, and `validate_session_publish_transition` re-checks it in the DB. Once `start_session` succeeds, `prevent_in_progress_session_changes` locks the plan's rows; `start_session` itself re-validates that the saved groups still exactly match the present players. Dates are stored in UTC.

Session items **copy** the exercise's display data (title, description, media, thumbnail) at insert time, so later library edits never rewrite an existing plan.

### Media

`lib/media.ts` parses image / YouTube / Vimeo / direct-video URLs and derives thumbnails client-side. Vimeo is the exception: it needs `app/api/media/thumbnail/route.ts`, the only real API route, which proxies oEmbed and validates that the returned host is `*.vimeocdn.com`.

### Styling

Tailwind v4 (`@import "tailwindcss"` in `app/globals.css`) with the palette as CSS custom properties on `:root` (`--ink`, `--paper`, `--orange`, …). Use those variables rather than hard-coded hexes. Classes are composed with `cn()` (clsx + tailwind-merge) from `lib/utils.ts`. Shared primitives are in `components/ui.tsx`; the app is light-mode only (`colorScheme: "light"`) and honors `prefers-reduced-motion`.

## Tests

Vitest + jsdom + Testing Library, `globals: true`, `@/*` aliased to `site/`. Tests sit beside their modules as `*.test.ts(x)` and concentrate on the pure logic in `lib/` (`session`, `roster`, `grouping`, `media`, `exercises`) plus a couple of component tests. New behavior in `lib/` should come with a focused test; scale wider verification (`lint`, `build`) to the risk of the change, and report any check you did not run.
