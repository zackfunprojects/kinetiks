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
