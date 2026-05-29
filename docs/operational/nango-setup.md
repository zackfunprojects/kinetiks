# Nango setup — operational guide

Phase 7 made Nango the canonical OAuth and sync provider for every external integration in Kinetiks Core. This doc is the step-by-step setup for a fresh Nango account.

**Scope:** 10 integrations (GA4, GSC, Stripe, Google Ads, Meta Ads, HubSpot, Twitter, LinkedIn, Instagram, TikTok). One time setup per integration.

---

## Prerequisites

- Nango account at https://app.nango.dev
- Provider developer-console access for each integration (Google Cloud, HubSpot, Twitter Developer Portal, etc.)
- Production Vercel project (apps/id) admin access for env vars
- Supabase production project admin access for Edge Function env vars

---

## Step 1 — Create Nango integrations

In the Nango dashboard, **Integrations → New Integration**, configure each of the 10 in turn. The exact set the platform expects is declared in [`apps/id/src/lib/integrations/nango/provider-config.ts`](../../apps/id/src/lib/integrations/nango/provider-config.ts) — never change the `nango_integration_id` here without also updating that file.

| Kinetiks provider | Nango integration_id  | Auth      | Notes |
|-------------------|-----------------------|-----------|-------|
| `ga4`             | `google-analytics`    | OAuth     | Scope: `analytics.readonly`. Provider details in Google Cloud Console > APIs & Services > Credentials. Property selection happens inside the Connect modal. |
| `gsc`             | `google-search-console` | OAuth   | Scope: `webmasters.readonly`. Same OAuth app as GA4 is usable; the scope set is the discriminator. |
| `stripe`          | `stripe-app`          | OAuth     | Use Stripe's OAuth app; Nango handles refresh. API-key fallback is configurable in Nango but we prefer OAuth for revocability. |
| `google_ads`      | `google-ads`          | OAuth     | Scope: `adwords`. Requires a Developer Token from the Google Ads API; configured on the Nango integration, not in our env. |
| `meta_ads`        | `facebook-ads`        | OAuth     | Scope: `ads_read`, `business_management`. Connects via the customer's Meta Business account. |
| `hubspot`         | `hubspot`             | OAuth     | Scope: `crm.objects.deals.read`, `crm.objects.contacts.read`, `crm.objects.companies.read`, `crm.schemas.deals.read`. |
| `twitter`         | `twitter`             | OAuth + PKCE | Twitter API v2. Free tier rate limits apply; Nango handles retry. |
| `linkedin`        | `linkedin`            | OAuth     | Requires LinkedIn Marketing API access (apply through LinkedIn Developer portal). |
| `instagram`       | `instagram-business`  | OAuth     | Personal accounts not supported. Customer must connect a Business or Creator account linked to a Facebook Page. |
| `tiktok`          | `tiktok`              | OAuth     | TikTok Business API. Schema drifts quarterly; our handler is defensive. |

For each integration:

1. Click **+ New Integration**, search the provider list, pick the matching template (e.g. "Google Analytics 4").
2. Paste your provider-side OAuth client_id + client_secret. For some providers (Twitter, TikTok) Nango walks you through extra fields.
3. Set scopes per the table above.
4. **Save**.
5. Enable the syncs declared in [`provider-config.ts`](../../apps/id/src/lib/integrations/nango/provider-config.ts). Each sync_name listed there must be turned on in Nango for that integration. Most are pre-built syncs Nango ships with; a few (TikTok) may require selecting from a list of available models.

---

## Step 2 — Configure the webhook

In Nango: **Settings → Webhooks**.

- **Webhook URL:** `https://kinetiks.ai/api/integrations/nango/webhook` (production). For local dev, use a tunnel (ngrok/cloudflared) pointing at your local server.
- **HMAC secret:** generate one (Nango's UI provides a generator). This becomes the `NANGO_WEBHOOK_SECRET` env var below.
- **Events:** enable `sync`, `auth`. Forward events stay disabled (we do not consume them yet).

---

## Step 3 — Set environment variables

In **Vercel (apps/id project)** → Settings → Environment Variables (Production + Preview):

| Variable                       | Value                                        | Notes |
|--------------------------------|----------------------------------------------|-------|
| `NANGO_SECRET_KEY`             | from Nango Settings → API Keys → Secret Key  | Server-side only; never exposed to the frontend |
| `NEXT_PUBLIC_NANGO_PUBLIC_KEY` | from Nango Settings → API Keys → Public Key  | Bundled into the frontend; safe to publish |
| `NEXT_PUBLIC_NANGO_HOST`       | (optional) Nango host override               | Default `https://api.nango.dev`; only set if using a custom region |
| `NANGO_WEBHOOK_SECRET`         | from Step 2                                  | HMAC verification for inbound webhooks |

In **Supabase (project ioptgqtzykqwnebwkioo)** → Edge Functions → Manage Secrets:

| Variable                       | Value                                        |
|--------------------------------|----------------------------------------------|
| `NANGO_SECRET_KEY`             | same as Vercel                               |
| `NANGO_WEBHOOK_SECRET`         | same as Vercel                               |

(The auth/sync webhook handler runs in apps/id, but the Edge Function crons that may trigger re-syncs need the SDK secret too.)

**Env vars to remove** as part of Phase 7 deployment (no longer used after legacy OAuth code was deleted):

```
GA4_CLIENT_ID, GA4_CLIENT_SECRET,
GSC_CLIENT_ID, GSC_CLIENT_SECRET,
HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET,
SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET,
TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET,
LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET,
INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET,
META_ADS_ACCESS_TOKEN,
GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET
```

Removal is optional but recommended to avoid surprise — they cannot affect anything now that the code paths reading them are deleted.

---

## Step 4 — Smoke test

Once configured:

1. Sign up a fresh test account in production (`https://kinetiks.ai`).
2. Land on `/connections`.
3. Click **Connect** on any provider. The Nango Connect modal should open.
4. Complete OAuth against a test provider account.
5. Modal closes; the connection card flips from "Connect" to "Active" within a few seconds.
6. Check `kinetiks_sync_logs` in Supabase — the initial sync should land within ~60 seconds.
7. In Chat, ask Marcus a provider-specific question (e.g. "what's my traffic?" for GA4, "what's in my pipeline?" for HubSpot). Marcus should answer using cache-backed data.

Repeat per provider as you finish configuring each one.

---

## Troubleshooting

- **"Connect button does nothing"**: Check the browser console. If `NEXT_PUBLIC_NANGO_PUBLIC_KEY is not set` shows, the env var didn't land in the frontend bundle — redeploy after setting it.
- **"Webhook 401 in Nango dashboard"**: HMAC secret mismatch between Nango and `NANGO_WEBHOOK_SECRET`. Re-copy from Nango.
- **"Connection created in Nango but never appears in Kinetiks"**: Check the webhook delivery in Nango → Logs. If the webhook fired but returned 4xx, see the response body. Most common cause: end_user.id format mismatch. The end_user.id our route sets is `kt_<account_uuid>`; if the modal was opened outside the standard flow, the format is wrong and our auth handler drops the event.
- **"Sync webhook arriving but no data appearing"**: Check `kinetiks_sync_logs` for the row. If `status='failed'`, the handler's `error_class` and `error_message` columns tell you why. If `status='succeeded'` but `records_added=0`, the customer's account is empty for that sync model.
- **"TikTok sync errors quarterly"**: The TikTok handler's defensive normalization should keep the sync from failing entirely. Unknown fields land in `metadata.extra`. If a sync stops working, check the Nango integration page for available models and compare to the sync_names listed in [provider-config.ts](../../apps/id/src/lib/integrations/nango/provider-config.ts).

---

## Adding a new provider

1. Add the Kinetiks `ConnectionProvider` value to the union in [`packages/types/src/connections.ts`](../../packages/types/src/connections.ts).
2. Add the `ProviderDefinition` entry in [`apps/id/src/lib/connections/providers.ts`](../../apps/id/src/lib/connections/providers.ts).
3. Add the `NangoProviderConfig` entry in [`provider-config.ts`](../../apps/id/src/lib/integrations/nango/provider-config.ts) — declare `nango_integration_id` + `sync_names`.
4. Write the sync handler in `apps/id/src/lib/integrations/nango/handlers/<provider>.ts`. For social platforms, use the `runSocialPostSync` shared helper from `_social-post-shared.ts`. For analytics/CRM, copy the GA4 / HubSpot pattern.
5. Register the handler in `apps/id/src/lib/integrations/nango/handlers/boot.ts`.
6. Write the Marcus query tool in `apps/id/src/lib/tools/<provider>-query.ts`. For social platforms, use `defineSocialReadTool`. For analytics, copy `ga4-query.ts` or `hubspot-query.ts`.
7. Register the tool in `apps/id/src/lib/tools/registry-boot.ts`.
8. Configure the new integration in the Nango dashboard (per Step 1 above).
9. Add the matching env vars / scopes / webhook entry if anything new is required.
10. Ship.
