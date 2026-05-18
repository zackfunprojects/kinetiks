# Environment Variables — Canonical Inventory

This is the source of truth for what env vars the system reads, where each
needs to be set, and how to generate the value. If you set or rotate
anything, update this doc in the same PR.

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
| `INTERNAL_SERVICE_SECRET` | yes | yes | Shared bearer Edge Functions use when calling back into apps/id (e.g. `metric-cache-cron` → `/api/internal/...`). Same exact value on both sides. Generate with any password manager, 32+ chars. |
| `NEXT_PUBLIC_APP_URL` | yes | no | Production: `https://kinetiks.ai`. Used in OAuth redirects + email templates. |

## Required for specific integrations

Missing one of these means the feature it owns silently doesn't work; the
rest of the app keeps running. Order roughly by importance.

| Variable | Vercel | Supabase | Owns |
| --- | --- | --- | --- |
| `NANGO_SECRET_KEY` | yes | no | Server-side Nango SDK auth. Owns OAuth + sync orchestration for all six D2 integrations (GA4, GSC, Stripe, Meta Ads, Google Ads, HubSpot). Get from Nango dashboard → Environment Settings. **Never expose to the browser.** |
| `NANGO_PUBLIC_KEY` | yes | no | Client-side Connect UI (`@nangohq/frontend`). Safe to ship to browser. Same source as the secret. |
| `NANGO_WEBHOOK_SECRET` | yes | no | HMAC-SHA256 verification for inbound webhooks at `/api/integrations/nango/webhook`. Generate in the Nango dashboard → Environment Settings → Webhook signature. |
| `NANGO_HOST` | yes | no | Nango API base URL. Default `https://api.nango.dev` (Nango Cloud). Override only when migrating to self-host. |
| `IDENTITY_API_URL` | no | yes | Where `metric-cache-cron` (Deno) calls into apps/id (Node). Default `https://kinetiks.ai`. Only needed on the Supabase Edge Function side. |
| `HARVEST_API_URL` | no | yes | Where `gmail-sync-cron` / `sequence-cron` call Harvest. Default `https://hv.kinetiks.ai`. |
| `RESEND_API_KEY` | yes | no | Transactional email send (briefs, system identity). |
| `FIRECRAWL_API_KEY` | yes | no | Crawler used by Cartographer. |
| `PEOPLE_DATA_LABS_API_KEY` | yes | no | Contact enrichment in Harvest. |
| `GA4_CLIENT_ID` / `GA4_CLIENT_SECRET` | nango | no | **D2 migration:** these now live in Nango's GA4 integration config, not Vercel. Slice 12 removes them from Vercel. Kept as the OAuth client identity that Nango uses to talk to Google. |
| `GSC_CLIENT_ID` / `GSC_CLIENT_SECRET` | nango | no | Same — stored in Nango's google-search-console integration. |
| `STRIPE_SECRET_KEY` | nango | no | Same — Nango stripe integration. |
| `HUBSPOT_CLIENT_ID` / `HUBSPOT_CLIENT_SECRET` | nango | no | Same — Nango hubspot integration. |
| `GOOGLE_ADS_CLIENT_ID` / `_CLIENT_SECRET` | nango | no | Same — Nango google-ads integration. |
| `META_ADS_ACCESS_TOKEN` | nango | no | Same — Nango facebook integration handles the Marketing API token. |
| `GOOGLE_WORKSPACE_CLIENT_ID` / `_CLIENT_SECRET` | yes | no | Email integration (C1). **Not migrated to Nango** — this is system identity, different lifecycle. |
| `MICROSOFT_365_CLIENT_ID` / `_CLIENT_SECRET` | yes | no | Email integration (C1). Same reason as above. |
| `SLACK_BOT_TOKEN` | yes | no | Slack bot (C2). |
| `SLACK_SIGNING_SECRET` | yes | no | Slack webhook verification. |
| `SLACK_APP_TOKEN` | yes | no | Slack socket-mode (if used). |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | yes | no | Slack OAuth flow. |

## Optional observability

| Variable | Vercel | Supabase | Notes |
| --- | --- | --- | --- |
| `SENTRY_DSN` | yes | no | Error capture. Project: kinetiks-id. |
| `POSTHOG_API_KEY` | yes | no | Product analytics. |

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
