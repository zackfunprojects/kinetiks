#!/usr/bin/env bash
# Fail if any file outside packages/ai imports @anthropic-ai/sdk directly.
# Cheap CI insurance: works without ESLint deps installed.
set -euo pipefail

cd "$(dirname "$0")/.."

# Search every TS/TSX file in the monorepo, excluding packages/ai and node_modules.
matches=$(grep -RIn --include='*.ts' --include='*.tsx' \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=dist \
  --exclude-dir='packages/ai' \
  "from ['\"]@anthropic-ai/sdk" \
  apps packages 2>/dev/null || true)

if [ -n "$matches" ]; then
  echo "❌ Direct @anthropic-ai/sdk imports detected outside packages/ai:"
  echo "$matches"
  echo
  echo "Use @kinetiks/ai router instead (routeAskClaude / routeAskClaudeMultiTurn)."
  exit 1
fi

echo "✓ AI SDK boundary clean."
