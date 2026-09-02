# Grep Handball — Implementation Plan and Checklist

## Summary

Build a responsive collaborative web app for handball coaches. The exercise library is publicly browsable, while session planning and team management require passwordless email sign-in. Following the architecture review, the application uses a portable standard Next.js React app with Supabase for magic-link authentication, PostgreSQL, Realtime Broadcast, Presence, and row-level security.

## Product checklist

- [x] Scaffold the standard Next.js React project and establish the Grep visual system.
- [x] Implement the public exercise library with search, media thumbnails, contribution, editing, and archival.
- [x] Implement passwordless sign-in, profiles, protected routes, and session restoration.
- [x] Implement multi-team creation, switching, invitations, membership, and role management.
- [x] Add Hoopit roster import, player attendance, and one-click random teams and pairs.
- [x] Implement Drafts, Upcoming, and Past session views.
- [x] Implement the collaborative session builder, blocks, exercises, custom activities, durations, notes, totals, publishing, and deletion.
- [x] Add optimistic autosave, Broadcast subscriptions, Presence, reconnect handling, and save-state feedback.
- [x] Add keyboard, touch, responsive, reduced-motion, and accessibility behavior.
- [x] Generate metadata and a branded social-preview card.
- [ ] Apply the migration to a hosted Supabase project and validate the live deployed routes.

## Architecture checklist

- [x] Add Supabase migrations for profiles, teams, memberships, invitations, exercises, sessions, blocks, and items.
- [x] Add indexes, grants, RLS policies, Realtime authorization, and initial global-admin configuration.
- [x] Add transactional functions for invitation acceptance, reordering, publishing, and membership checks.
- [x] Keep exercises globally readable while restricting mutations to authenticated owners and administrators.
- [x] Keep every team record and private Realtime channel restricted to current team members.
- [x] Copy exercise display data into session items so later library edits do not rewrite existing plans.
- [x] Store dates in UTC and derive Drafts, Upcoming, and Past views from status and calculated end time.
- [x] Keep player rosters team-private and session attendance/groupings scoped to accessible sessions.

## Acceptance checklist

- [ ] Anonymous users can browse exercises but cannot mutate data or access team routes.
- [ ] Users cannot read or mutate another team's data.
- [ ] Email-bound invitations expire, cannot be reused, and cannot be accepted by the wrong account.
- [ ] Two browser clients see session edits, reorders, totals, Presence, disconnects, and reconnects synchronize.
- [x] Publishing validates title, date/time, planned duration, and at least one block.
- [x] Media parsing and fallbacks work for images, YouTube, Vimeo, and direct video URLs.
- [x] The interface includes keyboard, touch, tablet, mobile, and reduced-motion behavior.
- [x] The production build succeeds and all local public/protected routes return successfully.
- [ ] The hosted Supabase RLS suite and deployed two-client collaboration flow pass against production configuration.

## V1 boundaries

External media URLs are supported, but uploads are not. Player accounts, exercise tags, comments, version history, session exports, recurring sessions, and full offline editing are outside v1. English is the initial interface language.
