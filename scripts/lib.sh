#!/usr/bin/env bash
# Shared helpers for the disaster-recovery scripts (scripts/backup.sh,
# scripts/restore.sh). Sourced, never run directly.
#
# Design rule: no secret is ever echoed, passed on a command line, or written
# to a file. The database password comes from the macOS Keychain (stored by
# `make keychain`) or is read with `read -rs`, into PGPASSWORD, which pg_dump
# and psql pick up from the environment, so it never appears in `ps` output,
# in the shell history, or in any file this script writes.

set -euo pipefail

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'
YEL=$'\033[33m'; BLU=$'\033[34m'; RST=$'\033[0m'

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_DIR="$REPO_ROOT/site"
MIGRATIONS_DIR="$SITE_DIR/supabase/migrations"

PROD_REF="fbbqdutatetfkybvlozx"
DEV_REF="hgjboxsgemvgrlyemudt"

say()  { printf '%s\n' "$*"; }
info() { printf '%s\n' "${DIM}$*${RST}"; }
ok()   { printf '%s %s\n' "${GRN}✓${RST}" "$*"; }
warn() { printf '%s %s\n' "${YEL}!${RST}" "$*"; }
die()  { printf '\n%s %s\n' "${RED}✗${RST}" "$*" >&2; exit 1; }

rule() { printf '%s\n' "${DIM}────────────────────────────────────────────────────────────${RST}"; }

# step <n> <total> <title> — prints a numbered heading and waits for the user.
# Set PLANNR_YES=1 to run without pauses (for a scripted/cron run).
step() {
  local n="$1" total="$2"; shift 2
  printf '\n%s\n' "${BOLD}${BLU}Step $n/$total — $*${RST}"
  rule
}

pause() {
  [[ "${PLANNR_YES:-0}" == "1" ]] && return 0
  printf '\n%s' "${DIM}Press Enter to continue, or Ctrl-C to stop… ${RST}"
  read -r _ </dev/tty || true
}

# confirm <prompt> — yes/no, defaults to no.
confirm() {
  [[ "${PLANNR_YES:-0}" == "1" ]] && return 0
  local reply
  printf '%s' "$1 ${DIM}[y/N]${RST} "
  read -r reply </dev/tty || reply=""
  [[ "$reply" == "y" || "$reply" == "Y" ]]
}

# confirm_typed <expected> <prompt> — requires typing an exact phrase.
# Used before anything that writes to a database.
confirm_typed() {
  local expected="$1" prompt="$2" reply
  printf '%s\n' "$prompt"
  printf '%s' "Type ${BOLD}$expected${RST} to proceed: "
  read -r reply </dev/tty || reply=""
  [[ "$reply" == "$expected" ]] || die "Got \"$reply\", expected \"$expected\". Nothing was changed."
}

# storage_bucket_names — read `supabase storage ls` on stdin, print one bucket
# per line. The CLI prints plain lines (`exercise-videos/`) in a terminal and
# JSON (`{"paths":["exercise-videos/"]}`) when it thinks an agent runs it, so
# take every name that ends in a slash and ignore the quoting.
storage_bucket_names() {
  grep -oE '[A-Za-z0-9._-]+/' | tr -d '/'
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

# Supabase's direct database host (db.<ref>.supabase.co) is IPv6-only, and the
# CLI's own `supabase db dump` shells out to pg_dump inside Docker. Neither is
# a given on a laptop, so these scripts use a local pg_dump over the IPv4
# session pooler instead, and check for it up front.
PG_BIN=""

find_pg_bin() {
  local candidate
  for candidate in \
    "$(command -v pg_dump 2>/dev/null || true)" \
    /usr/local/opt/postgresql@17/bin/pg_dump \
    /opt/homebrew/opt/postgresql@17/bin/pg_dump \
    /usr/local/opt/libpq/bin/pg_dump \
    /opt/homebrew/opt/libpq/bin/pg_dump \
    /Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump
  do
    [[ -n "$candidate" && -x "$candidate" ]] && { PG_BIN="$(dirname "$candidate")"; return 0; }
  done
  return 1
}

require_pg_tools() {
  if ! find_pg_bin; then
    say ""
    warn "pg_dump / psql were not found on this machine."
    say ""
    say "The Postgres client tools are the one prerequisite. Install them with:"
    say ""
    say "    ${BOLD}brew install postgresql@17${RST}"
    say ""
    say "That matches the server (Postgres 17.6) and is keg-only, so it will not"
    say "shadow anything. These scripts find it automatically afterwards — you do"
    say "not need to add it to PATH."
    say ""
    die "Install the client tools, then run this again."
  fi

  local client_major server_note
  client_major="$("$PG_BIN/pg_dump" --version | sed -E 's/.* ([0-9]+).*/\1/')"
  ok "pg_dump $("$PG_BIN/pg_dump" --version | awk '{print $3}') — $PG_BIN"

  if (( client_major < 17 )); then
    server_note="The production server runs Postgres 17.6."
    die "pg_dump is major version $client_major, too old to dump it. $server_note Run: brew install postgresql@17"
  fi
  [[ -x "$PG_BIN/psql" ]] || die "Found pg_dump but not psql in $PG_BIN."
}

require_supabase_cli() {
  command -v supabase >/dev/null 2>&1 \
    || die "The Supabase CLI is needed for Storage files. Install it with: brew install supabase/tap/supabase"
  ok "supabase CLI $(supabase --version 2>/dev/null | head -1)"
}

# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------

PGHOST_V="" PGPORT_V="" PGUSER_V="" PGDATABASE_V="" PROJECT_REF=""

# The macOS Keychain holds two items per project, both keyed by project ref
# (the account) and both written only by `make keychain`:
#
#   plannr-db-uri   the Session pooler URI, with no password in it
#   plannr-db       the database password
#
# The password goes from `security`'s stdout straight into PGPASSWORD; it is
# never on a command line or in a file. Without an item the scripts ask, as
# they always have.
KEYCHAIN_URI_SERVICE="plannr-db-uri"
KEYCHAIN_PW_SERVICE="plannr-db"

have_keychain() { command -v security >/dev/null 2>&1; }

# keychain_get <service> <ref> — print the secret, or fail quietly.
keychain_get() {
  have_keychain || return 1
  security find-generic-password -s "$1" -a "$2" -w 2>/dev/null
}

# keychain_has <service> <ref> — true if the item exists. Reads no secret.
keychain_has() {
  have_keychain || return 1
  security find-generic-password -s "$1" -a "$2" >/dev/null 2>&1
}

project_name() {
  case "$1" in
    "$PROD_REF") printf '%s' "grep-prod" ;;
    "$DEV_REF")  printf '%s' "planr-dev" ;;
    *) printf '%s' "$1" ;;
  esac
}

# parse_connection_uri <uri> — fill PG*_V and PROJECT_REF. Fails on garbage.
# Any password in the URI is ignored; the password always comes separately.
parse_connection_uri() {
  local raw="$1" body userinfo hostpart
  raw="${raw%%\?*}"                 # drop ?sslmode=… etc
  raw="$(printf '%s' "$raw" | tr -d '[:space:]')"
  [[ "$raw" == postgresql://* || "$raw" == postgres://* ]] || return 1

  # Split on the LAST "@": a pasted real password may itself contain one,
  # and splitting on the first would take part of it as the hostname.
  body="${raw#*://}"
  userinfo="${body%@*}"
  hostpart="${body##*@}"
  PGUSER_V="${userinfo%%:*}"
  PGDATABASE_V="${hostpart#*/}"
  [[ "$PGDATABASE_V" == "$hostpart" ]] && PGDATABASE_V=""
  hostpart="${hostpart%%/*}"
  PGHOST_V="${hostpart%%:*}"
  PGPORT_V="${hostpart##*:}"
  [[ "$PGPORT_V" == "$PGHOST_V" ]] && PGPORT_V=5432
  [[ -n "$PGHOST_V" && -n "$PGUSER_V" && "$body" == *@* ]] || return 1
  [[ -z "$PGDATABASE_V" ]] && PGDATABASE_V=postgres

  # postgres.<ref> on the pooler, or db.<ref>.supabase.co direct.
  if [[ "$PGUSER_V" == postgres.* ]]; then PROJECT_REF="${PGUSER_V#postgres.}"
  elif [[ "$PGHOST_V" =~ ^db\.([a-z0-9]+)\.supabase\.co$ ]]; then PROJECT_REF="${BASH_REMATCH[1]}"
  else PROJECT_REF=""; fi
  return 0
}

# The parsed connection as a URI without the password — what the Keychain holds.
connection_uri() {
  printf 'postgresql://%s@%s:%s/%s' "$PGUSER_V" "$PGHOST_V" "$PGPORT_V" "$PGDATABASE_V"
}

# prompt_uri <purpose> — ask for the dashboard's Session pooler URI.
prompt_uri() {
  local purpose="$1" raw
  say ""
  say "Open the Supabase dashboard for the project you want to ${BOLD}$purpose${RST}:"
  say ""
  say "  ${DIM}Dashboard → your project → ${BOLD}Connect${RST}${DIM} (top bar) → ${BOLD}Session pooler${RST}"
  say ""
  say "Copy the URI exactly as shown — it still contains the literal"
  say "${DIM}[YOUR-PASSWORD]${RST} placeholder, and that is fine; you will be asked for the"
  say "password separately so it never lands in your shell history."
  say ""
  warn "Use ${BOLD}Session pooler${RST} (port 5432), not Transaction pooler (6543)."
  info "  Transaction pooling cannot run pg_dump, and the Direct connection host is"
  info "  IPv6-only — this machine has no IPv6 route, so it will simply hang."
  say ""

  while :; do
    printf '%s' "Connection URI: "
    read -r raw </dev/tty || die "No input."
    parse_connection_uri "$raw" && break
    warn "That does not look like a postgres:// URI with a user and host. Try again."
  done
}

describe_connection() {
  say ""
  info "  host     $PGHOST_V"
  info "  port     $PGPORT_V"
  info "  user     $PGUSER_V"
  info "  database $PGDATABASE_V"
  [[ -n "$PROJECT_REF" ]] && info "  project  $PROJECT_REF$(project_label "$PROJECT_REF")"

  if [[ "$PGPORT_V" == "6543" ]]; then
    warn "Port 6543 is the transaction pooler; pg_dump will fail against it."
    confirm "Continue anyway?" || die "Stopped. Fetch the Session pooler URI instead."
  fi
  if [[ "$PGHOST_V" == db.*.supabase.co ]]; then
    warn "That is the IPv6-only direct host and this machine has no IPv6 route."
    confirm "Continue anyway?" || die "Stopped. Use the Session pooler URI instead."
  fi
}

export_connection() {
  export PGPASSWORD PGHOST="$PGHOST_V" PGPORT="$PGPORT_V" PGUSER="$PGUSER_V" PGDATABASE="$PGDATABASE_V"
  export PGSSLMODE="${PGSSLMODE:-require}"
}

# Password: from the Keychain if it holds one for this project, else asked.
obtain_password() {
  local pw=""
  if [[ -n "$PROJECT_REF" ]] && pw="$(keychain_get "$KEYCHAIN_PW_SERVICE" "$PROJECT_REF")" && [[ -n "$pw" ]]; then
    PGPASSWORD="$pw"
    ok "Password from the macOS Keychain ($KEYCHAIN_PW_SERVICE / $PROJECT_REF)"
    return 0
  fi
  say ""
  printf '%s' "Database password (input hidden): "
  read -rs PGPASSWORD </dev/tty || die "No input."
  printf '\n'
  [[ -n "$PGPASSWORD" ]] || die "Empty password."
}

# connect_ref <ref> <purpose> — connect to a known project: URI from the
# Keychain, or pasted (and refused if it is another project's).
connect_ref() {
  local ref="$1" purpose="$2" uri=""
  if uri="$(keychain_get "$KEYCHAIN_URI_SERVICE" "$ref")" && [[ -n "$uri" ]] && parse_connection_uri "$uri"; then
    ok "Connection URI from the macOS Keychain ($KEYCHAIN_URI_SERVICE / $ref)"
  else
    info "No URI for $(project_name "$ref") in the Keychain (${BOLD}make keychain${RST}${DIM} stores one)."
    prompt_uri "$purpose"
  fi
  if [[ "$PROJECT_REF" != "$ref" ]]; then
    die "That URI is for ${PROJECT_REF:-an unknown project}$(project_label "$PROJECT_REF"), not $ref$(project_label "$ref"). Nothing was changed."
  fi
  describe_connection
  obtain_password
  export_connection
}

# prompt_connection <purpose> — choose the project, then connect to it.
#
# PLANNR_PROJECT=dev|prod|<ref> skips the question. PLANNR_REUSE_CONNECTION=1
# takes the connection already in PGHOST/PGUSER/PGPASSWORD: migrate-prod sets
# it when it runs make backup, so the backup does not ask a second time.
prompt_connection() {
  local purpose="$1" choice="${PLANNR_PROJECT:-}"

  if [[ "${PLANNR_REUSE_CONNECTION:-0}" == "1" && -n "${PGHOST:-}" && -n "${PGUSER:-}" && -n "${PGPASSWORD:-}" ]]; then
    PGHOST_V="$PGHOST" PGPORT_V="${PGPORT:-5432}" PGUSER_V="$PGUSER" PGDATABASE_V="${PGDATABASE:-postgres}"
    parse_connection_uri "$(connection_uri)" || die "Could not reuse the connection."
    ok "Reusing the connection to $(project_name "$PROJECT_REF") from the calling script"
    describe_connection
    export_connection
    return 0
  fi

  if [[ -z "$choice" ]]; then
    say ""
    say "Which project do you want to ${BOLD}$purpose${RST}?"
    say "  1) planr-dev  ${DIM}($DEV_REF)${RST}"
    say "  2) grep-prod  ${DIM}($PROD_REF)${RST} ${RED}PRODUCTION${RST}"
    say "  3) another project ${DIM}(paste its URI)${RST}"
    while :; do
      printf '%s' "Choose 1, 2 or 3: "
      read -r choice </dev/tty || die "No input."
      case "$choice" in 1|2|3) break ;; *) warn "Type 1, 2 or 3." ;; esac
    done
  fi

  case "$choice" in
    1|dev|"$DEV_REF")   connect_ref "$DEV_REF" "$purpose" ;;
    2|prod|"$PROD_REF") connect_ref "$PROD_REF" "$purpose" ;;
    3|other)
      prompt_uri "$purpose"
      describe_connection
      obtain_password
      export_connection ;;
    *) connect_ref "$choice" "$purpose" ;;
  esac
}

project_label() {
  case "$1" in
    "$PROD_REF") printf ' %s' "${RED}(PRODUCTION — grep-prod)${RST}" ;;
    "$DEV_REF")  printf ' %s' "${DIM}(development — planr-dev)${RST}" ;;
    *) : ;;
  esac
}

test_connection() {
  say ""
  info "Testing the connection…"
  local version
  version="$("$PG_BIN/psql" -tAX -c 'select version()' 2>&1)" \
    || die "Could not connect:
$version

Common causes: wrong password; using the Direct (IPv6) host; or the project is
paused — open the dashboard and resume it, then try again."
  ok "Connected — ${version%% on *}"
}

# The schema/data exclusion lists below are the ones `supabase db dump` uses
# (read off `supabase db dump --dry-run`), so these scripts produce the same
# shape the Supabase CLI would — minus the Docker requirement.
#
# Passed as one --exclude-schema flag per name rather than the CLI's single
# pipe-alternated pattern. pg_dump patterns are only loosely regex-like, and if
# the alternation were ever not honored the pattern would match nothing, the
# platform schemas would be dumped, and schema.sql would fail on restore while
# looking perfectly fine on disk. One flag per name cannot fail that way.
SUPA_SCHEMA_EXCLUDE=(
  information_schema 'pg_*' _analytics _realtime _supavisor auth etl extensions
  pgbouncer realtime storage supabase_functions supabase_migrations cron dbdev
  graphql graphql_public net pgmq pgsodium pgsodium_masks pgtle repack tiger
  tiger_data 'timescaledb_*' '_timescaledb_*' topology vault
)

SUPA_DATA_EXCLUDE=(
  information_schema 'pg_*' graphql graphql_public pgsodium pgsodium_masks
  pgtle repack tiger tiger_data 'timescaledb_*' '_timescaledb_*' topology vault
  etl extensions pgbouncer realtime supabase_migrations _analytics _realtime
  _supavisor
)

# Note: macOS ships bash 3.2, so everything here stays 3.2-compatible —
# no namerefs, no associative arrays, no ${var,,}.
