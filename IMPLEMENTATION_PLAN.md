# Grep Handball — Implementation Plan and Checklist

## Summary

Build a responsive collaborative web app for handball coaches, on a portable
standard Next.js React app with Supabase for authentication, PostgreSQL,
Realtime Broadcast, Presence, and row-level security.

Two things below describe the plan rather than the app built from it, and the
lines they touch are annotated where they appear. The library is **not** publicly
browsable — `202609020031` put every exercise behind sign-in — and sign-in is
**email and password**, not a magic link: an administrator creates the account,
the coach sets their own password on first use, and resets it themselves
afterwards. `CLAUDE.md` is the current description of both.

## Product checklist

- [x] Scaffold the standard Next.js React project and establish the Grep visual system.
- [x] Implement the exercise library with search, media thumbnails, contribution, editing, and archival. *(No longer public — see the summary.)*
- [x] Implement sign-in, profiles, protected routes, and session restoration. *(Email and password — see the summary.)*
- [x] Implement multi-team creation, switching, invitations, membership, and role management.
- [x] Add Hoopit roster import, player attendance, and one-click random teams and pairs.
- [x] Implement Drafts, Upcoming, and Past session views.
- [x] Implement the collaborative session builder, blocks, exercises, custom activities, durations, notes, totals, publishing, and deletion.
- [x] Add optimistic autosave, Broadcast subscriptions, Presence, reconnect handling, and save-state feedback.
- [x] Add keyboard, touch, responsive, reduced-motion, and accessibility behavior.
- [x] Generate metadata and a branded social-preview card.
- [x] Apply the migrations to a hosted Supabase project and validate the live deployed routes. *(Deployed and in use; `DEPLOYMENT.md` is the runbook, `DISASTER_RECOVERY.md` the safety net.)*

## Architecture checklist

- [x] Add Supabase migrations for profiles, teams, memberships, invitations, exercises, sessions, blocks, and items.
- [x] Add indexes, grants, RLS policies, Realtime authorization, and initial global-admin configuration.
- [x] Add transactional functions for invitation acceptance, reordering, publishing, and membership checks.
- [x] Restrict exercise mutations to authenticated owners and administrators. *(Reading was global until `202609020031` closed it too.)*
- [x] Keep every team record and private Realtime channel restricted to current team members.
- [x] Copy exercise display data into session items so later library edits do not rewrite existing plans.
- [x] Store dates in UTC and derive Drafts, Upcoming, and Past views from status and calculated end time.
- [x] Keep player rosters team-private and session attendance/groupings scoped to accessible sessions.

## Acceptance checklist

Each line says what settles it. `supabase/tests/rls.test.sql` is the pgTAP suite;
it needs a disposable local Supabase instance, so it is run deliberately rather
than in `npm test`.

- [x] Anonymous visitors cannot read or mutate anything. *(The library stopped
  being public in `202609020031`: sign-in is required to browse exercises, and
  the v1 line promising anonymous browsing described a product that shipped
  differently. `rls.test.sql` covers the anon reads and writes.)*
- [x] Users cannot read or mutate another team's data. *(`rls.test.sql`: an
  unrelated coach sees no team, no session and no favourite of another coach,
  and every lifecycle RPC refuses them.)*
- [x] Email-bound invitations expire, cannot be reused, and cannot be accepted by
  the wrong account. *(`rls.test.sql` covers all three, plus the unconfirmed
  address, against `accept_team_invitation`.)*
- [x] The private Realtime topic behind collaboration admits team members only.
  *(`rls.test.sql` covers `can_access_session_topic` — membership, an unknown
  session, a malformed topic and the wildcard.)*
- [x] Publishing validates title, date/time, planned duration, and at least one block.
- [x] Media parsing and fallbacks work for images, YouTube, Vimeo, and direct video URLs.
- [x] The interface includes keyboard, touch, tablet, mobile, and reduced-motion behavior.
- [x] The production build succeeds and all local public/protected routes return successfully.
- [ ] **Two browser clients** see session edits, reorders, totals, Presence,
  disconnects and reconnects synchronize. *(Nothing but two real browsers can
  settle this; see the runbook below.)*
- [ ] **The pgTAP suite passes against the current schema.** *(Last run by hand;
  the newest assertions above have not been run anywhere yet.)*

### Closing the last two

Both are a person's job, and neither needs more code.

**The pgTAP suite.** It mutates a database, so it never runs against production
and never runs unattended:

```bash
cd site && supabase start && supabase test db   # disposable local instance
```

If it fails on a count, the `select plan(N)` at the top is the number of
assertions in the file, and adding one means bumping it.

**Two-client collaboration.** Two browsers, two accounts on the same team (a
second profile in the Supabase dashboard, or a private window signed in as
another coach), both on `/sessions/<id>/edit`:

1. Type in a block title in one — the other shows it without a reload.
2. Drag a block, then an activity, in one — the order and the totals follow in
   the other.
3. Watch the avatars: each coach surfaces on the block they are editing.
4. Kill the wifi on one for ten seconds. It shows «Kobler til på nytt …», and on
   reconnect it catches up rather than overwriting what the other one did.

## V1 boundaries

External media URLs were the v1 boundary; image and video uploads have since
been added (`202609020013`, `202609020016`). Player accounts, exercise tags,
comments, version history, recurring sessions, and offline editing remain
outside it. Exporting a session is a print stylesheet — `Skriv ut` on a plan —
rather than a file format. The interface is Norwegian.
