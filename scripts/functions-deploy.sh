#!/usr/bin/env bash
# Deploy every Edge Function present in supabase/functions/ to the linked
# Supabase project.
#
# Usage:
#   scripts/functions-deploy.sh                 # deploy all
#   scripts/functions-deploy.sh <name> [<name>] # deploy specific functions
#
# Pulls the function list from the filesystem so adding a new function
# under supabase/functions/<name>/index.ts means it gets deployed on the
# next run — no separate list to update.

set -euo pipefail

# Phase 5/4.5/7 incident guard (CLAUDE.md Lesson 10).
# Deploying Edge Functions while the application code is uncommitted
# leaves production in a half-state — the new function expects routes
# / handlers / DB shape that aren't on Vercel yet. Force a clean
# commit + push before deploy. Override with --allow-dirty if you
# really mean it (e.g. emergency rollback to a prior function version).
ALLOW_DIRTY=0
filtered_args=()
for arg in "$@"; do
  if [ "$arg" = "--allow-dirty" ]; then
    ALLOW_DIRTY=1
  else
    filtered_args+=("$arg")
  fi
done
set -- "${filtered_args[@]}"

if [ "$ALLOW_DIRTY" -ne 1 ]; then
  if ! bash scripts/check-git-deploy-sync.sh --quiet; then
    echo "" >&2
    echo "Refusing to deploy Edge Functions while git is out of sync." >&2
    echo "Commit + push your changes first, or re-run with --allow-dirty." >&2
    echo "" >&2
    echo "If this is an emergency rollback, --allow-dirty is the escape hatch," >&2
    echo "but you MUST commit the matching code immediately after." >&2
    exit 1
  fi
fi

PROJECT_REF="ioptgqtzykqwnebwkioo"

if [ "$#" -gt 0 ]; then
  fns=("$@")
else
  fns=()
  for d in supabase/functions/*/; do
    [ -f "${d}index.ts" ] && fns+=("$(basename "$d")")
  done
fi

if [ "${#fns[@]}" -eq 0 ]; then
  echo "No functions found under supabase/functions/" >&2
  exit 0
fi

echo "Deploying ${#fns[@]} function(s) to project ${PROJECT_REF}:"
printf "  - %s\n" "${fns[@]}"

supabase functions deploy "${fns[@]}" --project-ref "$PROJECT_REF"
