#!/usr/bin/env bash
# Guided production backup. Run via `make backup`.
#
# Produces a self-contained, dated folder holding everything needed to rebuild
# the project from nothing:
#
#   roles.sql             cluster roles                   (pg_dumpall --roles-only)
#   schema.sql            the live schema as it really is (pg_dump --schema-only)
#   platform_objects.sql  triggers + policies this app attaches to auth,
#                         storage and realtime, which a schema dump skips
#   data.sql              every row, incl. auth.users      (pg_dump --data-only)
#   storage/              the actual files in the buckets  (Storage API)
#   inventory.txt         row counts, to verify a restore against
#   MANIFEST.txt          what was taken, from where, with which tools
#   SHA256SUMS            integrity check
#
# Why each is separate: pg_dump cannot see Storage blobs; a schema-only dump
# omits auth.users; and a schema dump excludes the platform-owned schemas
# entirely, taking this app's auth.users triggers and bucket policies with it.
# A backup missing any one of those does not restore a working app.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

TOTAL=8
say ""
say "${BOLD}Plannr — production backup${RST}"
say "${DIM}Walks through $TOTAL steps. Nothing is written to the database; this only reads.${RST}"

# ---------------------------------------------------------------------------
step 1 $TOTAL "Check the local tools"
require_pg_tools
require_supabase_cli
pause

# ---------------------------------------------------------------------------
step 2 $TOTAL "Connect to the database you want to back up"
prompt_connection "back up"
test_connection
pause

# ---------------------------------------------------------------------------
step 3 $TOTAL "Choose where the backup goes"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEFAULT_DIR="$REPO_ROOT/backups/${PROJECT_REF:-db}-$STAMP"
say ""
say "Default location:"
say "  ${BOLD}$DEFAULT_DIR${RST}"
info "  (backups/ is gitignored — nothing here will ever be committed)"
say ""
printf '%s' "Press Enter to accept, or type another path: "
if [[ "${PLANNR_YES:-0}" == "1" ]]; then REPLY_DIR=""; else read -r REPLY_DIR </dev/tty || REPLY_DIR=""; fi
OUT="${REPLY_DIR:-$DEFAULT_DIR}"
mkdir -p "$OUT/storage"
chmod 700 "$OUT"
ok "Writing to $OUT"
warn "This folder will contain personal data (coach emails, auth identities). Keep it private."

# ---------------------------------------------------------------------------
step 4 $TOTAL "Dump the cluster roles"
info "Small, but a restore needs the roles to exist before the grants in schema.sql run."
"$PG_BIN/pg_dumpall" --roles-only --no-role-passwords 2>/dev/null \
  | sed -E '/^(CREATE|ALTER) ROLE "?(supabase_admin|supabase_auth_admin|supabase_storage_admin|supabase_replication_admin|supabase_read_only_user|dashboard_user|pgbouncer|authenticator|pgsodium_keyholder|pgsodium_keyiduser|pgtle_admin)"?/ s/^/-- /' \
  > "$OUT/roles.sql" || warn "pg_dumpall could not read the role catalog (not fatal — a Supabase target already has every role it needs)."
ok "roles.sql ($(wc -l < "$OUT/roles.sql" | tr -d ' ') lines)"
info "Platform-owned roles are commented out — the target project already has them."
pause

# ---------------------------------------------------------------------------
step 5 $TOTAL "Dump the schema"
info "This is the ground truth: the schema as production actually is, not as the"
info "migrations claim it should be. Diff it against prod_bootstrap.sql to catch drift."
# Appended by index: bash 3.2 (what macOS ships) errors on "${ARR[@]}" for an
# empty array while `set -u` is on.
SCHEMA_FLAGS=()
for n in "${SUPA_SCHEMA_EXCLUDE[@]}"; do
  SCHEMA_FLAGS[${#SCHEMA_FLAGS[@]}]=--exclude-schema
  SCHEMA_FLAGS[${#SCHEMA_FLAGS[@]}]="$n"
done
"$PG_BIN/pg_dump" --schema-only --quote-all-identifier "${SCHEMA_FLAGS[@]}" \
  | sed -E 's/^\\(un)?restrict .*$/-- &/' \
  | sed -E 's/^CREATE SCHEMA "/CREATE SCHEMA IF NOT EXISTS "/' \
  | sed -E 's/^CREATE TABLE "/CREATE TABLE IF NOT EXISTS "/' \
  | sed -E 's/^CREATE SEQUENCE "/CREATE SEQUENCE IF NOT EXISTS "/' \
  | sed -E 's/^CREATE VIEW "/CREATE OR REPLACE VIEW "/' \
  | sed -E 's/^CREATE FUNCTION "/CREATE OR REPLACE FUNCTION "/' \
  | sed -E 's/^CREATE PUBLICATION "supabase_realtime/-- &/' \
  | sed -E 's/^CREATE EVENT TRIGGER /-- &/' \
  | sed -E 's/^ALTER EVENT TRIGGER /-- &/' \
  | sed -E 's/^ALTER PUBLICATION "supabase_realtime/-- &/' \
  | sed -E 's/^ALTER FOREIGN DATA WRAPPER (.+) OWNER TO /-- &/' \
  | sed -E 's/^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"/-- &/' \
  | sed -E 's/^COMMENT ON EXTENSION (.+)/-- &/' \
  | sed -E 's/^SET transaction_timeout = 0;/-- &/' \
  > "$OUT/schema.sql" || die "Schema dump failed."
[[ -s "$OUT/schema.sql" ]] || die "schema.sql came out empty."
ok "schema.sql ($(du -h "$OUT/schema.sql" | cut -f1 | tr -d ' '))"

# The schema dump excludes the platform-owned schemas (auth, storage, realtime)
# because Supabase manages them — but this app attaches its OWN objects to
# tables inside them, and those would be lost silently:
#
#   auth.users        3 triggers: profile creation, forced-password-change
#                     clearing, and the account-deletion guard
#   storage.objects   the upload/delete policies for both buckets
#   realtime.messages the policies gating the private session: topics
#
# Restore without these and the app looks fine until a coach signs in for the
# first time (no profile row), uploads a video (denied), or opens a session
# with someone else (no realtime). Reconstructed from the catalog so this
# stays correct no matter what the migrations do later.
info "Capturing app-owned objects attached to auth / storage / realtime…"
"$PG_BIN/psql" -XAt -o "$OUT/platform_objects.sql" <<'SQL' 2>/dev/null || warn "Could not capture platform objects."
select '-- Triggers and policies this app attaches to platform-owned schemas.'
       || E'\n-- Apply AFTER schema.sql: these depend on functions in public.\n';
select format(E'drop trigger if exists %I on %s;\n%s;\n', t.tgname, c.oid::regclass, pg_get_triggerdef(t.oid))
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and n.nspname in ('auth','storage','realtime')
order by n.nspname, c.relname, t.tgname;
select format(E'drop policy if exists %I on %I.%I;\ncreate policy %I on %I.%I as %s for %s to %s%s%s;\n',
         policyname, schemaname, tablename,
         policyname, schemaname, tablename,
         lower(permissive), cmd, array_to_string(roles, ', '),
         case when qual       is not null then E'\n  using (' || qual || ')' else '' end,
         case when with_check is not null then E'\n  with check (' || with_check || ')' else '' end)
from pg_policies
where schemaname in ('storage','realtime')
order by schemaname, tablename, policyname;
SQL
if [[ -s "$OUT/platform_objects.sql" ]]; then
  ok "platform_objects.sql ($(grep -ci '^create ' "$OUT/platform_objects.sql" | tr -d ' ') objects)"
else
  warn "platform_objects.sql is empty — a restore would lose the auth.users triggers"
  warn "and the storage/realtime policies. Check the connection role's catalog access."
fi
pause

# ---------------------------------------------------------------------------
step 6 $TOTAL "Dump the data"
info "Includes auth.users and storage.objects — without those a restore has no"
info "coach accounts and no idea which files belonged to which exercise."
DATA_FLAGS=()
for n in "${SUPA_DATA_EXCLUDE[@]}"; do
  DATA_FLAGS[${#DATA_FLAGS[@]}]=--exclude-schema
  DATA_FLAGS[${#DATA_FLAGS[@]}]="$n"
done
{
  printf 'SET session_replication_role = replica;\n\n'
  "$PG_BIN/pg_dump" --data-only --quote-all-identifier "${DATA_FLAGS[@]}" \
    --exclude-table "auth.schema_migrations" \
    --exclude-table "storage.migrations" \
    --exclude-table "supabase_functions.migrations" \
    --schema '*' \
    | sed -E 's/^\\(un)?restrict .*$/-- &/'
  printf '\nRESET ALL;\n'
} > "$OUT/data.sql" || die "Data dump failed."
ok "data.sql ($(du -h "$OUT/data.sql" | cut -f1 | tr -d ' '))"

info "Recording row counts so a restore can be checked against them…"
"$PG_BIN/psql" -XAt -o "$OUT/inventory.txt" <<'SQL' 2>/dev/null || warn "Could not build inventory.txt (not fatal)."
select format('%s.%s = %s', n.nspname, c.relname,
         (xpath('/row/c/text()', query_to_xml(
            format('select count(*) as c from %I.%I', n.nspname, c.relname),
            false, true, '')))[1]::text)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and (n.nspname = 'public'
      or (n.nspname, c.relname) in (('auth','users'),('storage','objects'),('storage','buckets')))
order by n.nspname, c.relname;
SQL
[[ -s "$OUT/inventory.txt" ]] && ok "inventory.txt ($(wc -l < "$OUT/inventory.txt" | tr -d ' ') tables)"
pause

# ---------------------------------------------------------------------------
step 7 $TOTAL "Download the Storage files"
info "pg_dump never sees these — they are blobs behind the Storage API, not rows."
REF_FOR_STORAGE="$PROJECT_REF"
if [[ -z "$REF_FOR_STORAGE" ]]; then
  printf '%s' "Could not infer the project ref. Enter it (e.g. $PROD_REF): "
  read -r REF_FOR_STORAGE </dev/tty || true
fi

if [[ -z "$REF_FOR_STORAGE" ]]; then
  warn "No project ref — skipping Storage. The backup will be incomplete."
else
  if ! supabase projects list >/dev/null 2>&1; then
    warn "The Supabase CLI is not logged in."
    say  "Run ${BOLD}supabase login${RST} in another terminal, then come back."
    pause
  fi
  BUCKETS="$(cd "$SITE_DIR" && supabase storage ls --experimental --project-ref "$REF_FOR_STORAGE" 2>/dev/null \
    | grep -o '"[^"]*/"' | tr -d '"/' || true)"
  if [[ -z "$BUCKETS" ]]; then
    warn "No buckets listed. Check the CLI login, then re-run this step by hand:"
    say  "  cd site && supabase storage ls --experimental --project-ref $REF_FOR_STORAGE"
  else
    for bucket in $BUCKETS; do
      info "  downloading $bucket …"
      (cd "$SITE_DIR" && supabase storage cp -r --experimental --project-ref "$REF_FOR_STORAGE" \
        "ss:///$bucket" "$OUT/storage/$bucket" >/dev/null 2>&1) \
        || warn "  $bucket failed — re-run this step by hand before trusting the backup."
      ok "  $bucket — $(find "$OUT/storage/$bucket" -type f 2>/dev/null | wc -l | tr -d ' ') files"
    done
  fi
fi
pause

# ---------------------------------------------------------------------------
step 8 $TOTAL "Write the manifest and verify"
{
  echo "Plannr backup"
  echo "taken_at_utc   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "project_ref    ${PROJECT_REF:-unknown}"
  echo "host           $PGHOST_V:$PGPORT_V"
  echo "database       $PGDATABASE_V"
  echo "server         $("$PG_BIN/psql" -tAX -c 'show server_version' 2>/dev/null || echo unknown)"
  echo "pg_dump        $("$PG_BIN/pg_dump" --version | awk '{print $3}')"
  echo "taken_by       $(whoami)@$(hostname -s)"
  echo "repo_commit    $(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "repo_dirty     $(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ') files"
  echo "migrations     $(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l | tr -d ' ') files"
  echo "bootstrap_sha  $(shasum -a 256 "$SITE_DIR/supabase/prod_bootstrap.sql" 2>/dev/null | cut -d' ' -f1)"
  echo ""
  echo "migration files at time of backup:"
  ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | xargs -n1 basename | sed 's/^/  /'
} > "$OUT/MANIFEST.txt"

(cd "$OUT" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS)
ok "MANIFEST.txt and SHA256SUMS written"

say ""
rule
say "${BOLD}${GRN}Backup complete.${RST}  $OUT"
say ""
(cd "$OUT" && du -sh . | sed 's/^/  total  /')
(cd "$OUT" && ls -1 && echo)
rule
say ""
say "${BOLD}Two things left, and they are the ones people skip:${RST}"
say ""
say "  1. ${BOLD}Move a copy off this laptop.${RST} A backup on the only disk you own is"
say "     not a backup. Encrypted cloud folder, external drive — anywhere else."
say ""
say "  2. ${BOLD}Verify it restores${RST}, once, into a scratch Supabase project:"
say "     ${BOLD}make restore${RST}  → point it at a throwaway project, not production."
say "     An unverified backup is a guess."
say ""
info "Row counts to check a restore against are in inventory.txt."
