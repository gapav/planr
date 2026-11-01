# Backlog

Ideas not yet specced, roughly in order. `/spec` turns a line into a work
item and removes it from here.

## Next

- **Roll back the older fine-grained edits.** `updateItem`, `deleteBlock` and
  others still leave a refused write on screen as if it were saved (`CLAUDE.md`,
  *One client-side data layer*).
- **Drop `profiles.must_set_password`.** Inert since `202609020027`; only
  `/account/password` still reads it.
- **A root `README.md`.** It is empty; `site/README.md` is the real one.

## Outside v1, not planned

Player accounts, exercise tags, comments, version history, recurring
sessions, offline editing (`docs/v1-plan.md`, *V1 boundaries*).
