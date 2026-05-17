#!/usr/bin/env bash
# Fail if any file outside packages/tools and packages/runtime calls
# `<somethingTool>.execute(` directly. Tool execution must flow through
# the Agent Runtime so authority resolution, idempotency, retry, and
# tool_calls logging happen in exactly one place.
#
# Mirror of scripts/check-ai-boundary.sh — runs without ESLint deps so
# CI catches violations even before lint is wired.
set -euo pipefail

cd "$(dirname "$0")/.."

# `<word>Tool.execute(` — matches noopTestTool.execute(, queryPatternsTool.execute(, etc.
# Excludes packages/tools (the executor itself) and packages/runtime (the
# AgentRun.invokeTool path) which are the only legitimate callers.
matches=$(grep -REn --include='*.ts' --include='*.tsx' \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=dist \
  --exclude-dir='packages/tools' \
  --exclude-dir='packages/runtime' \
  --exclude-dir='__tests__' \
  '[A-Za-z_][A-Za-z0-9_]*[Tt]ool\.execute\(' \
  apps packages 2>/dev/null || true)

if [ -n "$matches" ]; then
  echo "❌ Direct tool.execute() calls detected outside packages/tools and packages/runtime:"
  echo "$matches"
  echo
  echo "Use AgentRun.invokeTool() from @kinetiks/runtime instead. Direct"
  echo "tool execution bypasses authority resolution, idempotency, retry,"
  echo "and tool_calls logging — all of which the Agent Runtime owns."
  exit 1
fi

echo "✓ Runtime boundary clean."
