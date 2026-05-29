#!/usr/bin/env bash
#
# Wrapper around `supabase db push --linked` with the Phase 5/4.5/7
# incident guard (CLAUDE.md Lesson 10).
#
# Applying migrations to production while the application code is
# uncommitted leaves production in a half-state — the new schema /
# RPC / table exists but no code calls it, and (worse) cron Edge
# Functions may try to call routes the deployed app doesn't have.
#
# Force a clean commit + push before applying migrations. Override
# with --allow-dirty if you really mean it. Pass any other supabase
# CLI args through.
#
# Usage:
#   bash scripts/db-push.sh                 # standard apply, guarded
#   bash scripts/db-push.sh --dry-run       # supabase --dry-run
#   bash scripts/db-push.sh --allow-dirty   # skip the guard

set -euo pipefail

ALLOW_DIRTY=0
forwarded=()
for arg in "$@"; do
  if [ "$arg" = "--allow-dirty" ]; then
    ALLOW_DIRTY=1
  else
    forwarded+=("$arg")
  fi
done

if [ "$ALLOW_DIRTY" -ne 1 ]; then
  if ! bash scripts/check-git-deploy-sync.sh --quiet; then
    echo "" >&2
    echo "Refusing to apply migrations to production while git is out of sync." >&2
    echo "Commit + push your changes first, or re-run with --allow-dirty." >&2
    echo "" >&2
    echo "Background: the application code reads / writes the new schema." >&2
    echo "Applying the migration before the code is deployed leaves" >&2
    echo "production in an inconsistent state. See CLAUDE.md Lesson 10." >&2
    exit 1
  fi
fi

# Forward to supabase CLI. --linked + --yes are the defaults; anything
# else passed in is preserved.
exec supabase db push --linked --yes "${forwarded[@]}"
