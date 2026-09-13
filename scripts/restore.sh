#!/usr/bin/env bash
# Guided restore from a `make backup` folder. Run via `make restore`.
#
# This is the half of disaster recovery people never rehearse, so it is written
# to be run calmly at 22:00 on a Tuesday: every step says what it is about to
# do, and nothing touches the target database before Step 6.
#
# Restore into a FRESH, EMPTY Supabase project. Restoring over a live one is
# possible but is a different, riskier operation — the script will make you say
# so out loud.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

TOTAL=10
say ""
say "${BOLD}Plannr — restore${RST}"
say "${DIM}$TOTAL steps. Steps 1-5 only read; nothing is written until Step 6.${RST}"

# ---------------------------------------------------------------------------
step 1 $TOTAL "Check the local tools"
require_pg_tools
require_supabase_cli
pause

# ---------------------------------------------------------------------------
step 2 $TOTAL "Choose the backup to restore"
say ""
if [[ -d "$REPO_ROOT/backups" ]]; then
  say "Backups found in $REPO_ROOT/backups:"
  ls -1t "$REPO_ROOT/backups" 2>/dev/null | sed 's/^/  /' || true
else
  info "No backups/ folder here — you will need to give a full path."
fi
say ""
printf '%s' "Path to the backup folder: "
read -r SRC </dev/tty || die "No input."
SRC="${SRC/#\~/$HOME}"
[[ -d "$SRC" ]] || die "$SRC is not a directory."
for f in roles.sql schema.sql data.sql MANIFEST.txt; do  # platform_objects.sql checked at Step 6
  [[ -f "$SRC/$f" ]] || die "$SRC is missing $f — that is not a complete backup folder."
done

say ""
rule
cat "$SRC/MANIFEST.txt" | head -14
rule

if [[ -f "$SRC/SHA256SUMS" ]]; then
  info "Verifying checksums…"
  if (cd "$SRC" && shasum -a 256 --quiet -c SHA256SUMS >/dev/null 2>&1); then
    ok "All files intact."
  else
    warn "Checksum mismatch — this backup may be truncated or corrupted."
    confirm "Continue anyway?" || die "Stopped."
  fi
else
  warn "No SHA256SUMS in this backup; integrity not verified."
fi
pause

# ---------------------------------------------------------------------------
step 3 $TOTAL "Prepare the target project"
say ""
say "Restore into a ${BOLD}brand-new, empty${RST} Supabase project:"
say ""
say "  1. Dashboard → ${BOLD}New project${RST}"
say "  2. Region ${BOLD}Central EU (Frankfurt)${RST} or ${BOLD}North EU (Ireland)${RST}"
say "  3. Save the database password in your password manager — on the free tier"
say "     it is the only way to take the next backup."
say "  4. Wait until the project is ${BOLD}Active${RST}."
say ""
warn "Do NOT paste prod_bootstrap.sql into the new project first."
info "  schema.sql in this backup is the schema as production really was, which is"
info "  the stronger source. Applying both would fight each other — and the"
info "  bootstrap contains one-time cleanup migrations (202609020028 deletes every"
info "  unaccepted invitation, 202609020029 deletes never-signed-in auth users)"
info "  that would quietly delete rows you are trying to restore."
pause

# ---------------------------------------------------------------------------
step 4 $TOTAL "Connect to the TARGET database"
warn "Everything from here writes to whatever you point at."
prompt_connection "restore INTO"
test_connection

say ""
if [[ "$PROJECT_REF" == "$PROD_REF" ]]; then
  say "${RED}${BOLD}"
  say "  ╔══════════════════════════════════════════════════════════╗"
  say "  ║  THIS IS PRODUCTION (grep-prod / $PROD_REF)  ║"
  say "  ╚══════════════════════════════════════════════════════════╝"
  say "${RST}"
  say "Restoring over a live production database overwrites rows that coaches"
  say "may have written since this backup was taken. If production is merely"
  say "damaged rather than gone, stop and take a fresh backup of it first."
  say ""
  confirm_typed "OVERWRITE PRODUCTION" "You are about to write a $(basename "$SRC") backup over production."
else
  confirm_typed "${PROJECT_REF:-restore}" "Target: ${PROJECT_REF:-$PGHOST_V}"
fi

# ---------------------------------------------------------------------------
step 5 $TOTAL "Look at what is already in the target"
EXISTING="$("$PG_BIN/psql" -tAX -c "select count(*) from pg_tables where schemaname='public'" 2>/dev/null || echo "?")"
USERS="$("$PG_BIN/psql" -tAX -c "select count(*) from auth.users" 2>/dev/null || echo "?")"
say ""
info "  public tables  $EXISTING"
info "  auth.users     $USERS"
if [[ "$EXISTING" != "0" && "$EXISTING" != "?" ]]; then
  warn "The target is not empty. Restoring into it can collide on primary keys."
  say  "A clean project is strongly preferred. To empty this one instead, run this"
  say  "in the dashboard SQL editor and then come back:"
  say  ""
  say  "    ${BOLD}drop schema public cascade; create schema public;${RST}"
  say  "    ${BOLD}delete from auth.users;${RST}"
  say  ""
  confirm "Continue into this non-empty database?" || die "Stopped. Nothing was changed."
else
  ok "Target looks empty — good."
fi
pause

# ---------------------------------------------------------------------------
step 6 $TOTAL "Restore roles, then the schema"
info "Roles first: the grants in schema.sql refer to them."
"$PG_BIN/psql" --variable ON_ERROR_STOP=0 -q -f "$SRC/roles.sql" >/dev/null 2>&1 || true
ok "roles.sql applied (pre-existing roles are expected to be skipped)"

info "Now the schema — as one transaction, so a failure leaves nothing half-built."
if "$PG_BIN/psql" --single-transaction --variable ON_ERROR_STOP=1 -q -f "$SRC/schema.sql"; then
  ok "schema.sql applied"
else
  say ""
  warn "The schema failed to apply cleanly and was rolled back."
  say  "Most common cause: the target was not empty. Re-read the error above."
  die  "Stopped before touching data."
fi

# The triggers on auth.users and the policies on storage.objects /
# realtime.messages live in platform-owned schemas that schema.sql deliberately
# skips. Without them a coach's first sign-in creates no profile row and every
# upload is denied — so this is not optional.
if [[ -s "$SRC/platform_objects.sql" ]]; then
  if "$PG_BIN/psql" --single-transaction --variable ON_ERROR_STOP=1 -q -f "$SRC/platform_objects.sql"; then
    ok "platform_objects.sql applied (auth.users triggers, storage + realtime policies)"
  else
    warn "Platform objects failed to apply."
    say  "The app will restore but sign-in will not create profiles and uploads"
    say  "will be denied. Fix this before letting anyone in."
    confirm "Continue anyway?" || die "Stopped."
  fi
else
  warn "This backup has no platform_objects.sql."
  say  "It predates that file, or the dump could not read the catalog. You must"
  say  "re-apply the auth.users triggers and the storage/realtime policies by hand"
  say  "— they are in the migrations (202609020001, 202609020013, 202609020017,"
  say  "202609020026, 202609020030)."
  confirm "Continue anyway?" || die "Stopped."
fi
pause

# ---------------------------------------------------------------------------
step 7 $TOTAL "Restore the data"
info "data.sql sets session_replication_role = replica, so foreign keys and the"
info "app's own triggers stay out of the way — rows land exactly as they were."
if "$PG_BIN/psql" --single-transaction --variable ON_ERROR_STOP=1 -q -f "$SRC/data.sql"; then
  ok "data.sql applied"
else
  say ""
  warn "The data failed to load and was rolled back. The schema is still in place."
  die  "Stopped."
fi
pause

# ---------------------------------------------------------------------------
step 8 $TOTAL "Re-upload the Storage files"
info "data.sql restored the storage.objects rows, but the files themselves are"
info "blobs behind the Storage API. The rows are cleared and recreated by the"
info "upload, which is lossless here: both buckets' policies key off the path"
info "prefix (user id / team id), not the object owner."
if [[ -d "$SRC/storage" ]] && [[ -n "$(ls -A "$SRC/storage" 2>/dev/null)" ]]; then
  REF_FOR_STORAGE="$PROJECT_REF"
  if [[ -z "$REF_FOR_STORAGE" ]]; then
    printf '%s' "Project ref for Storage: "; read -r REF_FOR_STORAGE </dev/tty || true
  fi
  if [[ -z "$REF_FOR_STORAGE" ]]; then
    warn "No project ref — skipping. Files must be uploaded by hand."
  else
    "$PG_BIN/psql" -q -c "delete from storage.objects;" >/dev/null 2>&1 \
      || warn "Could not clear storage.objects; uploads may report duplicates."
    for dir in "$SRC"/storage/*/; do
      bucket="$(basename "$dir")"
      count="$(find "$dir" -type f | wc -l | tr -d ' ')"
      info "  uploading $bucket ($count files) …"
      (cd "$SITE_DIR" && supabase storage cp -r -j 4 --experimental \
         --project-ref "$REF_FOR_STORAGE" "$dir" "ss:///$bucket" >/dev/null 2>&1) \
        || warn "  $bucket upload reported errors — check with: supabase storage ls -r --experimental --project-ref $REF_FOR_STORAGE ss:///$bucket"
      ok "  $bucket done"
    done
  fi
else
  warn "This backup has no storage/ files. Images and videos will 404."
fi
pause

# ---------------------------------------------------------------------------
step 9 $TOTAL "Verify against the backup's own row counts"
if [[ -f "$SRC/inventory.txt" ]]; then
  "$PG_BIN/psql" -XAt -o /tmp/plannr-restore-inv.$$ <<'SQL' 2>/dev/null || true
select format('%s.%s = %s', n.nspname, c.relname,
         (xpath('/row/c/text()', query_to_xml(
            format('select count(*) as c from %I.%I', n.nspname, c.relname),
            false, true, '')))[1]::text)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and (n.nspname = 'public'
      or (n.nspname, c.relname) in (('auth','users'),('storage','objects'),('storage','buckets')))
order by n.nspname, c.relname;
SQL
  say ""
  if diff -u "$SRC/inventory.txt" /tmp/plannr-restore-inv.$$ > /tmp/plannr-inv-diff.$$ 2>&1; then
    ok "Every table matches the backup's row counts exactly."
  else
    warn "Row counts differ from the backup:"
    sed -n '3,40p' /tmp/plannr-inv-diff.$$ | sed 's/^/    /'
    info "  storage.objects may legitimately differ if any upload failed above."
  fi
  rm -f /tmp/plannr-restore-inv.$$ /tmp/plannr-inv-diff.$$
else
  info "No inventory.txt in this backup — skipping the count check."
  "$PG_BIN/psql" -XAt -c "select 'auth.users = ' || count(*) from auth.users" 2>/dev/null || true
fi
pause

# ---------------------------------------------------------------------------
step 10 $TOTAL "Everything the database cannot restore"
say ""
say "The data is back. These live outside Postgres and are now yours to redo:"
say ""
say "  ${BOLD}1. Point the app at the new project${RST}"
say "     Vercel → Settings → Environment Variables:"
say "       NEXT_PUBLIC_SUPABASE_URL              https://<ref>.supabase.co"
say "       NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (new project's publishable key)"
say "       SUPABASE_SECRET_KEY                   (new project's secret key)"
say "     RESEND_API_KEY, RESEND_FROM and CRON_SECRET carry over unchanged."
say "     ${DIM}Redeploy afterwards — env vars are read at build time.${RST}"
say ""
say "  ${BOLD}2. Auth settings${RST}  (config.toml holds these; it is not applied by a restore)"
say "     cd site && supabase config push --project-ref <new-ref>"
say "     Then check: Site URL https://grep.team, redirect allow-list, signup"
say "     disabled, and the magic-link template on the token-hash form."
say ""
say "  ${BOLD}3. Custom SMTP${RST} — Supabase's built-in sender only delivers to project"
say "     members, so invite and reset mail silently fails without it."
say ""
say "  ${BOLD}4. Passwords are preserved${RST} — auth.users carries the hashes, so every"
say "     coach signs in exactly as before. No re-invites needed."
say ""
say "  ${BOLD}5. Take a backup of the restored project${RST} once you are happy:"
say "     ${BOLD}make backup${RST}"
say ""
rule
say "${BOLD}${GRN}Restore complete.${RST}"
