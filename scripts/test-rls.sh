#!/usr/bin/env bash
# Run pgTAP tests against the local Supabase Postgres.
#
# Usage:
#   ./scripts/test-rls.sh                       # all tests
#   ./scripts/test-rls.sh proposals_cross_tenant.sql
#
# Requires:
#   - pg_prove (perl Test::Harness): brew install pg_prove
#   - A running Supabase dev DB (supabase start)
#   - SUPABASE_DB_URL env, default: postgresql://postgres:postgres@127.0.0.1:54322/postgres

set -euo pipefail

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
TESTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/tests"
SETUP_FILE="$TESTS_DIR/_setup.sql"

if ! command -v pg_prove >/dev/null 2>&1; then
  echo "❌ pg_prove not found. Install with: brew install pg_prove (or: cpan TAP::Parser::SourceHandler::pgTAP)"
  exit 1
fi

# Apply setup helpers (idempotent)
psql "$DB_URL" -q -f "$SETUP_FILE" > /dev/null

if [ "$#" -eq 0 ]; then
  echo "→ running all pgTAP tests in $TESTS_DIR (excluding _setup.sql)"
  pg_prove -d "$DB_URL" "$TESTS_DIR"/*.sql --ext .sql --recurse \
    --norc --runtests-only-parses 2>/dev/null || pg_prove -d "$DB_URL" \
    $(ls "$TESTS_DIR"/*.sql | grep -v "_setup.sql")
else
  echo "→ running $1"
  pg_prove -d "$DB_URL" "$TESTS_DIR/$1"
fi
