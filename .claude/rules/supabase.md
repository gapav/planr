---
paths:
  - "site/supabase/**"
---

# Migrations and the security boundary

The browser talks to PostgREST directly, so these files are Grep's
authorization. Production holds real coaches and players, many of them
minors.

## Before you write

- A migration on `origin/main` is applied in production and immutable (a hook
  refuses the edit); write a new forward migration. One committed only on
  your branch may already be on `planr-dev` — the hook asks first.
- A new file is `YYYYMMDDNNNN_short_name.sql` and sorts after the newest:
  `make migrate-*` refuses a file older than the newest applied one.
  Check for a duplicated version — two files once shared `202609020032`
  (`DISASTER_RECOVERY.md`, “Resolved: the duplicate version number”).

## How the existing migrations are written

- A header comment, mostly in English: what the change is for and why this
  shape rather than the obvious other one.
- Safe to run twice: `if not exists`, `drop … if exists`
  before `create`/`add constraint`, `create or replace` for functions.
- A new table: `enable row level security`, policies, then
  `revoke all … from anon, authenticated` and grant `authenticated` only the
  verbs the app uses (column-level `update` where only some columns may
  change, as on `profiles`). Nothing is granted to `anon` — not since
  `202609020031`, not even exercises.
- Policies are `to authenticated`, one per verb, named
  `<table>_<verb>_<who>` (`team_focus_periods_read_member`), and decide access
  through the helpers in `202609020001_initial.sql`: `is_team_member`,
  `is_team_admin`, `can_access_session`, `can_access_block`,
  `is_global_admin`. Inserts that record an author pin `created_by =
  auth.uid()`. A global admin reads every team's plans (`202609250001`) but
  writes none.
- Helpers and RPCs are `security definer set search_path = public`,
  `revoke execute … from public, anon`, `grant execute … to authenticated`.
  Admin RPCs re-check `is_global_admin()` themselves.
- Anything the client must not be able to skip, or that needs a transaction
  (lifecycle, reordering, publishing, accepting an invitation), is an RPC.
  Reordering is never client-side row updates.
- Session content (sessions, blocks, items, and anything new that belongs to
  a plan) must be covered by two triggers and one function:
  `broadcast_session_change` (realtime), `prevent_in_progress_session_changes`
  (the lock), and `copy_session`. A data fix on a started or finished plan
  unlocks it for the transaction the way the RPCs do:
  `set_config('plannr.unlocked_session', <session id>, true)` (see
  `202610140001`).
- Player data keeps the `team_players_minimize_name` trigger
  (`202609020004`): “Firstname L.” and jersey number only.

## After you write

1. `npm run db:bootstrap` from `site/` — `scripts/build-bootstrap.test.ts`
   fails the suite when `prod_bootstrap.sql` has drifted. Never edit the
   bootstrap by hand.
2. Update `tests/rls.test.sql` when grants, policies, roles or data access
   change, and bump `select plan(N)` to the new number of assertions. Don't
   run it (`supabase test db` needs a disposable local instance and the
   maintainer's explicit yes).
3. Mirror the new shape in `lib/types.ts`, the `map*` functions and mutations
   in `components/app-provider.tsx`, and `lib/demo-data.ts`.
4. Hand off the exact new file(s), in order: the maintainer runs
   `make migrate-dev`, then `make migrate-prod` (it backs up first), then
   merges the frontend that needs it. Never run either, and never claim a
   migration is applied — what is applied where is each project's
   `supabase migration list`, which agents cannot read.
