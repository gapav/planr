# Plannr

A collaborative handball session planner built with Next.js and Supabase.

## What is included

- Public, searchable exercise library with author-controlled editing and media previews.
- Passwordless email sign-in using Supabase Auth PKCE links.
- Multi-team workspaces with admin/coach roles and email-bound invitations.
- Drafts, Upcoming and Past session views derived from status and session end time.
- Reorderable session blocks and activities, duration totals and publish validation.
- Optimistic autosave, private Realtime Broadcast updates and collaborator Presence.
- PostgreSQL migrations, grants, row-level security, transactional RPCs and pgTAP policy tests.
- An in-memory preview dataset when Supabase environment variables are absent.

Preview data is intentionally non-persistent. The production source of truth is Supabase.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Create a Supabase project and paste its URL and publishable key into `.env.local`.
3. Apply `supabase/migrations/202609020001_initial.sql` using the Supabase CLI or dashboard.
4. In Supabase Auth URL configuration, set the site URL and add `http://localhost:3000/auth/confirm` as an allowed redirect.
5. Update the Magic Link template to use the token-hash callback shown in `supabase/templates/magic-link.html`.
6. Start the app with `npm run dev`.

For production, configure the same three public environment values on the host, add the production `/auth/confirm` redirect, and configure custom SMTP in Supabase before inviting real coaches.

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
