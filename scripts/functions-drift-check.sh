#!/usr/bin/env bash
# Compare Edge Functions in the repo against what's actually deployed on
# Supabase. Exits non-zero if there is drift in either direction.
#
# Used in CI and as a manual sanity check before declaring a phase done.
# A function existing in the repo but not deployed is the bug shape that
# bit D1: the code asserts that cron is running and it silently isn't.
#
# Usage:
#   scripts/functions-drift-check.sh          # human output
#   scripts/functions-drift-check.sh --quiet  # only output on drift

set -euo pipefail

PROJECT_REF="ioptgqtzykqwnebwkioo"
QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

# Functions in the repo
repo_fns=()
for d in supabase/functions/*/; do
  [ -f "${d}index.ts" ] && repo_fns+=("$(basename "$d")")
done
IFS=$'\n' repo_sorted=($(sort <<<"${repo_fns[*]}")); unset IFS

# Functions deployed (parse `supabase functions list` table output)
deployed_raw="$(supabase functions list --project-ref "$PROJECT_REF" 2>/dev/null)"
deployed_fns=($(echo "$deployed_raw" | awk -F'|' 'NR>2 && $3 ~ /^[[:space:]]*[a-z]/ { gsub(/^[ \t]+|[ \t]+$/,"",$3); print $3 }' | sort -u))
IFS=$'\n' deployed_sorted=($(sort <<<"${deployed_fns[*]}")); unset IFS

# Diff
missing_deploy=()
for fn in "${repo_sorted[@]}"; do
  if ! printf '%s\n' "${deployed_sorted[@]}" | grep -qx "$fn"; then
    missing_deploy+=("$fn")
  fi
done

extra_deploy=()
for fn in "${deployed_sorted[@]}"; do
  if ! printf '%s\n' "${repo_sorted[@]}" | grep -qx "$fn"; then
    extra_deploy+=("$fn")
  fi
done

if [ "${#missing_deploy[@]}" -eq 0 ] && [ "${#extra_deploy[@]}" -eq 0 ]; then
  [ "$QUIET" = 0 ] && echo "OK: ${#repo_sorted[@]} functions in repo, all deployed."
  exit 0
fi

echo "DRIFT DETECTED between supabase/functions/ and project ${PROJECT_REF}:" >&2
if [ "${#missing_deploy[@]}" -gt 0 ]; then
  echo "" >&2
  echo "  In repo but NOT deployed (run scripts/functions-deploy.sh to fix):" >&2
  printf "    - %s\n" "${missing_deploy[@]}" >&2
fi
if [ "${#extra_deploy[@]}" -gt 0 ]; then
  echo "" >&2
  echo "  Deployed but NOT in repo (orphans — review for deletion):" >&2
  printf "    - %s\n" "${extra_deploy[@]}" >&2
fi
exit 1
