# F1 follow-ups — status

F1 (Tool Registry + Action Class Registry + Operator Registry contracts)
is functionally complete. Type-check, AI boundary, unit tests, and
production build are all green.

## Done in F1

### Platform contract types (`@kinetiks/types`)
- [x] `ToolDescriptor` — metadata side of an `AgentTool` (no execute).
- [x] `ActionClassDescriptor` — per 2027 addendum §2.4. constraint_schema, customer_template, llm_judgment_budget, eligibility flags.
- [x] `OperatorDescriptor` — per 2027 addendum §3.3. inputs/outputs schemas, required_tools, required_patterns, action_classes.
- [x] `AvailabilityPredicate`, `RateLimitConfig`, `LLMJudgmentBudget`.

### `@kinetiks/tools` workspace (new)
- [x] `AgentTool` runtime type with idempotency + execute.
- [x] **Tool Registry** — `defineTool`/`registerTool`/`getTool`/`listTools`/`listAvailableTools`/`isAvailable`. Structural validation rejects malformed descriptors at registration. Idempotent on identical re-registration.
- [x] **Action Class Registry** — `registerActionClass`/`getActionClass`/`assertActionClass`/`listActionClasses`/`listActionClassesForApp`. Enforces `<app>.<verb>_<noun>` shape, `source_app` prefix match, bans literal "Authority Grant" from `customer_template`, blocks spend-bearing default-grant eligibility.
- [x] **Operator Registry** — per-app scoping. `registerOperators(app, ops[])`, `getOperator`, `listOperatorsForApp`, `listAllOperators`.
- [x] **Customer-template renderer** — single-brace `{var}` syntax distinct from prompt `{{var}}`. Validates constraints against `constraint_schema`, then renders with safe number/boolean/array formatting.
- [x] **Executor** ([executor.ts](packages/tools/src/executor.ts)) — input validation, availability check, idempotency dedup hook, execute, output validation, structured log emission. F2 will layer authority resolution on top; F1 records `auto_threshold` for non-consequential tools and leaves `authorityOutcome` null for consequential ones (the stub F2 overrides).
- [x] **Logger seam** — `configureToolCallLogger`/`getToolCallLogger`/`emitToolCallLog`. Failures in the logger never break the call path.
- [x] **Cross-registry validation** — `validateRegistries()` returns a structured report; `assertRegistriesValid()` throws on failure. Catches: consequential tool with unregistered action class, operator's required_tools/action_classes that don't exist. Warns on orphaned action classes and on `required_patterns` (Pattern Type Registry lands in L1a).
- [x] **Capability manifest** — `buildCapabilityManifest(ctx, resolvers)` returns the serializable shape for Marcus and external agents.
- [x] **44 Vitest unit tests** covering all of the above.

### apps/id wiring
- [x] [supabaseToolCallLogger](apps/id/src/lib/tools/logger.ts) — writes one row to `kinetiks_tool_calls` per execution attempt.
- [x] [platformAvailabilityResolvers](apps/id/src/lib/tools/availability.ts) — `connection_required` queries `kinetiks_connections`; `plan_required` stub until B1 lands.
- [x] [noopTestTool](apps/id/src/lib/tools/noop-test.ts) — canary tool. Always-available, read-only, echoes the message + returns server time.
- [x] [listCapabilitiesTool](apps/id/src/lib/tools/list-capabilities.ts) — Marcus-callable meta tool returning the per-account manifest.
- [x] [bootToolRegistry()](apps/id/src/lib/tools/registry-boot.ts) — one-time boot: configure logger, register platform tools, run `assertRegistriesValid()`. Idempotent.
- [x] [src/instrumentation.ts](apps/id/src/instrumentation.ts) — calls `bootToolRegistry()` after `configureAICallLogger` in the Node runtime register hook.
- [x] [GET /api/tools/capabilities](apps/id/src/app/api/tools/capabilities/route.ts) — returns the manifest for the authenticated account.
- [x] [POST /api/tools/execute](apps/id/src/app/api/tools/execute/route.ts) — runs a registered tool by name; logs the call; surfaces `ToolError` with user-safe messages, captures unexpected errors to Sentry with the canonical context shape.

### Side fix: Edge-safe `@kinetiks/ai`
- [x] `@kinetiks/ai/knowledge` is now a separate subpath export. The main entry no longer pulls Node-only `fs/promises`/`path`, so `instrumentation.ts` and anything compiled for the Edge runtime stays clean.
- [x] All 8 consumers updated (`apps/id/src/lib/marcus/context-assembly.ts`, `cartographer/extract-voice.ts`, `cartographer/extract-positioning.ts`, `lib/ai/prompts/marcus-brief.ts`, `apps/hv/src/lib/composer/{generate,research}.ts`, `packages/sentinel/src/editorial.ts`).
- [x] `KnowledgeIntent` and other types remain re-exported from the main `@kinetiks/ai` (type-only re-exports are erased and Edge-safe).

### Verification gates
- [x] Type-check 14/14 packages clean.
- [x] AI SDK boundary check clean.
- [x] Vitest suite 44/44 in `@kinetiks/tools`.
- [x] `apps/id` production `next build` green — both `/api/tools/capabilities` and `/api/tools/execute` routes built.

## Out-of-F1 scope

These items are intentionally deferred to their named phases:

- **F2 (Agent Runtime + Marcus v2 hardening)** — the Agent Runtime wraps `executeTool` with retry/backoff, timeout, and (most importantly) the authority-resolution path that fills `authorityOutcome` and `grantId` on `tool_calls`. The F1 executor is the structural seam F2 builds on; nothing in F1 is throwaway.
- **F3 (Approval pipeline)** — `queued_for_approval` status on `kinetiks_tool_calls` is wired through the executor as a possible outcome but the routing into the approval queue lands in F3.
- **L1a (Pattern Library core)** — operators may declare `required_patterns`; `validateRegistries` emits a warning until the Pattern Type Registry exists in L1a.
- **L2a (Authority Grants core)** — consequential tools currently leave `authorityOutcome` null; L2a's resolution layer fills it with `grant_covers` / `auto_threshold` / `queued` / `escalated` / `fallback` / `denied`.

## Manual ops checks (Docker required)

Same Supabase-CLI flow as F0. The new pgTAP coverage for `kinetiks_tool_calls` (idempotency, status enum, RLS) lives in `supabase/tests/tool_calls_cross_tenant.sql` and runs as part of `./scripts/test-rls.sh`.

## End-to-end proof point (when dev server is up)

```bash
# 1. Connect as an authenticated user
curl -X POST http://localhost:3000/api/tools/execute \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <session>' \
  -d '{"tool_name":"noop_test","input":{"message":"hello"}}'
# → { "success": true, "data": { "echoed": "hello", "server_time": "..." } }

# 2. Verify a kinetiks_tool_calls row landed
SELECT tool_name, status, latency_ms, metadata
FROM kinetiks_tool_calls
ORDER BY started_at DESC LIMIT 1;
# → noop_test | success | <ms> | {}

# 3. Inspect the capability manifest
curl http://localhost:3000/api/tools/capabilities -H 'Cookie: <session>'
# → { "success": true, "data": { "tools": [{ "name": "noop_test", ... }, { "name": "list_capabilities", ... }], "action_classes": [], "operators": [] } }
```

## Files added in F1

- `packages/types/src/descriptors.ts`
- `packages/tools/{package.json, tsconfig.json}`
- `packages/tools/src/{types,tool-registry,action-class-registry,operator-registry,customer-template,logger,executor,validate,capabilities,index}.ts`
- `packages/tools/src/__tests__/{tool-registry,action-class-registry,operator-registry,customer-template,executor,validate}.test.ts`
- `apps/id/src/lib/tools/{logger,availability,noop-test,list-capabilities,registry-boot}.ts`
- `apps/id/src/app/api/tools/{capabilities,execute}/route.ts`
- `docs/build-phases/F1_FOLLOW_UPS.md` (this file)

## Files modified in F1

- `packages/types/package.json` (add zod), `packages/types/src/index.ts` (re-export descriptors)
- `packages/ai/package.json` (subpath export `./knowledge`), `packages/ai/src/index.ts` (drop runtime knowledge re-export; keep types)
- `apps/id/package.json` (add `@kinetiks/lib`, `@kinetiks/tools`, `zod`)
- `apps/id/next.config.js` (add `@kinetiks/tools` to transpilePackages)
- `apps/id/src/instrumentation.ts` (call `bootToolRegistry()`)
- 6 consumer files updated to import `loadKnowledge` from `@kinetiks/ai/knowledge`
