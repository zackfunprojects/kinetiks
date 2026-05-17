# D1 follow-ups — status

D1 (GA4 extractor + Metric Cache + first registered tool + Marcus
tool-use turn) is functionally complete. Type-check, AI boundary, unit
tests (~95 across the workspace including 17 GA4 extractor, 17 ga4_query
tool, 15 metric-cache, 7 refresh-token, 7 tool-decision, 1 ga4-proof),
and the apps/id production build are all green. Per-phase pgTAP
(metric_cache_isolation) authored.

## Done in D1

### Cache layer
- [x] Migration 00034_metric_cache.sql: `kinetiks_metric_cache`
  (account_id, source, normalized_input_hash) + advisory-lock RPC
  helpers + RLS + pgTAP cross-tenant.
- [x] `apps/id/src/lib/connections/metric-cache.ts`: canonical-JSON
  normalization with sha256, get/write, SWR semantics, advisory-lock
  refresh gate.
- [x] Per-metric TTL dispatch in `extractors/ga4.ts` (15min /1hr / 24hr
  per metric-class).

### Connection plumbing
- [x] `withFreshToken` helper: 401-aware OAuth retry; marks connection
  `error` on second rejection.
- [x] `TokenRejectedError` thrown by the GA4 client adapter on 401 /
  UNAUTHENTICATED.
- [x] First call to `registerExtractor('ga4', ...)` — registry-empty
  bug shape eliminated.
- [x] `apps/id/src/lib/connections/extractors/index.ts` barrel pulled
  in from `instrumentation.ts` for side-effect registration.

### Provider integration
- [x] `@google-analytics/data`, `google-auth-library`, `googleapis` added.
- [x] `Ga4Client` interface (test seam) + `createGa4Client` factory
  (lazy import).
- [x] `runGa4Query` primitive: translates Kinetiks names to GA4-native
  names; scales bounce_rate 0..1 → 0..100; returns normalized rows.

### Property picker
- [x] GET `/api/connections/ga4/properties` (Admin API via googleapis).
- [x] POST `/api/connections/ga4/select-property` (Zod-validated).
- [x] Callback redirect appends `?ga4_pick=1` for GA4 only.
- [x] `Ga4PropertyPicker.tsx` modal: loading / ready / empty / error
  states; tokens; aria-modal / aria-busy / role=listbox.

### Tool registration
- [x] `ga4_query` tool registered: input schema constrained to
  METRIC_REGISTRY, discriminated-union output (ok / not_connected /
  no_property / error), availability=always.
- [x] Cache miss/stale path: advisory lock + `withFreshToken` + cache
  write (best-effort).
- [x] Error classification: reauthorize_required, permission_denied,
  transient_provider_error, unknown.

### Refresh cron
- [x] `supabase/functions/metric-cache-cron/index.ts` (Deno, 15-min
  cadence). README documents the schedule + the Deno→Node boundary.
- [x] `/api/internal/metric-cache/refresh` route — INTERNAL_SERVICE_SECRET
  bearer, reconstructs Ga4Query from `cached.input`, runs the same
  lock + withFreshToken path the tool uses.

### Marcus tool-use turn (step 7.5)
- [x] `apps/id/src/lib/marcus/tool-decision.ts`: pre-decided
  tool-router Haiku. Three guard rails (unknown tool, schema mismatch,
  parse failure) all skip gracefully.
- [x] `marcus.tool_decision` registered in the AI task registry.
- [x] `engine.ts` step 7.5 inserted into both `processMarcusMessage`
  and `streamMarcusMessage`.
- [x] `pre-analysis.ts` exports `formatBriefForSonnet` and renders
  `[TOOL OBSERVATIONS]` adjacent to the user's question.

### Proof + smoke
- [x] `ga4-proof.test.ts` integration test: Haiku → AgentRun →
  ga4_query → `tool_calls` payload, asserts `agent_run_id` correlation.
- [x] `ga4.smoke.test.ts`: env-gated real-provider smoke test for
  pre-release validation.

## Open follow-ups (none blocking)

- Cron schedule needs to be set in the Supabase dashboard
  (`*/15 * * * *`) for the production project; not part of source code.
- `INTERNAL_SERVICE_SECRET` and `IDENTITY_API_URL` must be set on the
  Edge Function environment in production.
- Inline SWR refresh (return stale + truly async background refresh)
  is deferred behind the cron's coverage; D2 may revisit if Marcus
  turn latency on stale rows shows up in PostHog.
- D2 turns ga4Extractor's empty `[]` return into actual Oracle
  proposals derived from GA4 trends.

## Lessons added to CLAUDE.md

- §5 cache TTL belongs on the row, not on a generated column
- §6 Marcus tool calls are pre-decided, not multi-turn
- §7 Cron + Node API split for Deno-incompatible SDKs
