#!/usr/bin/env bash
# Apply migrations with one command (decisions 2 and 3). Run via make:
#
#   make migrate-dev        push pending migrations to planr-dev
#   make migrate-prod       make backup, then push them to grep-prod
#   make migrate-baseline   mark migrations a project already holds as applied
#
# Supabase's own table, supabase_migrations.schema_migrations, is the record of
# what is applied where. `supabase db push` reads it and runs only the files it
# lacks.
#
# The CLI in site/ is linked to grep-prod, so nothing here uses the link. Every
# CLI call gets --db-url, built from the Session pooler URI you paste, WITHOUT
# the password. The password is read with `read -rs` into PGPASSWORD, which
# psql and the CLI's Postgres client both take from the environment. It never
# appears on a command line, in `ps`, in a file, or in this script's output.
#
# Agents never run this: .claude/settings.json denies `make migrate*`.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

DEV_NAME="planr-dev"
PROD_NAME="grep-prod"

# ---------------------------------------------------------------------------
# Pure helpers, tested by site/scripts/migrate-plan.test.ts
# ---------------------------------------------------------------------------

# Versions of the migration files on disk, oldest first.
local_versions() {
  local f
  for f in "$MIGRATIONS_DIR"/*.sql; do
    [[ -e "$f" ]] || continue
    f="$(basename "$f")"
    [[ "$f" =~ ^([0-9]+)_ ]] && printf '%s\n' "${BASH_REMATCH[1]}"
  done | sort
}

in_list() {
  local needle="$1" item
  for item in $2; do [[ "$item" == "$needle" ]] && return 0; done
  return 1
}

# migration_plan <local versions> <remote versions> <public table count>
#
# Prints one line per migration that matters, `PENDING <v>`, `OUT_OF_ORDER <v>`
# or `MISSING_LOCAL <v>`, and returns:
#   0   safe to push (zero or more PENDING lines)
#   10  the remote history is empty but public has tables: the project was
#       migrated by hand or restored from a backup, and a push would rerun
#       every migration, the row-deleting ones included. Baseline it first.
#   11  a file on disk is missing remotely but is older than the newest
#       applied one: it was skipped, or applied by hand without the history.
#   12  the remote history has a version with no file on disk: this branch is
#       behind what the project holds.
migration_plan() {
  local local_v="$1" remote_v="$2" tables="${3:-0}" v newest="" rc=0
  if [[ -z "${remote_v//[[:space:]]/}" ]] && (( tables > 0 )); then
    return 10
  fi
  for v in $remote_v; do
    if [[ -z "$newest" ]] || (( 10#$v > 10#$newest )); then newest="$v"; fi
    if ! in_list "$v" "$local_v"; then
      printf 'MISSING_LOCAL %s\n' "$v"
      rc=12
    fi
  done
  for v in $local_v; do
    in_list "$v" "$remote_v" && continue
    if [[ -n "$newest" ]] && (( 10#$v < 10#$newest )); then
      printf 'OUT_OF_ORDER %s\n' "$v"
      (( rc == 0 )) && rc=11
    else
      printf 'PENDING %s\n' "$v"
    fi
  done
  return $rc
}

# baseline_candidates <local versions> <remote versions> <cutoff>
# The versions on disk, up to and including the cutoff, that the remote
# history lacks. These are what `migration repair --status applied` marks.
baseline_candidates() {
  local local_v="$1" remote_v="$2" cutoff="$3" v
  for v in $local_v; do
    (( 10#$v <= 10#$cutoff )) || continue
    in_list "$v" "$remote_v" || printf '%s\n' "$v"
  done
}

migration_file() {
  local f
  for f in "$MIGRATIONS_DIR/$1"_*.sql; do [[ -e "$f" ]] && basename "$f"; done
}

# ---------------------------------------------------------------------------
# Talking to the project
# ---------------------------------------------------------------------------

DB_URL=""

# connect <expected ref or empty> — paste the Session pooler URI, give the
# password, and refuse a project other than the one this run is for.
connect() {
  local expected="$1"
  prompt_connection "migrate"
  [[ -n "$PROJECT_REF" ]] || die "Could not tell which project that URI is for. Paste the Session pooler URI (user postgres.<ref>)."
  if [[ -n "$expected" && "$PROJECT_REF" != "$expected" ]]; then
    die "That URI is for $PROJECT_REF$(project_label "$PROJECT_REF"), not $expected$(project_label "$expected"). Nothing was changed."
  fi
  test_connection
  # No password in the URL: the CLI's Postgres client reads PGPASSWORD.
  DB_URL="postgresql://${PGUSER_V}@${PGHOST_V}:${PGPORT_V}/${PGDATABASE_V}?sslmode=require"
}

psql_value() { "$PG_BIN/psql" -tAX -v ON_ERROR_STOP=1 -c "$1"; }

REMOTE_VERSIONS="" PUBLIC_TABLES=0 HAS_HISTORY=0

read_remote_state() {
  PUBLIC_TABLES="$(psql_value "select count(*) from pg_tables where schemaname = 'public'")" \
    || die "Could not count the tables in public."
  if [[ "$(psql_value "select to_regclass('supabase_migrations.schema_migrations') is not null")" == "t" ]]; then
    HAS_HISTORY=1
    REMOTE_VERSIONS="$(psql_value "select version from supabase_migrations.schema_migrations order by version")" \
      || die "Could not read supabase_migrations.schema_migrations."
  else
    HAS_HISTORY=0
    REMOTE_VERSIONS=""
  fi
  local n; n="$(printf '%s\n' "$REMOTE_VERSIONS" | sed '/^$/d' | wc -l | tr -d ' ')"
  info "  public tables       $PUBLIC_TABLES"
  if (( HAS_HISTORY )); then info "  migration history   $n applied"
  else info "  migration history   none (supabase_migrations.schema_migrations does not exist)"; fi
}

# The CLI, run from site/ so it finds supabase/migrations, never with the link.
cli() { (cd "$SITE_DIR" && supabase "$@" --db-url "$DB_URL"); }

show_migration_list() {
  say ""
  info "supabase migration list ($PROJECT_REF):"
  cli migration list || warn "supabase migration list failed — check by hand."
}

banner() {
  local ref="$1" name="$2"
  say ""
  if [[ "$ref" == "$PROD_REF" ]]; then
    say "${RED}${BOLD}  ══════════════════════════════════════════════════════════"
    say "    THIS IS PRODUCTION — $name ($ref)"
    say "  ══════════════════════════════════════════════════════════${RST}"
  else
    say "  Target: ${BOLD}$name${RST} ($ref)$(project_label "$ref")"
  fi
}

# ---------------------------------------------------------------------------
# make migrate-dev / make migrate-prod
# ---------------------------------------------------------------------------

run_push() {
  local env="$1" ref name total
  if [[ "$env" == prod ]]; then ref="$PROD_REF"; name="$PROD_NAME"; total=6
  else ref="$DEV_REF"; name="$DEV_NAME"; total=5; fi

  say ""
  say "${BOLD}Plannr — apply migrations to $name${RST}"
  say "${DIM}$total steps. Nothing is written until you type the confirmation.${RST}"
  banner "$ref" "$name"

  step 1 $total "Check the local tools"
  require_pg_tools
  require_supabase_cli
  pause

  step 2 $total "Connect to $name ($ref)"
  info "Paste the Session pooler URI of ${BOLD}$name${RST}${DIM}. Any other project is refused."
  connect "$ref"
  pause

  step 3 $total "Compare the migrations on disk with $name's history"
  read_remote_state
  local plan rc pending v
  plan="$(migration_plan "$(local_versions)" "$REMOTE_VERSIONS" "$PUBLIC_TABLES")" && rc=0 || rc=$?
  case "$rc" in
    0) ;;
    10)
      say ""
      warn "$name has $PUBLIC_TABLES tables in public but no migration history."
      say  "A push now would rerun every migration — $(local_versions | wc -l | tr -d ' ') of them, including"
      say  "202609020028 and 202609020029, which delete rows."
      say  ""
      say  "Record what the project already holds first:  ${BOLD}make migrate-baseline${RST}"
      die  "Refused. Nothing was applied." ;;
    11)
      say ""
      warn "These files are missing from $name's history but are older than its newest applied migration:"
      printf '%s\n' "$plan" | sed -n 's/^OUT_OF_ORDER //p' | while read -r v; do say "    $(migration_file "$v")"; done
      say  ""
      say  "Either they were skipped, or applied by hand without the history. If the"
      say  "schema already holds them, mark them with ${BOLD}make migrate-baseline${RST}; if not,"
      say  "rename each to a version after the newest applied one."
      die  "Refused. Nothing was applied." ;;
    12)
      say ""
      warn "$name's history has migrations this checkout does not:"
      printf '%s\n' "$plan" | sed -n 's/^MISSING_LOCAL /    /p'
      say  ""
      say  "This branch is behind what $name holds. Merge or rebase onto origin/main first."
      die  "Refused. Nothing was applied." ;;
    *) die "Could not work out the plan (status $rc)." ;;
  esac

  pending="$(printf '%s\n' "$plan" | sed -n 's/^PENDING //p')"
  if [[ -z "$pending" ]]; then
    say ""
    ok "Nothing to apply — $name ($ref) already has every migration on disk."
    show_migration_list
    return 0
  fi
  say ""
  say "Pending on $name:"
  for v in $pending; do say "    ${BOLD}$(migration_file "$v")${RST}"; done
  pause

  local s=4
  if [[ "$env" == prod ]]; then
    step $s $total "Back up $name first"
    info "migrate-prod applies nothing without a complete, fresh backup. make backup"
    info "asks for the URI and password again: it is its own script."
    local marker; marker="$(mktemp)"
    # Expanded now, not when the trap fires: the trap runs at script exit,
    # after this function has returned and `marker` is out of scope, and
    # `set -u` would turn that into an "unbound variable" exit 1 after a
    # successful push.
    trap "rm -f $(printf '%q' "$marker")" EXIT
    if ! bash "$REPO_ROOT/scripts/backup.sh"; then
      die "The backup failed. Nothing was applied."
    fi
    local dir=""
    dir="$(find "$REPO_ROOT/backups" -maxdepth 1 -type d -name "$PROD_REF-*" -newer "$marker" 2>/dev/null | sort | tail -1)"
    [[ -n "$dir" ]] || die "No new backup of $PROD_REF in backups/ (a backup elsewhere, or of another project, does not count). Nothing was applied."
    [[ -s "$dir/SHA256SUMS" && -s "$dir/schema.sql" && -s "$dir/data.sql" ]] \
      || die "$dir is incomplete (no SHA256SUMS, schema.sql or data.sql). Nothing was applied."
    (cd "$dir" && shasum -a 256 --quiet -c SHA256SUMS >/dev/null 2>&1) \
      || die "$dir fails its own checksums. Nothing was applied."
    # backup.sh only warns about these two; a restore without them has no
    # auth.users triggers or bucket policies, or no uploaded files.
    [[ -s "$dir/platform_objects.sql" ]] \
      || die "$dir has an empty platform_objects.sql (auth triggers, storage and realtime policies). Nothing was applied."
    if [[ -z "$(find "$dir/storage" -type f 2>/dev/null | head -1)" ]]; then
      warn "$dir holds no Storage files. $name has uploaded videos and logos, so this"
      warn "backup could not restore them."
      confirm_typed "no storage" "Apply anyway, with a backup that lacks Storage?"
    fi
    ok "Backup verified: $dir"
    s=$((s + 1))
  fi

  step $s $total "Dry run, then confirm"
  info "What supabase db push would do (--dry-run applies nothing):"
  cli db push --dry-run --skip-vault || die "The dry run failed. Nothing was applied."
  say ""
  if [[ "$env" == prod ]]; then
    confirm_typed "migrate $name" "You are about to apply the migrations above to ${RED}${BOLD}PRODUCTION${RST} ($ref)."
  else
    confirm_typed "migrate $name" "You are about to apply the migrations above to $name ($ref)."
  fi
  s=$((s + 1))

  step $s $total "Apply"
  # --yes answers the CLI's own prompt: the typed confirmation above is the gate.
  # Never --include-all: an out-of-order file was refused in step 3.
  cli db push --skip-vault --yes || {
    warn "supabase db push failed. Each migration runs in its own transaction, so"
    warn "the ones listed as applied below went in; the failed one did not."
    show_migration_list
    die "Stopped."
  }
  ok "Applied to $name ($ref)."
  show_migration_list
}

# ---------------------------------------------------------------------------
# make migrate-baseline
# ---------------------------------------------------------------------------

run_baseline() {
  local total=4
  say ""
  say "${BOLD}Plannr — baseline the migration history${RST}"
  say "${DIM}Marks migrations the schema already holds as applied, without running their SQL.${RST}"
  say ""
  say "Use it once for a project migrated by hand in the SQL editor, and as the"
  say "last step of every ${BOLD}make restore${RST} (backups leave out supabase_migrations)."

  step 1 $total "Check the local tools"
  require_pg_tools
  require_supabase_cli
  pause

  step 2 $total "Connect to the project to baseline"
  info "Any project: $DEV_NAME, $PROD_NAME, or one you just restored into."
  connect ""
  local name="$PROJECT_REF"
  [[ "$PROJECT_REF" == "$DEV_REF" ]] && name="$DEV_NAME"
  [[ "$PROJECT_REF" == "$PROD_REF" ]] && name="$PROD_NAME"
  banner "$PROJECT_REF" "$name"
  pause

  step 3 $total "Choose what the schema already holds"
  read_remote_state
  local lv; lv="$(local_versions)"
  if (( PUBLIC_TABLES == 0 )); then
    die "public has no tables, so there is nothing to baseline. An empty project takes every migration: make migrate-dev / migrate-prod."
  fi
  local missing="" v
  for v in $REMOTE_VERSIONS; do in_list "$v" "$lv" || missing="$missing $v"; done
  [[ -z "$missing" ]] || die "The history has versions this checkout lacks:$missing. Update the branch first."

  say ""
  info "supabase migration list, before:"
  cli migration list || die "supabase migration list failed."

  # Default cutoff: the newest migration on origin/main. Merging deploys, and a
  # migration is applied before its PR merges, so everything there is in prod.
  local cutoff="" f
  for f in $(git -C "$REPO_ROOT" ls-tree --name-only origin/main site/supabase/migrations/ 2>/dev/null); do
    f="$(basename "$f")"
    [[ "$f" =~ ^([0-9]+)_.*\.sql$ ]] && cutoff="${BASH_REMATCH[1]}"
  done
  [[ -n "$cutoff" ]] || cutoff="$(printf '%s\n' "$lv" | tail -1)"
  say ""
  say "Every migration up to and including the cutoff is marked applied."
  say "Default: ${BOLD}$(migration_file "$cutoff")${RST} ${DIM}(newest on origin/main)${RST}"
  info "  After a restore, use the newest migration the backed-up project held."
  printf '%s' "Press Enter to accept, or type another version: "
  local reply; read -r reply </dev/tty || reply=""
  if [[ -n "$reply" ]]; then
    in_list "$reply" "$lv" || die "$reply is not the version of a file in site/supabase/migrations."
    cutoff="$reply"
  fi

  local candidates; candidates="$(baseline_candidates "$lv" "$REMOTE_VERSIONS" "$cutoff")"
  if [[ -z "$candidates" ]]; then
    ok "The history already has every migration up to $cutoff. Nothing to mark."
    return 0
  fi
  local count; count="$(printf '%s\n' "$candidates" | wc -l | tr -d ' ')"
  say ""
  say "These $count will be marked applied on $name, ${BOLD}without running them${RST}:"
  for v in $candidates; do say "    $(migration_file "$v")"; done
  say ""
  warn "Only mark what the schema really holds. A migration marked here but never"
  warn "run is skipped by every later push, and nothing will tell you."
  pause

  step 4 $total "Mark them applied"
  confirm_typed "baseline $name" "Record $count migrations as applied on $name ($PROJECT_REF)."
  # shellcheck disable=SC2086  # one argument per version, on purpose
  cli migration repair --status applied --yes $candidates \
    || die "supabase migration repair failed. Run make migrate-baseline again; it marks only what is still missing."
  ok "Marked $count migrations applied on $name."
  show_migration_list
}

# ---------------------------------------------------------------------------

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  case "${1:-}" in
    dev)      run_push dev ;;
    prod)     run_push prod ;;
    baseline) run_baseline ;;
    *) die "Usage: scripts/migrate.sh dev|prod|baseline  (run it through make migrate-*)" ;;
  esac
fi
