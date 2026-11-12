#!/usr/bin/env bash
# Store a project's database connection in the macOS Keychain, so make backup,
# restore and migrate-* stop asking for it. Run via `make keychain`.
#
# Two items per project, keyed by project ref:
#
#   plannr-db-uri   the Session pooler URI, with the password stripped out
#   plannr-db       the database password
#
# The password is typed into `security`'s own hidden prompt, so it is never on
# a command line, in `ps`, in a file or in shell history. The connection is
# tested before this says it is done; a password that does not work is removed.
#
# To forget a project:
#   security delete-generic-password -s plannr-db -a <ref>
#   security delete-generic-password -s plannr-db-uri -a <ref>

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

have_keychain || die "The macOS 'security' tool was not found. The Keychain is macOS-only; elsewhere the scripts ask for the URI and password."

TOTAL=4
say ""
say "${BOLD}Plannr — store a database connection in the Keychain${RST}"

status_line() {
  local ref="$1" uri="no URI" pw="no password"
  keychain_has "$KEYCHAIN_URI_SERVICE" "$ref" && uri="URI"
  keychain_has "$KEYCHAIN_PW_SERVICE" "$ref" && pw="password"
  printf '%s' "${DIM}stored: $uri, $pw${RST}"
}

# ---------------------------------------------------------------------------
step 1 $TOTAL "Check the local tools"
require_pg_tools

# ---------------------------------------------------------------------------
step 2 $TOTAL "Choose the project"
say "  1) planr-dev  ${DIM}($DEV_REF)${RST}   $(status_line "$DEV_REF")"
say "  2) grep-prod  ${DIM}($PROD_REF)${RST}   $(status_line "$PROD_REF")"
say "  3) another project ${DIM}(its ref is read from the URI)${RST}"
want=""
while :; do
  printf '%s' "Choose 1, 2 or 3: "
  read -r choice </dev/tty || die "No input."
  case "$choice" in
    1) want="$DEV_REF"; break ;;
    2) want="$PROD_REF"; break ;;
    3) want=""; break ;;
    *) warn "Type 1, 2 or 3." ;;
  esac
done

# ---------------------------------------------------------------------------
step 3 $TOTAL "Store the connection URI"
prompt_uri "store"
[[ -n "$PROJECT_REF" ]] || die "Could not tell which project that URI is for. Use the Session pooler URI (user postgres.<ref>)."
if [[ -n "$want" && "$PROJECT_REF" != "$want" ]]; then
  die "That URI is for $PROJECT_REF$(project_label "$PROJECT_REF"), not $want$(project_label "$want"). Nothing was stored."
fi
describe_connection
name="$(project_name "$PROJECT_REF")"
uri="$(connection_uri)"
security add-generic-password -U -s "$KEYCHAIN_URI_SERVICE" -a "$PROJECT_REF" \
  -l "Plannr $name — Session pooler URI" -w "$uri" \
  || die "Could not write to the Keychain."
ok "Stored $uri"
info "  (no password in it: that is the next item)"

# ---------------------------------------------------------------------------
step 4 $TOTAL "Store the database password"
if keychain_has "$KEYCHAIN_PW_SERVICE" "$PROJECT_REF"; then
  if confirm "A password for $name is already stored. Replace it?"; then
    security delete-generic-password -s "$KEYCHAIN_PW_SERVICE" -a "$PROJECT_REF" >/dev/null 2>&1 || true
  else
    info "Keeping the stored password."
  fi
fi
if ! keychain_has "$KEYCHAIN_PW_SERVICE" "$PROJECT_REF"; then
  say ""
  say "Paste ${BOLD}$name${RST}'s database password at the prompt, twice. Nothing is shown."
  info "  Dashboard → Project Settings → Database → Reset database password, if lost."
  say ""
  # -w last, with no value: security prompts for the password itself.
  security add-generic-password -s "$KEYCHAIN_PW_SERVICE" -a "$PROJECT_REF" \
    -l "Plannr $name — database password" -w </dev/tty \
    || die "Could not store the password (did the two entries differ?)."
fi

PGPASSWORD="$(keychain_get "$KEYCHAIN_PW_SERVICE" "$PROJECT_REF")" || die "Could not read the password back."
export_connection
say ""
info "Testing the connection…"
if version="$("$PG_BIN/psql" -tAX -c 'select version()' 2>&1)"; then
  ok "Connected — ${version%% on *}"
else
  security delete-generic-password -s "$KEYCHAIN_PW_SERVICE" -a "$PROJECT_REF" >/dev/null 2>&1 || true
  die "Could not connect, so the password was removed again:
$version

Check the password, or resume the project if it is paused, then run make keychain again."
fi

say ""
ok "${BOLD}$name${RST} is in the Keychain. make backup, restore and migrate-* will use it."
info "  macOS may ask once whether 'security' may read the item; choose Always Allow."
say ""
