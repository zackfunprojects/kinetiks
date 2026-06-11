> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: specs/radar-response.md (response) and platform-asks.md (sensing -> platform A4 agents)
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# PATCH-006: Radar

## Continuous Competitor Monitoring, Trend Detection & Reactive Content

**Date:** June 2026
**Applies to:** Phase 3 (Research & Planner), Phase 4 (Content Generator), Phase 7 (Analytics & Adjuster)
**Priority:** Medium-High - converts Dark Madder's research from batch to continuous, and unlocks the trending-topic content category that is outperforming evergreen informational posts in 2026
**References:** 03-RESEARCH-PLANNER.md, 07-ANALYTICS-ADJUSTER.md, 11-MODEL-STRATEGY.md, PATCH-001, PATCH-003, PATCH-004

---

## IMPORTANT: Read Before Implementing

1. Read through the ENTIRE patch document first
2. Review how the Adjuster's Quarterly Strategic Review reports "Competitor Movement" - Radar supersedes that section's data source (it becomes a roll-up of Radar events rather than a quarterly lookback)
3. Review the calendar proposal mechanism (how the Adjuster proposes calendar additions) - Radar reuses the same propose/approve path
4. Review the Content Generator's standard pipeline timing - the Fast Track (§5) modifies scheduling, not generation quality gates
5. Produce a written plan listing what changes, what stays, and what gets built new
6. Get approval before writing any code

---

## Problem Summary

Dark Madder's research is session-based: run Discovery, build the architecture, commit a calendar, refresh quarterly. Between sessions, the org is blind. Three things happen in the dark:

1. **Competitors publish into your territories and you find out from your rankings.** A competitor shipping a better piece into your bee-conservation cluster is actionable *the day it publishes* (outwrite it, refresh your hub, accelerate a planned spoke). Discovered three months later in a Quarterly Review, it's a post-mortem.

2. **Trends pass by entirely.** Industry news, new regulations, viral discussions, seasonal surges - the content that performs best in 2026 is increasingly timely: research, thought leadership, and trending topics outperform generic evergreen SEO posts, and AI engines disproportionately cite recent coverage. An org running purely on a quarterly evergreen calendar never captures any of this, because by the time a human notices a trend, drafts it, and publishes, the window is closed.

3. **The calendar can't react.** Even when the user *does* spot something, there's no workflow for it - no way to say "respond to this" and get a brief, a draft, and a publish slot without manually wiring it through Discovery → Keywords → Architecture.

Radar is the continuous sensing layer: a daily watch on competitors and the org's topic space, a relevance-filtered feed of events worth knowing about, and a one-click path from "this happened" to "here's the draft." It turns Dark Madder from a planner that executes into an operator that notices.

---

## Architecture Overview

```
WATCHES (daily crons)            FILTERING                   SURFACES
─────────────────────            ─────────                   ────────
Competitor sitemaps/RSS    ─┐    Relevance scoring           Radar feed (in-app)
Industry news queries      ─┤    (vs. territories +          Daily/weekly digest (email)
Keyword trend signals      ─┼─►  corpus embeddings)    ─►    Calendar proposals
Reddit velocity            ─┤    Dedup + clustering          Fast Track briefs
  (via PATCH-005 sources)  ─┘    Severity scoring            Refresh triggers (PATCH-004)
                                                             Quarterly Review roll-up
```

---

## 1. Watches

### 1.1 Competitor Watch

Org Settings gains **Competitors** (seeded from PATCH-002's `competitive_landscape` entries where a domain is known, plus the competitor domains already collected in research setup):

```
COMPETITOR WATCH
─────────────────
  givewise.com        sitemap ✓ detected     watching /blog/*, /guides/*
  spareapp.io         RSS ✓ detected         watching feed
  changecollective.org no feed — sitemap diff daily
  + Add competitor
```

**Mechanism:** Daily fetch of each competitor's sitemap (diff against yesterday's URL set) or RSS feed. New URLs are fetched, the article content extracted (same readability extraction as PATCH-003's legacy import), embedded, and compared against the org's territory centroids and cluster embeddings:

- Within distance 0.3 of a territory/cluster → **relevant event**, severity scored
- Otherwise → logged but not surfaced (visible under an expandable "37 low-relevance posts this week" line, never as individual noise)

**Severity** (Haiku classification + data): does it target a keyword the org ranks for (high)? Does it land in a cluster where the org has a hub (high)? Is it merely adjacent (low)?

### 1.2 Trend Watch

Three signal sources, fused:

- **News queries:** Daily web/news search on each active territory's top phrases (e.g., "bee conservation," "charity transparency"). New stories clustered by event (Haiku groups same-story coverage), so one regulation produces one Radar event citing five sources - not five events.
- **Keyword velocity:** Where the SEO API exposes trend data, weekly check on cluster head terms for volume spikes (>50% above trailing average).
- **Community velocity:** If PATCH-005 Reddit sources are configured, a thread crossing an engagement threshold in a watched subreddit on a relevant topic becomes a trend signal ("this question is blowing up in r/personalfinance right now").

### 1.3 Schema

```sql
CREATE TABLE radar_watches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  watch_type TEXT NOT NULL CHECK (watch_type IN
    ('competitor_sitemap','competitor_rss','news_query',
     'keyword_velocity','community_velocity')),
  label TEXT NOT NULL,                   -- "givewise.com", "bee conservation news"
  config JSONB,                          -- domain, path filters, query terms, thresholds
  territory_id UUID REFERENCES authority_territories(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','error')),
  last_run_at TIMESTAMPTZ,
  state JSONB,                           -- yesterday's URL set hash, trailing averages
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE radar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  watch_id UUID REFERENCES radar_watches(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN
    ('competitor_published','news_story','keyword_spike','community_spike')),
  title TEXT NOT NULL,
  summary TEXT,                          -- 2-3 sentence Haiku summary
  source_urls JSONB,                     -- all clustered sources
  relevance FLOAT,                       -- embedding similarity to nearest territory/cluster
  severity TEXT CHECK (severity IN ('high','medium','low')),
  affected_cluster_id UUID REFERENCES content_clusters(id),
  affected_piece_id UUID REFERENCES content_pieces(id),  -- if it threatens a specific piece
  suggested_response TEXT CHECK (suggested_response IN
    ('respond_new_piece','refresh_existing','accelerate_planned','monitor','none')),
  response_rationale TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN
    ('new','seen','responded','dismissed','expired')),
  expires_at TIMESTAMPTZ,                -- trends decay; default 14 days
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 2. The Radar Feed

New top-level nav item: **Radar**. The design intent is an instrument panel, not a social feed - sparse, severity-ranked, every event carrying evidence and one obvious action. On-brand framing: this is the product's sensor array.

```
RADAR                                    3 high · 5 medium · 37 low (collapsed)
──────────────────────────────────────────────────────────────────────────────

● HIGH   COMPETITOR · yesterday                      cluster: Bee Conservation
  GiveWise published "The Complete Guide to Helping Native Bees" (4,200 words)
  Targets "how to help native bees" — your hub ranks #3 for the parent term.
  Their piece covers 2 subtopics your hub doesn't: state-level pollinator
  programs, native bee ID. Theirs is newer and longer.
  [Refresh My Hub]  [Outwrite: New Piece]  [View Theirs ↗]  [Dismiss]

● HIGH   NEWS · 5 sources · 3h ago                  territory: Effective Giving
  FTC announces new disclosure rules for donation apps (effective Sept 2026)
  Directly affects your product category. No competitor coverage yet —
  first-mover window open. Est. interest: "donation app rules" already
  trending in Google News.
  [Fast Track a Response]  [Add to Calendar]  [Sources ▾]  [Dismiss]

◐ MEDIUM COMMUNITY · r/personalfinance · 12h ago
  Thread "are round-up donation apps a scam?" — 840 upvotes, 312 comments
  Maps to your Trust & Transparency territory. Your piece /trust answers
  this; consider a Reddit answer split + a refresh with the thread's
  specific objections.
  [Generate Reddit Answer]  [Queue Refresh]  [View Thread ↗]  [Dismiss]
```

### 2.1 Response Actions (One Click, Existing Machinery)

Every action routes into systems that already exist - Radar adds no second content pipeline:

| Action | What it does |
|--------|--------------|
| Refresh My Hub / Queue Refresh | Creates a PATCH-004 refresh job with the event attached as a gap record ("competitor covers X; you don't") |
| Outwrite: New Piece / Add to Calendar | Generates a brief (standard brief pipeline, event evidence included) and proposes a calendar slot via the existing calendar-proposal path |
| Fast Track a Response | §5 - brief + immediate generation + priority review slot |
| Generate Reddit Answer | Hands the thread to the Splits Engine's Reddit generator with the thread's actual language |
| Dismiss | Trains relevance: 3 dismissals of similar events auto-lowers that pattern's severity (logged, reversible in settings) |

### 2.2 The Digest

A daily or weekly (org-configurable, default weekly) email digest: high-severity events, one-line summaries, deep links to the feed. The digest is a *pointer*, never a report - all action happens in-app. Quiet weeks send nothing ("no digest is good news" beats inbox filler).

---

## 3. Relevance Discipline (Why This Won't Become Noise)

The failure mode of every monitoring feature is alert fatigue. Radar's contract with the user:

1. **Hard cap:** maximum 5 surfaced (medium+high) events per day per org; overflow rolls into the digest ranked by severity. Low-relevance events never notify.
2. **Embedding pre-filter before any LLM call:** events outside distance 0.35 of every territory and cluster are logged-only. The LLM never sees them; the user never pays for them.
3. **Dismissal learning** (§2.1) tightens the filter continuously.
4. **Expiry:** trend events auto-expire (default 14 days) - a stale "trending" alert is worse than none.
5. **Watch budget:** v1 caps at 10 competitor watches + 5 news queries per org, keeping daily cron cost predictable.

---

## 4. Radar ↔ Existing Systems

- **Adjuster:** The Quarterly Strategic Review's "Competitor Movement" section becomes a roll-up of the quarter's Radar events with outcomes ("GiveWise published 6 pieces into your clusters; you responded to 3; ranking impact: ..."). The Monthly Health Report gains a one-line Radar summary.
- **Research:** The Research Overview's status bar gains a Radar tile ("2 events need attention"). Territory cards in Discovery show watch coverage ("3 watches active on this territory").
- **Freshness Engine:** Competitor-published events targeting an existing piece feed the piece's SERP-gap signals - a competitor publishing against your piece *is* a freshness event.
- **Corpus Map:** Pieces under active competitive pressure (open high-severity event) render with a pulsing edge on the map - the sensor layer made visible.

---

## 5. The Fast Track

Trend content has a shelf life measured in days. The standard pipeline (brief → scheduled generation 3 days before publish → review → publish) is built for evergreen pacing. Fast Track is the same quality pipeline at emergency speed:

```
FAST TRACK: "What the FTC's New Donation App Rules Mean for Givers"
────────────────────────────────────────────────────────────────────
1. Brief generated now — sourced from the 5 clustered news stories,
   your product profile, and your Trust territory context        ✓ 2 min
2. Generation begins immediately (standard Opus pipeline, full
   craft + voice audit — speed never skips the quality gates)     ~15 min
3. Draft lands at the TOP of your review queue + push notification
4. On approval: publish immediately (today is the publish date)
5. Splits Engine auto-queues LinkedIn + Reddit splits — trend
   pieces earn their traffic from distribution, not from waiting
   for rankings

Fast Track pieces are tagged `timely` and EXCLUDED from:
• cannibalization blocking (they may deliberately overlap evergreen
  pieces — flagged for a later merge instead)
• the Freshness Engine's refresh queue by default (they're expected
  to age; a 'convert to evergreen' action exists for the winners)
```

Implementation: `content_pieces` gains `track TEXT DEFAULT 'standard' CHECK (track IN ('standard','fast'))`. Fast Track sets `scheduled_generate_at = now()` and inserts at review-queue head. A "convert to evergreen" action clears the tag and enrolls the piece in normal freshness management.

---

## 6. Technical Implementation Notes

### New API Routes

```
POST   /api/radar/watches                  -- Create watch
PUT    /api/radar/watches/[id]             -- Update / pause
POST   /api/radar/watches/[id]/run         -- Manual run (also daily cron per watch type)
GET    /api/radar/events                   -- Feed (filters: severity, status, cluster)
POST   /api/radar/events/[id]/respond      -- Execute a response action
POST   /api/radar/events/[id]/dismiss      -- Dismiss (+ pattern learning)
PUT    /api/radar/settings                 -- Digest cadence, caps, severity thresholds
POST   /api/radar/fasttrack                -- Create Fast Track piece from event
```

### Model Usage (additions to TASK_MODELS)

```typescript
  // --- Radar (PATCH-006) ---
  eventSummarization:      MODEL_CONFIG.HAIKU,   // 2-3 sentence event summaries
  storyClustering:         MODEL_CONFIG.HAIKU,   // Same-story grouping across sources
  severityClassification:  MODEL_CONFIG.HAIKU,   // High/medium/low given org context
  responseRecommendation:  MODEL_CONFIG.SONNET,  // Which response action, and why
  competitorPieceAnalysis: MODEL_CONFIG.SONNET,  // What their piece covers vs. ours
```

Fast Track generation reuses the standard Content Generator task models unchanged.

### Cost Controls

- Sitemap diffs are URL-set comparisons - article fetch + embed happens only for new URLs.
- All LLM calls gated behind the embedding relevance pre-filter (§3.2).
- News queries batched per territory per day; story clustering reduces N stories to 1 event before any Sonnet call.

---

## 7. UX Principles for This Patch

**Severity, then silence.** Radar earns trust by what it *doesn't* show. A quiet feed must mean a quiet week, never a broken cron (show "last sweep: 4h ago ✓" persistently).

**Every event is actionable or it isn't an event.** No FYI-only cards at medium+ severity. Each event ships with a recommended response and the reasoning behind it.

**Reaction uses the same quality bar as planning.** Fast Track compresses scheduling, never craft. A trend piece that embarrasses the org is worse than no trend piece.

**The user tunes the instrument.** Dismissals teach it, watches are editable, caps are visible. Radar should feel like equipment the user calibrates, not a black-box news service.

---

## 8. What to Keep From Current Implementation

- The calendar proposal/approval mechanism (Adjuster's path) - Radar proposals flow through it identically
- Quarterly Review structure - its Competitor Movement section changes data source, not shape
- The Splits Engine generators - Radar's Reddit/LinkedIn actions are thin invocations of them
- PATCH-003's article extraction + embedding service - competitor pieces use the same pipeline as legacy imports

---

## 9. Implementation Order

1. **radar_watches + radar_events + competitor sitemap/RSS diff cron** (extraction + embedding + relevance pre-filter)
2. **Radar feed UI** with competitor events only + dismiss action
3. **Response actions** wiring: Queue Refresh (PATCH-004), New Piece → brief + calendar proposal
4. **News watch** (query + story clustering + event creation)
5. **Digest email**
6. **Fast Track** (track column, immediate generation, review-queue priority, Splits auto-queue)
7. **Velocity signals** (keyword + community) and dismissal learning
8. **Integration surfaces:** Adjuster roll-up, Research Overview tile, Corpus Map pulse

Test end-to-end: add a competitor → seed yesterday's sitemap state → add a URL to their sitemap → verify event appears with correct cluster mapping and severity → trigger "Outwrite" → confirm brief carries competitor analysis and a calendar proposal appears → run a Fast Track and confirm the draft hits the review queue head within the SLA.

---

*Dark Madder PATCH-006 - Radar - June 2026*
