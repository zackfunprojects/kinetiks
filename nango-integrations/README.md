# nango-integrations

Custom Nango syncs and actions for Kinetiks. Deployed via the Nango CLI; the
deployed runtime lives on Nango's infrastructure (Cloud or self-hosted), not
on Vercel.

## What lives here

```
nango-integrations/
├── nango.yaml              # Integration + sync declarations (deploy contract)
├── syncs/
│   ├── google-analytics.ts # Slice 5 — GA4 Data API daily fetch
│   ├── google-search-console.ts # Slice 6
│   ├── stripe.ts           # Slice 6 — charges + customers + subscriptions
│   ├── meta-ads.ts         # Slice 7 — Marketing API campaign + insights
│   └── google-ads.ts       # Slice 7 — Google Ads Search API
├── models.ts               # Cross-sync shared TypeScript types
└── README.md               # This file
```

HubSpot is intentionally absent — we use Nango's pre-built syncs (companies,
contacts, deals, owners, pipelines) configured in the dashboard, not custom
TypeScript.

## Deploy workflow

The Nango CLI compiles each `syncs/*.ts` file against `nango.yaml`, packages
it, and uploads to the Nango runtime. Nango then schedules and executes the
sync on the cadence declared in `nango.yaml`.

```bash
# One-time install (workspace dev dep)
pnpm add -D -w @nangohq/cli

# Type-check syncs locally
npx nango compile

# Deploy to staging environment in Nango dashboard
NANGO_SECRET_KEY=$NANGO_STAGING_SECRET npx nango deploy staging

# Deploy to production (only after staging verification)
NANGO_SECRET_KEY=$NANGO_PROD_SECRET npx nango deploy prod
```

## Data flow

```
Provider API ──► Nango runtime ──► Nango records store
                                    │
                                    │  webhook (HMAC-SHA256 signed)
                                    ▼
                  apps/id /api/integrations/nango/webhook
                                    │
                                    │  parse + normalize
                                    ▼
                  kinetiks_metric_cache  /  kinetiks_crm_entities
```

Nango retains records for 30 days. Persist immediately on webhook receipt;
do not treat Nango as a store of record.

## Authoring a new sync

1. Add the integration + sync stanza to `nango.yaml` under the right
   `<provider-config-key>`. Specify cadence, sync_type, output model, and a
   one-paragraph description.
2. Write `syncs/<provider>.ts` exporting a function annotated with the
   Nango sync runtime contract (`NangoSync` type from `@nangohq/sync`).
3. Add a webhook handler at
   `apps/id/src/lib/integrations/nango/handlers/<provider>.ts` and register
   it in `apps/id/src/lib/integrations/nango/handlers/index.ts`.
4. Add per-source proposal derivation at
   `apps/id/src/lib/oracle/proposals/<provider>-proposals.ts` if the sync
   reveals Cortex-relevant facts.
5. Extend `apps/id/src/lib/oracle/metric-schema.ts:METRIC_REGISTRY` with
   any new metrics the sync produces.
6. Wire a per-source query tool at `apps/id/src/lib/tools/<provider>-query.ts`
   following the `ga4_query` shape and register it in
   `apps/id/src/lib/tools/registry-boot.ts`.
7. Update `docs/integrations/nango-runbook.md`.

## Pricing

Nango Cloud Growth tier covers 100 connections at $500/mo. Each sync run +
each record + each log + each webhook is metered at $0.0001. At ~17 syncs
per account per day across six providers, expect ~$0.05/account/day in
metering charges on top of the seat fee. See the cost-alert helper in
`apps/id/src/lib/oracle/runner.ts`.

## Self-host migration

Documented in `docs/integrations/nango-runbook.md`. Self-host requires
Postgres + Redis + Elasticsearch + S3-like storage + 5 Node services; only
Enterprise-supported by Nango. Trigger to migrate: monthly Cloud cost
exceeds $5,000.
