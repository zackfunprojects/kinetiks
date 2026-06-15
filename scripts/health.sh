#!/usr/bin/env bash
# Aggregate "is production state consistent with the repo?" check.
#
# Runs every guardrail we have, in order of cost (cheap first), and
# fails on the first red signal. Designed so you can run it before
# merging any phase PR and get a single yes/no answer.
#
# Checks:
#   1. TypeScript: `pnpm -r type-check`
#   2. Tests: `pnpm -r test`
#   3. Edge Function drift: `scripts/functions-drift-check.sh`
#   4. Migration parity: every repo migration is applied to prod
#      (`scripts/check-migration-parity.sh`); the third "repo vs prod"
#      drift guard, see CLAUDE.md Lesson 10.
#   5. Trust-language: `scripts/check-authority-grant-phrase.sh`
#      (Kinetiks Contract Addendum §2.14)
#   6. Vercel production deploy state: latest is Ready (not Error/Building)
#   7. Git ↔ deploy sync: working tree clean + HEAD pushed.
#      Added after the Phase 5/4.5/7 incident; see CLAUDE.md Lesson 10.
#
# Usage:
#   pnpm health
#   pnpm health --skip-tests   (faster sanity pass)

set -euo pipefail

SKIP_TESTS=0
for arg in "$@"; do
  [ "$arg" = "--skip-tests" ] && SKIP_TESTS=1
done

ok() { printf "  ✓ %s\n" "$1"; }
fail() { printf "  ✗ %s\n" "$1" >&2; exit 1; }

echo "[1/7] TypeScript across workspace..."
if pnpm -r type-check >/tmp/health-tsc.log 2>&1; then
  ok "type-check passed"
else
  echo "" >&2
  tail -20 /tmp/health-tsc.log >&2
  fail "type-check failed — see /tmp/health-tsc.log"
fi

if [ "$SKIP_TESTS" -eq 0 ]; then
  echo "[2/7] Unit tests across workspace..."
  if pnpm -r test >/tmp/health-test.log 2>&1; then
    ok "tests passed"
  else
    echo "" >&2
    tail -30 /tmp/health-test.log >&2
    fail "tests failed — see /tmp/health-test.log"
  fi
else
  echo "[2/7] Unit tests SKIPPED (--skip-tests)"
fi

echo "[3/7] Edge Functions drift..."
if scripts/functions-drift-check.sh --quiet 2>/tmp/health-drift.log; then
  ok "no drift between repo / deployed / scheduled"
else
  echo "" >&2
  cat /tmp/health-drift.log >&2
  fail "Edge Function drift — run pnpm functions:deploy / extend the schedules migration"
fi

echo "[4/7] Migration parity (repo migrations applied to prod)..."
if scripts/check-migration-parity.sh --quiet 2>/tmp/health-migrations.log; then
  ok "every repo migration is applied to production"
else
  status=$?
  if [ "$status" -eq 2 ]; then
    # Unverifiable (no supabase CLI / remote unreadable) — a skip, not green.
    ok "migration parity SKIPPED (Supabase CLI unavailable or remote unreadable)"
  else
    echo "" >&2
    cat /tmp/health-migrations.log >&2
    fail "migration drift — run pnpm db:push (verify a preview project first for consequential RLS changes)"
  fi
fi

echo "[5/7] Trust-language check (Authority Grant phrase)..."
if scripts/check-authority-grant-phrase.sh >/tmp/health-trust.log 2>&1; then
  ok "no customer-facing 'Authority Grant' occurrences"
else
  echo "" >&2
  cat /tmp/health-trust.log >&2
  fail "customer-facing 'Authority Grant' phrase found — see Addendum §2.14"
fi

echo "[6/7] Vercel production deploy state..."
if command -v vercel >/dev/null 2>&1; then
  # Most recent Production-environment row. vercel ls writes the table
  # to stderr and the URLs to stdout, so combine both streams.
  prod_line="$(cd apps/id && vercel ls 2>&1 | awk '/Production/ {print; exit}')"
  if [ -z "$prod_line" ]; then
    ok "no Vercel link in apps/id, skipping (run \`vercel link\` in apps/id to enable)"
  else
    if printf '%s' "$prod_line" | grep -q "Ready"; then
      ok "latest Production deploy is Ready"
    else
      echo "" >&2
      printf '%s\n' "$prod_line" >&2
      fail "latest Production deploy is NOT Ready — fix the deploy before merging"
    fi
  fi
else
  ok "vercel CLI not installed, skipping (install with \`npm i -g vercel\`)"
fi

echo "[7/7] Git ↔ deploy sync (CLAUDE.md Lesson 10)..."
# Catches the Phase 5/4.5/7 incident shape: uncommitted/unpushed code
# while DB and/or Edge Functions were already pushed to production.
if bash scripts/check-git-deploy-sync.sh --quiet 2>/tmp/health-git.log; then
  ok "working tree clean + HEAD pushed to origin"
else
  echo "" >&2
  cat /tmp/health-git.log >&2
  fail "git ↔ deploy out of sync — commit + push before declaring production-ready"
fi

echo ""
echo "OK: foundation is consistent."
