> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: specs/ai-visibility.md
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# PATCH-007: AI Visibility

## Citation Tracking Across AI Engines, Share of Voice & the Citability Audit

**Date:** June 2026
**Applies to:** Phase 4 (Content Generator), Phase 7 (Analytics & Adjuster)
**Priority:** Medium-High - the role of content is shifting from traffic generation to visibility inside AI systems; Dark Madder's measurement layer must follow, or the product optimizes for a shrinking metric
**References:** 07-ANALYTICS-ADJUSTER.md, 04-CONTENT-GENERATOR.md, 11-MODEL-STRATEGY.md, PATCH-003, PATCH-004, PATCH-006

---

## IMPORTANT: Read Before Implementing

1. Read through the ENTIRE patch document first
2. Review the Adjuster's existing v1 AI citation check (monthly Perplexity queries on top 10 keywords, logged as a binary bonus in the Performance Score) - this patch supersedes that mechanism entirely; remove it after this patch ships, and migrate its historical logs into `ai_probe_results` where possible
3. Review the Performance Score weighting in doc 07 §3.1 - this patch changes the AI Citation signal from a 10% binary bonus to a richer input (§5)
4. Review the pre-publish checklist in the Content Generator - the citability check (§6) becomes a checklist item
5. Produce a written plan listing what changes, what stays, and what gets built new
6. Get approval before writing any code

---

## Problem Summary

In 2026, a growing share of an org's potential audience never reaches a SERP: they ask ChatGPT, Perplexity, or get an AI Overview, and the "ranking" that matters is whether the answer cites you. Dark Madder's current treatment of this reality is a single monthly Perplexity check on 10 keywords, scored as a binary +10. Four problems:

1. **It measures one engine.** Perplexity, ChatGPT search, and Google AI Overviews have different retrieval behaviors, different citation patterns, and different audiences. An org can dominate one and be invisible in another without knowing it.

2. **It measures keywords, not questions.** AI engines answer *questions*. "bee conservation" is a keyword; "do bee hotels actually help native bees?" is what people ask. Probing keywords measures the wrong unit.

3. **It produces a score, not a diagnosis.** Knowing you weren't cited is useless without knowing *who was cited instead* and *why their passage won*. Share of voice against competitors is the actionable frame.

4. **Nothing connects measurement to action.** Even a perfect visibility report changes nothing unless it feeds the systems that fix content. Citability problems should become refresh operations (PATCH-004); uncited questions should become content opportunities.

AI Visibility makes "are AI engines citing us?" a first-class, continuously measured, per-cluster metric with a closed action loop - and gives every piece a pre-publish citability gate so new content is built citable rather than retrofitted.

---

## Architecture Overview

```
QUESTION BANK                PROBES (scheduled)              OUTPUTS
─────────────                ──────────────────              ───────
Per-cluster questions   ─►   Perplexity API            ─►   Citation records
(from PAA, keywords,         ChatGPT (search-enabled)        Share-of-voice per cluster
 customer lexicon,           AI Overviews                    AI Visibility Score
 user-added)                 (via DataForSEO SERP)           Diagnosis: who won & why
                                                             ─► Refresh ops (PATCH-004)
                                                             ─► Content opportunities
                                                             ─► Citability audit (pre-publish)
```

---

## 1. The Question Bank

The unit of measurement is a **probe question** - a natural-language question a real person would ask an AI engine. Each active cluster maintains a bank of 5-15 questions, assembled from:

- **PAA questions** already collected by the Research Planner for the cluster's keywords
- **Customer questions** from the Lexicon (PATCH-005) mapped to this cluster - the highest-value source, because they're verbatim real demand
- **Generated candidates:** a Sonnet pass converts the cluster's head terms into question phrasings, deduplicated against the above
- **User-added:** an "Add question" field; orgs know the questions that matter commercially ("is [product] legit?")

Questions are tiered: **Core** (probed every cycle, max 5/cluster) and **Extended** (rotated, 2-3 per cycle) - this is the cost-control lever. The user can promote/demote/retire questions; each shows its source and probe history.

```sql
CREATE TABLE ai_probe_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  cluster_id UUID REFERENCES content_clusters(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN
    ('paa','customer_lexicon','generated','user')),
  lexicon_entry_id UUID REFERENCES lexicon_entries(id),
  tier TEXT DEFAULT 'extended' CHECK (tier IN ('core','extended','retired')),
  expected_piece_id UUID REFERENCES content_pieces(id),  -- which piece SHOULD answer this
  created_at TIMESTAMPTZ DEFAULT now()
);
```

`expected_piece_id` is computed via corpus embeddings (PATCH-003): the chunk nearest the question. If no chunk is within distance 0.3, the question is marked **unanswerable by current corpus** - which is itself a finding (§5.3).

---

## 2. Probes

### 2.1 Engines (v1)

| Engine | Mechanism | Cadence |
|--------|-----------|---------|
| Perplexity | Sonar API - returns answer + citations natively | Biweekly (aligned to the Adjuster's biweekly pull) |
| ChatGPT | OpenAI API with web search enabled - parse cited URLs from the response | Biweekly |
| Google AI Overviews | DataForSEO SERP API - AI Overview presence + cited sources for the question as a query (already a listed capability of the existing DataForSEO integration) | Biweekly |
| Claude (web search) | Anthropic API with web search tool | Optional, off by default (engine toggle per org) |

Engines are config-driven (same model-as-configuration doctrine as 11-MODEL-STRATEGY): an `AI_ENGINES` config defines each engine's client, so adding/removing engines is config + one adapter, never a schema change.

### 2.2 What a Probe Records

For each (question × engine) probe:

```sql
CREATE TABLE ai_probe_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  question_id UUID REFERENCES ai_probe_questions(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  probed_at TIMESTAMPTZ DEFAULT now(),
  answer_text TEXT,                      -- the engine's answer (for diagnosis)
  cited_urls JSONB,                      -- ordered list of all citations
  org_cited BOOLEAN NOT NULL,
  org_cited_url TEXT,                    -- which page of ours
  org_citation_position INT,             -- 1st citation vs 7th matters
  org_passage_used TEXT,                 -- the sentence(s) of ours the answer drew on,
                                         -- when identifiable (Sonnet extraction)
  competitor_citations JSONB,            -- [{domain, url, position}] for known competitors
  sentiment TEXT CHECK (sentiment IN ('positive','neutral','negative','absent')),
                                         -- how the org was characterized when mentioned
  cost_cents INT
);
```

`sentiment` matters: being cited as "critics note that round-up apps like [Org]..." is a different outcome than being the recommended answer. A Haiku pass classifies the org's framing whenever the org is mentioned (cited or not - unlinked brand mentions are tracked too, since AI answers frequently name brands without linking).

---

## 3. The AI Visibility Surface

New tab: **Analytics > AI Visibility** (peer to the existing health-report views).

```
AI VISIBILITY                                 last probe cycle: Jun 7 · next: Jun 21
──────────────────────────────────────────────────────────────────────────────────

SHARE OF VOICE (this cycle · 42 core questions × 3 engines)

  Cluster              You    GiveWise   SpareApp   Other     Trend
  Bee Conservation     ████████ 38%   22%      4%      36%     ▲ +9
  Effective Giving     ███ 14%        31%      18%     37%     ▼ -5
  Trust & Safety       ██████ 29%     8%       21%     42%     ▬

  Share of voice = your citations ÷ all citations across probes in the
  cluster. "Other" = domains outside your competitor watchlist.

BY ENGINE
  Perplexity     cited on 19/42 questions (45%)    avg position 2.1
  ChatGPT        cited on 9/42  (21%)              avg position 3.8
  AI Overviews   present on 31/42 SERPs · cited on 11 (35%)

NEEDS ATTENTION
  ✕ "is donating spare change actually effective?"        0/3 engines
    All three cite GiveWise's 2026 effectiveness review. Your nearest
    piece (/what-works/micro-donations) answers this in paragraph 9 of
    a 2,800-word page — buried. Their winning passage is a 3-sentence
    direct answer under a question-matching H2.
    [Queue Citability Refresh]  [View Their Passage ▾]

  ✕ "can charities see my bank transactions?"              0/3 · NO PIECE
    34 customers asked this (Lexicon). No piece in your corpus answers it.
    [Create Content Piece]
```

Every diagnosis names the winner and the *mechanical reason* their passage won (directness, placement, structure, freshness, schema) - produced by a Sonnet comparison of the winning passage against the org's nearest chunk. This is the difference between a dashboard and an instrument.

---

## 4. The Closed Loop

Each finding routes into existing machinery - like Radar, this patch adds sensing, not a second content system:

| Finding | Route |
|---------|-------|
| Cited but losing position / wrong page cited | **Citability Refresh** - a PATCH-004 refresh job whose operations restructure the answering section (direct-answer lead, question-phrased H2, extractable summary) rather than update facts |
| Not cited, answer exists but buried | Same - citability refresh with the winning passage attached as evidence |
| Not cited, no answering piece | Content opportunity → brief + calendar proposal (standard path), question pre-attached as the piece's `expected` probe |
| Cited with negative sentiment | Surfaced as a high-severity alert (and to Radar's feed) - a reputation finding the org should see immediately, with the answer text attached |
| Competitor surging in a cluster (share-of-voice trend) | Feeds the Adjuster's monthly report and Radar (PATCH-006) as a `competitor` event |

---

## 5. Scoring Changes

### 5.1 AI Visibility Score (per cluster, 0-100)

```
AI Visibility Score =
    50 × citation_rate            (cited probes ÷ core probes, all engines)
  + 25 × share_of_voice           (vs. all cited domains in cluster)
  + 15 × position_factor          (avg citation position: 1st = 1.0, decays)
  + 10 × sentiment_factor         (positive/neutral = 1.0, negative = 0)
```

Displayed beside cluster Performance Scores in the Monthly Health Report and on cluster cards. Snapshotted per cycle in `ai_visibility_snapshots` for trend lines.

### 5.2 Performance Score Amendment (doc 07 §3.1)

The piece-level "AI Citation 10% binary bonus" is replaced: the 10% weight is retained but scored continuously - the piece's citation rate across probes where it is the `expected_piece_id` (no probes mapping to the piece = signal omitted and weights renormalized, not zeroed - don't punish pieces nobody probes).

### 5.3 Corpus-level rollup

The dashboard tile shows org-wide citation rate + trend, and the count of **unanswerable core questions** - the clearest single number for "demand exists; corpus doesn't answer it."

```sql
CREATE TABLE ai_visibility_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  cluster_id UUID REFERENCES content_clusters(id) ON DELETE CASCADE,
  cycle_date DATE NOT NULL,
  citation_rate FLOAT,
  share_of_voice FLOAT,
  avg_position FLOAT,
  sentiment_factor FLOAT,
  visibility_score INT,
  per_engine JSONB,                      -- breakdown by engine
  UNIQUE (org_id, cluster_id, cycle_date)
);
```

---

## 6. The Citability Audit (Pre-Publish)

Measurement fixes old content; the audit prevents new debt. A new item in the Content Generator's pre-publish checklist, run on every draft (and on every PATCH-004 refresh that adds sections):

**Checks (mechanical, fast):**
1. **Direct-answer lead:** Does the section targeting each mapped probe question open with a 2-3 sentence extractable answer before elaborating? (The passage pattern AI engines overwhelmingly select.)
2. **Question-shaped headers:** Is at least one H2 phrased as (or closely matching) a probe/PAA question?
3. **Self-contained passages:** Do key sections make sense excerpted alone (no orphan pronouns referring to prior sections, no "as mentioned above" in answer passages)?
4. **Schema completeness:** FAQPage/Article schema present per the existing metadata generation - verified, not regenerated.
5. **Attribution surface:** Named author, dated, sourced claims (claims already structured by PATCH-004's ledger).

Failures produce specific fix operations executed by the standard section-rewrite path (Opus) before the draft reaches the user - the user sees a passing checklist, not homework. The audit's rules live in a versioned config (`citability-rules.ts`) because engine behavior shifts; rules will be tuned against the org's own probe outcomes over time (which passage structures *actually* win citations for this org is measurable from `org_passage_used`).

---

## 7. Technical Implementation Notes

### New API Routes

```
GET    /api/ai-visibility/questions               -- Question bank (per cluster)
POST   /api/ai-visibility/questions               -- Add / generate questions
PUT    /api/ai-visibility/questions/[id]          -- Promote/demote/retire
POST   /api/ai-visibility/probe/run               -- Run probe cycle (also biweekly cron)
GET    /api/ai-visibility/results                 -- Probe results (filters)
GET    /api/ai-visibility/share-of-voice          -- Cluster SoV + trends
POST   /api/ai-visibility/findings/[id]/route     -- Execute closed-loop action
POST   /api/ai-visibility/citability/[draftId]    -- Run pre-publish citability audit
PUT    /api/ai-visibility/settings                -- Engine toggles, probe budget
```

### Model Usage (additions to TASK_MODELS)

```typescript
  // --- AI Visibility (PATCH-007) ---
  probeQuestionGeneration: MODEL_CONFIG.SONNET,  // Cluster terms → natural questions
  citationExtraction:      MODEL_CONFIG.HAIKU,   // Parse citations/mentions from answers
  sentimentClassification: MODEL_CONFIG.HAIKU,   // How was the org framed?
  passageDiagnosis:        MODEL_CONFIG.SONNET,  // Why their passage won vs. ours
  citabilityAudit:         MODEL_CONFIG.SONNET,  // Pre-publish structural checks
  citabilityRewrite:       MODEL_CONFIG.OPUS,    // Fix flagged sections (existing rewrite bar)
```

### Cost Controls (the defining constraint of this patch)

- **Probe budget per org per cycle**, enforced server-side: default 5 core questions × top 8 clusters × 3 engines = 120 probes/cycle. Visible in settings as a meter with estimated cost.
- Extended-tier questions rotate (round-robin) within a fixed extra allowance.
- Perplexity/OpenAI calls use the cheapest search-capable tier of each provider; answers truncated for storage.
- Diagnosis (the Sonnet passage comparison) runs only for core questions that *changed state* this cycle (newly lost, newly won, position moved ≥2) - not for every probe.

---

## 8. UX Principles for This Patch

**Measure questions, not keywords.** Everywhere this feature surfaces, the unit shown is a question a human would ask. Keywords stay in Research where they belong.

**Name the winner.** "Not cited" is a feeling; "GiveWise's 3-sentence direct answer won, here it is, here's yours" is a plan. Every negative finding identifies who won and the mechanical why.

**Findings end in buttons.** Every diagnosis terminates in an existing action: refresh, create, alert. No finding is allowed to be purely informational at high severity (shared doctrine with Radar).

**Honest variance.** AI engine answers are stochastic - the same question can cite differently hour to hour. Display cycle-over-cycle *trends* prominently and single-cycle results with a variance caveat; never let one probe swing a score alarmingly. (Internally: a state change requires confirmation in the next cycle before triggering automated routing.)

---

## 9. What to Keep From Current Implementation

- The DataForSEO integration - AI Overview probes are an additional call pattern on the existing client
- The Adjuster's biweekly cron - probe cycles attach to it rather than adding a scheduler
- The metadata/schema generation in the Content Generator - the citability audit verifies its output, never duplicates it
- Historical v1 Perplexity check logs - migrate into `ai_probe_results` (engine = 'perplexity', sparse fields) so trends don't start from zero

---

## 10. Implementation Order

1. **Question bank** - schema, generation from PAA + clusters, expected-piece mapping via embeddings, bank UI
2. **Perplexity probe adapter** + probe results schema (one engine end-to-end before breadth)
3. **AI Visibility tab** - citation rate, needs-attention list (single engine)
4. **ChatGPT + AI Overviews adapters**; engine config layer; share-of-voice computation
5. **Diagnosis pipeline** (passage comparison) + closed-loop routing to PATCH-004 refreshes and content opportunities
6. **Scoring integration** - cluster AI Visibility Score, Performance Score amendment, Health Report + dashboard surfaces
7. **Citability audit** in the pre-publish checklist + refresh-time variant
8. **Lexicon question import (PATCH-005) + Radar/sentiment alert wiring (PATCH-006)**

Test end-to-end: build a question bank for one cluster → run a probe cycle → verify citations parsed, share of voice computed, a lost question produces a diagnosis naming the winning passage → route it to a citability refresh → approve and publish → confirm the next probe cycle records the state change.

---

*Dark Madder PATCH-007 - AI Visibility - June 2026*
