#!/usr/bin/env bash
#
# Migration parity: every migration in supabase/migrations/ is applied to
# the linked production database.
#
# This is the third "repo vs production" drift guard, alongside
# check-git-deploy-sync.sh (code) and functions-drift-check.sh (Edge
# Functions). It closes the remaining face of CLAUDE.md Lesson 10: a
# migration merged to the repo but never `db:push`'d to prod is silent,
# load-bearing drift — RLS, triggers, and columns the deployed code may
# assume exist but don't (or vice versa).
#
# Mechanism: `supabase migration list --linked` prints a Local | Remote
# table. A row with a Local version but an empty Remote column is a repo
# migration that has not been applied to production.
#
# Degrades gracefully (exit 0 with a skip note) when the supabase CLI is
# absent or the remote can't be read (offline / not linked), so it never
# blocks a developer who simply can't reach prod — same posture as the
# Vercel check in health.sh.
#
# Exit codes:
#   0 — parity; 1 — drift (repo migrations not in prod);
#   2 — skipped (unverifiable: CLI absent or remote unreadable). The caller
#       distinguishes this from parity so a skip is not reported as green.
#
# Usage:
#   bash scripts/check-migration-parity.sh
#   bash scripts/check-migration-parity.sh --quiet   (CI mode; only failures echo)
#
# Wired into: pnpm health.

set -euo pipefail

QUIET=0
for arg in "$@"; do
  [ "$arg" = "--quiet" ] && QUIET=1
done

cd "$(dirname "$0")/.."

# `if` (not `&&`) so the function always returns 0 — under `set -e` a bare
# `[ ... ] && ...` that short-circuits when QUIET=1 would return 1 and abort
# the script before the intended exit code.
note() { if [ "$QUIET" -eq 0 ]; then printf '%s\n' "$1"; fi; }

if ! command -v supabase >/dev/null 2>&1; then
  note "supabase CLI not installed, skipping migration-parity check"
  exit 2
fi

# Capture the table; tolerate any failure (offline / not linked / auth).
LIST="$(supabase migration list --linked 2>/dev/null || true)"
if [ -z "$LIST" ]; then
  note "could not read the remote migration list (offline / not linked), skipping"
  exit 2
fi

# A data row is `   <local> | <remote> | <time>`. Strip non-digits per column;
# a row with a Local version and an empty Remote version is unapplied drift.
DRIFT="$(printf '%s\n' "$LIST" | awk -F'|' '
  NF >= 3 {
    local = $1; remote = $2;
    gsub(/[^0-9]/, "", local);
    gsub(/[^0-9]/, "", remote);
    if (local != "" && remote == "") print local;
  }
')"

if [ -n "$DRIFT" ]; then
  {
    echo "✗ migration drift: repo migrations NOT applied to production:"
    printf '   %s\n' $DRIFT
    echo "   Apply with: pnpm db:push  (verify on a preview project first where the"
    echo "   change is consequential — e.g. the JWT RLS cutover; see"
    echo "   docs/operational/jwt-cutover-runbook.md)."
  } >&2
  exit 1
fi

note "all repo migrations applied to production"
exit 0
