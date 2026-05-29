# RLS Migration: Service-Role Caller Buckets

Tracking doc for the data-access re-architecture (making RLS the runtime tenant
boundary). It sorts every `createAdminClient()` caller in `apps/id` into two
buckets so the Phase 3 (reads) and Phase 4 (writes) cutovers know exactly what
to convert and what to leave alone. Produced from the Phase 1 exploration; the
exact per-file list is finalized as each cutover step lands.

## The conversion pattern

Today: pages, layouts, and route handlers authenticate the user, then read/write
through `createAdminClient()` (service role, bypasses RLS) scoped manually with
`.eq('account_id', ...)`. Target: those user-request paths use
`createClient()` (the anon, cookie-bound, request-scoped client in
`apps/id/src/lib/supabase/server.ts`), and RLS enforces tenancy.

Key enabler: the shared read helpers already accept a client parameter (the
`AdminLike` seam) - e.g. `listPatterns(admin, input)`
(`apps/id/src/lib/cortex/patterns/list.ts`), `lib/cortex/authority/list.ts`,
`lifecycle.ts`, `submit-context-edit.ts`. Conversion passes the anon client
instead of `admin`; the helpers do not change. The same helper is reused by
both the UI (Bucket A, anon client) and agent tools (Bucket B, admin) - each
caller passes the appropriate client.

## Bucket A - convert to anon + RLS (user-request scoped)

These run inside a signed-in user's request and read/write only that user's data.

- **Page & layout Server Components (~23):** `(app)/layout.tsx`,
  `(dashboard)/layout.tsx`, and every `page.tsx` under `(app)/cortex/*`,
  `(app)/chat/*`, `(dashboard)/*`. Pattern: `createClient().auth.getUser()` ->
  account lookup -> data reads. Convert both the account lookup and the data
  reads to the anon client.
- **User-facing API routes (~69):** `api/cortex/**`, `api/context/**`,
  `api/goals/**`, `api/identity/**`, `api/approvals/**`, `api/account/**`,
  `api/oracle/budget`, and the user-triggered paths of `api/marcus/**`,
  `api/cartographer/**`. (Routes also have the `api_key` and `__internal__`
  auth paths - those keep admin; see Bucket B.)
- **Server Actions (~16):** e.g. `(app)/cortex/patterns/actions.ts`,
  `(app)/cortex/authority/actions.ts`, plus context-edit / settings actions.
  Reads convert in Phase 3; writes convert in Phase 4 (need user write
  policies + column-guard triggers first).

## Bucket B - keep service role (runs outside a user session)

These have no user JWT to scope by, or legitimately operate across accounts.

- **Agent Runtime + tools:** `lib/runtime/runtime-boot.ts`, `lib/tools/*`
  (ga4/gsc/stripe/query-patterns/etc.) - invoked by background agents as the
  system, not in a user request.
- **Operators / executors:** `lib/operators/executors/*` (archivist,
  authority-agent).
- **Archivist maintenance:** `lib/archivist/*` (pattern/deferred sweeps,
  calibrate, clean).
- **Internal / cron routes:** `app/api/internal/**`, `app/api/archivist/**`
  (auth via `INTERNAL_SERVICE_SECRET`).
- **Authority resolver:** `lib/cortex/authority/resolve.ts` - must read across
  grants at action-execution time.
- **Auth bootstrap + rate limiting:** `lib/auth/resolve-auth.ts` (api_key +
  `__internal__` paths and, until Phase 2's JWT claim lands, the session
  account lookup), `lib/auth/rate-limit.ts`.
- **Nango sync handlers:** `lib/integrations/nango/handlers/*`.
- **System writes everywhere:** Learning Ledger inserts, pattern emissions,
  confidence recalculation, Oracle runs, `ai_calls` / `tool_calls` logging.

## Table coverage status (cross-tenant pgTAP)

Phase 1 added cross-tenant isolation suites for the user-facing read surface:
the 8 context layers (`context_layers_cross_tenant.sql`) plus ledger,
routing_events, connections, imports, confidence, synapses, billing,
app_activations, approvals, approval_thresholds, goals, goal_snapshots, budgets,
budget_allocations, oracle_insights, api_keys, marcus_threads, marcus_messages,
thread_memory. Pre-existing suites cover patterns, authority_grants, proposals,
insights, metric_cache, oracle_runs, ai_calls, tool_calls, crm_entities,
social_posts, sync_logs, user_preferences.

Every table a Bucket A read touches must have a green cross-tenant suite before
its cutover step. System-only Bucket B tables (sentinel_*, webhooks,
webhook_deliveries, connection_sync_logs, pattern_pending_observations,
attribution_touchpoints, touchpoint_ledger, analytics_metrics, fatigue_rules,
escalations, marcus_alerts/follow_ups/schedules, system_identity) are read only
under the service role; their default-deny coverage is deferred with the rest of
Bucket B.
