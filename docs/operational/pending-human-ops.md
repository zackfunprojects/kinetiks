# Pending human ops - what only you can do

The complete, current set of steps that require the Vercel dashboard, the
Supabase dashboard, or a third-party provider console - i.e. things I cannot do
from a code change or the Supabase CLI. Finished items are not listed here.

Last updated: 2026-06-15.

**How to use this:** set each env var on the surface noted (Vercel project
`kinetiks-id`, and/or Supabase Edge secrets via `supabase secrets set`).
**Vercel env changes need a redeploy** to take effect. After each change,
verify with `pnpm health` and `GET https://id.kinetiks.ai/api/health`.

**Two things to know up front:**
- The app is served at **`https://id.kinetiks.ai`**. The apex `kinetiks.ai` is
  the marketing site and 404s `/api`. Every OAuth redirect / webhook URL below
  uses `id.kinetiks.ai`, and `NEXT_PUBLIC_APP_URL` must match it.
- Stale docs to ignore: `docs/operational/env-vars.md` and `nango-setup.md`
  show some URLs as `kinetiks.ai` (wrong) and label the PostHog key
  `POSTHOG_API_KEY` (code reads `NEXT_PUBLIC_POSTHOG_KEY`). This file is correct;
  those are queued for a cleanup pass.

Nothing below is blocking the core app from running - it boots and is safe
today. Each section **lights up a feature** that is built but dark in prod.

Priority legend: **[P1]** do before real users · **[P2]** when you need that
feature · **[opt]** optional / cleanup.

---

## 0. [P1] Foundational env (no external console - just Vercel)

These gate everything downstream. The boot-required ones (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
`KINETIKS_ENCRYPTION_KEY`) must already be set or the app wouldn't boot - **verify
them**, don't assume. The action items here are the ones easy to get wrong:

| Env var | Where | Value / step |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Vercel **and** Supabase Edge secret | `https://id.kinetiks.ai` (the base for every OAuth redirect + email/Slack deep link; must equal the host you register callbacks against). |
| `KINETIKS_ENCRYPTION_KEY` | Vercel | 32-byte hex, `openssl rand -hex 32`. AES-256-GCM key for OAuth/system tokens at rest. **Never rotate** once connections exist (invalidates every stored token). |
| `INTERNAL_SERVICE_SECRET` | Vercel **and** Supabase Edge secret (identical value) | Long random string. Edge crons use it to call back into `apps/id`; a mismatch silently 401s every cron (oracle, archivist, model-discovery, email-poll, meeting-prep, fixtures). |
| `ADMIN_BOOTSTRAP_USER_IDS` | Vercel | Your `auth.users.id` (comma-separated for multiple). Boot-seeds `kinetiks_admins` so `/admin` opens. Until set, `/admin` 404s for everyone (safe default). Find your id: `select u.id, u.email from auth.users u order by u.created_at;` |

After setting: redeploy, then `https://id.kinetiks.ai/api/health` should show the
env booleans true and (signed in) `jwt.claim_matches_db: true`.

---

## 1. [P1] Sentry - production error reporting (prod is blind without it)

Until this is set, `captureException` no-ops in prod and you have zero error
visibility. Do this first so failures setting up everything else are visible.

1. Sentry -> Create Project -> platform **Next.js**, name `kinetiks-id`.
2. Settings -> Client Keys (DSN) -> copy the DSN.
3. Set BOTH on Vercel (same DSN): `SENTRY_DSN` (server) and
   `NEXT_PUBLIC_SENTRY_DSN` (browser). Redeploy.

---

## 2. [P1] Nango - data connections (GA4, Stripe, GSC, ads, social, CRM)

This is the fuel for the whole intelligence layer. Without it the product runs
on fixtures only - no real customer metrics reach the Metric Cache, so Oracle /
Patterns / Marcus recommendations have no real data.

**2a. Create the 10 integrations** (Nango Dashboard -> Integrations -> New).
The `nango_integration_id` must match exactly (pinned in
`apps/id/src/lib/integrations/nango/provider-config.ts`) or the Connect modal
fails with "unknown integration":

| Kinetiks provider | Nango integration_id | Scopes (summary) | Syncs to enable |
|---|---|---|---|
| ga4 | `google-analytics` | `analytics.readonly` | `ga4-traffic-metrics`, `ga4-conversion-events` |
| gsc | `google-search-console` | `webmasters.readonly` | `gsc-search-analytics`, `gsc-sitemap-status` |
| stripe | `stripe-app` | Stripe OAuth app | `stripe-charges`, `stripe-subscriptions`, `stripe-customers` |
| google_ads | `google-ads` | `adwords` + Developer Token (on the Nango integration) | `google-ads-campaigns`, `google-ads-keywords` |
| meta_ads | `facebook-ads` | `ads_read`, `business_management` | `meta-ads-campaigns`, `meta-ads-insights` |
| hubspot | `hubspot` | `crm.objects.{deals,contacts,companies}.read`, `crm.schemas.deals.read` | `hubspot-deals`, `-contacts`, `-companies`, `-owners`, `-pipelines` |
| twitter | `twitter` | OAuth2 + PKCE (API v2) | `twitter-recent-posts`, `twitter-profile-stats` |
| linkedin | `linkedin` | LinkedIn Marketing API (apply via dev portal) | `linkedin-posts`, `linkedin-org-stats` |
| instagram | `instagram-business` | Business/Creator acct linked to an FB Page | `instagram-media`, `instagram-insights` |
| tiktok | `tiktok` | TikTok Business API | `tiktok-videos`, `tiktok-account-stats` |

Each provider needs its own developer-console OAuth app (Google Cloud, HubSpot,
Twitter, Meta, LinkedIn, TikTok, Stripe Connect) whose redirect URI is the
**Nango callback** (Nango shows it per integration, typically
`https://api.nango.dev/oauth/callback`). Google Ads also needs a Developer Token
on the Nango integration.

**2b. Webhook** (Nango -> Environment Settings -> Webhooks):
- URL: `https://id.kinetiks.ai/api/integrations/nango/webhook`
- Enable "Sign with HMAC", generate secret -> `NANGO_WEBHOOK_SECRET` (Vercel).
- Enable events: `sync`, `auth`. Forward events off.

**2c. Keys** (Nango -> Environment Settings -> API Keys):
- Secret Key -> `NANGO_SECRET_KEY` (Vercel **and** Supabase Edge secret).
- Public Key -> `NEXT_PUBLIC_NANGO_PUBLIC_KEY` (Vercel).
- (`NEXT_PUBLIC_NANGO_HOST` / `NANGO_HOST` only if self-hosting Nango.)

**Smoke test:** sign up a fresh prod account -> `/cortex/integrations` ->
Connect a provider -> modal completes -> card flips Active -> a row appears in
`kinetiks_sync_logs` within ~60s.

---

## 3. [P2] Google Cloud - Workspace email + Calendar (system connections)

Separate from GA4/GSC, whose OAuth clients live in Nango (section 2). Email and
Calendar are **system connections** - the platform holds send/act tokens - so
they need a Google OAuth client in OUR env.

1. **Enable APIs** (Google Cloud Console -> APIs & Services -> Library): Gmail
   API, Google Calendar API. (GA4 Data API + Search Console API too if you want
   the Nango GA4/GSC apps on the same project.)
2. **OAuth consent screen** (External): app name, support email, logo, homepage
   `https://kinetiks.ai`, privacy/ToS. Scopes: `gmail.send`, `gmail.readonly`,
   `gmail.modify`, `calendar.events`, `calendar.readonly`, `openid email`.
   Gmail scopes are restricted -> either keep in Testing with allow-listed
   users, or publish to Production and complete Google's CASA verification
   before non-test users can connect.
3. **OAuth client (Web application)** -> Authorized redirect URIs (both,
   byte-exact):
   - `https://id.kinetiks.ai/api/connections/system/google_workspace/callback`
   - `https://id.kinetiks.ai/api/connections/system/calendar/callback`
   - Client ID -> `GOOGLE_WORKSPACE_CLIENT_ID` (Vercel)
   - Client secret -> `GOOGLE_WORKSPACE_CLIENT_SECRET` (Vercel)

Until set, the Email/Calendar cards render "Not configured" (safe).

---

## 4. [P2] Slack app - system connection + inbound events/interactivity

One app at api.slack.com/apps serving OAuth install + inbound.

1. **OAuth & Permissions** -> Redirect URL:
   `https://id.kinetiks.ai/api/connections/system/slack/callback`. Bot scopes:
   `app_mentions:read`, `channels:history`, `channels:read`, `chat:write`,
   `chat:write.customize`, `groups:history`, `groups:read`, `im:history`,
   `im:read`, `im:write`, `users:read`. No user scopes.
2. **Basic Information** -> App Credentials:
   - Client ID -> `SLACK_CLIENT_ID` (Vercel)
   - Client Secret -> `SLACK_CLIENT_SECRET` (Vercel)
   - Signing Secret -> `SLACK_SIGNING_SECRET` (Vercel)
3. **Event Subscriptions** -> enable, Request URL
   `https://id.kinetiks.ai/api/slack/events` (handles the URL-verification
   handshake). Subscribe to `app_mention`, `message.im`.
4. **Interactivity & Shortcuts** -> enable, Request URL
   `https://id.kinetiks.ai/api/slack/interactive` (approval-card buttons).

(`SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` are retired - leave unset.)

---

## 5. [P2] Stripe - subscription billing (the `/api/billing/*` surface)

Distinct from Stripe analytics, which flows through Nango (section 2).

1. **API key** (Developers -> API keys): Secret key -> `STRIPE_SECRET_KEY`.
2. **Products/Prices** (three recurring monthly Prices matching
   `lib/billing/plans.ts`: $29 / $79 / $199):
   - Starter Price ID -> `STRIPE_PRICE_STARTER`
   - Pro Price ID -> `STRIPE_PRICE_PRO`
   - Team Price ID -> `STRIPE_PRICE_TEAM`
   (A missing price makes only that tier "Not available".)
3. **Webhook** (Developers -> Webhooks -> Add endpoint):
   - URL `https://id.kinetiks.ai/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `invoice.paid`, `invoice.payment_failed`
   - Signing secret (`whsec_...`) -> `STRIPE_WEBHOOK_SECRET`
4. Enable the **Customer Portal** (Settings -> Billing -> Customer portal) for
   `/api/billing/portal`.

All on Vercel. If `STRIPE_SECRET_KEY` is unset the plan-picker shows
"Subscriptions aren't configured" (safe).

---

## 6. [P2] Resend - transactional email fallback

Used by `lib/email/sender.ts` only when an account has no Workspace connection.

1. Resend -> Domains -> Add domain (e.g. `kinetiks.ai`); add the DKIM/SPF/
   return-path DNS records and verify.
2. API Keys -> create -> `RESEND_API_KEY` (Vercel).
3. `RESEND_FROM_EMAIL` (Vercel) - an address on the verified domain (default
   `notifications@kinetiks.ai`).

---

## 7. [P2] PostHog - product analytics

1. PostHog -> create Project -> Project Settings -> Project API Key.
2. `NEXT_PUBLIC_POSTHOG_KEY` (Vercel). Optional `NEXT_PUBLIC_POSTHOG_HOST`
   (defaults to US cloud). Until set, the analytics wrapper no-ops.

---

## 8. [P2] Firecrawl - Cartographer onboarding crawl

`FIRECRAWL_API_KEY` (Vercel). Firecrawl key for website crawling during intake.
Unset = the onboarding intake crawl is disabled (onboarding still works without
the auto-enrichment).

---

## 9. [opt] Cleanup / do-not-set

- `GA4_CLIENT_ID` / `GA4_CLIENT_SECRET`: legacy per-provider GA4 OAuth,
  superseded by Nango. No code reads them - safe to **remove** from Vercel.
- `MICROSOFT_365_CLIENT_ID` / `_SECRET`: M365 system connection is deferred (no
  Azure app exists, no code path) - do not set.
- `HARVEST_API_URL`: only matters once `apps/hv` (out of scope) is live;
  default `https://hv.kinetiks.ai` is fine.
- `KINETIKS_FIXTURES_ENABLED`: must be **false/unset in prod** (it is the
  dev/staging synthetic-pattern substrate). Both the Vercel and Supabase
  surfaces must agree.

---

## Suggested order

`NEXT_PUBLIC_APP_URL` + `KINETIKS_ENCRYPTION_KEY` + `INTERNAL_SERVICE_SECRET`
(section 0) -> Sentry (1) -> Nango (2) -> Google Cloud (3) -> Slack (4) ->
Stripe (5) -> Resend (6) -> PostHog (7) -> Firecrawl (8) -> `ADMIN_BOOTSTRAP_USER_IDS`
whenever you want `/admin`. Redeploy + `pnpm health` after each.
