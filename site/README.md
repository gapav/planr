# Grep

A collaborative handball session planner built with Next.js and Supabase.

## What is included

- Public, searchable exercise library with author-controlled editing and media previews.
- Email and password sign-in. Accounts are created by an administrator in the Supabase dashboard with a temporary password; the first sign-in forces the coach to choose their own.
- Multi-team workspaces with admin/coach roles and email-bound invitations.
- Privacy-minimized Hoopit `.xls` and `.xlsx` roster imports that retain only first name, surname initial and jersey number.
- Drafts, Upcoming and Past session views derived from status and session end time.
- Staged live-session check-in, explicit team or pair generation, and a locked in-progress workout view.
- Reorderable session blocks and activities, duration totals and publish validation.
- Optimistic autosave, private Realtime Broadcast updates and collaborator Presence.
- PostgreSQL migrations, grants, row-level security, transactional RPCs and pgTAP policy tests.
- An in-memory preview dataset when Supabase environment variables are absent.

Preview data is intentionally non-persistent. The production source of truth is Supabase.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Create a Supabase project and paste its URL and publishable key into `.env.local`.
3. Apply every file in `supabase/migrations` in filename order using the Supabase CLI or dashboard.
4. In Supabase Auth URL configuration, set the site URL. The app sends no auth emails, so no redirect allow-list entry or email template is required.
5. Start the app with `npm run dev`.

For production, configure the same three public environment values on the host.

To add a coach: create their user in the Supabase dashboard (Authentication -> Users -> Add user) with a temporary password and *Auto Confirm User* enabled, then create an invite link from Team settings and send them the link and the temporary password. The link only resolves while signed in as the invited address.

When upgrading an existing database, apply only the migration files that have not already run. The player roster starts in `202609020003_player_rosters_and_live_sessions.sql`; migrations `202609020006` and `202609020007` add the in-progress status and locked workout transition.

When applying these two migrations manually in the Supabase SQL Editor, run `202609020006_in_progress_session_status.sql` first and wait for it to finish, then run `202609020007_start_session_workflow.sql` as a separate query. The second migration refreshes the PostgREST schema cache so the `start_session` RPC is available immediately.

## First global administrator

After the owner signs in once, run this from the Supabase SQL editor:

```sql
update public.profiles
set is_global_admin = true
where email = 'owner@example.com';
```

This role can edit or archive any global exercise. Team administration remains scoped through `team_memberships`.

## Quality checks

```bash
npm run lint
npm test
npm run build
supabase test db
```

The last command requires a local Supabase CLI environment. The app build uses Webpack for compatibility across constrained build environments; Next.js remains the runtime and framework.
