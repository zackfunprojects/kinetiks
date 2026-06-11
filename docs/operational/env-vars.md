# Environment Variables — Canonical Inventory

This is the source of truth for what env vars the system reads, where each
needs to be set, and how to generate the value. If you set or rotate
anything, update this doc in the same PR.

## Phase 7 deletions (no longer needed; safe to remove from Vercel)

The legacy per-provider OAuth code paths were deleted; Nango holds these
credentials now. Removing them from Vercel is optional but recommended:

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

See [`docs/operational/nango-setup.md`](nango-setup.md) for the per-provider
setup steps in the Nango dashboard.

---


Two surfaces consume env vars:

1. **Vercel** — the running web app. Set per project (`kinetiks-id` at
   minimum) under Project Settings → Environment Variables. Each value
   needs to be present in all three environments (Production, Preview,
   Development) unless noted.
2. **Supabase Edge Function secrets** — the cron + worker functions.
   Set under Project Settings → Edge Functions → Secrets.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-provisioned by
Supabase on every Edge Function. Do not set them manually.

## Required (the app will not work without these)

| Variable | Vercel | Supabase | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | n/a (auto) | Public Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | n/a | Public JWT, shipped to browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | n/a (auto) | Service-role key. Never logged. |
| `ANTHROPIC_API_KEY` | yes | no | Marcus + every Haiku call routes through here. |
| `KINETIKS_ENCRYPTION_KEY` | yes | no | 32-byte hex. AES-256-GCM key for OAuth tokens at rest. Generate once with `openssl rand -hex 32`; rotating it invalidates every stored OAuth token. **Currently missing from Vercel — this is the most critical gap.** |
| `INTERNAL_SERVICE_SECRET` | yes | yes | Shared bearer Edge Functions use when calling back into apps/id (e.g. `oracle-analysis-cron` → `/api/internal/...`). Same exact value on both sides. Generate with any password manager, 32+ chars. |
| `NEXT_PUBLIC_APP_URL` | yes | no | Production: `https://kinetiks.ai`. Used in OAuth redirects + email templates. |

## Required for specific integrations

Missing one of these means the feature it owns silently doesn't work; the
rest of the app keeps running. Order roughly by importance.

| Variable | Vercel | Supabase | Owns |
| --- | --- | --- | --- |
| `NANGO_SECRET_KEY` | yes | yes | Server-side Nango SDK auth. Owns OAuth + sync orchestration for all ten Phase 7 integrations (GA4, GSC, Stripe, Google Ads, Meta Ads, HubSpot, Twitter, LinkedIn, Instagram, TikTok). Get from Nango dashboard → API Keys → Secret Key. **Never expose to the browser.** |
| `NEXT_PUBLIC_NANGO_PUBLIC_KEY` | yes | no | Client-side Connect UI (`@nangohq/frontend`). Safe to ship to browser. Get from Nango dashboard → API Keys → Public Key. |
| `NEXT_PUBLIC_NANGO_HOST` | yes (optional) | no | Nango API base URL override. Default `https://api.nango.dev` (Nango Cloud). |
| `NANGO_WEBHOOK_SECRET` | yes | yes | HMAC-SHA256 verification for inbound webhooks at `/api/integrations/nango/webhook`. Generate in the Nango dashboard → Settings → Webhooks. |
| `IDENTITY_API_URL` | no | yes | Where Deno Edge Functions (e.g. `oracle-analysis-cron`) call into apps/id (Node). Default `https://kinetiks.ai`. Only needed on the Supabase Edge Function side. `metric-cache-cron` was retired in migration 00074: Nango sync has written the cache directly since Phase 7, and the cron's refresh route no longer exists. |
| `KINETIKS_ID_API_URL` | no | yes | Where `authority-defaults-diff-cron` (Phase 5) calls into apps/id. Default `https://kinetiks.ai`. |
| `HARVEST_API_URL` | no | yes | Where `gmail-sync-cron` / `sequence-cron` call Harvest. Default `https://hv.kinetiks.ai`. |
| `RESEND_API_KEY` | yes | no | Transactional email send - the fallback path of `lib/email/sender.ts` (D2) when an account has no `google_workspace` connection. |
| `RESEND_FROM_EMAIL` | yes (with Resend) | no | From address for the Resend fallback (must be on a Resend-verified domain). Default `notifications@kinetiks.ai`. The display name is always the customer's system name ("Kit via Kinetiks"). |
| `FIRECRAWL_API_KEY` | yes | no | Crawler used by Cartographer. |
| `PEOPLE_DATA_LABS_API_KEY` | yes | no | Contact enrichment in Harvest. |
| `GOOGLE_WORKSPACE_CLIENT_ID` / `_CLIENT_SECRET` | yes | no | **Load-bearing since D1.** Google OAuth client for the `google_workspace` (email) and `calendar` system connections — the direct OAuth flow at `/api/connections/system/[provider]/start`, NOT Nango (the platform itself must hold these send/act tokens). Create in Google Cloud Console → Credentials → OAuth client (Web): add BOTH redirect URIs `https://kinetiks.ai/api/connections/system/google_workspace/callback` and `https://kinetiks.ai/api/connections/system/calendar/callback`; enable the Gmail API and Google Calendar API on the project. Unset = the Email/Calendar cards render "Not configured for this deployment yet." |
| `MICROSOFT_365_CLIENT_ID` / `_CLIENT_SECRET` | no (deferred) | no | Microsoft 365 system connection is deferred until an Azure app registration exists (see QUESTIONS.md, D1). The provider registry in `apps/id/src/lib/connections/system-providers.ts` is the seam where it slots in. |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | yes | no | **Load-bearing since D1.** Slack OAuth v2 client for the `slack` system connection. Create at api.slack.com/apps: add redirect URL `https://kinetiks.ai/api/connections/system/slack/callback`; bot scopes are requested by the app (`chat:write`, `chat:write.customize` for posting under the system's chosen name, `app_mentions:read`, channel/IM read + write, `users:read`). Unset = the Slack card renders "Not configured for this deployment yet." |
| `SLACK_BOT_TOKEN` | no (retired, D2) | no | No code reads this anymore: the `@kinetiks/ai/slack-dispatcher` resolves each account's encrypted bot token from its D1 `slack` connection. Safe to remove from Vercel. |
| `SLACK_SIGNING_SECRET` | yes (D3) | no | Slack inbound webhook verification (`/api/slack/events`, lands in D3). |
| `SLACK_APP_TOKEN` | no | no | Socket-mode only; not used — inbound goes through the public events URL (D3). |

## Optional observability

| Variable | Vercel | Supabase | Notes |
| --- | --- | --- | --- |
| `SENTRY_DSN` | yes | no | Error capture. Project: kinetiks-id. |
| `POSTHOG_API_KEY` | yes | no | Product analytics. |

## Feature flags

| Variable | Vercel | Supabase | Notes |
| --- | --- | --- | --- |
| `KINETIKS_FIXTURES_ENABLED` | yes (dev/staging only) | yes (dev/staging only) | Phase 1.5 fixture emitter switch. When `true`, `fixture-emitter-cron` runs every 2 hours and `/api/internal/fixtures/emit` POSTs Harvest-shaped pattern emissions to `/api/synapse/patterns` with `source_app: "kinetiks_fixtures"`. **Never set to `true` in production.** Both surfaces must agree; the Node route re-checks the flag so a one-sided enable still no-ops. Cleanup: POST `/api/internal/fixtures/cleanup` to archive all fixture-sourced patterns (status flips to `archived`, no DELETE). |

## How to generate values that have to be matched across both surfaces

`INTERNAL_SERVICE_SECRET` and `KINETIKS_ENCRYPTION_KEY` are shared
secrets. The value must match exactly between Supabase and Vercel. Use:

```
INTERNAL_SERVICE_SECRET:  openssl rand -base64 48
KINETIKS_ENCRYPTION_KEY:  openssl rand -hex 32
```

Paste into Supabase first, then into Vercel, copy-paste in the same
clipboard action. Rotating either is a coordinated operation across all
running deployments + Edge Functions and is documented separately when
needed.

`NANGO_WEBHOOK_SECRET` is generated *in the Nango dashboard* (Environment
Settings → Webhooks → Sign with Hmac). Copy from Nango, paste into Vercel.
The value lives on both sides — Nango uses it to sign outbound webhooks;
our `/api/integrations/nango/webhook` route uses it to verify.

## How to verify Vercel matches this inventory

From `apps/id/`:

```
vercel env ls
```

Compare to the "yes" rows above. Anything in the inventory marked
`yes` for Vercel but absent from `vercel env ls` is a real gap.

## How to verify Supabase matches this inventory

Dashboard → Project Settings → Edge Functions → Secrets. Compare to the
"yes" rows for Supabase. CLI alternative:

```
supabase secrets list --project-ref ioptgqtzykqwnebwkioo
```

## Drift policy

If you add a new env-var consumer in code (`process.env.X` via
`@kinetiks/lib/env`), this file must be updated in the same PR. The
pre-merge runbook (CLAUDE.md Definition of Done) calls this out.
