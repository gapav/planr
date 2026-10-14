<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Grep project guidance

## Scope and architecture

- This directory contains the full application: a Next.js 16 App Router frontend backed by Supabase.
- Use `npm` and run project commands from this directory.
- Supabase is the production source of truth. The in-memory demo data is only a fallback when the public Supabase environment variables are absent.
- Preserve privacy minimization for imported player data: retain only the minimized player name and jersey number unless the user explicitly changes that requirement.

## Supabase migrations

- The user applies database migrations manually in the Supabase dashboard. Never run commands that apply, push, reset, or otherwise mutate a local or remote Supabase database.
- Make database changes only by creating or editing SQL files in `supabase/migrations/`. Do not claim that a migration has been applied.
- Keep migrations ordered by their timestamped filename and safe to execute through the Supabase SQL editor.
- Treat migrations that may already have been applied as immutable. If their application status is unclear, ask before editing them or add a new forward migration.
- After changing database SQL, run `npm run db:bootstrap` so `supabase/prod_bootstrap.sql` matches the migrations — `scripts/build-bootstrap.test.ts` fails the suite otherwise — then identify the exact migration file the user must apply manually and mention any required ordering. Never suggest applying `prod_bootstrap.sql` to a database being restored from a backup; it is for an empty project only.
- Update `supabase/tests/rls.test.sql` when grants, policies, roles, or data-access behavior change. Do not run `supabase test db` unless the user explicitly asks and confirms a disposable local Supabase instance is available.

## Implementation conventions

- Read the relevant installed Next.js guide required by the generated rule above before changing framework code.
- Browser access goes through `lib/supabase/client.ts`, the only writer of the auth cookie. Nothing server-side reads the session: `lib/supabase/server.ts` has no callers, and each API route that needs Supabase builds its own `createClient` — with the caller's bearer token wherever there is a caller, so RLS still applies, and with `SUPABASE_SECRET_KEY` only in the three routes allowed to hold it (see the root `CLAUDE.md`). Do not expose secrets through `NEXT_PUBLIC_*` variables.
- Preserve row-level security and least-privilege grants for all database changes.
- Add or update focused Vitest coverage for changed behavior. Tests live beside the corresponding modules using `*.test.ts` or `*.test.tsx`; API route tests run in the node environment with `@supabase/supabase-js` mocked.
- Avoid editing generated output, dependency directories, or environment files containing credentials.
- Preserve unrelated user changes in the working tree.

## Verification

Run the checks relevant to the change from this directory:

```bash
npm run lint
npm test
npm run build
```

For small, isolated changes, start with the focused test and expand verification in proportion to the risk. Report any checks that were not run or could not complete.
