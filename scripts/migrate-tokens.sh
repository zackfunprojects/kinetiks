#!/usr/bin/env bash
# Migrate legacy CSS variable names to canonical --kt-* tokens across
# the apps/id source tree. After running this, the legacy alias block in
# apps/id/src/app/globals.css can be deleted.
#
# Mappings are 1:1; each line is a safe in-place replacement.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/apps/id/src"

# Each entry: "old|new" with var(--…) wrapping. The pipe avoids slash conflicts.
declare -a MAP=(
  "var(--bg-base)|var(--kt-bg-base)"
  "var(--bg-surface)|var(--kt-bg-subtle)"
  "var(--bg-surface-raised)|var(--kt-bg-muted)"
  "var(--bg-surface-overlay)|var(--kt-bg-elevated)"
  "var(--bg-inset)|var(--kt-bg-base)"
  "var(--text-primary)|var(--kt-fg-1)"
  "var(--text-secondary)|var(--kt-fg-2)"
  "var(--text-tertiary)|var(--kt-fg-3)"
  "var(--text-on-accent)|var(--kt-fg-on-inverse)"
  "var(--border-default)|var(--kt-border-1)"
  "var(--border-muted)|var(--kt-border-2)"
  "var(--accent-emphasis)|var(--kt-accent-hover)"
  "var(--accent-muted)|var(--kt-accent-soft)"
  "var(--accent-subtle)|var(--kt-accent-soft)"
  "var(--accent-secondary-muted)|var(--kt-warm-soft)"
  "var(--accent-secondary)|var(--kt-warm)"
  "var(--success-muted)|var(--kt-success-soft)"
  "var(--success)|var(--kt-success)"
  "var(--warning-muted)|var(--kt-warning-soft)"
  "var(--warning)|var(--kt-warning)"
  "var(--error-muted)|var(--kt-danger-soft)"
  "var(--error)|var(--kt-danger)"
  "var(--info-muted)|var(--kt-accent-soft)"
  "var(--info)|var(--kt-accent)"
  "var(--ring-track)|var(--kt-border-2)"
  "var(--ring-fill)|var(--kt-accent)"
  "var(--user-bubble)|var(--kt-bg-muted)"
  "var(--marcus-bubble)|var(--kt-bg-elevated)"
  "var(--sidebar-active-bg)|var(--kt-accent-soft)"
  "var(--sidebar-active-text)|var(--kt-accent-ink)"
  "var(--logo-accent)|var(--kt-accent)"
  "var(--accent)|var(--kt-accent)"
)

# Run on .ts/.tsx/.css files; skip node_modules, .next, dist, and the tokens file itself
files=$(find "$TARGET" \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/dist/*")

count_total=0
for entry in "${MAP[@]}"; do
  old="${entry%%|*}"
  new="${entry##*|}"
  matched=0
  while IFS= read -r f; do
    if grep -q -F -- "$old" "$f"; then
      # Use perl for safe in-place edit with literal substitution
      perl -i -pe "s/\Q${old}\E/${new}/g" "$f"
      matched=$((matched + 1))
    fi
  done <<< "$files"
  if [ "$matched" -gt 0 ]; then
    printf '%-44s → %-32s  (%d files)\n' "$old" "$new" "$matched"
    count_total=$((count_total + matched))
  fi
done

echo
echo "Done. Files touched: $count_total"
