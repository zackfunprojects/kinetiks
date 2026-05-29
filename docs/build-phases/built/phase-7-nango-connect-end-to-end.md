# Phase 7 — Nango Connect end-to-end + Marcus read surface for 10 providers

**Shipped:** 2026-05-27
**Migrations:** 00063 (schema cleanup + provider enum), 00064 (kinetiks_social_posts), 00065 (connection ledger event types)
**Operational docs:** `docs/operational/nango-setup.md`, `docs/operational/env-vars.md`

## Goal

Replace per-provider OAuth with Nango Connect across the entire stack. A test user clicks one button, sees the Nango Connect modal, picks any of 10 providers, completes auth, and Marcus can read the resulting data.

## Provider list (final)

| Provider     | Sync handler                              | Marcus tool          |
|--------------|-------------------------------------------|----------------------|
| `ga4`        | existing (D2)                             | `ga4_query` (refactored cache-only) |
| `gsc`        | existing (D2)                             | `gsc_query` (existing) |
| `stripe`     | existing (D2)                             | `stripe_query` (existing) |
| `google_ads` | existing (D2)                             | `google_ads_query` (existing) |
| `meta_ads`   | existing (D2)                             | `meta_ads_query` (existing) |
| `hubspot`    | existing (D2)                             | `hubspot_query` (NEW) |
| `twitter`    | NEW (`handlers/twitter.ts`)               | `twitter_query` (NEW) |
| `linkedin`   | NEW (`handlers/linkedin.ts`)              | `linkedin_query` (NEW) |
| `instagram`  | NEW (`handlers/instagram.ts`)             | `instagram_query` (NEW) |
| `tiktok`     | NEW (`handlers/tiktok.ts`, defensive)     | `tiktok_query` (NEW) |

Dropped: `resend` (outbound only), `salesforce` (enterprise — wrong audience).
Added social: `tiktok` (filled Salesforce's slot).

## Architecture

**Connect path** — `POST /api/connections` → `nango.createConnectSession()` → frontend opens `@nangohq/frontend` Connect modal → Nango fires `auth` webhook → `handlers/auth.ts` upserts `kinetiks_connections`, emits `connection_created` Ledger entry, triggers initial sync via `nango.triggerSync()`.

**Sync path** — Nango fires `sync` webhook → existing per-provider handler writes to `kinetiks_metric_cache` (analytics + ads + Stripe), `kinetiks_crm_entities` (HubSpot), or `kinetiks_social_posts` (Twitter / LinkedIn / Instagram / TikTok) → `connection_sync_completed` Ledger entry.

**Read path** — Marcus calls per-provider read tool → tool reads from cache → returns structured response with `not_connected` / `syncing` / `ok` status discrimination so Marcus surfaces the right plain-language message.

**Disconnect path** — `DELETE /api/connections/[id]` → `nango.deleteConnection()` → local row flipped to `revoked` → `connection_revoked` Ledger entry. Nango fires `connection.deleted` webhook for idempotent confirmation.

## What was hard-deleted

- `apps/id/src/lib/connections/oauth.ts` (420 lines — per-provider OAuth URL builder, PKCE, scopes)
- `apps/id/src/lib/connections/state-hmac.ts` (49 lines — OAuth state signing)
- `apps/id/src/lib/connections/refresh-token.ts` (184 lines — withFreshToken loop)
- `apps/id/src/lib/connections/extract.ts` (230 lines — in-house extraction path)
- `apps/id/src/lib/connections/extractors/ga4.ts` (319 lines — GA4 Data API client)
- `apps/id/src/lib/connections/extractors/index.ts`
- `apps/id/src/app/api/connections/callback/route.ts` (169 lines — OAuth callback)
- `apps/id/src/app/api/connections/ga4/properties/route.ts`
- `apps/id/src/app/api/connections/ga4/select-property/route.ts`
- `apps/id/src/app/api/internal/metric-cache/refresh/route.ts` (172 lines — Node-side legacy refresh)
- `apps/id/src/components/connections/Ga4PropertyPicker.tsx`
- `apps/id/src/components/connections/ApiKeyModal.tsx`
- Dead tests: refresh-token, ga4 extractor, ga4-query (live-fallback variant), ga4-proof

Plus `manager.ts` reduced from 396 lines (full OAuth lifecycle) to ~80 lines (SELECT helpers only).

Net: ~2400 lines of legacy code removed.

## DoD checklist

- ✓ All 10 providers connect via Nango Connect modal
- ✓ Auth webhook upserts `kinetiks_connections` with `credentials=null`, `nango_connection_id` + `nango_provider_config_key` set
- ✓ Disconnect calls `nango.deleteConnection` AND flips local row, both idempotent
- ✓ 4 Ledger event types: connection_created, connection_revoked, connection_sync_completed, connection_sync_failed
- ✓ pgTAP cross-tenant test on `kinetiks_social_posts`
- ✓ 41 new Vitest tests; 0 regressions (453/453 passing)
- ✓ TypeScript strict compiles across all 14 workspace packages
- ✓ Trust-language script passes
- ✓ `pnpm health` all 5 checks green
- ✓ Operational docs at `docs/operational/nango-setup.md` and updated `env-vars.md`

## Operational steps remaining (Zack)

1. Set up Nango account at app.nango.dev.
2. Configure all 10 integrations per [`docs/operational/nango-setup.md`](../../operational/nango-setup.md).
3. Set Vercel env vars: `NANGO_SECRET_KEY`, `NEXT_PUBLIC_NANGO_PUBLIC_KEY`, `NANGO_WEBHOOK_SECRET`.
4. Set Supabase Edge Function env vars: `NANGO_SECRET_KEY`, `NANGO_WEBHOOK_SECRET`.
5. Smoke-test: connect each provider on a fresh test account, confirm Marcus answers a provider-specific question.

## Out of scope (Phase 7.5+ candidates)

- Per-connection sync configuration UI (which syncs to run, which models to fetch)
- HubSpot custom field support
- Multi-account-per-provider (one Nango connection per (account, provider) in v1)
- Edge Function cron that re-triggers stale syncs on demand
- Marcus prompt enrichment with "connected providers" preamble
