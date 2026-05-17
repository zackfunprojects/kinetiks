# metric-cache-cron

Periodic refresh worker for `kinetiks_metric_cache` rows whose `expires_at`
has passed.

## Schedule

Configure in the Supabase dashboard:

```
*/15 * * * *
```

15-minute cadence matches the tightest TTL in the cache (top-of-funnel
GA4 sessions / users at 900s). Less frequent runs leave stale data
between scrapes; more frequent burns Edge Function budget.

## Required environment variables

| Name | Notes |
| ---- | ----- |
| `SUPABASE_URL` | Standard |
| `SUPABASE_SERVICE_ROLE_KEY` | Standard |
| `INTERNAL_SERVICE_SECRET` | Shared bearer the Node API checks |
| `IDENTITY_API_URL` | Where to reach `apps/id`. Defaults to `https://kinetiks.ai`. |

## Why two hops?

The cron runs under Deno; `@google-analytics/data` is Node-only. The
cron therefore POSTs to `/api/internal/metric-cache/refresh` in
`apps/id` (Node), which runs the extractor and writes the new cache row.

Same pattern as `gmail-sync-cron` calling `HARVEST_API_URL`.

## Observability

- One log line per run: due_rows / refreshed / skipped / errored.
- Per-row errors are logged with `account_id` + `source` (no PII).
