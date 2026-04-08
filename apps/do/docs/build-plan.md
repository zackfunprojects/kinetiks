# DeskOf - Comprehensive Build Plan

> **Source docs:** `DeskOf-CLAUDE.md`, `DeskOf-Product-Brief.docx`, `DeskOf-Build-Companion.docx`, `DeskOf-Integration-Architecture.docx`, `DeskOf-Quality-Addendum.docx`, `DeskOf-Final-Supplement.docx`, `DeskOf-Research-Spike.docx`
>
> **Goal:** Production-ready, scalable. Cuts no corners from spec scope. All 10 Quality Addendum findings + all 6 Final Supplement gaps integrated into the right phases.
>
> **Estimated total:** 88-106 days serial, 59-69 days with parallelization.

---

## 0. Locked Decisions

| # | Decision | Confirmed |
|---|---|---|
| 1 | Promote `apps/id/src/lib/cortex/` → new `packages/cortex/` package. Operator Profile lives at `packages/cortex/operator-profile/`. `apps/id` and `apps/do` both consume it via workspace import. | ✅ |
| 2 | Create `packages/deskof/` for shared types, scoring math, gate logic, fingerprinting | ✅ |
| 3 | Next.js app lives at `apps/do/` alongside the specs (specs stay in `apps/do/docs/specs/`, app source in `apps/do/src/`) | ✅ |
| 4 | Phase 0 LLM/API budget: **$305** approved | ✅ |
| 5 | Phase 0 and Phase 1 run **in parallel** via git worktrees from day one. Subsequent independent phases also parallelized via worktrees. | ✅ |
| 6 | Reddit + Quora dev accounts: ready within ~1 hour (blocks Phase 1.4 / 1.5 only) | ✅ |
| 7 | GSC integration reuses existing Kinetiks ID connection (Integration Doc §3.4) | ✅ |

### Cortex promotion (executed in Phase 1.0)
1. Move `apps/id/src/lib/cortex/{confidence,conflict,evaluate,expire,index,resolve-proposal,route}.ts` → `packages/cortex/src/`
2. Add `packages/cortex/package.json` (`@kinetiks/cortex`)
3. Create `packages/cortex/src/operator-profile/` subdir for the new primitive
4. Update `apps/id` imports to `@kinetiks/cortex`
5. Verify `pnpm build` + `pnpm type-check` green across the monorepo before any Phase 1 work proceeds
6. Merge to main as its own PR (`refactor/promote-cortex-to-package`) before Phase 1 phase branches fork off

### Repo layout after promotion
```
apps/
  do/                              # DeskOf app (Next.js) + specs
    docs/specs/                    # The 8 source documents
    docs/adr/                      # Architecture decision records
    src/                           # App source
packages/
  cortex/                          # PROMOTED — shared Cortex primitives
    src/
      operator-profile/            # NEW Operator Profile primitive
      ...                          # existing cortex modules
  deskof/                          # NEW — shared DeskOf logic
    src/
      types/
      scoring/
      gate/
      fingerprint/
      cppi/
  mcp/tools/deskof/                # NEW MCP tool surface
```

---

## Branch + Worktree + Review Workflow

Every phase ships through a feature branch reviewed by CodeRabbit before merge. Independent phases run in parallel via git worktrees.

### Per-phase lifecycle
1. **Branch:** `phase/<phase-id>-<short-name>` off latest `main` (e.g. `phase/0-research-spike`, `phase/1-foundation`, `phase/2-write-loop`)
2. **Worktree:** Create with `git worktree add ../kinetiks-<phase-id> phase/<phase-id>-<short-name>` so multiple phases can be developed concurrently without context-switching the primary checkout
3. **Build** the phase per the task tables below
4. **Verify locally:** `pnpm build`, `pnpm type-check`, phase test suite, manual smoke per phase exit criteria
5. **PR + CodeRabbit review:** Open PR against `main`, wait for CodeRabbit pass
6. **Fix all CodeRabbit issues** before merge — no merging with open CodeRabbit findings
7. **Merge** once green
8. **Tear down worktree:** `git worktree remove ../kinetiks-<phase-id>`

### Parallelization map
| Concurrent group | Phases | Reason |
|---|---|---|
| Day 1 wave | Phase 0 + Phase 1 (+ Cortex promotion PR) | Independent workstreams |
| Mid wave | Phases 2 → 3 → 4 | Linear because each builds on the previous Write loop |
| Late wave | Phase 5 + Phase 6 + Phase 7 | All depend on Phase 4 but are independent of each other |
| Final wave | Phase 8 | Depends on everything |

### Worktree hygiene
- One branch per worktree
- Worktrees live in sibling directories: `../kinetiks-phase-0`, `../kinetiks-phase-1`, etc.
- The primary checkout (`/Users/zackhollandsmacbookpro/kinetiks`) stays on `main` between phases
- Rebase each phase branch onto `main` before opening PR if any other phase has merged in the meantime
- If a rebase introduces conflicts in shared files (`tier-config.ts`, schema migrations, `packages/deskof/`), resolve with care and re-run full type-check before pushing

### CodeRabbit workflow
- CodeRabbit runs automatically on PR open + every push
- Treat all CodeRabbit comments as blocking unless explicitly waived in PR conversation with reasoning
- Common CodeRabbit fixes (TS strict, missing error handling, unused imports) addressed inline
- Architectural CodeRabbit suggestions either implemented or rebutted in-thread before merge
- A phase is NOT complete until: CodeRabbit shows zero open issues, all checks green, exit criteria verified, manual smoke passes

---

## Phase 0 — Research Spike: LLM Citation Prediction Model

**Duration:** 7-9 days (extended from 5-7 by Quality Addendum #2 to include Quora data).
**Runs in parallel with Phase 1.** Validates whether citation probability can be predicted before we invest in the full discovery engine.

### Tasks
| # | Task | Days |
|---|---|---|
| 0.1 | Reddit thread scraper — collect 5,000 threads across 6 verticals (growth/marketing, startups/SaaS, product/PM, dev tools, AI/LLMs, lifestyle control). Age 3-18 months, ≥5 comments, ≥10 upvotes. Store full attribute set per Research Spike §2.3. | 2 |
| 0.2 | Quora question scraper (Playwright) — collect 2,000 questions across same verticals from Quora Spaces, including Quora-specific features (author credentials, answer request count, view count, answer-age-relative-to-question). | 1.5 |
| 0.3 | Google indexing checker — Google Custom Search API, record indexed status + first-page position for all 7,000 threads. | 0.5 |
| 0.4 | Question extraction batch (Claude API) — normalize all 7,000 threads into LLM-style questions. | 0.5 |
| 0.5 | LLM citation checker — query ChatGPT (gpt-4o + browsing), Perplexity (sonar-pro), Claude (sonar with web search), Gemini (2.0-flash w/ grounding) for each of 7,000 questions. Parse responses for direct URL citations, content matches, subreddit references. Classify L0–L3 (binary cited = L2+). | 2 |
| 0.6 | Build labeled dataset — join thread attributes + citation results into a 7,000-row labeled corpus. | 0.5 |
| 0.7 | Train + evaluate models — logistic regression baseline + XGBoost. **Run both Approach A (unified) and Approach B (Reddit-only / Quora-only).** Hold lifestyle vertical out for validation. 80/20 stratified split + 5-fold CV. | 1.5 |
| 0.8 | Documentation — feature importance ranking, per-vertical performance, AUC + Precision@top-10%, go/no-go recommendation. If unified model within 3% AUC of platform-specific, use unified. | 1 |

### Exit criteria
- Labeled dataset of 7,000 threads with citation status across 4 LLM platforms
- AUC, Precision@10%, feature importance ranking documented
- **Go (AUC > 0.65):** ship citation prediction in Phase 4 with 0.25 weight
- **Strong go (AUC > 0.75):** consider raising weight in composite score
- **Weak signal (0.55–0.65):** ship without citation in composite, use as tiebreaker
- **No-go (< 0.55):** drop citation prediction; rely on longitudinal data later

### Cost
~$301 (per Quality Addendum #2.6)

---

## Phase 1 — Foundation

**Duration:** 12-14 days. App scaffold, auth, schema, Reddit + Quora clients, platform abstraction, billing tier integration.

### 1.0 Architecture decisions (1 day)
- Resolve the 3 prerequisite questions above with the user
- Lock package layout
- ADR document committed to `apps/deskof/docs/adr/`

### 1.1 Scaffolding & shared infra (2 days)
- `apps/deskof/` Next.js 14 (App Router, TS strict, Tailwind, Geist) inside the Turborepo
- `packages/cortex/` (promoted from `apps/id/src/lib/cortex/` or aliased) with `operator-profile/` subdir
- `packages/deskof/` for shared types, scoring math, gate logic, fingerprinting utilities
- `packages/mcp/tools/deskof/` for MCP tool definitions
- Tailwind theme + Geist font stack matching Kinetiks design system, dark mode tokens per Quality Addendum #9
- PWA manifest: `display: standalone`, `orientation: portrait`, theme_color matches mode

### 1.2 Kinetiks ID auth integration (1.5 days)
- Shared `.kinetiks.ai` cookie middleware
- Server session + tier reading from Kinetiks ID
- Cross-app auth verification test
- Floating pill connector mounted

### 1.3 Database schema (2 days)
All tables under `deskof_` prefix in shared Supabase project. Migrations in `packages/supabase/migrations/`.

**Core tables:**
- `deskof_opportunities` (user_id + status + score idx)
- `deskof_replies` (user_id + posted_at idx; **DB constraint: posted_at NULL until human_confirmed_at NOT NULL**)
- `deskof_reply_tracking` (reply_id + horizon + timestamp)
- `deskof_threads` (platform + subreddit + created_at; cached snapshots, 7-day TTL)
- `deskof_platform_accounts` (encrypted token columns; access only via Edge Functions)
- `deskof_platform_health` (user_id + platform + date)
- `deskof_authority_scores` (user_id + topic + date)
- `deskof_skip_log` (user_id + created_at; 90-day retention)
- `deskof_citation_checks` (reply_id + model + checked_at)
- `deskof_operator_tracks`

**Quality gate tables (Quality Addendum):**
- `deskof_cppi_log` (CPPI snapshots)
- `deskof_topic_vectors` (reply topic vectors for spacing detection)
- `deskof_community_gate_config` (per-subreddit auto-learned thresholds)
- `deskof_gate_health` (weekly Gate Trust Score)

**Quora matching:**
- `deskof_quora_match_attempts` (reply_id, attempt_ts, candidates_found, match_confidence, match_method, outcome)

**Privacy / analytics:**
- `deskof_analytics_events` (event_name, user_id_hash, ts, properties JSONB, session_id)
- `deskof_data_deletion_requests`

**Filtered threads:**
- `deskof_filtered_threads` (today's filtered threads + reasons; non-persistent / daily reset)

**RLS policies:**
- All tables: `user_id = auth.uid()`
- `deskof_replies`: extra policy preventing UPDATE to `content` or `posted_at` without `human_confirmed_at` set in same transaction
- `deskof_platform_accounts`: encrypted tokens never client-readable

### 1.4 Reddit OAuth + API client (2.5 days)
- OAuth2 web flow (read, submit, history, identity scopes)
- Encrypted token storage via Supabase Vault
- Server-side refresh + rotation
- Reddit API client abstraction with rate limit (target <30 req/min sustained), exponential backoff, X-Ratelimit-Remaining monitoring (auto-backoff at <10 remaining)
- History import job

### 1.5 Quora scraper client (3 days)
- Playwright headless scraper with multiple CSS selector fallbacks per data point
- Rate limit: 20 req/min max
- Health check: alert if selector success <80%
- Question discovery, answer extraction, score tracking
- Stores into `deskof_threads` with `platform: 'quora'`
- Quora profile URL ingestion (no OAuth)
- **Browser handoff for posting** (clipboard + URL open + return detection)

### 1.6 Platform abstraction layer (1 day)
- `PlatformInterface` with `fetchThreads`, `fetchThreadDetail`, `postReply`, `checkReplyStatus`, `importHistory`
- Reddit + Quora both implement; all Scout/Lens/Pulse/Mirror logic operates on the interface

### 1.7 Tier-gating middleware + billing integration (2 days)  *(Quality Addendum #10)*
- Centralized `lib/tier-config.ts` — single source of truth for feature gates
- `<UpgradeGate feature="...">` component
- `canAccess(feature)` middleware reading Kinetiks ID session
- Feature-gate matrix from Quality Addendum #10.4 fully encoded
- Per-tier track ceiling: free → minimal, standard → standard, hero → hero
- Conversion-trigger components (lock icons, teasers, upgrade CTAs) — empty shells for Phase 8 wiring

### 1.8 Privacy + deletion infrastructure (1 day)  *(Final Supplement #2)*
- `deskof_data_deletion_requests` table
- Edge Function triggered by Kinetiks ID account-deletion webhook → cascading purge schedule (1h tokens, 24h tables, 7d Cortex profile)
- Privacy disclosure modal component for onboarding

### Phase 1 exit criteria
- App loads at `deskof.kinetiks.ai` with Kinetiks ID auth
- Reddit OAuth works end to end, encrypted tokens stored
- Quora scraper discovers questions and extracts answers via abstraction layer
- Platform abstraction allows Scout to treat Reddit + Quora identically
- All `deskof_` tables deployed with RLS
- Tier middleware enforces gating in a smoke test
- Account-deletion webhook drops a row in deletion-requests table

---

## Phase 2 — Core Write Loop + Onboarding

**Duration:** 12-14 days. The complete Write tab + revised 6-step onboarding + Operator Profile cold start pipeline.

### 2.1 Operator Profile foundation (3 days)
- `packages/cortex/operator-profile/`
  - `types.ts` — `OperatorProfile`, `ExpertiseTier`, `VoiceFingerprint`, `Interest`, `GateAdjustments`
  - `builder.ts` — dynamic profile construction
  - `expertise-tiers.ts` — Core Authority / Credible Adjacency / Genuine Curiosity logic
  - `personal-identity.ts`
  - Confidence-score computation
- Read APIs: Cortex business context layers (8 layers, weights per Integration Doc §2.1)
- Write API: profile updates from Mirror

### 2.2 Cold start pipeline — Mirror v0  *(Quality Addendum #6)*
- **Phase A: Import everything** (background jobs after onboarding step 1)
  - Reddit history → topic extraction (NLP, lightweight, no LLM), subreddit frequency, top-performing replies, voice patterns
  - Quora answer history (if connected) → same analysis
  - Kinetiks context inheritance (products, voice, narrative, competitive, etc.)
  - Content URL ingestion (1-5 URLs) → scrape + analyze for expertise depth, voice, unique angles
- **Phase B: Calibration exercise** — store 10 thread judgments as labeled training signal
- **Phase C/D: Ongoing** scaffolded for Phase 7
- Confidence target: 0.55-0.65 by end of onboarding

### 2.3 Scout v1 — keyword discovery (2 days)
- Subreddit + Quora topic monitoring driven by Operator Profile expertise topics
- Thread metadata extraction + dedup
- Stores into `deskof_threads` and `deskof_opportunities`

### 2.4 Basic match scoring (1 day)
- Expertise fit (keyword overlap with Operator Profile) + thread freshness
- No timing model, citation prediction, or answer gap yet (Phase 4)

### 2.5 Write tab UI — opportunity card stack (2.5 days)
- Single-card view: thread title, platform badge, match score, context snippet, Quora-specific markers
- **Mobile-first** *(Quality Addendum #3):* full-bleed cards, thumb-zone primary actions, swipe-left = skip / swipe-right = write reply, pull-to-refresh
- Skip with reason selector (5 SkipReason values) → feeds discovery learning

### 2.6 Reply editor + dual posting flow (2 days)
- Reply editor with character count + thread context sidebar
- Reddit: post via API after gate clears
- **Quora browser handoff:** clipboard copy + open URL + on app return, auto-trigger "I posted this" confirmation
- **Drafts persisted in Zustand + service worker cache** (PWA offline) — text NEVER lost on any failure path
- Post button anchored above mobile keyboard

### 2.7 Track selector (0.5 day)
- Minimal / Standard / Hero picker, persisted in `deskof_operator_tracks`
- Tier-gated: free → minimal only, etc.
- Controls Scout opportunity-queue depth via `TRACK_CONFIGS`

### 2.8 Revised onboarding (6 steps, < 8 min)  *(Final Supplement #4)*
1. Privacy disclosure modal + Reddit OAuth (required) + Quora URL (optional). History imports start in background.
2. Content URL import (1-5 URLs) — Kinetiks context inherited if available.
3. Expertise calibration — 10 real threads, sweet-spot / could-contribute / not-for-me labels.
4. Personal interests — free-text + suggested communities, pre-populated from history.
5. Track selection — default Standard with 7-day trial.
6. First card — land on Write tab with Scout-found opportunity from calibration topics.

### 2.9 Analytics instrumentation — Phase 2 events  *(Final Supplement #5)*
- `analytics.ts` shared wrapper, queues locally, batches flush, never blocks UI
- Onboarding events (8 events from §5.1)
- Write tab events (12 events from §5.2)
- All include implicit context (timestamp, session_id, tier, track, platform, app_version)

### Phase 2 exit criteria
- Onboarding completes in < 8 min, lands on first card
- User can swipe through opportunity cards from both Reddit and Quora
- User can post a reply to Reddit via API
- User can post to Quora via browser handoff (clipboard + URL + auto-confirm on return)
- Track selection enforced
- Drafts persist across reload and offline
- Analytics events firing for all instrumented actions

---

## Phase 3 — Quality Gate (Lens)

**Duration:** 8-10 days. Full quality gate including CPPI and topic spacing. Advisory-only feature flag for first 30 days per user.

### 3.1 Self-promotion ratio tracker (1 day)
- 30-day rolling ratio per platform
- Stored snapshot in `deskof_platform_health`

### 3.2 Lens gate engine (2.5 days)
- All gate checks (computation + LLM-powered):
  - Self-promotion ratio (all tiers)
  - Link presence (all tiers)
  - Tone mismatch (LLM, Standard+)
  - Redundancy (LLM, Standard+)
  - Question responsiveness (LLM, Standard+)
- Returns `GateResult { status: clear|advisory|blocked, checks: [GateCheck...] }`
- LLM failures degrade silently (skip LLM checks, run computational only)

### 3.3 CPPI — Cross-Platform Promotional Index (1.5 days)  *(Quality Addendum #4)*
- Volume dimension (cross-platform promotional ratio, 7-day rolling)
- Concentration dimension (product concentration)
- Clustering dimension (temporal clustering coefficient)
- `CPPI = volume*0.4 + concentration*0.35 + clustering*0.25`
- Levels: low <0.40, moderate 0.40-0.60, high 0.60-0.80, critical >0.80
- Gate behavior: informational at moderate, advisory at high, blocking at critical
- Snapshots in `deskof_cppi_log`

### 3.4 Topic spacing intelligence (1.5 days)  *(Quality Addendum #5)*
- Lightweight NLP topic vectorization per reply (NOT LLM — fast and cheap)
- Cosine similarity vs last-7-day reply vectors
- 2 similar = informational, 3+ = advisory, same-day-different-community = elevated advisory
- Stored in `deskof_topic_vectors`
- Scout integration: deprioritize already-covered topics, surface in card explanation

### 3.5 Gate UI in editor (1.5 days)
- Inline gate results below editor
- Clear / advisory / blocked status with specific check messages and recommendations
- Override control for advisories (never blocks)
- Mobile: compact strip above keyboard

### 3.6 Server-side gate validation (0.5 day)
- Re-run all gate checks on submission to prevent client bypass
- Hard block if server result is `blocked`

### 3.7 Calibration infrastructure  *(Final Supplement #6)*
- Feature flag `gate_blocking_enabled` per user — auto-flips after 30 days
- Per-check enable phasing (days 31-60: self-promo only; days 61-90: incremental)
- `deskof_community_gate_config` table populated by Pulse from outcome data (Phase 6)
- `gate_adjustments` field on Operator Profile for per-user calibration

### 3.8 Analytics — gate events
- `gate_check_completed`, `gate_advisory_overridden`, `reply_post_failed`

### Phase 3 exit criteria
- Every reply runs through full gate before posting
- CPPI computed and visible to gate logic
- Topic spacing detection and Scout integration working
- Server-side validation prevents client bypass
- Advisory-only mode confirmed for first 30 days per user
- All gate target rates measurable (advisory 15-25%, block 1-3%, override 30-50%)

---

## Phase 4 — Discovery Engine Intelligence

**Duration:** 12-14 days. Upgrade Scout from keyword matching to full composite scoring. Filtered feed UI.

### 4.1 Timing model (3 days)
- Upvote velocity tracking (Reddit) / view-velocity (Quora)
- Comment arrival rate, OP engagement detection
- Per-community time-of-day pattern learning
- Output: `timing_score` 0-1 per opportunity

### 4.2 Citation prediction integration (2 days)
- Wire in the Phase 0 model (or fallback if no-go)
- Thread-level `citation_prob` 0-1
- Stores prediction inputs/outputs for longitudinal feedback loop

### 4.3 Answer gap detection (3 days)
- LLM analysis of existing replies to identify missing perspectives
- Match gaps against operator expertise tiers
- Output: `answer_gap_score` 0-1 + gap description for suggested-angle generation

### 4.4 Anti-signal filtering (2 days)
- Astroturf detection (account age + posting pattern analysis)
- Community hostility scoring (downvote rate, removal rate per community)
- Cold-entry warnings (no posting history in community)
- Redundancy detection (already-well-answered)
- Promo-tension detection (honest answer requires self-promo)
- Filtered threads logged in `deskof_filtered_threads` with reason

### 4.5 Composite scoring + opportunity-cost budgeting (1 day)
- `match_score = expertise*0.30 + timing*0.20 + citation_prob*0.25 + answer_gap*0.20 + anti_signal*0.05`
- Hero tier: customizable weights
- Rank against Track budget, surface top-N

### 4.6 Suggested angle generation (2 days)
- LLM one-line angle from thread context + operator expertise + answer gap
- NOT a draft reply (hard constraint)
- Free tier: locked, shows upgrade CTA

### 4.7 Filtered feed UI  *(Quality Addendum #7)*
- Subtle counter in Write tab header: "Filtered: 6 today"
- Tappable list view with one-line reasons per thread
- Read-only, non-persistent (daily reset)
- Each row shows match score it would have received

### 4.8 Analytics — discovery events
- `opportunity_surfaced`, `opportunity_viewed`, `opportunity_skipped`, `angle_viewed`, `filtered_feed_opened`

### Phase 4 exit criteria
- Composite scoring produces measurably better opportunities than keyword-only
- Suggested angles are specific and contextual
- Filtered feed surfaces with educational reasons
- Opportunity queue respects Track budget

---

## Phase 5 — Reply Tab + Removed-Reply Recovery

**Duration:** 9-11 days. Active thread management, triage, sentiment, removal analysis.

### 5.1 Reply monitoring (2 days)
- Polling Reddit API for responses on user's posted replies
- Quora periodic scraping (6h first week, daily first month, weekly after)
- Stored in `deskof_reply_tracking`
- **Quora 3-layer answer matching** *(Quality Addendum #1)*:
  - Layer 1: content fingerprinting (Levenshtein 0.75+ auto-match, 0.50-0.75 ambiguous → user picks)
  - Layer 2: URL fallback
  - Layer 3: 48hr timed retry (every 6h)
  - All attempts logged in `deskof_quora_match_attempts`

### 5.2 Triage engine (2.5 days)
- LLM classification: Engage / Acknowledge / Ignore / Opportunity
- Uses thread context + reply content
- Override-tracking feeds learning loop

### 5.3 Reply tab UI (2 days)
- Active thread list with triage badges
- Reply preview, sentiment indicator
- Tap to expand → thread context + respond inline
- Removed filter toggle

### 5.4 Sentiment analysis (1.5 days)
- LLM thread-sentiment classification over time
- Flag negative shifts proactively

### 5.5 Removed reply analysis pipeline  *(Quality Addendum #8)*
- Detection at 15min / 1h / 6h / 24h / 72h
- Classification: instant (AutoMod), moderator, shadow, delayed
- Root cause analysis (link presence, account age, AutoMod rules, thread-wide moderation)
- Reply tab visual treatment (muted dusty red, plain-language cause)
- Recovery options: retry with edits / find similar thread / deprioritize community / acknowledge
- Feeds back into gate calibration, discovery scoring, Operator Profile

### 5.6 Triage learning loop (1 day)
- Track triage overrides
- Feed into triage model adjustment
- Stored in Operator Profile

### 5.7 Analytics — Reply tab events
- All 7 events from Final Supplement §5.3

### Phase 5 exit criteria
- Reply tab shows all active threads with triage status
- Quora 3-layer matching works end to end
- Removed reply analysis surfaces with recovery options
- Triage overrides feed Mirror

---

## Phase 6 — Reputation Tab + Tracking Engine (Pulse)

**Duration:** 12-14 days. Authority Score, all four time horizons, platform health, Gate Trust Score.

### 6.1 Immediate tracking 0-24h (1.5 days)
- Removal detection, upvote velocity, OP engagement, early reply engagement
- Edge Function `pulse-immediate` triggered after post

### 6.2 Short-term tracking 1-4 weeks (2 days)
- Google indexing check, reply position tracking, secondary engagement
- Edge Function `pulse-shortterm` (pg_cron daily)

### 6.3 Medium-term tracking 1-3 months — LLM citation checks (2.5 days)
- Scheduled jobs against ChatGPT, Perplexity, Gemini, Claude
- Standard: weekly. Hero: every 48h for <30d threads, daily for <7d threads.
- Cost-aware batching: decreases with thread age, prioritizes high-engagement threads
- `pulse-citation` Edge Function (pg_cron weekly, with priority queue for Hero)

### 6.4 Long-term tracking 3+ months (1.5 days)
- Authority trajectory
- Organic brand mention detection
- Branded search correlation via GSC integration (Hero only)
- `pulse-longterm` (pg_cron daily)

### 6.5 Authority Score computation (2 days)
- Three dimensions: Reach, Resonance, Reverberation (Reverberation weighted heaviest)
- Per-topic scoring
- Daily snapshots in `deskof_authority_scores`
- `pulse-authority` Edge Function (pg_cron daily)

### 6.6 Reputation tab UI (3 days)
- Single Authority Score number with glow effect (per dark mode spec)
- 90-day trend chart
- Dimension drill-downs (Reach / Resonance / Reverberation)
- Citation feed (full for Standard+, teaser for free)
- Platform health dashboard (CPPI gauge, self-promo ratio, subreddit standing, cooling alerts)
- Cooling recommendations referencing CPPI
- Streaks (top-3 reply streaks, healthy ratio weeks, MoM growth)

### 6.7 Platform health monitoring (1 day)
- Per-subreddit standing
- Posting frequency vs community norms
- Risk indicators
- Daily snapshot via `health-snapshot` Edge Function

### 6.8 Gate Trust Score + community calibration  *(Final Supplement #6.6)*
- Weekly batch job: F1 of gate predictions vs actual platform outcomes
- Stored in `deskof_gate_health`
- Alert if score drops below 0.50
- Per-community thresholds auto-learned and stored in `deskof_community_gate_config`

### 6.9 Analytics — Reputation tab events
- All 7 events from Final Supplement §5.4

### Phase 6 exit criteria
- Authority Score per topic with trend
- All four time horizons tracking and surfacing
- Citation checks running on schedule
- Platform health dashboard live with proactive cooling
- Gate Trust Score computing weekly

---

## Phase 7 — Mirror v1 + Personal Interest Engine

**Duration:** 7-9 days. Dynamic profile building, personal pipeline, crossover detection.

### 7.1 Content ingestion v2 — Mirror (2 days)
- Periodic ingestion of new blog posts, newsletters, product docs
- Webhook trigger from Dark Madder if available
- Voice fingerprint refinement

### 7.2 Dynamic expertise tier assignment (2 days)
- Mirror auto-assigns Core Authority / Credible Adjacency / Genuine Curiosity
- Replaces manual tiers from cold start
- Confidence scoring per tier

### 7.3 Personal interest surfacing (2 days)
- Parallel Scout pipeline for non-professional threads
- Different ranking model emphasizing community fit over expertise
- Feeds Write tab card stack alongside professional opportunities

### 7.4 Crossover detection (1 day)
- Identify threads where personal + professional intersect
- Boost in opportunity ranking

### 7.5 Personal engagement cadence tracking (1 day)
- Monitor personal/professional ratio
- Nudge when personal cadence drops

### 7.6 Behavioral learning loop (1 day)
- Skip patterns, gate overrides, triage overrides → Operator Profile updates
- `mirror-behavioral` Edge Function (pg_cron daily)
- Per-user gate adjustment refinement

### Phase 7 exit criteria
- Operator Profile builds dynamically from content + behavior
- Personal interest threads surface
- Crossover prioritized
- Cadence nudges working

---

## Phase 8 — Gamification + MCP + Analytics + Polish

**Duration:** 10-12 days. Levels, streaks, MCP tools, conversion analytics, security audit, production polish.

### 8.1 Level progression + streaks (1.5 days)
- Observer → Referenced level computation from Authority Score milestones
- Streaks for top-3 reply runs, healthy ratio weeks, MoM growth
- Reputation tab integration

### 8.2 MCP tools (3 days)
All under `packages/mcp/tools/deskof/`. Auth via `kntk_` keys with `deskof:read` / `deskof:write` scopes.
- `deskof_get_opportunities` (Standard+, 30/min)
- `deskof_check_draft` (Hero, 20/min)
- `deskof_get_authority` (Standard+, 30/min)
- `deskof_get_thread_status` (Standard+, 30/min)
- `deskof_get_platform_health` (Standard+, 30/min)
- **`deskof_post`** (Hero, 5/min) — requires `human_confirmation_token` (5-min TTL, single-use, content-hash bound, generated only via UI session, stored in memory not DB)

### 8.3 Conversion triggers + analytics  *(Quality Addendum #10.5)*
- Wire all conversion triggers built as shells in Phase 1.7:
  - Suggested angle lock (free → standard)
  - Citation teaser (free → standard)
  - Quora opportunity teaser
  - Gate intelligence preview
  - First-week conversion prompt (single, dismissable)
  - GSC upsell, strategy brief preview, citation speed difference, MCP teaser (standard → hero)
- Conversion analytics events from Final Supplement §5.5
- 7-day free trial flow for Standard
- Webhook configuration UI for Hero
- Upgrade/downgrade flow + billing page deep links

### 8.4 Hero-exclusive strategic features (2 days)
- Weekly AI strategy brief (Monday-generated, ~$1-2/user/week LLM cost)
- Custom scoring weights UI
- Webhook events (`deskof_citation_event`, `deskof_removal_event`, etc.)
- Exportable analytics (weekly + monthly reports)

### 8.5 Discovery engine feedback loop (1.5 days)
- Track skipped opportunities' outcomes
- If skipped 85-score thread gets cited → recalibrate
- Adjust scoring weights from real performance data

### 8.6 Data export pipeline  *(Final Supplement #2.5)*
- Edge Function assembling Operator Profile (JSON), Replies (JSON), Authority history (CSV), Health (CSV), Skip log (CSV)
- ZIP delivered via email within 24h
- GDPR Article 20 compliance

### 8.7 Production polish (2 days)
- Loading states, empty states, all 6 error categories from Final Supplement §1
- Degraded mode banner (Reddit unreachable 15+ min, 2+ LLM failures, DB write failures)
- Notification system: rich push, deep links, citation celebration treatment, max 2/day cap, quiet hours
- Settings page
- A11y pass

### 8.8 Security audit (1 day)
- Verify human-only publishing constraint at all 4 layers (DB, API, MCP, UI)
- Verify human_confirmation_token cannot be generated via API or MCP
- API key scoping audit
- RLS policy audit
- OAuth token encryption audit
- **Ban any PR that adds a code path bypassing human confirmation**

### 8.9 Test coverage  *(CLAUDE.md §Testing Strategy)*
- Unit: scoring, gate (incl. CPPI, topic spacing), authority calc, fingerprinting
- Integration: Reddit API (test sub), Quora scraper (saved HTML snapshots), answer matching corpus
- E2E: full Write flow, Quora handoff, removed reply recovery, onboarding
- **Mandatory:** no path posts without human confirmation
- **Mandatory:** tier gating enforced for every gated feature
- Gate calibration tests (advisory-only flag, community config, trust score)
- All key analytics events fire with correct properties

### Phase 8 exit criteria
- Levels + streaks visible
- All 6 MCP tools operational and human-confirmation enforced
- Discovery engine self-improving from outcome data
- Conversion triggers wired and instrumented
- Hero strategic features live
- Data export delivers within 24h
- All error states and degraded mode tested
- Security audit passed
- Test suite green
- Production-ready

---

## Build Summary

| Phase | Focus | Days | Cumulative |
|---|---|---|---|
| 0 | Research Spike | 7-9 | 7-9 |
| 1 | Foundation | 12-14 | 19-23 |
| 2 | Core Write Loop + Onboarding | 12-14 | 31-37 |
| 3 | Quality Gate (Lens) | 8-10 | 39-47 |
| 4 | Discovery Intelligence | 12-14 | 51-61 |
| 5 | Reply Tab + Removal Recovery | 9-11 | 60-72 |
| 6 | Reputation + Tracking (Pulse) | 12-14 | 72-86 |
| 7 | Mirror + Personal Engine | 7-9 | 79-95 |
| 8 | Gamification + MCP + Polish | 10-12 | 89-107 |

**Serial total:** 89-107 days (matches Quality Addendum + Final Supplement projections)

### Parallelization opportunities
- **Phase 0** (Research Spike) runs in parallel with **Phase 1** (Foundation) — different workstreams
- **Phase 5** (Reply tab) and **Phase 6** (Reputation) run concurrently after Phase 4
- **Phase 7** (Mirror) starts alongside Phase 6 since it depends on Phase 2 foundations

**With max parallelization: 59-69 days critical path.**

---

## Cross-Cutting Requirements (Apply to Every Phase)

These are non-negotiable, enforced from Phase 1 onward, never deferred to "Phase 2 / coming soon":

1. **Human-only publishing.** No code path posts without human-written text + human_confirmation_token. Enforced at DB, API, MCP, UI. Any PR violating this is rejected.
2. **Tier gating.** All gated features go through `lib/tier-config.ts` + `<UpgradeGate>`. Never hardcode tier checks in components.
3. **Drafts never lost.** Every error path saves the user's reply text to Zustand + service worker cache + `deskof_replies` with `status: 'draft'`.
4. **Graceful degradation.** Never blank screens. Reddit down → cached opportunities. Quora down → silent Reddit-only. LLM down → features get less smart silently. Multi-failure → degraded mode banner + posting disabled.
5. **Analytics during build, not as a retrofit.** Every UI component task includes analytics instrumentation as a sub-task.
6. **Operator Profile is private.** Never exposed via MCP, never shared with other users, never used to train models for others.
7. **Mobile-first design.** All primary actions thumb-zone, swipe-driven Write tab, full-bleed cards on mobile, keyboard-aware editor, pull-to-refresh on every tab.
8. **Dark mode.** Component-level dark mode specs from Quality Addendum #9 followed for every new component.
9. **Privacy disclosure first.** Privacy modal shown before any platform connection during onboarding.
10. **Gate calibration discipline.** First 30 days advisory-only per user. Auto-feature-flag transition.

---

## Critical Files & Locations

```
apps/deskof/                            # Next.js app
  src/
    app/                                # App Router
      (auth)/onboarding/                # 6-step onboarding
      write/                            # Write tab
      reply/                            # Reply tab
      reputation/                       # Reputation tab
      api/                              # API routes
    components/
      cards/                            # Opportunity cards
      gate/                             # Lens UI
      editor/                           # Reply editor
      filtered-feed/                    # Quality Addendum #7
    lib/
      tier-config.ts                    # SINGLE source of truth for gating
      analytics.ts                      # Event wrapper
      scout/                            # Discovery engine
      lens/                             # Quality gate
      pulse/                            # Tracking engine
      mirror/                           # Operator Profile updates
      reddit/                           # Reddit client
      quora/                            # Quora scraper + handoff
      platform/                         # PlatformInterface
      drafts/                           # Zustand + SW cache

packages/cortex/operator-profile/        # NEW Cortex primitive
  types.ts
  builder.ts
  expertise-tiers.ts
  personal-identity.ts
  confidence.ts

packages/deskof/                         # Shared types, math, utilities
  src/
    types/
    scoring/                            # Composite scoring math
    gate/                               # Gate check types
    fingerprint/                        # Quora content fingerprinting
    cppi/                               # CPPI computation

packages/mcp/tools/deskof/               # MCP tool definitions
  get-opportunities.ts
  check-draft.ts
  get-authority.ts
  get-thread-status.ts
  get-platform-health.ts
  post.ts                               # Human-confirmation enforced

packages/supabase/migrations/            # All deskof_ migrations + RLS
```

---

## Verification (Before Any Phase Is Marked Complete)

Per global CLAUDE.md "compare against spec before marking complete":

1. Re-read the relevant spec section(s) for the phase
2. List every capability described in the spec
3. Verify each is implemented
4. Explicitly list any gaps
5. Do NOT hide missing functionality behind "Phase 2 / coming soon"
6. Run `pnpm build` + `pnpm type-check` + test suite (these are the floor, not the ceiling)
7. Manually verify the AI / LLM workflows work, are not stubbed
8. Verify the UX matches the design intent for the actual use case

---

## Kickoff Sequence (Day 1)

1. **PR-A:** `refactor/promote-cortex-to-package` — promote `apps/id/src/lib/cortex/` to `packages/cortex/`. Must merge before any phase branch starts.
2. Once PR-A merges:
   - **Worktree A:** `../kinetiks-phase-0` on `phase/0-research-spike` — Reddit/Quora scrapers, citation checker, model training (waiting on Reddit dev account, ~1h)
   - **Worktree B:** `../kinetiks-phase-1` on `phase/1-foundation` — scaffold `apps/do/`, schema, auth, platform abstraction, tier middleware
3. Both worktrees develop in parallel. Phase 0 has zero dependency on Phase 1 product code.
4. As Phase 1 nears merge, prep `phase/2-write-loop` worktree.
5. After Phase 4 merges, fan out: `phase/5-reply-tab`, `phase/6-reputation`, `phase/7-mirror` worktrees in parallel.
6. Phase 8 forks last from a fully merged main.
