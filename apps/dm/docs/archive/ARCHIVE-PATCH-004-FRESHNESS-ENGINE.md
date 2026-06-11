> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: specs/lifecycle-freshness.md
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# PATCH-004: The Freshness Engine

## Stale Claim Detection, Automated Refresh Drafts & Content Decay Response

**Date:** June 2026
**Applies to:** Phase 4 (Content Generator), Phase 6 (Framer Integration), Phase 7 (Analytics & Adjuster)
**Priority:** High - refreshing existing content is the highest-ROI content activity, and it's currently 100% manual after the Adjuster flags it
**References:** 04-CONTENT-GENERATOR.md, 06-FRAMER-INTEGRATION.md, 07-ANALYTICS-ADJUSTER.md, 11-MODEL-STRATEGY.md, PATCH-003 (required dependency)

---

## IMPORTANT: Read Before Implementing

1. Read through the ENTIRE patch document first
2. PATCH-003 must be implemented first (this patch consumes embeddings, the legacy adoption path, and the published_body column)
3. Review the Adjuster's outlier flags and the Monthly Health Report's "Underperformers Requiring Action" section - this patch is the execution arm for those diagnoses, not a parallel system
4. Review how the draft queue and diff views work in the Content Generator and Learning Loop - refresh drafts reuse both
5. Produce a written plan listing what changes, what stays, and what gets built new
6. Get approval before writing any code

---

## Problem Summary

Dark Madder can detect that content is decaying - the Adjuster computes trajectories, flags negative outliers, and recommends "refresh" in the monthly report. Then a human has to do everything: figure out *what specifically* is stale, research current data, rewrite sections, and republish. In practice that means refreshes get recommended and never happen. Meanwhile:

1. **Published content silently rots.** A piece written in March 2026 says "as of 2025, 41% of donors..." and that claim ages every day. Nobody re-reads published pieces looking for expired statistics, dead links, superseded product facts, or "last year" phrases that are now two years old. Google and AI engines both reward demonstrable freshness; stale claims actively erode trust and citations.

2. **The SERP moves and the piece doesn't.** Competitors publish, search intent shifts, new subtopics emerge (People Also Ask questions that didn't exist at publish time). The piece that earned position 3 drifts to position 9 with no alarm until traffic decay shows up weeks later - a lagging indicator when leading indicators were available.

3. **"Refresh" is an undefined unit of work.** The Adjuster says "refresh this piece" but a refresh could mean: update 3 stats, add a section answering a new PAA question, rewrite a weak intro, fix the title for CTR, or all of the above. Without decomposing it, the work is intimidating and gets skipped.

The Freshness Engine closes the loop: it continuously scores every published piece for freshness, decomposes "stale" into specific named problems with evidence, generates a complete refresh draft as a reviewable diff, and publishes the approved update through the existing Framer path. The user's job shrinks from "do a refresh" to "review a diff."

This is the feature where Dark Madder's propose-don't-publish philosophy pays off most visibly: a cron job that rewrites your live content unsupervised is terrifying; a queue of evidence-backed diffs awaiting your approval is a superpower.

---

## Architecture Overview

```
DETECTION (continuous)              PRIORITIZATION              EXECUTION (on schedule/demand)
──────────────────────              ──────────────              ──────────────────────────────
Claim extraction & expiry    ─┐                                 Refresh brief
SERP gap monitoring          ─┤     Freshness Score      ─►     Refresh generation (sectioned)
Decay signals (Adjuster)     ─┼─►   per piece (0-100)           Diff assembly + rationale
Link rot checks              ─┤     Refresh Queue               User review (diff UI)
Time-based aging             ─┘     (ranked)                    One-click publish via Framer
```

---

## 1. The Claims Ledger

### 1.1 Concept

The atomic unit of staleness is a **claim**: a dated, factual, or perishable statement inside a published piece. At publish time (and once during backfill for existing pieces), a Sonnet pass extracts every claim into a ledger:

```
Claim types:
  statistic        "41% of millennial donors gave through an app in 2025"
  dated_reference  "as of early 2026", "last year", "the latest iPhone"
  external_fact    "Charity Navigator rates organizations on four dimensions"
  price_or_number  "plans start at $9/month"
  product_fact     claims about the org's own product (features, limits)
  recommendation   "the best tool for X is Y"
```

Each claim is stored with its location (chunk anchor + sentence), its source if cited, and an **expiry model**: statistics expire when newer data exists; "as of [date]" phrases expire on a calendar; product facts expire when the product profile (PATCH-002) changes; prices expire fast; evergreen definitional claims may never expire.

### 1.2 Verification Passes

A weekly job re-verifies claims approaching or past expiry, batched by org:

- **Statistics & external facts:** Web search for newer figures from the original source or a better one. A Sonnet call compares: still current / superseded (with the new figure + source) / unverifiable.
- **Dated references:** Pure date math - "last year" written in 2025 is now wrong. Flag automatically, no search needed.
- **Product facts:** Diff against the current product profile. PATCH-002's deep product schema makes this mechanical: if `key_features` or pricing fields changed since the claim was extracted, flag every piece that states the old fact. *This is the synergy that makes product-led content safe to scale - update the product profile once, and every affected article queues a correction.*
- **Links:** HTTP check on all external links monthly. 404s and redirects become claims of type `link_rot`.

### 1.3 Schema

```sql
CREATE TABLE content_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  piece_id UUID REFERENCES content_pieces(id) ON DELETE CASCADE,
  claim_type TEXT NOT NULL CHECK (claim_type IN
    ('statistic','dated_reference','external_fact','price_or_number',
     'product_fact','recommendation','link_rot')),
  claim_text TEXT NOT NULL,            -- the sentence as published
  chunk_anchor TEXT,                   -- where it lives
  source_url TEXT,                     -- citation, if any
  expiry_model TEXT NOT NULL CHECK (expiry_model IN
    ('calendar','data_superseded','profile_linked','link_health','evergreen')),
  expires_at TIMESTAMPTZ,              -- for calendar-model claims
  status TEXT DEFAULT 'current' CHECK (status IN
    ('current','expiring','stale','superseded','unverifiable')),
  replacement_text TEXT,               -- proposed updated claim (when superseded)
  replacement_source_url TEXT,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_claims_piece ON content_claims (piece_id, status);
```

---

## 2. SERP Gap Monitoring

For each published piece's primary keyword, a biweekly job (piggybacking on the Adjuster's existing biweekly pull to share API budget) fetches the current SERP via DataForSEO and computes:

- **New PAA questions** not present at publish time and not answered by any section of the piece (checked via chunk embeddings from PATCH-003 - a question whose embedding has no chunk within distance 0.3 is unanswered)
- **Coverage gaps:** topics the current top-5 results cover (extracted by Haiku from their H2s/snippets) that the piece doesn't
- **Position movement:** which competitor displaced the piece, and what they did differently (newer date? more comprehensive? better format match?)

Output is a set of **gap records** attached to the piece, each with evidence ("3 of the top 5 results now have a section on reef-safe sunscreen regulations; you don't").

---

## 3. The Freshness Score

Every published piece gets a Freshness Score (0-100), recomputed weekly and displayed everywhere the Performance Score appears:

| Signal | Weight | Scoring |
|--------|--------|---------|
| Stale/superseded claims | 30% | 100 minus 12 per stale claim (floor 0) |
| SERP gaps | 25% | 100 minus 15 per significant gap |
| Content age | 15% | <3mo = 100, 3-6mo = 80, 6-12mo = 55, >12mo = 30 |
| Position trajectory | 20% | From Adjuster snapshots: rising = 100, stable = 70, declining = 25 |
| Link health | 10% | 100 minus 20 per dead link |

**Refresh Priority** = (100 - Freshness Score) × traffic weight, where traffic weight is the piece's share of org clicks (log-scaled). A rotting piece nobody reads ranks below a slightly-stale piece that drives 30% of traffic. This ordering is the Refresh Queue.

---

## 4. The Refresh Pipeline

### 4.1 Trigger Modes

- **Scheduled (default):** A cron job (org-configurable: daily / weekly / off) takes the top N pieces from the Refresh Queue (default N=1 daily) whose score is below the refresh threshold (default 65) and generates refresh drafts. This is Ryan Law's "daily cron job to refresh our highest priority articles," with guardrails.
- **On demand:** A "Refresh Now" button on any piece (Library, Corpus Map side panel, or Health Report).
- **Adjuster handoff:** When the Monthly Health Report recommends a refresh, the recommendation card carries a "Queue Refresh" action that creates the job - the report finally has an execution arm.
- **Product-profile cascade:** When a product profile changes, all pieces with affected `product_fact` claims queue automatically (capped, user-notified: "Your pricing change affects 7 published pieces - review queued refreshes").

### 4.2 Refresh Generation

A refresh is **surgical, not a rewrite**. The pipeline:

1. **Assemble the Refresh Brief:** the piece's stale claims (with replacements + sources), gap records, CTR diagnosis (title/meta rework if the Adjuster flagged a CTR anomaly), and the piece's voice context (org voice profile + corrections ledger, exactly as in normal generation).
2. **Scope the edits:** A Sonnet pass maps each problem to an operation: `replace_sentence` (claim updates), `insert_section` (gap fills - generated as new H2s via the standard section-generation path, Opus), `rewrite_section` (sections diagnosed as weak), `update_metadata` (title/meta), `fix_link`.
3. **Generate:** Each operation executes with the same craft enforcement as original generation. New sections pass through the transition audit so insertions don't read as bolted-on. The whole updated piece passes the voice audit; the Learning Loop's corrections ledger applies, so refreshes honor everything the user has taught the system.
4. **Assemble the diff** and place it in the **Refresh Queue** awaiting review.

### 4.3 The Review Experience

Refreshes get a dedicated review UI - a diff, not a document:

```
REFRESH: "How to Help Save the Bees"                 Freshness 48 → est. 92
─────────────────────────────────────────────────────────────────────────
8 changes proposed · 2 stat updates · 1 new section · 1 dated phrase
· 3 internal links (from Link Sweep) · 1 title update

■ STAT UPDATE                                            #the-numbers
  − "Native bee populations declined 23% between 2020 and 2024."
  + "Native bee populations declined 28% between 2020 and 2025,
     according to the Xerces Society's 2026 census."
  Why: Original source published updated figures Jan 2026. [source ↗]
  [Accept] [Edit] [Reject]

■ NEW SECTION                                            after #bee-hotels
  + "Do 'Save the Bees' Campaigns Actually Target the Right Bees?"
    (412 words — expand to read)
  Why: New PAA question, appears for your primary keyword; 4 of the
  top 5 results don't answer it. First-mover gap.
  [Accept] [Edit] [Reject]

■ DATED PHRASE                                           #intro
  − "Earlier this year, the EPA..."
  + "In March 2025, the EPA..."
  Why: Relative date written in 2025 is now ambiguous.
  [Accept] [Edit] [Reject]

[Accept All & Publish]   [Accept All as Draft]   [Discard Refresh]
```

Every change is independently acceptable. "Accept All & Publish" pushes the merged body through the existing Framer update path as a single CMS item update, then re-embeds the piece (PATCH-003) and re-extracts claims (the ledger resets to current). Edits the user makes inside the diff feed the Learning Loop like any other edit.

**Published refreshes append a changelog entry** stored on the piece (`refresh_history` JSONB) and, optionally, a visible "Last updated June 2026 - updated statistics and added a section on X" note injected into the Framer piece (org-level toggle; transparency notes are an E-E-A-T signal per the Startup Search Playbook's correction-policy guidance).

### 4.4 Schema

```sql
CREATE TABLE refresh_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  piece_id UUID REFERENCES content_pieces(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL CHECK (trigger IN
    ('scheduled','manual','adjuster','product_cascade','link_sweep')),
  freshness_score_before INT,
  status TEXT DEFAULT 'queued' CHECK (status IN
    ('queued','generating','awaiting_review','partially_accepted',
     'published','discarded','failed')),
  operations JSONB,        -- array of {type, anchor, before, after, rationale,
                           --           evidence_url, status}
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Modify content_pieces:
ALTER TABLE content_pieces ADD COLUMN freshness_score INT;
ALTER TABLE content_pieces ADD COLUMN refresh_history JSONB DEFAULT '[]';
```

---

## 5. Where Freshness Lives in the UI

- **Library list view:** Freshness column next to Performance, sortable. Pieces below threshold show the madder-red decay glow (consistent with the Corpus Map overlay in PATCH-003).
- **New tab: Library > Freshness.** The Refresh Queue: ranked pieces, their scores, their named problems ("3 stale stats, 1 SERP gap"), pending refresh drafts awaiting review, and the org's refresh settings (cadence, threshold, daily cap, changelog visibility).
- **Dashboard:** A single tile - "Content Health: 3 refreshes awaiting review · corpus freshness 81/100."
- **Monthly Health Report:** The Underperformers section now shows each piece's decomposed freshness problems and a Queue Refresh action, replacing the vague "recommended action: re-optimize."

---

## 6. Adopting Legacy Content

Legacy pieces (imported in PATCH-003) are scored for freshness but can't be refreshed until adopted. Adoption flow, from any legacy piece:

```
ADOPT THIS PIECE
─────────────────
Dark Madder will match "10 Ways to Help Pollinators" to an item in your
connected Framer CMS (matched by slug: /blog/help-pollinators ✓) and take
over management. After adoption:
• The Freshness Engine can propose and publish updates to it
• Link Sweep approvals publish directly instead of exporting checklists
• It joins the draft/refresh workflow like any Dark Madder piece

Nothing changes on your site until you approve a specific refresh.

[Adopt]  [Adopt All 52 Legacy Pieces]  [Cancel]
```

Adoption requires a slug/ID match in the connected Framer collection; unmatched pieces stay read-only with an explanatory note. This is the bridge that lets Dark Madder take over an *existing* blog rather than only net-new content - a major expansion of who the product serves, at near-zero additional build cost.

---

## 7. Technical Implementation Notes

### New API Routes

```
POST   /api/freshness/claims/extract/[pieceId]   -- Extract claims (publish hook + backfill)
POST   /api/freshness/claims/verify              -- Run verification batch (cron)
GET    /api/freshness/queue                      -- Ranked refresh queue
POST   /api/freshness/refresh/[pieceId]          -- Create refresh job (manual trigger)
GET    /api/freshness/refresh/[jobId]            -- Job with operations for diff UI
POST   /api/freshness/refresh/[jobId]/resolve    -- Accept/edit/reject operations, publish
POST   /api/freshness/adopt                      -- Adopt legacy piece(s)
PUT    /api/freshness/settings                   -- Cadence, threshold, caps, changelog toggle
```

### Model Usage (additions to TASK_MODELS)

```typescript
  // --- Freshness Engine (PATCH-004) ---
  claimExtraction:        MODEL_CONFIG.SONNET,  // Identify + type claims at publish time
  claimVerification:      MODEL_CONFIG.SONNET,  // Compare claim vs. fresh search results
  serpGapExtraction:      MODEL_CONFIG.HAIKU,   // Topics from competitor H2s/snippets
  refreshScoping:         MODEL_CONFIG.SONNET,  // Map problems to edit operations
  refreshSectionWrite:    MODEL_CONFIG.OPUS,    // New/rewritten sections (same bar as generation)
  refreshSentenceWrite:   MODEL_CONFIG.SONNET,  // Surgical sentence replacements
```

### Cost & Safety Controls

- Per-org daily refresh cap (default 1 scheduled refresh/day) and a hard cap on web-search calls per verification batch.
- Verification only runs on claims that are `expiring` or past `expires_at` - never the full ledger.
- A refresh job that would change >40% of the piece's text aborts and converts to an Adjuster recommendation ("this piece needs a rewrite, not a refresh") - the system never quietly replaces a piece wholesale.
- Failed Framer publishes roll back: the piece's stored body is only updated after the CMS update succeeds.

---

## 8. UX Principles for This Patch

**Every change carries its evidence.** A stat update shows the new source. A new section shows the SERP data that justified it. No change is ever "the AI thought this was better."

**Diffs, not documents.** Reviewing a refresh must take 2 minutes, not 20. The unit of review is the change, independently acceptable.

**The cron proposes; the human publishes.** Scheduled generation is automatic; publication never is (no auto-publish toggle for refreshes in v1 - this is deliberate; trust is earned through the diff UI first).

**Freshness is a first-class metric.** It sits beside Performance everywhere, because in 2026 freshness *is* performance - for rankings and for AI citations alike.

---

## 9. What to Keep From Current Implementation

- The Adjuster's trajectory computation and outlier flags - they're inputs to the Freshness Score, not duplicated
- The Monthly Health Report structure - this patch upgrades its recommendations with execution actions
- The draft queue and Learning Loop edit tracking - refresh diffs flow through both
- The entire Framer update path - refreshes are just CMS item updates

---

## 10. Implementation Order

1. **Claims Ledger** - extraction on publish + backfill job for existing published pieces
2. **Verification passes** - calendar/dated first (pure logic, no API cost), then statistic verification via web search, then product-profile cascade
3. **Freshness Score + Library column + Freshness tab** (read-only queue, no generation yet) - ships visible value early
4. **SERP gap monitoring** - piggyback on the Adjuster's biweekly pull
5. **Refresh pipeline** - scoping, generation, diff assembly
6. **Diff review UI + Framer publish + re-embed/re-extract on publish**
7. **Scheduled cron + Adjuster handoff + product cascade triggers**
8. **Legacy adoption flow**

Test end-to-end: backfill claims on a published piece with a known stale stat → verify it's flagged with a sourced replacement → run a manual refresh → accept a subset of changes → confirm Framer item updated, changelog recorded, claims re-extracted, freshness score recomputed.

---

*Dark Madder PATCH-004 - The Freshness Engine - June 2026*
