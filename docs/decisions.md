# Decisions

Numbered and append-only. Code, docs, issues and pull requests cite them by number
(“decision 3”), so a number is never reused or renumbered. To change one, add
a new decision and strike the old one through with a pointer to it. Record
only what the maintainer decided; a proposal waits under open questions or in
an issue. The next number is **14**; 5, 6 and 11 are held by decisions not
recorded here yet.

Decisions made before November 2026 are not back-filled. They are recorded
where they took effect: the hard rules and architecture in `CLAUDE.md`, and
the header comment of the migration that made them — for example
`202609020031` (the library behind sign-in) or `202609250001` (the global
admin reads every team's plans and writes none).

## 1. Work lives on the GitHub board, not in `work/` (2026-11-11)

Each change is a GitHub issue on the project board, specced in the shape of
`.github/ISSUE_TEMPLATE/work.yml`. An issue labelled `agent` is built by Claude
in Actions and comes back as a pull request; changes built locally go through
`/ship` to a pull request too. The PR carries what a work file used to: the
ticked “Done when” lines with evidence, the check results and the steps before
merging. Merging deploys production, so a PR's migrations are applied before
it merges (`/release`). `work/` and `work/backlog.md` are retired; their open
items moved to issues. The migration ledger stays in `DEPLOYMENT.md`.

## 2. Migrations are applied with one command, by the maintainer (2026-11-11)

Migrations stop being pasted into the SQL editor. The maintainer runs
`make migrate-dev` and `make migrate-prod`, which wrap `supabase db push`, prompt
for the password and confirm before applying; `migrate-prod` takes a full
backup first and stops if it fails. Supabase's own
`supabase_migrations.schema_migrations` table becomes the record of what is
applied where, replacing the ledger in `DEPLOYMENT.md`. Agents still never
touch a database, and no database secret goes to GitHub: running migrations
from Actions was considered and not chosen.

## 3. How `make migrate-*` stays safe (2026-11-11)

Refines decision 2. A `make restore` ends with `make migrate-baseline`, since
backups leave out `supabase_migrations` and a restored project would otherwise
look un-migrated. The backup scripts stay as they are. `migrate-*` refuses to
push when the remote history is empty but `public` has tables. The migration
hook refuses edits to a migration on `origin/main`, asks for one committed only
on the current branch (`/release` may have applied it before the merge), and
passes new or uncommitted files. `.claude/settings.json` denies
`make migrate*`, so the rule that agents never apply migrations is enforced,
not just written down. Upgrading to Supabase Pro, whose platform backups carry
the history, is a separate question.

## 4. Undertema: a fixed second level under each exercise topic (2026-11-12)

Issue #9. Each of the six exercise topics gets subtopics (*undertema*), stored
like `age_groups`: an `exercises.subtopics text[]` label array with a fixed
list in a check constraint (`202611120001`), not a topics table. The list lives
once in the app, `EXERCISE_SUBTOPICS` in `site/lib/types.ts`, with stable keys
qualified by topic (`forsvar.teknikk`, `malvakt.teknikk`); adding or renaming
one is a new migration plus that edit, and admins cannot edit it in the app.
There is no third level, and the six topics are unchanged.

- An exercise may carry several subtopics, but only from its own topic; the
  check constraint enforces that against `category`.
- An untagged exercise appears under its topic, never under a subtopic — the
  opposite of age groups, where untagged means every band.
- In the library's rail, subtopics with no matches are shown greyed out with 0,
  not hidden.
- Existing exercises are not backfilled; the maintainer tags them by hand after
  release.
- ~~The session builder's and warm-up dialog's library pickers keep topic and
  age only.~~ The session builder's picker has undertema since decision 8; the
  warm-up dialog's still keeps topic and age only.

## 7. Grep has a version, and coaches hear about minor and major releases (2026-11-12)

Issue #21. Grep's version is `site/package.json`'s `version`, semver, starting
at `1.0.0` for production as it stood when it got one; `1.1.0` is the first
release with highlights. `RELEASES` in `site/lib/changelog.ts` lists every
announced release, newest first, and its first entry is the running version.
There are no git tags or GitHub Releases.

- Every pull request carries a **Version** line: *patch*, *minor* or *major*.
  A patch changes neither file and is never announced. A minor or major bumps
  `package.json` and adds a changelog entry whose highlights are drafted from
  the issue in plain Norwegian for coaches; the maintainer approves the wording
  in the PR. `/release` checks the line, `package.json` and the changelog
  agree before merging.
- After a minor or major release, a returning coach sees «Velkommen tilbake!
  Her er hva som er nytt siden sist» once, in the signed-in shell, never during
  a live workout. Releases are compared on `major.minor` alone, so patches stay
  silent.
- «Last seen» is per device (`localStorage` `grep-seen-version`), not per
  account: no migration. Storage that cannot be read shows nothing.
- There is no archive page and no way back to the dialog once it is closed.
- **Switched off (2026-11-23, #44).** The signed-in shell no longer opens
  the dialog, for any version. The Version line, `package.json`, `RELEASES`,
  `lib/release-notes.ts` and `WhatsNewDialog` stay, so it can be switched on
  again in `components/app-shell.tsx`.

## 8. The session builder's exercise picker is the library's rail (2026-11-12)

Issue #24. «Legg til øvelser» in the session builder lays out the library's own
filter rail (`RailBody` from `exercise-filter-rail.tsx`) beside search and the
results, instead of its own rows of chips. Undertema, samlinger, Favoritter and
the team's age band therefore work as on /exercises, and a change to the rail
reaches both. Chosen over restyled chip rows with an undertema row (mockup
linked from the issue).

- The dialog names the bolk, stays open after an add, and marks each added
  exercise «Lagt til»; «Ferdig» closes it.
- Age opens on the band the plan's team implies, as the library does.
- The warm-up dialog's picker is unchanged for now.

## 9. No screen says "nothing here" before the first load has answered (2026-11-12)

Issue #26. Until the provider's first load has settled, an empty list or a
missing session means "not here yet", so every empty and not-found state waits
for its flag and shows `LoadingState` from `site/components/ui.tsx` instead —
short status text («Henter økter …»), `role="status"`. `workspaceLoaded`
covers everything `loadPrivateData` fetches; `exercisesLoaded` covers the
library, which `loadExercises` fetches on its own. Both latch true once the
first load settles, success or failure, and start true in demo mode.

- No skeletons, and no caching the workspace on the device.
- A failed load still settles to the empty state.
- Refetches after the first load (Realtime, after an RPC) never show the
  loading state again.

## 10. Håndballskolen: lessons are code, shown by the coach (2026-11-17)

Issue #33. A new sidebar item, «Håndballskolen» (`/handballskolen`), holds
interactive lessons for coaches to show their players. The first is
«Utgruppert forsvar», ported from a claude.ai prototype.

- Lessons are written in the repo (a registry in `lib/lessons/` plus a component
  per lesson), not authored in the app. No tables, no migration.
- Signed-in coaches only, inside the shell, with a «Vis på storskjerm» mode for
  showing it on a projector. No public link for players.
- Nothing is saved: scores and the current step live in memory.
- The prototype's own look stays behind: Grep's type and tokens throughout,
  roles in Grep's brights, the court on `--court-*` tokens in both themes.
- On a phone it lives in the «Mer» drawer; the bottom bar is unchanged.

## 11. Grep is installed as a PWA, not from the App Store (2026-11-18)

Many coaches find installing a web app awkward, so the App Store was
considered: a Capacitor shell around the live site. It is set aside for now
because publishing, TestFlight and Apple push all need the paid Apple
Developer Program. We make the PWA easy to install instead.

- Sign-in works inside the installed app. On iOS a home-screen app keeps
  its own storage, apart from Safari's, and a magic link always opens in
  Safari, so the emails also carry a **code** that the coach types in. It
  is 8 digits, the existing `otp_length`, and lasts the existing 24 hours.
  The links still work.
- The «Sjekk e-posten din» screen on /sign-in always shows a code field, in
  the browser and in the installed app alike.
- Invitation and login emails from `app/api/admin/auth-link` carry the code
  too. A code gets the same protection as a link: a team admin is never
  given one for an account that already existed.
- Follow-up work: an install guide and prompts, then a service worker with
  web push (on iOS, push works only in an installed app), then a measure of
  how many coaches have installed it.
- Reopen the App Store question when the $99 fee is acceptable. The plan
  then is the Capacitor shell, self-service account deletion (Apple requires
  it; today only a global admin can delete an account) and a review account.

## 12. Grep holds no data about players (2026-11-23)

Issue #42. Grep keeps no roster, no attendance and no drawn groups. Coaches
plan and run sessions; Grep does not need to know who the players are, and
holding nothing about them — many of them minors — removes the privacy risk
rather than minimising it. It also removes the setup step between a coach and
the session. This replaces the «Firstname L.» plus jersey-number rule, which
covered data Grep no longer has.

- `202611230001_remove_player_data.sql` drops `team_players`,
  `session_attendance`, `session_groupings`, `player_belongs_to_session`,
  `sessions.grouping_kind` and `session_grouping_kind`. Nothing is archived.
- Starting a session is one `start_session(uuid)` call: «Start økten» on
  `/sessions/[id]/live`, no attendance, no draw, no «Hopp over oppsett».
  `start_session_without_setup` is gone with the old two-argument
  `start_session`.
- `/team` has no «Spillere» tab and opens on «Trenere»; the Hoopit roster
  import is gone.
- Untouched: Håndballskolen's court diagrams, the fixture calendar, and the
  free-text session notes, which are coach text.
- Backups taken before the migration still hold the rosters. Deleting them is
  the maintainer's call.

## 13. Dependencies are scanned for known vulnerabilities in CI (2026-11-23)

Issue #47. `.github/workflows/security.yml` checks `site/package-lock.json`
— direct and transitive dependencies — against the npm advisory database.

- `npm audit --omit=dev --audit-level=high` fails the check on a high or
  critical advisory in a production dependency. Those are the packages that
  ship to Vercel and run with coaches' sessions and the secret-key routes.
  Dev-only packages (eslint, vitest, vite) run on a developer's machine and
  in CI, never in production, and moderate/low advisories are usually
  denial-of-service edge cases: both are printed in the same job's full
  report and fixed when convenient, but they don't block a merge.
- It runs on every pull request, every push to `main`, weekly on `main`
  (Mondays 06:17 UTC) so new advisories in packages already shipped surface
  without a PR, and by hand (`workflow_dispatch`).
- On pull requests `actions/dependency-review-action` also fails when the PR
  *adds* a high/critical vulnerable runtime package.
- `.github/dependabot.yml` opens security updates only — no routine version
  bumps — for `npm` in `/site` and `github-actions` in `/`, one grouped PR per
  ecosystem.
- The threshold is not lowered to make a red check pass: a finding is fixed,
  or tracked in an issue while the check stays red.

## 14. Coaches suggest a replacement exercise on a plan's card (2026-11-24)

Issue #52. A colleague who thinks an exercise in someone else's plan should be
swapped proposes it on the card instead of editing behind the author's back.
(The issue named this decision 13; that number had gone to the dependency
scan.)

- «Foreslå alternativ» on every exercise activity in `/sessions/<id>` and the
  builder while the plan is a draft or published. It opens the library picker
  in a pick-one mode with an optional comment of at most 200 characters.
- One suggestion per coach per activity, in `session_item_suggestions`
  (`202611240001`); suggesting again replaces one's own. The row holds the
  exercise id only — the card shows the library's exercise.
- «Bytt» (any coach on the team) is `accept_item_suggestion`: the activity
  takes the exercise and its display data and keeps its position, minutes,
  stikkord and coaches, in one transaction with deleting the suggestion and
  any other one naming the same exercise. «Avvis» (any coach) and «Trekk
  tilbake» (the suggester) are the same delete.
- Nothing is suggested, dismissed or accepted once the workout has started:
  the lock trigger covers the table like the rest of the plan.
- An exercise archived after it was suggested still shows, marked «Arkivert»,
  and can still be swapped in: `exercises_read_suggested` lets the team read
  exactly the exercises suggested on their own plans. A coach cannot newly
  suggest one somebody else has archived.
- `copy_session` copies no suggestions. Live session and print show none, and
  nothing is mailed about them.
- Suggestions load with the plan (embedded in the sessions query) and are
  broadcast on `session:<id>` like every other plan write.

## 15. «Foreslå alternativ» only in the builder, from a ⋮ menu (2026-11-24)

Issue #55; amends 14. The dashed pill on every card cluttered a plan coaches
mostly just read, and making a suggestion is an editing action.

- The plan view (`/sessions/<id>`) shows the suggestions already made, with
  their count pill and «Bytt» / «Avvis» / «Trekk tilbake», but offers no way to
  make one.
- In the builder each activity's trash button is now a ⋮ menu in the same
  spot: «Foreslå alternativ» (exercises, while the plan is a draft or
  published) and «Fjern» («Fjern stasjon N» on a station). The block header's
  «Slett» stays a button.
- Who may suggest, accept or dismiss is unchanged, as are the data model, the
  RPCs and RLS.

## Open questions

None recorded yet.
