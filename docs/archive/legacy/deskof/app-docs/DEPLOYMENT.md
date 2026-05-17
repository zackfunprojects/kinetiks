# DeskOf — Deployment Guide

## Phase 2.5 deployment posture

DeskOf is **not yet ready for real users.** The Phase 2.5 build closes the worst Phase 1+2 debt items but still has known production gaps that the documented phases will close. This guide tells you what's safe, what isn't, and what each gap requires before flipping it on.

## Architecture

DeskOf is a Next.js 14 (App Router) application that lives at `apps/do/` in the Kinetiks monorepo. It deploys as a single Node.js + Edge surface to Vercel (or any Next-compatible host).

It depends on:

- The shared **Kinetiks Supabase** project (RLS-enforced; see `supabase/migrations/00025-00027`)
- The **Kinetiks ID** session cookie (`.kinetiks.ai`) for authentication and tier resolution
- Three workspace packages: `@kinetiks/cortex`, `@kinetiks/deskof`, `@kinetiks/types`

It does **not yet** depend on Reddit, LLM providers, or any background processor — those land in Phases 1.4 (follow-up), 3, 4, 6 respectively.

## Required environment variables

Copy `apps/do/.env.example` to your deployment target. The minimal set needed for the app to boot:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
KINETIKS_WEBHOOK_SECRET
NEXT_PUBLIC_KINETIKS_BILLING_URL
NEXT_PUBLIC_APP_VERSION
```

If `KINETIKS_WEBHOOK_SECRET` is unset, the inbound deletion webhook receiver returns 503 unconditionally — defense-in-depth so you can never accidentally accept unverified webhooks.

## Database migrations

```bash
# From the monorepo root
cd supabase
supabase db push  # or your usual migration runner
```

The DeskOf-relevant migrations are:

- `00025_deskof_schema.sql` — every `deskof_*` table from CLAUDE.md, RLS, the `reply_requires_human_confirmation` constraint, the `deskof_platform_accounts_safe` view
- `00026_deskof_operator_profiles.sql` — Operator Profile + content URLs + onboarding state + calibration responses
- `00027_deskof_operator_profile_lock_version.sql` — `lock_version` column on profiles, `draft_revision` column on replies (Phase 2 CodeRabbit fixes)

Apply them in order. They are additive — there are no destructive operations in any of these files.

## Phase 2.5 production gates

Below are the things that **must remain disabled** in production until the corresponding phase ships.

### 1. Account deletion (Phase 8)

The `/api/privacy/deletion-webhook` route currently:

- Verifies the HMAC signature
- Records an audit row in `deskof_data_deletion_requests`
- Returns **HTTP 503 with `Retry-After: 3600`** so the upstream caller retries

It does **not** delete tokens, rows, or the Cortex Operator Profile. Until the Phase 8 cascade processor lands, **do not advertise account deletion as a working capability** in your privacy policy or onboarding copy. The 503 is intentional — we'd rather break the webhook delivery than silently lie about deletion. (See `apps/do/src/lib/privacy/deletion.ts`.)

### 2. Reddit posting (Phase 1.4 follow-up)

The Reddit client is not yet built. `/api/reply/post` returns **HTTP 503** with a clear error message for any Reddit opportunity. The Write tab editor disables the Post button for Reddit threads with a tooltip explaining why.

This will land as a small follow-up PR once Reddit Data API access is approved.

### 3. Real Quality Gate (Phase 3)

`upsertDraftReply` writes a stub `PASS_THROUGH_GATE_RESULT` for every draft. There is no real Lens engine yet. **Do not present DeskOf as having a quality gate to users.** The gate UI shell ships in Phase 3.

### 4. Scout intelligence (Phase 4)

Scout v1 only populates `expertise_fit` and `timing_score`. The other three composite dimensions are zero. Suggested angles are always `null`. The `/api/dev/seed-fixtures` route is the only thread source available — there is no production discovery path.

### 5. Pulse tracking (Phase 6)

The `quora_match_status` column gets set to `pending` when the user confirms a Quora handoff, but no job actually runs the 3-layer answer match. Authority Score, citation checking, removal detection, and platform-health snapshots all land in Phase 6.

## Confirmation token storage

The human-confirmation token (`apps/do/src/lib/reply/confirmation-token.ts`) is stored in a process-local in-memory `Map`. **This means DeskOf must run on a single Node.js instance until Phase 8 ships the Redis-backed or signed-JWT alternative.** If you scale the app horizontally before then, posting will appear to work but tokens issued by one instance will not be consumable on another, and posts will fail with "Unknown or already-used confirmation token".

The DB-level `reply_requires_human_confirmation` constraint is the second line of defense — it cannot be bypassed even if the in-memory store is replaced — but the in-memory token IS the API-layer enforcement and it does not survive restarts or scale-out.

If you must run multiple instances during Phase 2.5, sticky sessions on the `/api/reply/*` routes are an acceptable interim measure.

## Service worker

The PWA service worker at `public/sw.js` is registered automatically in production builds (skipped in dev). Its sole job in Phase 2.5 is to keep the offline shell alive so the IndexedDB-backed local draft store can recover state on reload. It does not yet cache opportunity cards or push notifications — those are Phase 8.

## Vercel preview deployments

The Phase 2 PR set has Vercel preview comments enabled. Each PR builds a preview at a unique URL. The preview shares a Supabase project with main, so:

- Don't run destructive seed routes against a preview
- Don't push test webhook payloads through a preview unless the secret matches
- Vercel preview URLs are auto-protected — login via id.kinetiks.ai still gates access

## Production launch checklist (BEFORE ENABLING REAL USERS)

The audit at `apps/do/docs/audit-phase-1-2.md` is the canonical pre-launch checklist. Phase 2.5 closes most of the critical items. Before enabling real users you must additionally:

- [ ] Reddit OAuth client landed and exercised end to end
- [ ] Lens quality gate shipped (Phase 3)
- [ ] Scout v1 → Scout v2 with at least the timing model (Phase 4)
- [ ] Pulse tracking running on a schedule (Phase 6)
- [ ] Account-deletion processor running on the 1h/24h/7d windows (Phase 8)
- [ ] Confirmation token store moved off the in-memory Map (Phase 8)
- [ ] Privacy policy updated to reflect actual data flows
- [ ] Test coverage above 60% on `lib/` and `packages/deskof`
- [ ] CodeRabbit reviews on every PR addressed (no open critical findings)
