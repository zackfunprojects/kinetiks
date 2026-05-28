#!/usr/bin/env bash
#
# Trust-language enforcement for Kinetiks Contract Addendum §2.14.
#
# Greps customer-rendered surfaces for the literal phrase
# "Authority Grant" — case-insensitive, allowing one or more whitespace
# characters between the words — and fails the build if any hit is
# found that is not in a comment, type identifier, or docstring.
#
# The internal name "Authority Grant" stays in:
#   - Type declarations (AuthorityGrant, AuthorityGrantStatus, etc.)
#   - Code comments
#   - Migration / spec files
#
# The phrase MUST NOT appear in:
#   - Customer-rendered JSX text in apps/id/src/components/
#   - Customer-rendered JSX text in apps/id/src/app/(app)/
#   - Customer-rendered prompt strings (the proposal cards, the
#     Cortex Authority sub-tab, Marcus's answers)
#
# The script approximates the "rendered text" filter by greping JSX
# files for the phrase BETWEEN tag content (>…<) or in plain strings
# (`"…"` / `'…'` / `\`…\``) — heuristic, but the literal phrase is
# rare enough that false positives are easy to whitelist by either
# rewriting the customer copy or moving the string into a code comment.
#
# Run via `pnpm check:authority-phrase` or directly:
#   bash scripts/check-authority-grant-phrase.sh
#
# Phase 4 — Chunk 10.

set -euo pipefail

cd "$(dirname "$0")/.."

PATTERN='[Aa]uthority[[:space:]]+[Gg]rant'

# Roots to scan: any directory rendering UI to the customer or
# composing customer-facing strings.
ROOTS=(
  "apps/id/src/components"
  "apps/id/src/app/(app)"
  "apps/id/src/lib/marcus"
  "apps/id/src/lib/insights"
)

# Filter out:
#   - Lines that are clearly type/interface/identifier references
#     (the internal name stays in TypeScript types).
#   - Comment lines (// or  *  prefixes).
#   - Test files and fixtures (the phrase shows up in test names and
#     forbidden-phrase test data).

# Use ripgrep when available — faster and better Unicode handling.
# Fall back to plain grep otherwise.
if command -v rg >/dev/null 2>&1; then
  SEARCH="rg --no-heading --line-number --color=never \
    --glob '*.ts' --glob '*.tsx' \
    --glob '!*.test.ts' --glob '!*.test.tsx' \
    --glob '!__tests__' \
    --regexp '${PATTERN}'"
else
  # POSIX-compatible fallback. -E for extended regex; recursive with
  # explicit --include filters.
  SEARCH="grep -RInE \
    --include='*.ts' --include='*.tsx' \
    --exclude='*.test.ts' --exclude='*.test.tsx' \
    --exclude-dir='__tests__' \
    --exclude-dir='node_modules' \
    --exclude-dir='.next' \
    --exclude-dir='dist' \
    '${PATTERN}'"
fi

violations=""
for root in "${ROOTS[@]}"; do
  if [ ! -d "$root" ]; then continue; fi
  # shellcheck disable=SC2086
  hits=$(eval $SEARCH "$root" 2>/dev/null || true)
  if [ -z "$hits" ]; then continue; fi

  # Filter step. Any line where the FIRST occurrence of the phrase is
  # within a comment is allowed (the phrase used in a comment or
  # docstring is fine — that is internal documentation).
  while IFS= read -r line; do
    [ -z "$line" ] && continue

    # path:line:contents
    contents="${line#*:}"
    contents="${contents#*:}"

    # Strip leading whitespace.
    stripped="${contents#"${contents%%[![:space:]]*}"}"

    # Comment-only lines: //, /*, *, or # → skip.
    case "$stripped" in
      "//"*|"/*"*|"*"*|"#"*) continue ;;
    esac

    # Type-position-only lines: lines containing `: AuthorityGrant` or
    # `<AuthorityGrant` or `AuthorityGrant[` (TS type references) and
    # NOT containing the phrase as text between JSX tags. The check is:
    # if EVERY occurrence of "Authority Grant" on the line is either
    # preceded by ":", "<", or wedged inside a type name like
    # AuthorityGrantStatus, allow it.
    #
    # Heuristic: if the line, with all TypeScript-identifier-shaped
    # occurrences ("AuthorityGrant", "AuthorityGrantStatus", etc.)
    # removed, no longer contains "Authority Grant", it is type-only.
    stripped_types=$(echo "$contents" | sed -E 's/AuthorityGrant[A-Za-z]*//g')
    if ! echo "$stripped_types" | grep -qE "$PATTERN"; then
      continue
    fi

    violations="${violations}${line}"$'\n'
  done <<EOF
$hits
EOF
done

if [ -n "$violations" ]; then
  echo "❌ Trust-language violation: 'Authority Grant' appears in customer-rendered surfaces."
  echo
  echo "Per Kinetiks Contract Addendum §2.14, the literal phrase is internal-only."
  echo "Customer-facing word is 'permission' or 'authority'."
  echo
  echo "Offenders:"
  echo "$violations"
  echo
  echo "Fix: either reword the customer copy (e.g. 'permission'), or move the"
  echo "string into a code comment / type identifier (those are allowed)."
  exit 1
fi

echo "✓ Trust-language clean — no customer-facing 'Authority Grant' occurrences."
