# Grep

A collaborative handball session planner built with Next.js and Supabase.

## What is included

- Public, searchable exercise library with author-controlled editing and media previews.
- Passwordless email sign-in with long-lived Supabase sessions and one-time magic links.
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
4. In Supabase Auth URL configuration, set the site URL and add `http://localhost:3000/auth/confirm` to the redirect allow-list.
5. Set the **Magic Link** email template to the contents of `supabase/templates/magic-link.html`. The confirmation page waits for a button click before consuming the token, so automated email scanners cannot use the link before the coach does.
6. Start the app with `npm run dev`.

## Production domain

The canonical production origin is `https://grep.team`.

1. In Vercel, add `grep.team` to the project and make it the production domain. Add `www.grep.team` as a redirect to `grep.team` if the `www` form should also work.
2. Publish the exact DNS records Vercel shows for the apex and `www` names. Do not copy generic record values if Vercel shows project-specific ones.
3. Set `NEXT_PUBLIC_SITE_URL=https://grep.team` for the Vercel **Production** environment and redeploy. Keep preview and local environments on their own origins.
4. In Resend, add and verify `grep.team`, publish its generated DKIM, SPF and return-path records, then create an API key. Set `RESEND_FROM=Grep <no-reply@grep.team>` and `RESEND_API_KEY` in Vercel Production.
5. In Supabase **Authentication → URL Configuration**, set **Site URL** to `https://grep.team`. Add `https://grep.team/auth/confirm` to **Redirect URLs**; keep `http://localhost:3000/**` for local development. Add the exact Vercel preview pattern only if preview deployments need to send auth email.
6. In Supabase **Authentication → Emails → SMTP Settings**, enable custom SMTP with host `smtp.resend.com`, port `465`, username `resend`, the Resend API key as the password, sender email `no-reply@grep.team`, and sender name `Grep`. This sends the magic-link emails requested from the public sign-in page.
7. In Supabase **Authentication → Email Templates → Magic Link**, paste `supabase/templates/magic-link.html`.

After DNS and the environment values are live, test both a team-administrator invitation and the public sign-in flow. Each email should link to `https://grep.team/auth/confirm`, wait for the coach to press **Fortsett til Grep**, and then open the requested page.

Coaches sign in at `/sign-in` with their email address. Supabase keeps the browser session refreshed, so daily users normally stay signed in; they request another email only after signing out, clearing browser data, using a new device, or when the session has been revoked.

To add a coach: a team administrator opens `/team`, presses **Inviter trener**, and enters their address. The app reserves the team seat, creates the account when necessary, and sends a one-time login link. The pending list supports resend, copy fallback, and revoke. A global administrator can do the same from `/admin` and can also grant administrator roles.

This needs `SUPABASE_SECRET_KEY` on the server (see `.env.example`), read only by `app/api/admin/auth-link/route.ts`. `RESEND_API_KEY` and `RESEND_FROM` are optional for administrator-issued invitations: without them, the link is still created and shown for manual delivery. Public sign-in emails are sent by Supabase through the custom SMTP configuration above.

**Without a verified sending domain** Resend will not deliver to arbitrary addresses. Nothing is lost when an administrator-issued email fails: the account and reserved seat remain, and the UI shows the one-time login link for direct manual delivery. Do not post that credential in a shared channel.

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
