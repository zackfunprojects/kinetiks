# Kinetiks AI - Strategic Roadmap

> **Date:** April 8, 2026
> **Context:** Full repo audit of zackfunprojects/kinetiks (669 files, ~85k LOC)
> **Author:** Claude + Zack

---

## Current State of Reality

### What's Built and Real

| Product | Location | Files | LOC | Status |
|---------|----------|-------|-----|--------|
| **Kinetiks ID (Core)** | apps/id | 290 | 37,160 | Phases 0-6 + Marcus v2. Chat, Analytics tab, Cortex tab, approvals, Cartographer, Archivist, Marcus, Oracle schemas, agent comms (email/Slack/calendar), connections framework |
| **Harvest** | apps/hv | 214 | 25,630 | Full UI (Greenhouse/Field/Market), contacts, campaigns, sequences, composer, calls, inbox, infra, Sentinel package. **But:** end-to-end workflows broken, AI features shallow, UX rough |
| **DeskOf** | apps/do | 70 | 9,058 | Phase 3 complete (Lens quality gate). Scout v1, write loop, onboarding, reply editor, tier gating |
| **Desktop shell** | apps/desktop | 4 | ~200 | Electron skeleton only (main, tray, notifications, preload) |
| **Shared packages** | packages/* | 94 | 13,461 | types, ui, supabase, synapse, ai, mcp, cortex, deskof, sentinel - all functional |
| **Database** | supabase/migrations | 28 files | - | Core + Marcus + Harvest + DeskOf schemas with RLS |

### What Doesn't Exist (Zero Code)

| Product | Spec Size | Notes |
|---------|-----------|-------|
| Dark Madder (apps/dm) | Has synapse preset | Standalone repo exists separately, needs migration |
| Hypothesis (apps/ht) | Referenced only | No code, no directory |
| Litmus (apps/lt) | Referenced only | No code, no directory |
| Kinetiks Terminal | 67k words of spec | No code, no directory |
| Ads app | Unnamed | Concept only |
| Adventure | Unnamed | Concept only |

### The Critical Gap

The connections system has 9 providers defined (GA4, GSC, Stripe, HubSpot, Salesforce, Twitter, LinkedIn, Instagram, Resend) with OAuth, encryption, and an extraction framework - **but zero actual extractors are registered**. `registerExtractor()` is never called. The Oracle has types and schemas but no data flowing into it. The intelligence layer has no fuel.

---

## The Vision (Restated Clearly)

For vibe coders launching apps (not enterprise):

**Connect accounts -> Ingest & clean data -> Show what matters -> Direct strategy -> Apps act on it -> Results feed back**

That's the loop. Without steps 1-3, the apps are standalone tools with a fancy wrapper. The core must become a real data platform before the apps matter.

---

## Priority Stack

### Phase A: Core Data Infrastructure (The Foundation)

**Goal:** Kinetiks ingests real data from real accounts and the Oracle can actually analyze it.

#### A1: Provider Extractors (the biggest gap)

Build actual extractors for the providers that matter most to vibe coders launching apps:

| Priority | Provider | Why | Data Yield |
|----------|----------|-----|------------|
| 1 | **GA4** | Everyone has it | Traffic, sources, conversions, user behavior, top pages |
| 2 | **Stripe** | Revenue is the ultimate metric | MRR, churn, LTV, plan distribution, trial conversion |
| 3 | **GSC** | SEO is the free growth lever | Keywords, positions, CTR, impressions, indexed pages |
| 4 | **Google Ads** | Many run ads to launch | Spend, CPA, ROAS, campaign performance, search terms |
| 5 | **Meta Ads** | Social ads for launch | Spend, CPA, audience performance, creative performance |
| 6 | **LinkedIn** | B2B social presence | Post performance, follower growth, engagement |
| 7 | **X/Twitter** | Tech audience lives here | Engagement, follower growth, content performance |
| 8 | **HubSpot** | Common CRM for startups | Contacts, deals, pipeline, lifecycle stages |
| 9 | **Instagram** | Consumer/brand presence | Reach, engagement, audience demographics |
| 10 | **Resend** | Email delivery | Sends, opens, clicks, bounces |

**New providers to add (not currently in registry):**

| Provider | Why | Category |
|----------|-----|----------|
| **Webflow/WordPress** | CMS - where their content lives | CMS |
| **Vercel Analytics** | Many vibe coders deploy here | Analytics |
| **PostHog** | Product analytics, popular with devs | Analytics |
| **Lemonsqueezy/Paddle** | Alternative payment processors | Revenue |
| **Beehiiv/ConvertKit** | Newsletter platforms | Email |
| **YouTube** | Video content channel | Social |
| **TikTok** | Growth channel for some verticals | Social |

For v1 launch: GA4, Stripe, GSC are the minimum. If we only ship three extractors, those three.

Each extractor follows the existing `registerExtractor` pattern and:
- Pulls data on a schedule (CRON via Supabase Edge Functions)
- Normalizes into the Oracle's MetricDataPoint format
- Handles token refresh, rate limits, error recovery
- Reports sync status to kinetiks_connections.last_sync_at

#### A2: Data Cleaning Pipeline

The Archivist handles Context Structure data. We need an equivalent for metrics:

- **Normalize** - Different sources report the same thing differently (GA4 "sessions" vs. GSC "clicks" vs. Stripe "customers"). Map to unified metric keys from METRIC_REGISTRY.
- **Dedup** - Same data point from overlapping syncs
- **Gap detection** - Missing data periods flagged, not silently ignored
- **Anomaly flagging** - Z-score based (pattern-detector.ts already has the skeleton)
- **Freshness tracking** - How stale is each data source? Surface this to Marcus.

#### A3: Oracle Activation

The Oracle files exist (715 LOC) but need to become real:

- **goal-tracker.ts** - Currently has types. Needs to read actual metric data from Supabase and compute progress against user-defined goals.
- **pattern-detector.ts** - Has z-score skeleton. Needs to run on real ingested data via CRON.
- **insight-generator.ts** - Needs to produce actual natural language insights from detected patterns, feed them to Marcus.
- **attribution.ts** - Cross-source attribution (which content drives which pipeline).
- **budget-tracker.ts** - Track spend across connected ad platforms.

#### A4: Background Intelligence Agents

The "always browsing" layer. New capability, not in the current codebase:

- **Competitor monitor** - Given competitors from Context Structure, periodically crawl their site, social, content, pricing. Detect changes. Surface to Marcus.
- **SEO monitor** - Track keyword position changes daily via GSC data. Alert on drops.
- **Social listener** - Monitor mentions, industry keywords across connected social platforms.
- **Content scanner** - Analyze competitor content strategy, find gaps and opportunities.

These are CRON Edge Functions that write findings to a new `kinetiks_intelligence_feed` table. Marcus reads from this table when assembling context.

#### A5: Billing & Seeds

Currently `apps/id/src/lib/billing/plans.ts` exists but billing isn't wired. For launch:

- Stripe Checkout integration for subscription plans
- Seeds balance tracking and consumption
- Plan-based feature gating (which apps, how many seats, which integrations)
- Usage metering for AI calls

#### A6: Desktop App

The Electron shell exists (4 files). Needs:

- Daily brief notification (Marcus generates, desktop surfaces)
- Approval quick-actions from system tray
- Menu bar presence with unread count
- Deep links into web app tabs
- Auto-update mechanism

---

### Phase B: Fix Harvest

**Goal:** Harvest actually works end-to-end as a standalone outbound tool.

Current problems (based on repo analysis):

1. **List building doesn't work** - The Scout/enrichment pipeline needs to actually find and enrich prospects. The UI exists but the underlying data flow is broken.
2. **Sequence execution is broken** - Sequences exist in the DB and UI but the execute endpoint doesn't reliably send emails through connected mailboxes.
3. **AI features are shallow** - The Composer has a generate/research/review flow but the AI quality is poor. The Sentinel review panel exists but doesn't meaningfully improve outreach.
4. **UX is rough** - The three-zone layout (Greenhouse/Field/Market) is conceptually sound but the actual interactions feel unfinished.

Fix priority:
1. **Contacts + enrichment** - Make list building actually work. Import, enrich, score, segment.
2. **Mailbox + domain infra** - Make email sending actually work. Domain verification, mailbox health, warmup.
3. **Sequence execution** - End-to-end: create sequence -> enroll contacts -> emails send -> track opens/replies -> handle responses.
4. **Composer quality** - AI draft generation that produces emails people would actually send. Research briefs that surface real context.
5. **Inbox** - Replies come in, get threaded, get classified (interested/not interested/objection).
6. **UX pass** - Make the whole thing feel good to use.

---

### Phase C: Dark Madder Migration

**Goal:** Dark Madder running in the monorepo, connected to Cortex/Synapse.

Since it exists as a standalone app:

1. **Scaffold apps/dm** in the monorepo
2. **Port core functionality** - Content editor, keyword research, editorial calendar, publishing
3. **Wire Synapse** - Preset already exists in `packages/synapse/src/presets/dark-madder.ts`
4. **Connect to Cortex** - Content uses Voice, Narrative, Brand layers from Context Structure
5. **Oracle integration** - Content performance metrics flow into the analytics pipeline
6. **Floating pill** - Show Kinetiks connection status, approvals, quick-chat

---

### Phase D: Launch Harvest + Dark Madder

**Goal:** Two working products that can acquire users independently and pull them into the Kinetiks ecosystem.

- Harvest launches as standalone outbound tool (hv.kinetiks.ai)
- Dark Madder launches as standalone content tool (dm.kinetiks.ai)
- Both work independently with free tiers
- Both create Kinetiks IDs behind the scenes
- Cross-app intelligence available when both are connected
- Dog-food both for Kinetiks AI's own marketing

---

### Phase E: DeskOf Spinoff

**Goal:** DeskOf becomes an independent product outside the monorepo.

- Extract apps/do + packages/deskof into its own repo
- DeskOf keeps its own Supabase project (migrate deskof_* tables)
- Auth still via Kinetiks ID (shared cookie) for connected users
- Standalone auth option for independent users
- Complete remaining build plan phases (4-8) independently
- Launch at its own domain

---

### Phase F: Litmus + Hypothesis

**Goal:** PR engine and landing page/CRO tool join the suite.

Only start these after Harvest + Dark Madder are launched and stable. They complete the GTM suite:

- **Litmus** - Journalist database, pitch generation, coverage tracking, share of voice
- **Hypothesis** - Landing page builder, A/B testing, form optimization, conversion tracking

Both follow the same pattern: standalone app, Synapse-connected, Oracle-reporting.

---

## What NOT to Build (For Now)

| Item | Why Not |
|------|---------|
| Kinetiks Terminal | 67k words of spec for a power-user CLI when the core doesn't work yet. Build this after the ecosystem exists. |
| Ads app | Vibe coders run simple ad campaigns. GA/Meta Ads data ingestion covers the intelligence layer. A dedicated app is later. |
| Adventure | Creative/experimental GTM is a nice-to-have for mature users, not a launch priority. |
| More spec documents | You have >1MB of specs. The bottleneck is code, not vision. |

---

## Immediate Next Actions

1. **Consolidate CLAUDE.md** - Merge v1 and v2 into one authoritative file. The divergence is confusing Claude Code agents.
2. **Start Phase A1** - Pick GA4 as the first extractor. It's the highest-value, most universal data source. Build one real extractor end-to-end (OAuth -> pull data -> normalize -> store -> Oracle can read it). This proves the pipeline.
3. **Audit Harvest** - Before fixing it, do a systematic walkthrough of every user flow and document exactly what's broken. Don't guess - click through it.
4. **Assess Dark Madder standalone** - What state is the separate repo in? What can be ported vs. what needs rewriting?
5. **Kill the Terminal spec** - Or at minimum, move it to an "ideas" folder. It's pulling mental energy toward a product that shouldn't exist yet.

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| A1-A3 (Core data) | 4-6 weeks | None - start now |
| A4 (Intelligence agents) | 2-3 weeks | A1-A3 |
| A5-A6 (Billing + Desktop) | 2-3 weeks | Can parallel with A4 |
| B (Fix Harvest) | 3-4 weeks | Can start parallel with A |
| C (Dark Madder migration) | 2-3 weeks | Depends on standalone assessment |
| D (Launch) | 2 weeks | B + C complete |
| E (DeskOf spinoff) | 1-2 weeks | Can happen anytime |
| F (Litmus + Hypothesis) | 6-8 weeks each | After D |

**To a launchable core product (Kinetiks + Harvest + Dark Madder): ~10-14 weeks** if parallelized well.

---

## One Last Thing

The beauty you described - "get access to the right data, direct them via strategy, act on that path with the right apps, have the apps learn and speak to the main core" - is genuinely compelling. The architecture supports it. The shared packages, the Cortex/Synapse/Oracle system, the approval pipeline, the Learning Ledger - it's all designed for this.

The gap isn't vision or architecture. It's that the data pipeline has no fuel and one of your two shipped apps doesn't work well. Fix those two things and you have something real.
