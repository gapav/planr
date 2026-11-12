# Decisions

Numbered and append-only. Code, docs, issues and pull requests cite them by number
(“decision 3”), so a number is never reused or renumbered. To change one, add
a new decision and strike the old one through with a pointer to it. Record
only what the maintainer decided; a proposal waits under open questions or in
an issue. The next number is **9**; 5 and 6 are held by decisions still in
review.

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

## Open questions

None recorded yet.
