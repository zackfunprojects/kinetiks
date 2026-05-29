#!/usr/bin/env bash
#
# Guard against the Phase 5/4.5/7 incident: "DB migrations + Edge
# Functions were applied to production while the application code
# stayed uncommitted in the working tree for hours."
#
# CLAUDE.md Lesson 8 covered the inverse case ("code in the repo is
# not code in production" — Edge Functions in repo but not deployed).
# This script covers the other direction: production schema/edge
# functions deployed without the matching application code being in
# git at all.
#
# Three checks, each fast:
#
#   1. Working tree is clean — every change is in a commit.
#   2. HEAD is pushed to origin — every commit is on the remote.
#   3. (optional) Heuristic check that the current branch's tip
#      matches main, or warns clearly if you're on a feature branch.
#
# Exit codes:
#   0 — green; safe to say "production matches what you intended"
#   1 — red; uncommitted or unpushed work; fix before calling things
#       "deployed to production"
#
# Usage:
#   bash scripts/check-git-deploy-sync.sh
#   bash scripts/check-git-deploy-sync.sh --quiet   (CI mode; only failures echo)
#
# Wired into:
#   - pnpm health  (as step 6 of 6)
#   - scripts/db-push.sh  (pre-flight)
#   - scripts/functions-deploy.sh  (pre-flight)
#

set -euo pipefail

QUIET=0
for arg in "$@"; do
  [ "$arg" = "--quiet" ] && QUIET=1
done

cd "$(dirname "$0")/.."

# ── 1. Working tree clean? ──────────────────────────────────
# `git status --porcelain` prints exactly one line per change.
# Empty output = clean. We exclude untracked files only inside
# /tmp-like dirs the user wouldn't commit anyway; everything else
# counts.
DIRTY="$(git status --porcelain)"
if [ -n "$DIRTY" ]; then
  COUNT="$(printf '%s\n' "$DIRTY" | wc -l | tr -d ' ')"
  echo "" >&2
  echo "❌ Working tree has $COUNT uncommitted change(s):" >&2
  printf '%s\n' "$DIRTY" | head -15 >&2
  if [ "$COUNT" -gt 15 ]; then
    echo "   ... and $((COUNT - 15)) more (run 'git status' for the full list)" >&2
  fi
  echo "" >&2
  echo "If you've already run \`supabase db push\` or" >&2
  echo "\`pnpm functions:deploy\`, the DB and the Edge Functions are" >&2
  echo "ahead of the application code on Vercel. Commit + push these" >&2
  echo "changes before declaring anything \"deployed to production.\"" >&2
  echo "" >&2
  echo "Phase 5/4.5/7 incident reference: CLAUDE.md Lesson 10." >&2
  exit 1
fi

# ── 2. HEAD pushed to origin? ──────────────────────────────
# Check the upstream tracking branch. If HEAD is ahead of upstream,
# commits are local-only and Vercel hasn't seen them.
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if ! git rev-parse --verify --quiet "@{u}" >/dev/null; then
  # No upstream configured for this branch (e.g. just created locally).
  if [ "$CURRENT_BRANCH" = "main" ]; then
    echo "" >&2
    echo "❌ Local 'main' has no upstream — refusing to call anything 'deployed'." >&2
    exit 1
  else
    # Always print the remediation hint, even under --quiet. CR #69
    # flagged that suppressing it on quiet mode leaves CI failures with
    # no actionable stderr; downstream callers (health.sh, db-push.sh,
    # functions-deploy.sh) couldn't tell the user how to recover.
    echo "" >&2
    echo "❌ branch '$CURRENT_BRANCH' has no upstream (not yet pushed)." >&2
    echo "Run: git push -u origin $CURRENT_BRANCH" >&2
    exit 1
  fi
fi

AHEAD="$(git rev-list --count '@{u}'..HEAD 2>/dev/null || echo 0)"
if [ "$AHEAD" != "0" ]; then
  echo "" >&2
  echo "❌ HEAD is $AHEAD commit(s) ahead of origin/$CURRENT_BRANCH:" >&2
  git log --oneline '@{u}'..HEAD | head -10 >&2
  echo "" >&2
  echo "Push these before calling anything \"deployed to production.\"" >&2
  echo "Vercel does not see local commits." >&2
  exit 1
fi

# ── 3. pnpm-lock.yaml in sync with workspace package.jsons? ──
# Failure mode caught in production (PR #69, Vercel preview): adding
# a dependency via `pnpm add` updates the workspace's package.json
# but leaves pnpm-lock.yaml untouched until `pnpm install` is run.
# Local builds work because node_modules is populated; CI fails
# because `pnpm install --frozen-lockfile` refuses to drift.
#
# `pnpm install --frozen-lockfile` is the same check Vercel runs.
# When node_modules is already populated, it completes in ~3s and
# only verifies the lockfile.
if command -v pnpm >/dev/null 2>&1; then
  if ! pnpm install --frozen-lockfile --reporter=silent >/tmp/health-lockfile.log 2>&1; then
    echo "" >&2
    echo "❌ pnpm-lock.yaml is out of sync with at least one workspace's package.json:" >&2
    tail -8 /tmp/health-lockfile.log >&2
    echo "" >&2
    echo "Fix: run \`pnpm install\` to regenerate the lockfile, then commit it." >&2
    echo "Vercel CI uses --frozen-lockfile and refuses to build with drift." >&2
    exit 1
  fi
fi

# ── 4. (Informational) Branch context ───────────────────────
# Production auto-deploys from main on Vercel. If we're on a feature
# branch, Vercel deploys to a *preview* URL, not production. Warn
# clearly so the human knows what "deployed" means in this context.
if [ "$CURRENT_BRANCH" != "main" ] && [ "$QUIET" -ne 1 ]; then
  echo "  ℹ branch '$CURRENT_BRANCH' is not main; Vercel builds this as a preview" >&2
  echo "    Production deploys only after merging this branch's PR to main." >&2
fi

if [ "$QUIET" -ne 1 ]; then
  echo "  ✓ working tree clean, HEAD pushed to origin/$CURRENT_BRANCH"
fi
exit 0
