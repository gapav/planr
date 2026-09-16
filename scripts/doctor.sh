#!/usr/bin/env bash
# Checks this machine can actually take and restore a backup — before the day
# it matters. Read-only; touches no database and needs no password.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

FAIL=0
say ""
say "${BOLD}Plannr — disaster-recovery preflight${RST}"
rule

# 1. Postgres client -------------------------------------------------------
if find_pg_bin; then
  v="$("$PG_BIN/pg_dump" --version | awk '{print $3}')"
  major="${v%%.*}"
  if (( major >= 17 )); then ok "pg_dump $v  ($PG_BIN)"
  else warn "pg_dump $v is older than the server (17.6) and cannot dump it."; FAIL=1; fi
  [[ -x "$PG_BIN/psql" ]] && ok "psql present" || { warn "psql missing"; FAIL=1; }
else
  warn "pg_dump not found  →  brew install postgresql@17"
  FAIL=1
fi

# 2. Supabase CLI ----------------------------------------------------------
if command -v supabase >/dev/null 2>&1; then
  ok "supabase CLI $(supabase --version 2>/dev/null | head -1)"
  if supabase projects list >/dev/null 2>&1; then ok "supabase CLI is logged in"
  else warn "supabase CLI not logged in  →  supabase login (needed for Storage files)"; FAIL=1; fi
else
  warn "supabase CLI not found  →  brew install supabase/tap/supabase"
  FAIL=1
fi

# 3. Network path ----------------------------------------------------------
# The direct host db.<ref>.supabase.co is IPv6-only. If there is no IPv6 route
# the only way in is the IPv4 session pooler, so it is worth knowing which
# world you are in before a crisis.
if curl -s -6 -m 5 -o /dev/null https://ipv6.google.com 2>/dev/null; then
  ok "IPv6 works — the Direct connection host is reachable"
else
  info "No IPv6 route on this network."
  info "  → use the ${BOLD}Session pooler${RST}${DIM} URI (port 5432). Both scripts ask for it by name."
fi

# 4. Repo state ------------------------------------------------------------
count=$(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l | tr -d ' ')
ok "$count migrations in site/supabase/migrations"
if [[ -f "$SITE_DIR/supabase/prod_bootstrap.sql" ]]; then
  if (cd "$SITE_DIR" && npx vitest run scripts/build-bootstrap.test.ts >/dev/null 2>&1); then
    ok "prod_bootstrap.sql is in sync with the migrations"
  else
    warn "prod_bootstrap.sql has drifted  →  make bootstrap"
    FAIL=1
  fi
else
  warn "prod_bootstrap.sql missing  →  make bootstrap"; FAIL=1
fi

# Two migration files sharing a version makes "which ran first" unanswerable
# from the filenames, and blocks ever adopting `supabase db push`. The one pair
# this repo had was renamed apart; this catches the next one.
dupes=$(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | xargs -n1 basename \
        | sed -E 's/^([0-9]+)_.*/\1/' | sort | uniq -d)
[[ -n "$dupes" ]] && info "Note: duplicate migration version(s): $(echo $dupes | tr '\n' ' ')"

# 5. Existing backups ------------------------------------------------------
if [[ -d "$REPO_ROOT/backups" ]] && [[ -n "$(ls -A "$REPO_ROOT/backups" 2>/dev/null)" ]]; then
  latest="$(ls -1t "$REPO_ROOT/backups" | head -1)"
  ok "Most recent local backup: $latest"
  age_days=$(( ( $(date +%s) - $(stat -f %m "$REPO_ROOT/backups/$latest") ) / 86400 ))
  (( age_days > 31 )) && warn "  …that is $age_days days old. Take a fresh one."
else
  warn "No backups yet  →  make backup"
  FAIL=1
fi

rule
if (( FAIL )); then
  say "${YEL}Some checks need attention — see above.${RST}"
else
  say "${GRN}${BOLD}Ready.${RST} This machine can take and restore a backup."
fi
say ""
exit 0
