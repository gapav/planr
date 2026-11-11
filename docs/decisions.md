# Decisions

Numbered and append-only. Code, docs, issues and pull requests cite them by number
(“decision 3”), so a number is never reused or renumbered. To change one, add
a new decision and strike the old one through with a pointer to it. Record
only what the maintainer decided; a proposal waits under open questions or in
an issue. The next number is **3**.

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

## Open questions

None recorded yet.
