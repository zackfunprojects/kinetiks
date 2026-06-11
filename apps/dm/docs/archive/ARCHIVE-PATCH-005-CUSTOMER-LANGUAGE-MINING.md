> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: specs/knowledge-trainer.md (mining -> Cortex proposals; redaction non-optional)
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# PATCH-005: Customer Language Mining

## Voice-of-Customer Ingestion, the Customer Lexicon & Language-Driven Research

**Date:** June 2026
**Applies to:** Phase 2 (Voice Engine), Phase 3 (Research & Planner)
**Priority:** High - this is the largest differentiation opportunity in the patch series. No competitor tool mines customer language well, and it upgrades both research quality and voice quality simultaneously.
**References:** 02-VOICE-ENGINE.md, 03-RESEARCH-PLANNER.md, 11-MODEL-STRATEGY.md, PATCH-001, PATCH-002

---

## IMPORTANT: Read Before Implementing

1. Read through the ENTIRE patch document first
2. Review the Discovery tab (PATCH-001) - this patch adds a new source of Authority Territories and seed vocabulary into that flow, it does not create a parallel research entry point
3. Review the Voice Engine's three-layer profile structure and how profiles are injected into generation - this patch adds a vocabulary layer, not a fourth voice
4. Review PATCH-002's product schema (`user_personas.objections`, `search_behavior`) - mined language feeds these fields
5. Produce a written plan listing what changes, what stays, and what gets built new
6. Get approval before writing any code

This patch handles customer communications, which contain PII. The redaction pipeline in §2.2 is not optional and must be built before any storage of ingested text.

---

## Problem Summary

Dark Madder's research is **outside-in**: it derives topics from the org's website, product descriptions, and SEO APIs. All of those sources share a flaw - they reflect how the *org* (or the market's incumbents) talks, not how *customers* talk. This produces three failures:

1. **Vocabulary mismatch.** Talvi's site says "micro-philanthropy" and "round-up giving." Its customers say "apps that donate your spare change." Content written in org vocabulary misses the queries real people type and the phrasing AI engines match against when choosing citations. The gap between company language and customer language is where rankings are lost - and nobody at a small company has time to read 400 support tickets to find it.

2. **Invisible topics.** The questions customers actually ask - in support tickets, sales calls, Reddit threads, app reviews - are the highest-intent content topics that exist, and most never show up in keyword tools because they're long-tail, conversational, or too new. The current seed generation can't surface what it can't see.

3. **Personas built on guesses.** PATCH-002's product profiles ask the user to write personas, objections, and `search_behavior` from memory. The raw material to *derive* these exists in the org's inboxes and communities, unread.

Customer Language Mining gives Dark Madder ears. It ingests the places customers talk, distills how they talk and what they ask, and feeds that into three existing systems: Discovery (new territories + seed vocabulary), the Voice Engine (customer vocabulary layer), and Product Profiles (evidence-backed objections and personas).

---

## Architecture Overview

```
SOURCES                        PIPELINE                          CONSUMERS
───────                        ────────                          ─────────
Paste (threads, reviews,       Ingest                            CUSTOMER LEXICON
  interview notes)             → Redact PII (mandatory)            (terms, questions,
File upload (CSV ticket        → Segment into utterances           objections, quotes)
  exports, transcripts)        → Extract (entities, n-grams,            │
Gmail (existing OAuth)           questions, objections,                 ├─► Discovery: territories
Reddit (subreddit/keyword        emotional language)                    │     + seed vocabulary
  fetch)                       → Score (frequency ×                     ├─► Voice Engine:
App store reviews (App           distinctiveness)                       │     vocabulary layer
  Store / Play Store by ID)    → Aggregate into Lexicon                 ├─► Product profiles:
Slack / Intercom / Gong        → Language Gap analysis                  │     personas, objections
  (v2 connectors)                (customer vs. org language)            └─► Splits Engine: Reddit
                                                                           native phrasing
```

---

## 1. Sources & Ingestion

### 1.1 Design Stance: Paste-First, Connect-Second

Ryan Law's version assumes Gong, Intercom, and a populated Slack - enterprise sources. Dark Madder's first orgs are early-stage; their customer language lives in scrappier places. So v1 inverts the priority: **the paste box is the hero**, integrations are accelerators.

New tab inside Research: **Research > Listening** (sits between Discovery and Keywords in the nav - listening precedes discovering).

```
LISTENING                                          Lexicon: 247 terms · 4 sources
────────────────────────────────────────────────────────────────────────────────

ADD CUSTOMER LANGUAGE

  [Paste anything]   [Upload file]   [Connect a source]

  Paste anything: Reddit threads, app reviews, support emails, sales call
  notes, survey responses, Discord messages. Dark Madder will figure out
  what it is, strip personal information, and mine the language.

CONNECTED SOURCES
  ✓ Gmail — support@talvi.app           last sync 2h ago    1,204 messages
  ✓ Reddit — r/personalfinance,         daily fetch          312 threads
      r/charity · keywords: "donate spare change", "round up app"
  ✓ App Store — Talvi (id 158402...)    weekly fetch         89 reviews
  + Add source
```

### 1.2 Source Types (v1)

| Source | Mechanism | Notes |
|--------|-----------|-------|
| Paste | Free-text box, auto-detects format (thread, review list, transcript, email chain) via a Haiku classification pass | The universal escape hatch; zero setup |
| File upload | CSV/TXT/MD. Column-mapping UI for CSVs ("which column is the message text?") | Handles Intercom/Zendesk/Typeform exports without integrations |
| Gmail | Reuses the existing Gmail OAuth connection; user selects label(s) or an address filter (e.g., to: support@) | Read-only; bodies are mined and discarded, only extractions persist (see §2.3) |
| Reddit | Public JSON API; org configures subreddits + keyword filters; daily fetch of matching threads + comments | The richest source of unfiltered customer vocabulary for consumer products |
| App store reviews | App Store / Google Play scrape by app ID; weekly | High emotion, high objection density |
| Slack / Intercom / Gong | **v2.** Listed in "Connect a source" as "coming soon" so the architecture anticipates them | The `language_sources` schema is connector-agnostic from day one |

### 1.3 Schema

```sql
CREATE TABLE language_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN
    ('paste','file','gmail','reddit','app_store','play_store',
     'slack','intercom','gong')),
  label TEXT NOT NULL,                  -- "support@ inbox", "r/personalfinance"
  config JSONB,                         -- filters, ids, subreddits, keywords
  sync_cadence TEXT DEFAULT 'manual' CHECK (sync_cadence IN
    ('manual','daily','weekly')),
  last_synced_at TIMESTAMPTZ,
  utterance_count INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','error')),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 2. The Mining Pipeline

### 2.1 Segmentation

Raw input is segmented into **utterances** - one customer statement each (a review, a comment, a ticket message, a survey answer). Org-authored text (support agent replies, the org's own Reddit comments) is detected and excluded; we are mining how customers talk, and the org's replies would contaminate the signal with the org's own vocabulary.

### 2.2 Redaction (Mandatory, Pre-Storage)

Before anything persists, every utterance passes a redaction step: names, email addresses, phone numbers, account identifiers, addresses, and payment fragments are replaced with typed placeholders (`[NAME]`, `[EMAIL]`). Implementation: regex pass for structured PII + a Haiku pass for names in prose. Redaction runs in-memory during ingestion; **unredacted text is never written to the database.**

### 2.3 What Persists

Deliberately minimal:

- **Extractions** (terms, phrases, questions, objections - §2.4) with counts and source attribution
- **Exemplar quotes**: up to 3 short redacted quotes per lexicon entry, kept as evidence
- Raw redacted utterances are retained for 30 days (to allow re-mining with improved extractors), then purged. For Gmail, raw bodies are never stored at all - mined in-memory, extractions only.

This minimal-retention posture is a feature, not a constraint: "we mine your inbox without warehousing your inbox" is the line that makes connecting Gmail feel safe.

### 2.4 Extraction

Each utterance batch goes through a Sonnet extraction pass producing typed entries:

```
term          recurring noun phrases / entities ("spare change", "round-ups",
              "the causes tab", competitor names)
phrase        recurring multi-word expressions in customer voice
              ("apps that donate for you", "where does my money actually go")
question      literal questions customers ask ("can I cap how much it
              rounds up per month?")
objection     doubts and hesitations ("it's just pennies, does that even
              matter", "I don't trust these apps with my bank login")
praise        what customers love, in their words (fuel for differentiators
              and social-proof angles)
emotion       affect-loaded language ("guilt", "overwhelmed by causes",
              "finally feels effortless")
```

### 2.5 Scoring: Frequency × Distinctiveness

Raw frequency over-weights generic language ("app", "money"). Each entry gets a **distinctiveness score**: how much more common is this phrase in customer utterances than in (a) the org's own website corpus (from the voice onboarding scan) and (b) general English. High frequency + high distinctiveness = the gold: language customers use constantly that the org never uses.

---

## 3. The Customer Lexicon

The aggregated, living output. Main view of the Listening tab once data exists:

```
CUSTOMER LEXICON                          filter: All types ▾   All sources ▾
──────────────────────────────────────────────────────────────────────────────

★ LANGUAGE GAPS (you say it one way; they say it another)        12 found

  They say "spare change apps"             247×   You say "micro-philanthropy"
  ├ distinctiveness 9.1 · sources: Reddit (201), reviews (38), email (8)
  ├ "honestly all the spare change apps felt scammy until this one" — r/pf
  └ [Generate territory]  [Add to seed vocabulary]  [View 247 utterances]

  They say "where my money goes"           183×   You say "impact transparency"
  └ ...

TOP QUESTIONS                                                     54 found
  "can I pick more than one cause?"                    61×   ◯ not covered
  "does rounding up affect my credit score?"           44×   ◯ not covered
  "is [Org] legit?"                                    39×   ● covered (/trust)
  └ [Create content piece]  [Add to FAQ]  [Dismiss]

TOP OBJECTIONS                                                    23 found
  "it's just pennies — does it even matter?"           88×
  └ appears in product profile? ✕ → [Add to Round-Up App objections]
```

Key behaviors:

- **Coverage check** runs every question against the corpus embeddings (PATCH-003): a question with no chunk within distance 0.3 is "not covered" - an instant, evidence-backed content idea with built-in demand proof.
- **Every entry carries receipts:** counts, sources, exemplar quotes. Per the house principle, nothing appears without data.
- The lexicon **recomputes incrementally** on each sync; entries trend ("↑ 34% this month") so the org can watch language shift.

### 3.1 Schema

```sql
CREATE TABLE lexicon_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN
    ('term','phrase','question','objection','praise','emotion')),
  text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,        -- for dedup/merging variants
  frequency INT DEFAULT 0,
  distinctiveness FLOAT,
  source_breakdown JSONB,               -- {reddit: 201, app_store: 38, gmail: 8}
  exemplar_quotes JSONB,                -- [{quote, source_type, date}] max 3, redacted
  org_equivalent TEXT,                  -- for language gaps: what the org says instead
  coverage_status TEXT CHECK (coverage_status IN ('covered','not_covered','partial')),
  covered_by_piece_id UUID REFERENCES content_pieces(id),
  trend_30d FLOAT,                      -- frequency change
  status TEXT DEFAULT 'active' CHECK (status IN ('active','dismissed','merged')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 4. Where the Lexicon Flows

### 4.1 Into Discovery (Research)

- **Territory proposals:** Clusters of related high-distinctiveness entries become proposed Authority Territories with `source = 'customer_language'`, appearing in the Discovery tab alongside conversation-derived territories: *"Your customers talk constantly about distrust of donation apps (88 objections, 39 'is it legit' questions). Proposed territory: Trust & transparency in giving apps."*
- **Seed vocabulary:** Seed query generation (03 §2.2 Step 1) gains a fourth input: the top 50 customer phrases, with the instruction to phrase seeds in customer vocabulary. Seeds derived from customer language carry a small **ear icon** with the frequency count - demand evidence keyword tools can't provide.
- **Brief enrichment:** Content briefs for pieces in lexicon-derived clusters include the relevant questions, objections, and 2-3 exemplar quotes as required material: *"Address the objection 'it's just pennies' - raised 88 times by real customers."* The Content Generator now writes toward documented doubts instead of imagined ones.

### 4.2 Into the Voice Engine

A new **vocabulary layer** attached to the org voice profile (not a fourth voice - a lexical overlay injected into generation prompts):

```
CUSTOMER VOCABULARY (org: Talvi)
Prefer:  "spare change" over "micro-donations" · "where your money goes"
         over "impact transparency" · "causes" over "verticals"
Mirror these question phrasings in headers where natural: [top questions]
Never adopt: profanity, competitor slang the org shouldn't echo: [exclusions]
```

The user curates this in Voice Engine settings: each preferred-term swap is a toggle, defaulted on for the top 10 language gaps, with the evidence shown. The Learning Loop watches for conflicts - if the user keeps editing "spare change" back to "micro-donations" in drafts, the corrections ledger wins and the vocabulary toggle is auto-flagged for review.

### 4.3 Into Product Profiles (PATCH-002)

On the product profile page, fields with lexicon evidence show an enrichment prompt: *"23 mined objections aren't in this product's objection list - review and add?"* Accepting maps lexicon entries into `user_personas.objections`, `search_behavior`, and `differentiators.evidence` (praise entries make excellent evidence). Personas stop being guesses.

### 4.4 Into the Splits Engine

Reddit-derived phrasing is injected into Reddit answer generation so posts read native to the subreddit they came from. Top questions feed LinkedIn/TikTok hooks ("the question we get 60 times a month").

---

## 5. Onboarding Moment

Customer language mining joins org onboarding as an optional step after the website scan:

```
Step 3 of 4 — Teach me how your customers talk (optional, 2 minutes)

Paste anything real customers have written — a few app reviews, a Reddit
thread, some support emails. Even 20 messages sharpens everything Dark
Madder writes for you. You can always add more later in Research > Listening.

[Paste box]                                    [Skip for now]
```

Even a small paste gives the voice engine and seed generation customer grounding from day one, and demonstrates the product's depth in the first session.

---

## 6. Technical Implementation Notes

### New API Routes

```
POST   /api/listening/sources                 -- Create source (paste creates ephemeral source)
PUT    /api/listening/sources/[id]            -- Update config / pause
POST   /api/listening/sources/[id]/sync       -- Trigger sync (also cron)
POST   /api/listening/ingest                  -- Paste/file ingestion → pipeline
GET    /api/listening/lexicon                 -- Lexicon with filters/sort
POST   /api/listening/lexicon/[id]/action     -- generate_territory | add_seed_vocab |
                                              --   create_piece | add_objection | dismiss | merge
GET    /api/listening/lexicon/[id]/utterances -- Redacted utterances behind an entry (30-day window)
POST   /api/listening/coverage/recheck        -- Re-run coverage vs. corpus embeddings
```

### Model Usage (additions to TASK_MODELS)

```typescript
  // --- Customer Language Mining (PATCH-005) ---
  ingestFormatDetection:   MODEL_CONFIG.HAIKU,   // What kind of text is this paste?
  utteranceSegmentation:   MODEL_CONFIG.HAIKU,   // Split + org-vs-customer attribution
  piiRedaction:            MODEL_CONFIG.HAIKU,   // Names in prose (after regex pass)
  languageExtraction:      MODEL_CONFIG.SONNET,  // Terms/questions/objections per batch
  lexiconAggregation:      MODEL_CONFIG.SONNET,  // Merge variants, name language gaps
  territoryFromLanguage:   MODEL_CONFIG.OPUS,    // Propose territories from lexicon clusters
                                                 // (strategic - same bar as territory discovery)
```

### Cost Controls

- Extraction runs on batched utterances (50/call), only on new utterances since last sync.
- Reddit/app-store fetch caps per sync (500 utterances) with oldest-first backfill on demand.
- Distinctiveness baseline (org site corpus frequencies) computed once per voice-scan, cached.

---

## 7. UX Principles for This Patch

**Receipts or it didn't happen.** Every lexicon entry shows counts, sources, and real (redacted) quotes. The product's claim is "this is what your customers actually say" - it must be auditable in one click.

**Mine, don't warehouse.** Minimal retention, mandatory redaction, extraction-only persistence for inboxes. Say this in the UI at connection time, plainly.

**Customer language informs; the org decides.** Vocabulary swaps are toggles, territory proposals await approval, objections are suggested into product profiles - never silently merged. Same propose/dispose doctrine as everywhere else.

**Zero-integration value.** The product must be fully useful with paste alone. Connectors deepen it; they never gate it.

---

## 8. What to Keep From Current Implementation

- The Discovery conversational territory flow - lexicon-derived territories enter it as pre-evidenced cards, the conversation remains for everything else
- Seed generation's existing three inputs (site scan, product descriptions, intent modifiers) - customer vocabulary is a fourth input, not a replacement
- The Gmail OAuth connection - reuse, with new read scopes only if required
- PATCH-002 product schema - this patch populates it, never alters it

---

## 9. Implementation Order

1. **Ingestion + redaction pipeline** with paste + file sources (the irreducible core)
2. **Extraction + lexicon aggregation + Listening tab** (lexicon view, evidence drill-down)
3. **Coverage check** against corpus embeddings (PATCH-003 dependency)
4. **Discovery integration** - territory proposals + seed vocabulary + ear-icon evidence
5. **Voice vocabulary layer** + Learning Loop conflict detection
6. **Product profile enrichment** prompts
7. **Reddit + app store connectors** (scheduled fetch)
8. **Gmail connector** (in-memory mining, extraction-only persistence)
9. **Onboarding step + Splits Engine phrasing injection**

Test end-to-end: paste a real Reddit thread → verify PII redacted, utterances attributed, lexicon populated with quotes → generate a territory from a language gap → run seed generation and confirm customer-phrased seeds with ear icons → generate a piece and confirm the brief carried questions/objections and the draft uses customer vocabulary.

---

*Dark Madder PATCH-005 - Customer Language Mining - June 2026*
