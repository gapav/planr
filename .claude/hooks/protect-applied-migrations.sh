#!/bin/bash
# PreToolUse hook for Edit|Write (decision 3). Whether a migration may still
# change is read from git, not from a ledger:
#
#   on origin/main                     refuse: merging deploys, and a migration
#                                      is applied before its PR merges
#   committed on this branch only      ask: /release may already have applied
#                                      it to dev or prod before the merge
#   new, or not committed anywhere     pass
#
# What is applied where is in each project's supabase_migrations history
# (`supabase migration list`), which an agent cannot read. Edits made through
# Bash are not covered.
file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
  */site/supabase/migrations/*.sql) ;;
  *) exit 0 ;;
esac
[ -e "$file" ] || exit 0

name=$(basename "$file")
root="${file%/site/supabase/migrations/*}"
rel="site/supabase/migrations/$name"

ask() {
  jq -n --arg reason "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse",
    permissionDecision: "ask", permissionDecisionReason: $reason}}'
  exit 0
}

git -C "$root" rev-parse --git-dir >/dev/null 2>&1 \
  || ask "Cannot read git in $root, so whether $name has shipped is unknown. Edit it anyway?"

if ! git -C "$root" rev-parse --verify --quiet origin/main >/dev/null; then
  ask "There is no origin/main here, so whether $name has shipped is unknown. Edit it anyway?"
fi
if git -C "$root" cat-file -e "origin/main:$rel" 2>/dev/null; then
  echo "$name is on origin/main, so it is applied in production and immutable. Write a new forward migration instead." >&2
  exit 2
fi
if git -C "$root" cat-file -e "HEAD:$rel" 2>/dev/null; then
  ask "$name is committed on this branch, and /release may already have applied it to planr-dev or grep-prod. Check with \`supabase migration list\` before editing. Edit it anyway?"
fi
exit 0
