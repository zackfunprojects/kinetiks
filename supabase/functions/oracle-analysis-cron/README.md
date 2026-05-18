# oracle-analysis-cron

**Cadence:** `*/30 * * * *` (every 30 minutes).

## Purpose

Coordinator-only Edge Function that drives the Oracle analysis cycle.
Every 30 minutes, it scans `kinetiks_connections` and
`kinetiks_metric_cache` to find accounts eligible for analysis (any
active connection + any cache row refreshed in the last 7 days), batches
them, and POSTs each batch to `/api/internal/oracle/analyze` in `apps/id`.

The actual per-account analysis (running detectors, writing
`kinetiks_insights`, etc.) lives in the Node runner at
`apps/id/src/lib/oracle/runner.ts`. See CLAUDE.md Lesson 7 for the
Deno/Node split rationale.

## Required env vars (Supabase Edge Function secrets)

- `SUPABASE_URL` (auto-provisioned)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-provisioned)
- `INTERNAL_SERVICE_SECRET` — shared secret with `apps/id`
- `IDENTITY_API_URL` — base URL for apps/id; defaults to `https://kinetiks.ai`

## Deploy

```bash
pnpm functions:deploy oracle-analysis-cron
```

Schedule is set in migration `00037_oracle_schedule_dedup_runs.sql` via
the `_kt_schedule_edge_function('oracle-analysis-cron', '*/30 * * * *', ...)`
helper. Re-running the migration is idempotent for cadence updates.

## Behavior

- Per-batch fetch timeout: 30s.
- Batch size: 10 accounts per POST.
- Failures per batch are isolated; one bad batch does not stop the next.
- Returns `{ accounts_eligible, batches, succeeded, failed }`.

## Observability

- Each Node-side `analyzeAccount()` call writes a row to
  `kinetiks_oracle_runs` with counts + duration + status.
- Each `oracle.signal_polish` Haiku call writes a row to
  `kinetiks_ai_calls` via the AI router.
- Each insight emit writes a Learning Ledger entry from the runner.
