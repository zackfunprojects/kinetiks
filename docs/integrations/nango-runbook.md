# Nango Runbook

Operational guide for Kinetiks's Nango integration. Read this when:

- Adding a 7th data source
- Diagnosing a webhook delivery failure
- Triaging sync errors in production
- Evaluating a Cloud → self-host migration

## Architecture in one paragraph

Six external providers (GA4, GSC, Stripe, Meta Ads, Google Ads, HubSpot)
connect to user accounts via Nango's Embedded Connect UI. Nango owns OAuth,
token refresh, scheduled sync execution, and retry. After each sync Nango
fires an HMAC-SHA256-signed webhook to
`/api/integrations/nango/webhook` in `apps/id`. The handler verifies the
signature, fetches the records via Nango's `GET /records` API, normalizes
them, and writes to `kinetiks_metric_cache` (time-series) or
`kinetiks_crm_entities` (HubSpot entities). The Oracle's analysis cron
reads from these caches; the Marcus tool layer reads from the same caches.

## Environment

Cloud (Growth tier). Connection cap: 100. Pricing: $500/mo flat + $0.0001
per event (sync run, record, log, webhook).

Endpoints:
- `https://api.nango.dev` (server SDK)
- `https://connect.nango.dev` (Connect UI iframe)

Env vars: see `docs/operational/env-vars.md` (NANGO_SECRET_KEY,
NANGO_PUBLIC_KEY, NANGO_WEBHOOK_SECRET, NANGO_HOST).

## Adding a 7th data source

1. **Pick the integration** in Nango's catalogue
   ([nango.dev/integrations](https://nango.dev/integrations)). If it has
   pre-built syncs (like HubSpot), you skip the custom sync code entirely.
2. **Configure the OAuth app** in the provider's developer console
   (e.g. Google Cloud Console for Google APIs). Capture client ID + secret.
3. **Add the integration** in Nango Dashboard → Integrations → New
   Integration. Paste the OAuth credentials. Select required scopes.
4. **Define the sync** in `nango-integrations/nango.yaml`:
   ```yaml
   integrations:
     <provider-config-key>:
       syncs:
         <sync-name>:
           runs: every 30 minutes
           description: |
             Plain-English description of what the sync pulls and how often.
           output: <ModelName>
           sync_type: full | incremental
           endpoint: <HTTP method + path>
   ```
5. **Write the sync** at `nango-integrations/syncs/<provider>.ts`. Export a
   default async function annotated with `NangoSync`.
6. **Deploy:**
   ```bash
   NANGO_SECRET_KEY=$NANGO_STAGING_SECRET npx nango deploy staging
   ```
7. **Test in Nango dashboard** — trigger a manual sync, verify records appear.
8. **Add the webhook handler** at
   `apps/id/src/lib/integrations/nango/handlers/<provider>.ts`. Register in
   `handlers/index.ts`. Schema-validate the payload with Zod.
9. **Write to cache:** `kinetiks_metric_cache` for time-series,
   `kinetiks_crm_entities` for entity-shaped data.
10. **Extend `METRIC_REGISTRY`** with any new metrics the provider produces.
11. **Wire a per-source query tool** at
    `apps/id/src/lib/tools/<provider>-query.ts` following the `ga4_query`
    shape. Register in `apps/id/src/lib/tools/registry-boot.ts`.
12. **Optionally write proposal derivation** at
    `apps/id/src/lib/oracle/proposals/<provider>-proposals.ts` if the sync
    reveals Cortex-relevant facts.
13. **Update this runbook** + `docs/operational/env-vars.md` if any new
    env vars are required (rare; most are managed by Nango itself).

Cross-source detectors automatically pick up the new source if its metrics
land in `METRIC_REGISTRY` with consistent units.

## Diagnosing a webhook delivery failure

1. Check `kinetiks_sync_logs` for the most recent rows from that source.
   `error` column carries our parser's failure reason if we received but
   couldn't process.
2. If no recent rows arrived at all, check Nango Dashboard →
   Connections → <connection> → Webhooks tab. Nango shows delivery attempts
   + response codes from our endpoint.
3. Common causes:
   - **HMAC mismatch** → `NANGO_WEBHOOK_SECRET` in Vercel doesn't match
     Nango Dashboard → Environment Settings → Webhook signature. Rotate
     and redeploy.
   - **Body too large** → Nango caps webhook body at 1MB. Large sync runs
     deliver the metadata; we then fetch records via API. Make sure the
     handler is calling `GET /records`, not relying solely on the webhook
     body.
   - **Timeout** → handler must complete in 20s. Move heavy work to the
     `oracle-analysis-cron` pipeline; the webhook handler should just
     normalize + write.
4. Sentry tag `route='integrations/nango/webhook'` surfaces handler errors.

## Triaging sync errors in production

1. **Sentry** breadcrumb `nango.sync.failed` with `extra.providerConfigKey`,
   `extra.syncName`, `extra.accountId`.
2. **Nango Dashboard** → Logs → filter by error level. Each failure has a
   stack trace + the inputs (anonymized).
3. **Common failure shapes:**
   - **Token expired and refresh failed** → user must reconnect. Surface
     the "reconnect" prompt in Analytics tab's SourcesPanel.
   - **Provider rate-limited** → Nango handles retry with backoff; if it
     gives up, the sync stays errored until the next scheduled run.
   - **Provider API change** → our normalizer breaks. Fix the normalizer
     in `apps/id/src/lib/integrations/nango/handlers/<provider>.ts`,
     no Nango redeploy needed.

## Evaluating a Cloud → self-host migration

Trigger: monthly Cloud cost exceeds $5,000.

Cost comparison (rough):
- **Cloud Growth + overage at 1000 accounts:** ~$5,000–$8,000/mo
- **Self-host:** ~$300/mo infrastructure (Render/Fly: server, Postgres,
  Redis, Elasticsearch, S3) + 1 engineer on-call for outages

Self-host stack required (per Nango docs):
- Postgres (2 CPU, 8GB, 128GB SSD)
- Redis
- Elasticsearch (2 vCPU, 1GB, 30GB)
- S3 or compatible object storage
- 5 Node services: Server, Persist, Runner, Jobs, Orchestrator

Migration steps:
1. Provision the stack on Render or Fly. Document infra in `infra/nango/`.
2. Deploy Nango self-hosted services from Docker images.
3. Re-configure each integration in the self-hosted dashboard with the
   same OAuth credentials.
4. **Re-auth all connections.** Nango doesn't export connection state
   between instances; every customer must reconnect. Plan a maintenance
   window or a phased cutover by provider.
5. Repoint `NANGO_HOST` env var in Vercel + Supabase.
6. Run the GA4 / Stripe / etc. syncs in parallel on both Cloud and
   self-host for a week before tearing down Cloud.

Estimated effort: 2 weeks of focused engineering.

## Out of scope for D2

- Ad-level Meta Ads granularity (only campaign-level + insights). D3.
- LinkedIn Ads, Twitter Ads, TikTok Ads, YouTube Ads. D4+.
- Webflow, PostHog, Beehiiv, Klaviyo, custom GraphQL/REST. Future.
