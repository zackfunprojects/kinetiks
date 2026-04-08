# DeskOf Phase 1 + 2 Audit

**Date:** 2026-04-07
**Scope:** Everything on `main` as of commit `faaba91` (Phase 1 merged). Phase 2 work that has landed in `main` under `apps/do/src/**`, `packages/cortex/src/operator-profile/**`, `packages/deskof/src/**`, and migrations `00025`-`00027`.
**Posture:** Brutal. The user asked where we cut corners; this document names them.

Rating legend:
- ✅ Complete (matches or exceeds spec)
- 🟡 Good but incomplete (works, but shallow vs spec)
- 🔴 Cut corner (placeholder/stub where spec demanded depth)
- ⚫ Missing (spec requires, not built)
- 📋 Deferred (explicitly deferred in a PR; not itself a failure)

---

## 1. Executive Summary

### Top 5 things we shipped well

1. **Human-only-publishing constraint at the database layer.** `reply_requires_human_confirmation` check in `supabase/migrations/00025_deskof_schema.sql:129-137` plus the column-level `revoke update (human_confirmed_at, posted_at, platform_reply_id, tracking)` at line 185 plus the scoped update policy at line 170 plus the in-memory single-use content-hash-bound confirmation token in `apps/do/src/lib/reply/confirmation-token.ts`. This is genuine defense-in-depth and honors the defining product constraint.
2. **Platform-accounts token confidentiality.** The base-table `revoke select` + invoker-scoped `deskof_platform_accounts_safe` view (`00025_deskof_schema.sql:243-271`) is the right pattern and explicitly prevents the usual RLS-doesn't-filter-columns trap.
3. **Optimistic concurrency on the Operator Profile.** Migration `00027` adds `lock_version`; `apps/do/src/lib/cortex/operator-profile-service.ts:174-229` implements a genuine CAS loop with bounded retries and a pure-transform API. Concurrent Mirror writes cannot silently drop each other.
4. **Draft autosave out-of-order defense.** `draft_revision` column + `ReplyEditor.tsx` monotonic ref + `upsertDraftReply` rejection of older revisions (`apps/do/src/lib/reply/service.ts:96-153`) plus the frozen-on-posted/Quora-handoff semantics is production-grade.
5. **Quality Addendum #1 Layer 1 (Quora fingerprinting) math is clean.** `packages/deskof/src/fingerprint/quora.ts` uses O(min(a,b))-space Levenshtein, proper normalization, correct thresholds. It is genuinely ready to be consumed.

### Top 5 things we cut

1. **Scout has nowhere to fetch threads from.** There is no Reddit client in the codebase at all (no `lib/reddit/` directory), no Quora `fetchThreads` implementation (`lib/quora/client.ts:90-96` returns `[]`), no Edge Function, no cron entry, no manual ingestion. `deskof_threads` is never populated by any code path in the repo. **The Write tab, in production, will render "0 ready" forever.** Every other Phase 2 claim flows from this missing piece.
2. **Scout only populates 2 of 5 scoring dimensions.** `lib/scout/v1.ts:82-89` hard-codes `citation_probability: 0`, `answer_gap_score: 0`, `anti_signal_count: 0`. Expertise topic match is naive lowercased substring (`expertise-tiers.ts:57-63`). Suggested angles are hard-coded `null`. This is labeled "v1" but the delta to v2 is the entire Phase 4 scope.
3. **Operator Profile cold start Phase A is a skeleton.** `lib/mirror/cold-start.ts` persists content-URL rows but has ZERO ingestion. No scrape, no NLP extract, no voice fingerprint update, no Reddit history import, no Quora history import, no Kinetiks context inheritance, no background job. Confidence will never rise above whatever the manual inputs give it — the 0.55-0.65 target from Quality Addendum #6 is unreachable.
4. **Onboarding calibration step was silently dropped.** `lib/onboarding/state.ts:40-47` removes `calibration` from `STEP_ORDER` with a comment that it depends on Scout work. `applyCalibrationResponses` exists in `lib/mirror/cold-start.ts:187` and has no caller, no API route, no page. Final Supplement #4 lists it as step 3 of 6. The shipped onboarding is 5 steps and skips the single step that matters most for cold-start profile depth.
5. **Handoff confirmation page doesn't exist.** `ReplyEditor.tsx:194` routes the user to `/write/${opportunity.id}/handoff`. There is no such route. Grepping for `handoff` in `apps/do/src/app` returns zero page files. Every Quora post flow ends with a 404.

### Overall verdict

Phase 1 shipped a clean foundation: schema, RLS, tier gate matrix, operator-profile types, CPPI math, Quora fingerprint math. The critical security primitives (human-only publishing, encrypted token handling, webhook HMAC) are in place. This part is genuinely solid.

Phase 2 shipped **the scaffolding of the core write loop without the loop**. The Write tab renders; the editor writes and autosaves; the Quora handoff builds the correct PostReplyResult. But the queue it reads from is empty, the editor's post flow dead-ends on a 404, the cold-start pipeline that's supposed to make the first card feel like a precision instrument imports nothing, and the calibration exercise that Quality Addendum #6 calls the centerpiece of depth was deleted from the step order entirely. Zero tests exist across the package + app.

The verdict is: **Phase 1 = 85%, Phase 2 = 40% of scope by depth.** We have a very nice empty building.

---

## 2. Per-area findings

### A. Cortex package + Operator Profile primitive

**Files inspected:**
- `packages/cortex/src/operator-profile/types.ts`
- `packages/cortex/src/operator-profile/builder.ts`
- `packages/cortex/src/operator-profile/expertise-tiers.ts`
- `packages/cortex/src/operator-profile/index.ts`
- `packages/cortex/src/dispatcher.ts` (not touched by this phase; verified unchanged)
- `apps/do/src/lib/cortex/operator-profile-service.ts`
- `supabase/migrations/00026_deskof_operator_profiles.sql`
- `supabase/migrations/00027_deskof_operator_profile_lock_version.sql`

**Ratings:**

- Type definitions vs CLAUDE.md §Operator Profile — ✅ **Complete.** Every field from the CLAUDE.md Operator Profile interface is present (professional, personal, gate_adjustments, confidence, last_updated). VoiceFingerprint, Interest, Community, ProductAssociation, PlatformHistory all typed. Adds `user_id` and `created_at` on top of the spec.
- ExpertiseTier enum — ✅ Three tier levels, evidence array, confidence per tier, matches spec.
- Tier-matching logic — 🔴 **Cut corner.** `expertise-tiers.ts:57-63` is **case-insensitive substring overlap**. Comment on line 32 acknowledges this explicitly ("Phase 4 will replace this with a vector similarity comparison once Mirror is producing topic embeddings"). Perfectly honest about it, but it means expertise matching is substantively a keyword toy in Phase 2. "growth marketing" matches "your growth marketing budget is too high" and also "you'll marketing-speak your way into nothing" (false positive on `marketing`).
- Voice fingerprint structure — 🟡 **Good but incomplete.** The type (`types.ts:39-48`) has `avg_sentence_length`, `vocabulary_level`, `tone_descriptors`, `signature_phrases`. Reasonable. But Quality Addendum #6 calls for behavioral nuance ("anti-hustle-porn", "uses concrete revenue numbers") that this flat struct can't capture, and nothing in the codebase ever writes to any of these fields — voice fingerprint is type-only right now.
- Behavioral learning hooks — ⚫ **Missing.** `GateAdjustments.override_accuracy` and `personal_removal_rate` exist as fields but no code path updates them. `builder.ts` has `computeProfileConfidence` but there is no `recordSkipReason(...)`, `recordGateOverride(...)`, `recordTriageOverride(...)` consumer. This is Phase 7 per spec, so the absence is **📋 Deferred** rather than a failure — but flag it as a known dependency because the confidence trajectory leans on it.
- Confidence computation vs Quality Addendum #6.4 — 🟡 `builder.ts:98-133` gives a defensible additive score. Targets (0.15 manual → 0.35 history → 0.50 URL → 0.60 calibration → 0.75+ week 1) are documented in the comment. **Problem: on the actual code paths that exist in Phase 2, nothing can push confidence past ~0.25.** No history import, no content URL ingestion consumer, no calibration step in `STEP_ORDER`, no behavioral events. The function is correct; the inputs don't exist.
- CLAUDE.md §2 Cortex Integration — 🟡 The Operator Profile layer is defined and persisted. "Data Flow: Into the Operator Profile" lists content ingestion / platform history / behavioral data / manual input — **only manual input (interests, calibration) has working code, and calibration is disabled**. "Data Flow: Out" lists Scout/Lens/future apps — Scout reads it via `findMatchingTier`; Lens doesn't exist yet; there is no public read API for future apps. Enough for Phase 2 scope, but the surface area compared to the spec is small.

**Remediation:** Before Phase 4 lands, swap `topicMatches` for an embedding-similarity call. Wire at least one consumer of `override_accuracy` in Phase 3 (Lens) so the confidence math actually trends upward. Write unit tests for `computeProfileConfidence` against the cold-start trajectory targets.

### B. apps/do scaffold

**Files inspected:** `apps/do/public/manifest.webmanifest`, `apps/do/src/app/layout.tsx`, `apps/do/src/app/globals.css`, `apps/do/next.config.js`, `apps/do/package.json`, `apps/do/public/icon-{192,512}.png`.

- PWA manifest — 🟡 `display: standalone`, `orientation: portrait`, theme colors set, icons present. **But:** Only 192 and 512 icons. Quality Addendum #3 calls for a full icon set for iOS (apple-touch-icon at 180, 167, 152, 120) and Android (48, 72, 96, 144). `manifest.webmanifest` also lacks a `shortcuts` array (Write / Reply / Reputation deep links) and `screenshots` for Android installability prompts. The `start_url` is `/`, not `/write` — users re-entering the PWA land on the marketing page.
- Service worker for offline drafts — ⚫ **Missing.** Quality Addendum #3.3 PWA Manifest Configuration section explicitly requires "Service worker caches: opportunity cards (for offline reading), authority score data, static assets" and "Offline state: user can read cached opportunity cards and draft replies." `apps/do/public/` contains only `icon-{192,512}.png` and `manifest.webmanifest`. No `sw.js`, no `workbox`, no `next-pwa`. Autosave sends to `/api/reply/draft` — offline the user's text lives in component state only and is lost on reload. This directly contradicts Final Supplement §1.3 "The absolute rule: the user's written text is NEVER lost."
- Mobile-first design tokens vs Quality Addendum #9 dark mode — 🔴 `globals.css` has a single `:root` block and a single `@media (prefers-color-scheme: dark)` override with ~12 tokens. Quality Addendum #9 specifies component-level dark mode tokens (elevation layers, focus rings, disabled states, gate status colors, platform badge colors). The file literally comments "The dark mode token system from Quality Addendum #9 will be wired in Phase 2 alongside the first opportunity card component" but Phase 2 did not add any further dark-mode work. Known deferral left unresolved.
- Push notification setup — ⚫ **Missing.** No VAPID keys, no `Notification.requestPermission()`, no service worker `push` handler, no `deskof_push_subscriptions` table. Approvals mode (Standard+, gated as `approvals_mode` in `tier-config.ts`) has no way to deliver a push. Acceptable for Phase 2 if Approvals mode ships in Phase 7/8, but the spec discussion of notification design (Quality Addendum #3) should at minimum have a tracking ticket.
- Geist + Space Grotesk fonts — 🔴 **Wrong fonts.** `layout.tsx:2` imports `Space_Grotesk` and `JetBrains_Mono`. CLAUDE.md line 24 says "Tailwind CSS + Geist font stack" and build-plan.md Phase 1.1 says "Tailwind theme + Geist font stack matching Kinetiks design system." We are NOT using Geist, and `--font-sans` references `var(--font-sans)` which resolves to Space Grotesk. Either the design decision changed and the spec is stale, or we shipped the wrong font.

**Remediation:** Add `next-pwa` or a hand-written service worker; cache `/api/reply/draft` POSTs to IndexedDB for offline. Add iOS icon set + shortcuts array. Fix `start_url` to `/write`. Decide Geist vs Space Grotesk and update whichever of (code, spec) is wrong. Flesh out `globals.css` tokens to cover gate status colors, elevation, and focus rings.

### C. Schema (migrations 00025 + 00026 + 00027)

**Files inspected:** All three migration files fully.

- Every table from CLAUDE.md §Database Schema present — ✅ Verified one-by-one:
  `deskof_opportunities, deskof_replies, deskof_reply_tracking, deskof_threads, deskof_platform_accounts, deskof_platform_health, deskof_authority_scores, deskof_skip_log, deskof_citation_checks, deskof_operator_tracks, deskof_cppi_log, deskof_topic_vectors, deskof_community_gate_config, deskof_gate_health, deskof_quora_match_attempts, deskof_analytics_events, deskof_data_deletion_requests, deskof_filtered_threads`. All present in 00025. 00026 adds `deskof_operator_profiles`, `deskof_content_urls`, `deskof_calibration_responses`, `deskof_onboarding_state`. 00027 adds `lock_version` and `draft_revision` columns.
- RLS policies on every user-owned table — ✅ Present on every table with `user_id`. `deskof_replies` update policy correctly restricts to draft state and guards `posted_at`/`human_confirmed_at`/`platform_reply_id`. Note `deskof_community_gate_config` and `deskof_gate_health` have RLS enabled but no SELECT policy — this is intentional (service-role only) and commented as such.
- Indexes — ✅ Queries on user_id + status + score, user_id + posted_at, platform + community + thread_created_at all covered. The partial index `idx_deskof_opportunities_expires_at where status = 'pending'` is a nice touch.
- `reply_requires_human_confirmation` constraint — ✅ Correct. The check verifies `human_confirmed_at <= posted_at <= human_confirmed_at + interval '5 minutes'`. Matches the in-memory token TTL.
- Safe view over encrypted tokens — ✅ See executive summary bullet 2.
- `kinetiks_billing` integration — 🟡 `apps/do/src/lib/auth/session.ts:58-63` reads `kinetiks_billing.plan` by `account_id`. **But:** I verified that in the apps/id migrations, the column on `kinetiks_billing` is `plan` (not `tier`) but the primary key / reference is `account_id`. The code assumes `account_id` equals `auth.users.id`. Comment on session.ts:55-56 states this: "The user's account_id matches their auth user id in Kinetiks." That assumption is correct in the existing Kinetiks ID codebase, but there is no test or runtime assertion — if the mapping ever diverges, every DeskOf user silently drops to `free` with zero error signal. `normalizeTier` returns `'free'` for any unrecognized plan, so a schema drift is completely invisible.

**Remediation:** Add an observability breadcrumb when `billing` is `null` (missing row case) — right now we silently downgrade to free. Add a smoke-test migration that asserts `kinetiks_billing.account_id` exists.

### D. Tier gating (`lib/tier-config.ts`)

**Files inspected:** `apps/do/src/lib/tier-config.ts`; all `UpgradeGate` consumers; `apps/do/src/components/tier/UpgradeGate.tsx`.

- Every feature from Quality Addendum #10.4 — ✅ I counted 40 Feature literals across the eight groups in the file. Matches the Quality Addendum matrix sections (Discovery, Quality Gate, Write, Reply, Reputation, Operator Profile, MCP, Hero strategic). No obvious gaps.
- `TIER_LIMITS` quotas — 🟡 Only `content_urls` is defined. Spec calls out at minimum: tracked replies per week (governed by `TRACK_CONFIGS` weekly budgets, OK), Hero citation-check cadence, content URL count (✓). Nothing else numeric in Phase 2 scope, but as Phase 3-6 land we'll need gate LLM check quotas, triage LLM quotas, export frequency limits. The scaffold has a single entry.
- `UpgradeGate` teaser + locked state — ✅ Component handles both modes, has defined upgrade CTA, correct use of `requiredTier()`. Small nit: the `<Link href="/upgrade?...">` target route does not exist (`/upgrade` page is not in the app tree).
- Hardcoded tier checks elsewhere — 🔴 `apps/do/src/lib/mirror/cold-start.ts:45-49` defines `CONTENT_URL_LIMITS` as its own local constant **duplicating** the `TIER_LIMITS.content_urls` in `tier-config.ts`. Two sources of truth for the same limit — if one is changed, the other silently drifts. This is exactly the anti-pattern CLAUDE.md line 438 warns against ("Don't hard-code tier checks"). Also: `cold-start.ts:62` types `tier` as `"free" | "standard" | "hero"` inline instead of importing `BillingTier`.

**Remediation:** Delete `CONTENT_URL_LIMITS` from `cold-start.ts`, import and use `TIER_LIMITS.content_urls[tier]`. Add a completeness test that iterates `allFeatures()` and renders `<UpgradeGate>` for each one. Create a real `/upgrade` page or delete the dead link.

### E. Quora platform (`lib/quora/*`)

**Files inspected:** `apps/do/src/lib/quora/scraper.ts`, `apps/do/src/lib/quora/client.ts`, `packages/deskof/src/fingerprint/quora.ts`.

- Three-layer answer matching:
  - **Layer 1 (fingerprint)** — ✅ Math implemented in `packages/deskof/src/fingerprint/quora.ts`. Thresholds correct (0.75 / 0.50). `normalizeForFingerprint` handles smart quotes, em-dashes, ellipsis. **But:** It is NEVER called from any Pulse/scrape path, because Pulse doesn't exist. The fingerprint is stored (`service.ts:71-74` computes SHA-256 of the normalized text and persists it into `deskof_replies.content_fingerprint`), but nothing ever *matches* against it. It is write-only math.
  - **Layer 2 (URL fallback)** — ⚫ **Missing.** No UI, no API route, no DB column to store the user-provided Quora answer URL. The Quality Addendum #1.3 flow — "We couldn't find your answer automatically. Can you paste the URL?" — does not exist.
  - **Layer 3 (48hr timed retry)** — ⚫ **Missing.** No cron, no Edge Function, no job queue. The `deskof_quora_match_attempts` table exists (00025:475) but only has a CREATE TABLE — no insert site anywhere in `apps/do/src`.
- Selector health monitoring — 🟡 `SelectorHealth` class in `scraper.ts:138-174` tracks per-field success rates and classifies overall as healthy if all fields with ≥5 observations are above 80%. **But:** No alert destination. `health_report()` is exposed on `QuoraScraper` and `QuoraClient.scraperHealth()` but is never called from any API route, cron, or logger. The structured alert Quality Addendum calls for (`log a structured alert so we can repair quickly`) is a data structure in memory with no consumer.
- Rate limiter — 🟡 Token-bucket in `scraper.ts:99-132` with capacity 5 and 3000ms refill = 20 req/min ceiling. The math is right, but the `acquire()` recursion in the hot path (`return this.acquire()` after a setTimeout) is tail-recursive and will work fine in practice, but is a non-standard shape. More important: **this limiter is per-`QuoraScraper` instance**, not per-process. If two Playwright browsers exist you've doubled the rate. For Phase 1 with one instance it's fine; scale flag.
- Posting flow (browser handoff) — 🟡 `QuoraClient.postReply` in `client.ts:105-123` returns the correct `browser_handoff` shape. URL validation via `toQuoraUrl` is a good SSRF defense. **But:** the handoff confirmation page `/write/[id]/handoff` that the editor navigates to on success **does not exist** (see executive summary #5). Also: `fetchThreads` returns `[]` (line 95), `importHistory` returns `{ imported_count: 0, next_cursor: null }` (line 140), `checkReplyStatus` returns `{ kind: "unknown" }` (line 131). The `QuoraClient` implements the interface but only `postReply` and `fetchThreadDetail` have real logic.
- `ImportHistory` — ⚫ Stub.
- `FetchThreads` — ⚫ Stub.
- Scraper integration into Scout — ⚫ `QuoraScraper.scrapeQuestion` works on a single known URL, but nothing in the codebase produces URLs. No space-crawler, no topic monitor.

**Remediation:** Highest priority: create `/write/[opportunityId]/handoff/page.tsx` because every Quora post ends there today. Build Pulse v0 with just Layer-1 fingerprint matching as a cron job (weekly is fine to start). Wire `scraperHealth()` to structured logging. Implement `fetchThreads` as a space-page scrape.

### F. Privacy / deletion

**Files inspected:** `apps/do/src/lib/privacy/disclosure.ts`, `apps/do/src/lib/privacy/deletion.ts`, `apps/do/src/components/privacy/PrivacyDisclosureModal.tsx`, `apps/do/src/app/api/privacy/deletion-webhook/route.ts`, `apps/do/src/app/api/onboarding/privacy/route.ts`, `apps/do/src/lib/webhooks/verify.ts`, `apps/do/src/app/onboarding/privacy/page.tsx`.

- Privacy disclosure modal — ✅ Shown as step 1 of onboarding, before Reddit OAuth, as spec requires. `PRIVACY_DISCLOSURE_VERSION` pinned to a dated string (2026-04-07). Acknowledgement persisted into `deskof_onboarding_state.privacy_acknowledged_at` + `privacy_disclosure_version`.
- Account deletion webhook receiver — ✅ Signature verified via `verifyWebhook` BEFORE body parse. HMAC-SHA256 over `{timestamp}.{body}`. Timing-safe comparison. Fails closed if `KINETIKS_WEBHOOK_SECRET` is unset. 5-minute replay window. Idempotent: existing pending/in-progress rows are returned unchanged.
- Cascade orchestrator — 🔴 **Skeleton only.** `lib/privacy/deletion.ts` defines `requestAccountDeletion`, `markDeletionStage`, `completeDeletion`. These insert and update rows in `deskof_data_deletion_requests` but **do not delete anything**. The file's own comment on line 22-24 says "The scheduled background processor that actually executes the cascade lands in Phase 8." This means: today, if a user deletes their Kinetiks ID account, DeskOf writes a `pending` row and nothing else happens — tokens are NOT revoked, data is NOT deleted, Cortex profile is NOT purged. GDPR Article 17 is not being met. **This is a critical compliance gap that must close before any real user touches the system.**
- Data export pipeline (Final Supplement #2.5) — ⚫ **Missing.** No `/api/privacy/export` route, no background job, no ZIP assembly, no email delivery. GDPR Article 20.
- 1h / 24h / 7d windows — ⚫ Not enforced anywhere because the processor doesn't exist.

**Remediation:** Either disable the deletion webhook with a 503 response and an explicit "not ready" error until the processor lands, or build the processor. Do NOT accept the webhook and silently drop the user's data-deletion request on the floor.

### G. Auth / session (`lib/auth/session.ts`)

**Files inspected:** `apps/do/src/lib/auth/session.ts`, `apps/do/src/lib/supabase/server.ts`.

- Reads from `kinetiks_billing.plan` — ✅ Correct column.
- Handles missing billing row — 🟡 Returns `tier: 'free'` via `normalizeTier(null)`. Technically graceful, but as noted in Area C, **silently downgrades** a paying user if their billing row is missing or unreadable. No observability breadcrumb, no log.
- Session expiry — 🟡 `supabase.auth.getUser()` is called each request (the page is `force-dynamic`). Returns null on expiry; `requireDeskOfSession` yields a 401 Response. Acceptable.
- Cookie domain — ✅ `getCookieDomain()` in `supabase/server.ts` resolves to `.kinetiks.ai` when the host ends in `.kinetiks.ai`, or to `process.env.COOKIE_DOMAIN` if set. Mirrors apps/id pattern.
- API key auth for MCP — ⚫ **Missing entirely.** This is acceptable per spec (Phase 8 surface) and correctly called out in the session.ts comment on line 9-10. **📋 Deferred.**

**Remediation:** Add a single `console.warn` (or, better, a structured log event) when `billing` is null. Otherwise good.

### H. Analytics (`lib/analytics.ts`)

**Files inspected:** `apps/do/src/lib/analytics.ts`; all call sites via `grep -rn "track({"`; `apps/do/src/app/api/analytics/batch/route.ts`.

- Wrapper queues locally, flushes in batches, non-blocking — ✅ Verified. `pagehide` flush handler exists. 3s debounce, 50-event cap.
- User_id hashing — 🟡 The type is `user_id_hash: string | null` but I cannot find the code that actually **hashes** the user ID in `apps/do/src`. `initAnalytics(opts)` takes an `ImplicitContext` where `user_id_hash` is already expected to be a hash. The caller of `initAnalytics` is not in the codebase yet — so the field is null at runtime today, and whichever component eventually wires it must be careful to pass a real hash. **As shipped, no analytics event is attributed to a user** because nothing calls `initAnalytics`.
- Event coverage — the pertinent call sites:

| Event | Location | Wired? |
|---|---|---|
| `onboarding_started` | `app/onboarding/privacy/page.tsx:21` | ✅ |
| `platform_connected` | nowhere | ⚫ (Reddit OAuth deferred, Quora URL no event) |
| `content_urls_submitted` | `app/onboarding/content/page.tsx:68` | ✅ |
| `calibration_completed` | nowhere | ⚫ (step removed from STEP_ORDER) |
| `interests_submitted` | `app/onboarding/interests/page.tsx:40` | ✅ |
| `track_selected` | `components/onboarding/TrackSelector.tsx:67` | ✅ |
| `onboarding_completed` | nowhere | ⚫ |
| `onboarding_abandoned` | nowhere | ⚫ |
| `opportunity_surfaced` | nowhere (server-side, would need to fire in `scout/v1.ts` or `opportunities/queue.ts`) | ⚫ |
| `opportunity_viewed` | `components/write/CardStack.tsx:64,93,111,172` | ✅ |
| `opportunity_skipped` | `CardStack.tsx` (one of the four) | ✅ |
| `reply_editor_opened` | `CardStack.tsx` (one of the four) | ✅ |
| `reply_draft_saved` | `ReplyEditor.tsx:80` | ✅ |
| `reply_posted` | `ReplyEditor.tsx:169` | ✅ |
| `reply_post_failed` | `ReplyEditor.tsx:207` | ✅ |

  - Onboarding: 8 spec'd, **4 wired, 4 missing**.
  - Write: 7 spec'd (subset; Phase 2 not all 12), 6 wired, 1 missing (`opportunity_surfaced`).
  - Reply tab events (7), Reputation events (7): ⚫ none yet, Phase 5/6 territory. **📋 Deferred** as expected.
  - Conversion events: ⚫ none. Quality Addendum describes `upgrade_prompt_shown`, `upgrade_completed`, but no taxonomy entry exists in `AnalyticsEvent` union and no call site. This is a gap because the Free-to-Standard conversion IS the business model.
  - System events (`session_started`, `page_visibility`, etc., Final Supplement §5.6): ⚫ none. No `initAnalytics` caller means no `session_started`.

- 90-day anonymization job — ⚫ **Missing.** The column `user_id_hash` exists and the intent is documented in `00025:506-507`, but there's no cron, no Edge Function, no SQL function to null it out. GDPR-relevant.
- User_id_hash is actually a hash — 🟡 See above — type is hash, caller does not exist, runtime is null.
- **Critical bug:** `initAnalytics` is never called, so every event fires with the `pendingContext()` placeholder (session_id = "pending", user_tier = null, user_track = null). This renders analytics aggregation useless until fixed.

**Remediation:** Add a client-side `<AnalyticsBootstrap>` that runs `initAnalytics(...)` from the root layout with a hashed user ID (SHA-256 of the user_id is fine). Fire `opportunity_surfaced` from the server component that returns the queue, or fire it client-side in `CardStack` on first render of each card. Add the four missing onboarding events (onboarding_completed, onboarding_abandoned, platform_connected, and — once calibration returns — calibration_completed). Add a 90-day anonymization function via pg_cron.

### I. Onboarding (`app/onboarding/*`)

**Files inspected:**
- `apps/do/src/app/onboarding/{page,privacy,connect,content,interests,track}/page.tsx`
- `apps/do/src/app/api/onboarding/{privacy,connect/skip,content,interests,track}/route.ts`
- `apps/do/src/lib/onboarding/state.ts`
- `apps/do/src/components/onboarding/TrackSelector.tsx`

- **Step 1 — Privacy + Connect:** 🟡 Privacy modal: ✅ works. Connect: 🔴 **both connectors are placeholders**. Reddit is a disabled button ("Awaiting Reddit Data API access approval"). Quora links to `/onboarding/connect/quora` which **does not exist** (verified — no `connect/quora/page.tsx`). The primary button says "Continue" and calls `/api/onboarding/connect/skip`. Final Supplement calls this step "~2 min, History imports in background" — today it imports nothing and connects nothing.
- **Step 2 — Content Import:** ✅ present. URLs persist into `deskof_content_urls`. **But:** no ingestion, so the URLs sit inert.
- **Step 3 — Expertise Calibration (10 threads):** ⚫ **Not in the shipped step order.** `lib/onboarding/state.ts:40-47` removes it. `applyCalibrationResponses` in cold-start.ts has no caller. No UI component for the 10-thread exercise. This was explicitly the deepest piece of Quality Addendum #6 and it was excised with a one-line comment.
- **Step 4 — Personal Interests:** ✅ present and functional.
- **Step 5 — Track Selection:** ✅ `TrackSelector` component wired, tier-gated via `canSelectTrack`, persists to `deskof_operator_tracks`.
- **Step 6 — First Card:** 🟡 Routes to `/write`. **But:** the card queue will be empty (see Area J), so the user lands on "0 ready" and has nothing to do.
- < 8 min target — realistic since there are only 4 real interactive steps left after trimming calibration.
- Background imports during step 1 — ⚫ None.
- Resume-from-where-you-left-off — ✅ `onboarding/page.tsx` redirects to `state.current_step`.
- `onboarding_abandoned` event — ⚫ No fire site.

**Remediation:** Either build the calibration step (requires real threads in deskof_threads first) or explicitly document in the spec that the Phase 2 cold start is calibration-less and accept the lower confidence trajectory. Fire `onboarding_abandoned` via `navigator.sendBeacon` in `beforeunload`. Remove the dead `/onboarding/connect/quora` link or create the page.

### J. Scout v1 + Opportunity queue

**Files inspected:** `apps/do/src/lib/scout/v1.ts`, `apps/do/src/lib/opportunities/queue.ts`, `apps/do/src/app/api/opportunities/skip/route.ts`.

- Composite scoring math — ✅ Delegated to `packages/deskof/src/scoring/composite.ts`, which implements the CLAUDE.md formula exactly. Weight-sum validation, clamping, `Math.round(*100)`.
- 2 of 5 dimensions populated — 🔴 `scout/v1.ts:83-89` hardcodes `citation_probability: 0, answer_gap_score: 0, anti_signal_count: 0`. Free-tier spec allows this simplification; paid tier does not. With `DEFAULT_WEIGHTS` (expertise 0.30, timing 0.20), even a perfect thread caps at 50/100 — the entire dynamic range is compressed into half the scale. The numeric output looks broken ("why is my best match 48?").
- **Nowhere to fetch threads from** — 🔴 CRITICAL. `scoreThreads(threads, profile, options)` is a pure function that takes an array of `ThreadSnapshot` — which nothing in the repo produces. No Reddit client (`find /apps/do/src/lib/reddit` = empty), no `QuoraClient.fetchThreads` implementation (returns `[]`), no Edge Function, no cron, no manual admin trigger. **`deskof_threads` is never written to in the repo.** `deskof_opportunities` is never written to. `getPendingOpportunities` will return `[]` on every call in production. Write tab will render empty forever.
- Anti-signal filtering — ⚫ None. `anti_signal_count: 0` always. No astroturf detection, no hostile-community list, no cold-entry detection, no redundancy detection. Phase 4 scope, ⚫ for Phase 2 but worth noting this is where the whole "intelligence" side of the product lives.
- Suggested angle generation — ⚫ `suggested_angle: null` always. Phase 4 scope.
- Opportunity expiration — 🟡 `expires_at` is set (48h default). No cron marks expired — the `getPendingOpportunities` query filters by `expires_at > now()` so stale rows never appear, but they accumulate in the table indefinitely. The comment `where status = 'pending'` on the partial index hints the intent but there's no eviction.
- Skip-reason learning loop — 🟡 `deskof_skip_log` is populated on every skip (`queue.ts:137-147`), but there is no consumer. No Mirror ingestion, no Scout weight adjustment. Phase 8.
- Personal surfacing — ⚫ `opportunity_type` is set to `personal` if the matched tier is `genuine_curiosity`, but there is no Phase 2 code that actually produces `genuine_curiosity` tiers (calibration step missing, behavioral learning missing). Dead branch.

**Remediation:** The single highest-leverage fix for Phase 3 is **getting at least one real opportunity into `deskof_threads`**. Options: (a) build a minimal Quora space crawler, (b) stub a fixture loader that seeds 20 real threads manually for dev so at least the Write tab is testable end-to-end, (c) sprint on Reddit API access. Without this, all Phase 2 UI is unusable.

### K. Mirror v0 (`lib/mirror/cold-start.ts`)

Covered in depth under A and I. Summary of the file's actual behavior:

- `submitContentUrls`: persists to `deskof_content_urls`. No ingestion job reads from this table. ⚫ ingestion missing.
- `submitPersonalInterests`: calls `addPersonalInterests` on the operator profile. Works. ✅
- `applyCalibrationResponses`: defined, correct tier inference from judgements, correctly uses `addExpertiseTiers`. **Zero call sites.** ⚫ UI for the 10-thread flow does not exist.
- Reddit history import — ⚫ **Missing.**
- Quora history import — ⚫ **Missing.**
- Kinetiks context inheritance (products, voice, narrative, competitive) — ⚫ **Missing.** CLAUDE.md §2.1 lists 8 context layers; none are read in Phase 2.
- Behavioral learning loops — ⚫ Phase 7 scope, 📋 deferred.

### L. Reply editor + posting

Covered in E and in `lib/reply/service.ts`. Key points:

- Quora handoff with synchronous popup — ✅ Correctly opens `about:blank` inside the click handler and sets `location.href` after the server confirms. This is a subtle but important detail for Safari/iOS.
- Reddit posting — 📋 Explicitly deferred with disabled button and hover title.
- Confirmation token — 🔴 **Single-instance only.** `lib/reply/confirmation-token.ts:32-46` stores tokens in a process-local `Map`. Multi-instance deployment will fail posting silently. The comment at line 34-36 acknowledges this and points to Phase 8. For Phase 2 this is acceptable, but it must be loud in the deployment story: the app MUST run on a single Node.js instance until Phase 8 lands.
- Draft autosave with monotonic revision — ✅ Correct, see executive summary #4.
- Handoff confirmation page — 🔴 **Does not exist.** `ReplyEditor.tsx:194` routes to `/write/${opportunity.id}/handoff`. `find apps/do/src/app -name "handoff*"` returns nothing. Every Quora post ends with a Next.js 404.
- "I posted this" confirmation flow + Pulse trigger — ⚫ Pulse doesn't exist at all; `quora_match_status: 'pending'` is set in `markQuoraHandoffPending` but there is no consumer that ever flips it to `matched`.
- DB constraint tested — ⚫ No test suite. The check constraint will kick in at runtime, but there is zero test coverage confirming the trigger behavior.

### M. Lens (Quality Gate) — should NOT exist yet

- ✅ Verified: no `lib/lens/`, no gate engine, no LLM checks.
- ✅ `PASS_THROUGH_GATE_RESULT` in `reply/service.ts:58-62` is the sole gate output. It's labeled "Phase 2 stub gate result" and consumed by `api/reply/draft/route.ts:96`. Correct.
- ✅ No `gate_blocking_enabled` feature flag scaffolding exists yet. Phase 3 scope.
- The gate UI shell in the editor is also absent — that's Phase 3. Confirmed.

### N. Pulse (Tracking) — Phase 6

- ✅ Nothing exists. No tracking, no citation checks, no authority scores, no removal detection.
- The Quora Layer 3 timed retry IS Pulse-adjacent and is also absent. Confirmed. **📋 Deferred** per plan.

### O. Filtered feed (Quality Addendum #7)

- `deskof_filtered_threads` exists in 00025 with a proper CHECK constraint on filter reasons.
- **No writer:** nothing in the code ever inserts into this table.
- **No reader:** no API route, no page, no counter in the Write tab header.
- **📋 Deferred** (Phase 4) — but flag it as a known dependency; the schema is a hollow commitment until Phase 4.

### P. CPPI (Quality Addendum #4)

- `deskof_cppi_log` exists in 00025.
- Math in `packages/deskof/src/types/cppi.ts` — ✅ correct weights, correct level classification, pure function.
- **Called by:** nothing. `grep computeCppiScore apps/do/src` returns zero hits. The math is importable and correct but unused.
- No snapshot job, no writer, no reader. Not yet needed in Phase 2 but a mid-phase calibration data point: we should not let the math drift out of sync with the unused call sites before Phase 3 lands it.

### Q. Topic spacing (Quality Addendum #5)

- `deskof_topic_vectors` exists in 00025 with a `vector` double precision array column (pgvector migration noted as a follow-up).
- No vectorizer (no NLP topic extraction, no embedding model call, no writer).
- No consumer.
- **📋 Phase 3 scope.** Flag as dependency.

### R. Test coverage

- Unit tests: ⚫ **Zero.** `find apps/do -name "*.test.ts" -o -name "*.spec.ts"` returns nothing. Same for `packages/deskof` and `packages/cortex/src/operator-profile`.
- Integration tests: ⚫ Zero.
- E2E tests: ⚫ Zero.
- Vitest config: ⚫ No `vitest.config.{ts,js}` exists in `apps/do/`. `package.json:14` declares `"test": "vitest run"` but vitest has nothing to discover.
- This means:
  - The human-confirmation-token lifecycle is untested.
  - The DB check constraint is untested.
  - The CAS loop in `updateOperatorProfile` is untested.
  - The draft revision ordering is untested.
  - The fingerprint math (`similarity`, `findBestMatch`) is untested.
  - The CPPI math is untested.
  - The tier gate matrix is untested.
- **Every security-critical invariant in the codebase rests on manual PR review.**

**Remediation:** Before Phase 3 starts, write at minimum: (1) a confirmation-token consume test, (2) a CAS loop contention test, (3) a fingerprint similarity test against a hand-crafted pair at each threshold, (4) a gate-matrix completeness test iterating `allFeatures()`, (5) a draft revision ordering test. That's ~2 days of work and closes the worst of the untested-invariants risk.

### S. Operational concerns

- **Edge Functions / cron:** ⚫ None specific to DeskOf. `supabase/functions/` contains `archivist-cron`, `cortex-cron`, `expire-cron`, `marcus-*`, `gmail-sync-cron`, `ratelimit-cleanup`, `sequence-cron`, `webhook-retry` — all apps/id or other apps. **Zero** `deskof-*` functions. CLAUDE.md §7.3 / the build plan lists at least: Scout discovery cron, Pulse immediate/short-term/medium-term/long-term/authority cron, citation-check cron, opportunity expiry cron, analytics anonymization cron, deletion processor cron, thread cache purge cron. **None exist.**
- `.env.example` — ⚫ **Missing.** Environment variables referenced by the code include at least `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `COOKIE_DOMAIN`, `KINETIKS_WEBHOOK_SECRET`, plus any Reddit/Quora API keys that will follow. No one checking out the repo has any way to know what to populate.
- **Production deployment story:** ⚫ Not documented. The single-instance-only constraint from the confirmation token is nowhere in a runbook.
- **Logging:** ⚫ No structured logging. Errors are thrown or `console.error`'d (one instance, in `queue.ts:147`). No correlation IDs, no request IDs, no spans.
- **Error monitoring (Sentry):** ⚫ Not integrated.

**Remediation:** Add `apps/do/.env.example` with every env var referenced by the code. Add a brief `apps/do/DEPLOYMENT.md` that calls out the single-instance constraint, the `COOKIE_DOMAIN` setting, and the webhook secret. Integrate a structured logger (pino / @kinetiks/logger if one exists). Pick a sentry tier and wire it in Phase 3.

### T. Documentation

- **README at `apps/do/`:** ⚫ **Missing.** The only markdown files in `apps/do/` are `CLAUDE.md` (the spec), `DeskOf-Build-Plan.md` (the plan), and the 7 `.docx` files. No `README.md` telling a human how to run `pnpm dev`, where the tests would be, what env vars to set, or what the directory structure means.
- **ADRs:** ⚫ `apps/do/docs/adr/` directory does not exist. Build plan 1.0 explicitly called for an ADR document committed to `apps/deskof/docs/adr/`. Not done.
- **Inline comments:** ✅ Genuinely strong. Every tricky invariant is documented (the RLS column-filtering gotcha in 00025, the CAS rationale in operator-profile-service, the synchronous-popup rationale in ReplyEditor, the Quora SSRF rationale in QuoraClient.toQuoraUrl). This is the one place where Phase 2 punches above its weight.
- **Spec-vs-project docs:** The CLAUDE.md is the source spec, not project documentation. Nothing explains how to actually run this thing.

**Remediation:** Add a 30-line `apps/do/README.md` covering: prerequisites, env vars, `pnpm dev`, known limitations (no Reddit, empty queue, handoff 404), and where to read the spec. Add at least 2 ADRs: (1) Geist vs Space Grotesk decision, (2) single-instance-constraint for confirmation tokens.

---

## 3. Critical debt items (must fix before any real user)

Priority order:

1. **Quora handoff 404** — `ReplyEditor.tsx:194` routes to a non-existent page. Anyone who completes the post flow today gets a 404. **Fix: create `app/write/[opportunityId]/handoff/page.tsx`** with the "I posted this" confirmation button, clipboard fallback, and manual Quora link.
2. **Deletion cascade is a no-op.** `lib/privacy/deletion.ts` records a request and does nothing else. GDPR Article 17 breach. **Fix: either disable the webhook endpoint (503 + message) until the processor lands OR build the three-stage processor.**
3. **Scout has no thread source.** The entire Write tab is empty in production. **Fix: at minimum, a seed script / admin endpoint that ingests a fixed set of threads into `deskof_threads` and runs `scoreThreads` against the current profile. This makes everything downstream testable.**
4. **`initAnalytics` is never called.** Every analytics event fires with the `pendingContext()` placeholder, meaning session_id, tier, and track are all null. The analytics pipeline is literally a bit bucket. **Fix: mount an `<AnalyticsBootstrap>` in the root layout that calls `initAnalytics` once the server-side session is hydrated.**
5. **CONTENT_URL_LIMITS duplication.** Two sources of truth in `cold-start.ts` vs `tier-config.ts`. Drift risk. **Fix: delete the local constant.**
6. **No tests exist for security-critical invariants.** Human confirmation token, CAS loop, draft revision ordering, DB check constraint, tier matrix. **Fix: ~2 days of unit tests before Phase 3 opens.**
7. **Wrong font vs spec.** Either fix the spec or fix the fonts, but don't leave them divergent in a design-system app.

## 4. Important debt items (Phase 3-4)

Ordered:

1. **Calibration step reinstatement.** The entire depth of the Operator Profile cold start depends on this. Requires real threads in `deskof_threads` first, so it naturally pairs with the Scout thread-source fix.
2. **Content URL ingestion job.** Scrape the URL, extract topics + voice, update the profile. Turns the inert `deskof_content_urls` table into actual confidence-building fuel.
3. **Operator Profile confidence can't actually trend up in Phase 2.** No history import, no URL ingestion, no behavioral events, no calibration. The 0.55-0.65 target from Quality Addendum #6.4 is currently unreachable. Every Phase 3-4 component that behaves differently "at low confidence" will be exercising its low-confidence branch forever.
4. **Service worker + offline draft cache.** Final Supplement §1.3 is explicit: "user's written text is NEVER lost." Today a page reload mid-draft loses it.
5. **Selector health alerting wired to a logger.** Today `QuoraScraper.health_report()` is a dead end.
6. **Opportunity expiry cron.** `deskof_opportunities` accumulates expired rows forever.
7. **Analytics anonymization cron.** 90-day `user_id_hash → null` is a documented promise with no enforcement.
8. **The four missing onboarding events** (`platform_connected`, `onboarding_completed`, `onboarding_abandoned`, `calibration_completed` post-reinstatement).
9. **`opportunity_surfaced` analytics event.** The primary measurement for whether Scout surfaced anything to anyone is unmeasured.
10. **Dead `/upgrade` route.** `UpgradeGate` links to a non-existent page.
11. **`/onboarding/connect/quora` dead link.** Same problem.
12. **ADRs directory + two initial ADRs.**
13. **`.env.example` + `README.md` + `DEPLOYMENT.md`.**

## 5. "Good vs great" deltas

Places where what we shipped works but a sharper implementation would meaningfully improve the product:

1. **Expertise matching is lowercased substring.** Replacing with small-embedding cosine similarity (384-dim, computed on-demand with a local model or Anthropic embeddings) would eliminate false positives on every generic term and is ~1 day of work.
2. **`freshnessScore` is a single exponential decay.** Real timing needs upvote-velocity, OP-engagement, and community-time-of-day (Phase 4), but even a two-stage curve (rise then decay over 24h) would surface threads at actual inflection points instead of always favoring "newest."
3. **Voice fingerprint is a flat struct.** A genuine cold-start signal needs to capture things like "uses concrete numbers", "starts replies with a question", "avoids corporate voice". Storing a short sample of the user's own best writing alongside the flat metadata would make Phase 3's tone check possible.
4. **Confirmation token in-memory Map.** Swapping to a stateless signed JWT with content hash embedded is a 2-hour refactor that removes the single-instance constraint.
5. **Draft autosave only persists to Supabase.** Adding an IndexedDB mirror via service worker would eliminate the "lost on reload while offline" failure mode.
6. **The analytics event schema uses a discriminated union.** Great for safety but means adding an event requires touching both the union and every call site. A generic `track(name, props)` with a typed registry would be ergonomically nicer at the cost of type-level guarantees — worth discussing.
7. **Quora scraper uses a single Playwright context per call.** Pooling browser contexts would cut cold-start latency significantly once we actually ingest threads.
8. **The `UpgradeGate` teaser mode** renders children behind a blur with a lock card on top. This is fine for text but produces an ugly overlap for interactive widgets. Quality Addendum's teaser guidance wants richer variants per feature type.

## 6. Recommendations for Phase 3

Phase 3's nominal scope is Lens (Quality Gate). My recommendation is that Phase 3 absorb the following from Phase 1-2 debt **before** starting any gate work, because Phase 3 cannot be reasonably tested without them:

### Absorb into Phase 3 (blocks gate work)

1. **A thread source.** Even a fixture loader is enough. Lens cannot be tested against real opportunities if opportunities never exist.
2. **The handoff confirmation page.** Lens lives between the editor and the post; if the post flow 404s, gate calibration data is never collected.
3. **`initAnalytics` wiring.** Gate events (`gate_check_completed`, `gate_advisory_overridden`) are meaningless if every event is attributed to "pending".
4. **Unit test scaffold + the 5 critical tests from Area R.** Phase 3 introduces real math (CPPI integration, topic spacing cosine). Having no test harness at this stage guarantees the phase ships untested too.
5. **Deletion cascade processor OR webhook disablement.** Phase 3 is the last safe window to close the GDPR gap before any beta user touches the app.

### Backfill during Phase 3 (not blocking but high-ROI)

1. **Calibration step reinstatement.** As soon as a thread source exists, turn the 10-thread calibration back on. The gate's per-user calibration (`gate_adjustments`) depends on a profile that has real expertise tiers.
2. **Content URL ingestion (lightweight version).** Even just "scrape URL, extract top 10 nouns, populate signature_phrases" is enough to make the tone check in Phase 3.2 meaningful.
3. **Service worker + offline draft cache.** Makes the "never lose text" promise real.

### Defer to Phase 4 or later (with tickets)

- Reddit posting / Reddit OAuth / Reddit history import: blocks on external API approval, cannot be fixed locally.
- Pulse: Phase 6.
- Filtered feed UI: Phase 4.
- Behavioral learning loops: Phase 7.
- MCP tools: Phase 8.
- Multi-instance confirmation tokens: Phase 8.
- Push notifications + Approvals mode: Phase 7/8.

---

## Appendix: file counts

- `apps/do/src`: 46 TypeScript/TSX files.
- `packages/deskof/src`: 10 files.
- `packages/cortex/src/operator-profile`: 4 files.
- Migrations touching DeskOf: 3 (00025, 00026, 00027).
- Tests: 0.
- Edge Functions: 0.
- README files: 0.
- ADRs: 0.
- `.env.example`: absent.

## Appendix: commit context

Audit performed at commit `faaba91` on `main`. Phase 1 was merged via PR #40 (commit `f8c960d` scaffold + `2f00dfa` CodeRabbit fixes). Phase 2 work on `main` as of this audit includes: `packages/cortex` promotion (commit `988e373`), plus the Phase 1 merge contents. A number of the files audited here were introduced as part of the Phase 1 foundation PR that was billed as "foundation only" but shipped non-trivial Phase 2 code paths (Write tab client, reply editor, cold-start stubs, analytics wrapper). The audit treats them as Phase 2 work regardless of which PR they arrived in, because they are building the Phase 2 write loop.
