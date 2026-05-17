# F2 follow-ups — status

F2 (Agent Runtime + Marcus v2 hardening) is functionally complete.
Type-check, AI boundary, runtime boundary, unit tests, and production
build are all green.

## Done in F2

### Streaming router
- [x] `routeStreamClaude` added to `@kinetiks/ai` — wraps the Anthropic
  SDK stream, taps `finalMessage`/`error` for `ai_calls` logging while
  passing the stream object through to callers unchanged.

### `packages/runtime` (new workspace)
- [x] `AgentRun.invokeTool` — single legitimate path for invoking
  platform tools. Wraps F1's `executeTool` with: run id propagation,
  authority resolution (stub), exponential-backoff retry, per-call
  AbortSignal + timeout merge, run-level trace + authority-outcome
  aggregation.
- [x] `startAgentRun` factory + `summary()` rollup.
- [x] `configureAuthorityResolver` hook — L2a swaps in real grant
  resolution.
- [x] `f2StubAuthorityResolver` — every action class resolves to
  `auto_threshold` with `grant_id = null`. Replaced by L2a.
- [x] Retry helper (`backoffMs`, `isRetryable`, `sleep` with AbortSignal).
- [x] 9 Vitest unit tests covering happy/retry/non-retryable/correlation/
  authority-stub/authority-override/abort paths.

### Prompt-task registry populated
- [x] `apps/id/src/lib/ai/task-registry.ts` registers every Marcus +
  Cartographer task at boot: `marcus.persona_stream`,
  `marcus.persona_response`, `marcus.pre_analysis`, `marcus.intent`,
  `marcus.action_generate`, `marcus.action_extract`,
  `marcus.memory_extract`, `marcus.thread_title`,
  `marcus.command_translate`, `cartographer.conversation`,
  `cartographer.calibrate`, `cartographer.extract_voice`,
  `cartographer.extract_brand`, `cartographer.extract_brand_subjective`,
  `cartographer.extract_org`, `cartographer.extract_positioning`,
  `cartographer.extract_social`.
- [x] `instrumentation.ts` calls `registerKinetiksPromptTasks()` at
  Node-runtime boot.

### Marcus + Cartographer migration to the router
- [x] Marcus (`engine.ts`, `intent.ts`, `thread-manager.ts`,
  `command-translator.ts`, `action-extractor.ts`) migrated from
  `askClaude` / `askClaudeMultiTurn` / `streamClaude` to the router.
- [x] Sub-modules (`pre-analysis.ts`, `action-generator.ts`,
  `memory.ts`) keep their `(prompt) => result` injected-caller
  interface; the engine constructs per-task callers via
  `makeHaikuCaller(task, context)` so each `ai_calls` row carries the
  right task name + agent_run_id.
- [x] Cartographer extract/calibrate/conversation modules migrated.
- [x] AgentRun started at the top of each Marcus entry point;
  `runId` stamped on every AI call this turn.

### Tool-bridge inventory
- [x] `apps/id/src/lib/marcus/tool-bridge.ts` builds an LLM-readable
  inventory from `buildCapabilityManifest`. Engine pre-fetches it and
  passes it through to `buildPreAnalysisBrief`, which injects a
  `[PLATFORM CAPABILITIES]` block into the formatted brief. Marcus
  answers "what can you do?" off this canonical list.

### Stub Marcus-callable tools
- [x] `query_patterns` (returns empty + `stub: true`) — replaced by L1a.
- [x] `query_actions_authority` (returns `auto_threshold` for any
  registered action class, `unknown_action_class` otherwise) — replaced
  by L2a. Looks up `customer_template` from the Action Class Registry
  so Marcus can quote the customer-facing sentence.

### Sentinel splice
- [x] `action-extractor.ts → executeActions → case "brief"` calls
  `reviewContent` from `@kinetiks/sentinel` before inserting the
  routing event. `held` blocks the route; `flagged` still routes but
  tags the payload with `sentinel_verdict` + `sentinel_review_id`.
  Failures degrade permissively so Sentinel outages never break Marcus.
- [x] Content type inferred from `target_app` (harvest→cold_email,
  dark_madder→blog_post, hypothesis→landing_page,
  litmus→journalist_pitch).

### Lint + CI boundaries
- [x] `.eslintrc.json` adds `no-restricted-syntax` for
  `*Tool.execute(` outside `packages/tools` and `packages/runtime`,
  with `__tests__` carve-out.
- [x] `scripts/check-runtime-boundary.sh` — grep-based CI gate. Passes
  clean.

### Verification gates
- [x] Workspace type-check 15/15 packages clean.
- [x] AI SDK boundary check clean.
- [x] Runtime boundary check clean.
- [x] `@kinetiks/tools` Vitest 44/44 pass.
- [x] `@kinetiks/runtime` Vitest 9/9 pass.
- [x] `apps/id` production `next build` green (all routes including new
  `/api/tools/*` and the migrated Marcus pipeline).

### Docs
- [x] `docs/specs/marcus-engine-v2-plan.md` appended with an "F2
  changelog" section describing what landed, what didn't change, and
  what is deferred.

## Out-of-F2 scope (named successor phases)

- **L2a (Authority Grants core):** swap `f2StubAuthorityResolver` with
  live grant resolution against `kinetiks_authority_grants`. Fills
  `tool_calls.authority_outcome` and `tool_calls.grant_id`.
- **L1a (Pattern Library core):** replace `query_patterns` stub with
  live reads. Marcus's pre-analysis brief should then carry actual
  patterns alongside the inventory.
- **F3 (Approval pipeline production wiring):** the Sentinel splice
  currently logs verdicts onto routing-event payloads; F3 routes
  Marcus's proposals/briefs end-to-end through the approval queue.
- **Marcus tool invocation:** today Marcus only reads the registry via
  the brief inventory. When Marcus needs to invoke `list_capabilities`,
  `query_patterns`, or any future tool by name, that path goes through
  `AgentRun.invokeTool` (the runtime is already wired; the bridge from
  Sonnet's response to a tool call is the missing piece, naturally
  landing alongside the F2-tool-use prompt work).

## Manual ops checks

Same Docker-required Supabase apply flow as F0/F1. Once a dev DB is up:

```bash
# Trigger a Marcus turn (after auth)
curl -X POST http://localhost:3000/api/marcus/chat \
  -H 'Content-Type: application/json' -H 'Cookie: <session>' \
  -d '{"message":"what tools do you have right now?"}'

# Verify ai_calls + agent_run_id correlation
SELECT task, model, status, latency_ms, agent_run_id, thread_id
FROM kinetiks_ai_calls
ORDER BY started_at DESC LIMIT 10;

# Verify the tool inventory shows up in the response
# (a turn that asks "what tools do you have" should list noop_test,
#  list_capabilities, query_patterns, query_actions_authority)
```

## Files added in F2

- `packages/runtime/{package.json, tsconfig.json}`
- `packages/runtime/src/{types,authority,retry,run,index}.ts`
- `packages/runtime/src/__tests__/run.test.ts`
- `apps/id/src/lib/ai/task-registry.ts`
- `apps/id/src/lib/marcus/tool-bridge.ts`
- `apps/id/src/lib/tools/query-patterns.ts`
- `apps/id/src/lib/tools/query-actions-authority.ts`
- `scripts/check-runtime-boundary.sh`
- `docs/build-phases/F2_FOLLOW_UPS.md` (this file)

## Files modified in F2

- `packages/ai/src/{router,index}.ts` (added `routeStreamClaude`)
- `apps/id/src/instrumentation.ts` (registers prompt tasks at boot)
- `apps/id/src/lib/marcus/{engine,intent,thread-manager,command-translator,action-extractor,pre-analysis}.ts` (migrated to router; Sentinel splice; tool inventory in brief)
- `apps/id/src/lib/cartographer/{extract-voice,extract-org,extract-brand,extract-positioning,extract-social,calibrate,conversation}.ts` (migrated to router)
- `apps/id/src/lib/tools/registry-boot.ts` (registers stub tools)
- `apps/id/{package.json, next.config.js}` (add `@kinetiks/runtime` workspace + transpilePackages entry)
- `.eslintrc.json` (no-restricted-syntax for tool.execute)
- `docs/specs/marcus-engine-v2-plan.md` (F2 changelog)
