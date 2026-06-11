> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: specs/research-architecture.md and specs/measurement.md (pgvector -> platform-asks.md)
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# PATCH-003: Corpus Intelligence

## Embeddings Layer, Semantic Internal Linking & Topical Authority Mapping

**Date:** June 2026
**Applies to:** Phase 1 (Data Model), Phase 3 (Research & Planner), Phase 4 (Content Generator), Phase 7 (Analytics & Adjuster)
**Priority:** High - foundational infrastructure. PATCH-004 (Freshness Engine) and PATCH-007 (AI Visibility) both consume this layer.
**References:** 01-DATA-MODEL.md, 03-RESEARCH-PLANNER.md, 04-CONTENT-GENERATOR.md, 07-ANALYTICS-ADJUSTER.md, 11-MODEL-STRATEGY.md, PATCH-001

---

## IMPORTANT: Read Before Implementing

1. Read through the ENTIRE patch document first
2. Verify pgvector is enabled on the Supabase project (`CREATE EXTENSION IF NOT EXISTS vector;`)
3. Review the current internal linking logic in the Research Planner (cluster-planned links in briefs) and the Content Generator (how `internal_links_needed` is consumed) - this patch extends both, it does not replace them
4. Review how published pieces are stored and whether the full published body is retained after Framer publish (it must be - if only the draft is stored, add a sync step)
5. Produce a written plan listing what changes, what stays, and what gets built new
6. Get approval before writing any code

This patch is mostly invisible infrastructure with two visible surfaces (the Corpus Map and the Link Sweep). Build the infrastructure first; the surfaces depend on it.

---

## Problem Summary

Dark Madder currently understands content as rows in a database: titles, keywords, clusters, statuses. It does not understand what the content *means*. This creates four specific gaps:

1. **Internal linking only works forward, at plan time.** The Research Planner declares `internal_links_needed` when a brief is created, so new pieces link to planned siblings. But nothing ever links *backward*: when piece #40 publishes, pieces #1-39 never learn it exists. Real topical authority requires the whole corpus to interlink, and today that requires a manual link sweep - exactly the kind of recurring chore the Startup Search Playbook schedules humans to do ("major internal linking sweep across all published content").

2. **Existing site content is invisible.** When an org connects a site that already has 60 blog posts, Dark Madder scans it once for voice and never thinks about it again. Those 60 posts are linkable assets, cannibalization risks, and authority signals - and the system can't see any of that.

3. **Cannibalization detection is keyword-based.** Two pieces targeting different keywords but answering the same intent ("do bee hotels work" vs "are bee hotels effective for conservation") sail past the current check and end up competing in the SERP.

4. **Topical authority is asserted, not measured.** The hub-and-spoke architecture *plans* authority, but nothing measures whether the published corpus actually forms tight, coherent topic neighborhoods - or whether it's drifting into scattered one-off posts. "Topic drift" is invisible until rankings suffer.

The fix for all four is the same primitive: a vector embedding for every piece of content the org has ever published, stored in pgvector, queryable in milliseconds. One table unlocks four features.

---

## Architecture Overview

```
CONTENT SOURCES                      EMBEDDING PIPELINE                CONSUMERS
─────────────────                    ──────────────────                ─────────
Published pieces (Dark Madder)  ─┐
Approved drafts                 ─┤   Chunk (by section)                Semantic internal linking
Legacy site content (crawled)   ─┼─► Embed (Voyage API)          ─►   Corpus Map (visualization)
Refresh drafts (PATCH-004)      ─┘   Store (pgvector)                 Cannibalization detection v2
                                     Re-embed on update               Topical authority + drift scores
                                                                      Generation context retrieval
                                                                      Freshness Engine (PATCH-004)
```

### Embedding Model

Dark Madder uses the **Voyage AI API** (`voyage-3-large`) for embeddings, following the model-as-configuration principle from 11-MODEL-STRATEGY.md. Add to the model config:

```typescript
export const EMBEDDING_CONFIG = {
  provider: 'voyage',
  model: 'voyage-3-large',
  dimensions: 1024,
  inputTypeDocument: 'document',   // for corpus content
  inputTypeQuery: 'query',         // for similarity queries
} as const;
```

No embedding call ever hardcodes the model string. Swapping providers (OpenAI, Cohere) is a config change plus a re-embed migration.

### Two Granularities

Every piece is embedded at two levels:

- **Piece-level:** One embedding of the title + meta description + first 1,500 words. Used for corpus mapping, cannibalization, and drift.
- **Chunk-level:** One embedding per H2 section (title + section body). Used for internal link placement (links point at the *section* that's relevant, not vaguely at the article) and generation context retrieval.

---

## 1. The Embedding Pipeline (Invisible Infrastructure)

### 1.1 What Gets Embedded, When

| Event | Action |
|-------|--------|
| Piece published via Framer integration | Embed piece + chunks within 5 minutes (Edge Function trigger) |
| Draft approved (pre-publish) | Embed piece-level only (enables cannibalization check before publish) |
| Refresh published (PATCH-004) | Re-embed piece + chunks |
| Legacy import (see 1.2) | Batch embed during import |
| Piece deleted/unpublished | Soft-delete embeddings (keep for history, exclude from queries) |

### 1.2 Legacy Corpus Import

New surface in **Org Settings > Content Library > Import Existing Content**. This is the "crawl your sitemap" move, productized:

```
IMPORT EXISTING CONTENT
────────────────────────
Dark Madder found a sitemap at talvi.app/sitemap.xml with 64 URLs.

  ◉ Import all blog/guide content (52 URLs matched /blog/* and /guides/*)
  ○ Let me choose URLs manually
  ○ Skip - start fresh

What import does:
• Reads each page and extracts the article content
• Adds each piece to your Content Library as "Legacy" (read-only)
• Makes them available for internal linking, cannibalization
  checks, and your Corpus Map
• Does NOT modify anything on your site

[Start Import]
```

Imported pieces get `source = 'legacy'` on the `content_pieces` table (new column, default `'darkmadder'`). Legacy pieces appear in the Content Library with a distinct badge, are embedded like native pieces, and can be "adopted" later (converted to managed pieces so the Freshness Engine can refresh them - see PATCH-004 §6).

**Implementation:** Fetch sitemap, filter URLs by user-selected path patterns, fetch each page, extract main content (use a readability-style extraction; strip nav/footer/CTA blocks), store title/url/body/published-date-if-detectable, embed. Run as a background job with progress shown in the UI ("Imported 31 of 52...").

### 1.3 Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  piece_id UUID REFERENCES content_pieces(id) ON DELETE CASCADE,
  granularity TEXT NOT NULL CHECK (granularity IN ('piece', 'chunk')),
  chunk_index INT,                     -- NULL for piece-level
  chunk_heading TEXT,                  -- The H2 this chunk belongs to (chunk-level only)
  chunk_anchor TEXT,                   -- URL fragment for deep links, e.g. "#how-it-works"
  content_hash TEXT NOT NULL,          -- SHA-256 of embedded text; skip re-embed if unchanged
  embedding vector(1024) NOT NULL,
  embedded_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,      -- false when piece unpublished/superseded
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_embeddings_org_active ON content_embeddings (org_id) WHERE is_active;
CREATE INDEX idx_embeddings_vector ON content_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Modify content_pieces:
ALTER TABLE content_pieces ADD COLUMN source TEXT DEFAULT 'darkmadder'
  CHECK (source IN ('darkmadder', 'legacy'));
ALTER TABLE content_pieces ADD COLUMN published_body TEXT;  -- if not already retained
```

---

## 2. Semantic Internal Linking

### 2.1 The Two Directions

**Forward (at generation time):** When the Content Generator builds a piece, it already consumes `internal_links_needed` from the brief. This patch adds a semantic pass: before generation, query the corpus for the 8 most similar *chunks* across all published + legacy pieces. Inject them into the generation context as available link targets:

```
AVAILABLE INTERNAL LINKS (inject into section generation prompts):
[
  { "title": "Do Bee Hotels Actually Work?", "url": "/what-works/bee-hotels",
    "section": "The evidence on solitary bees", "anchor": "#solitary-bee-evidence",
    "relevance": "Directly supports any claim about bee hotel effectiveness" },
  ...
]

Instruction to generator: Where a claim in this section is substantiated by one
of the available internal links, link to it using natural anchor text. Use at
most one link per 250 words. Never force a link; relevance over quota.
```

This means new pieces link richly and *specifically* (to sections, not just pages) without the planner having to predict every link.

**Backward (the Link Sweep):** When a new piece publishes, find existing pieces that *should now link to it*:

1. Query: which active chunks across the corpus are within cosine distance 0.25 of the new piece's piece-level embedding?
2. For each candidate chunk, a Haiku call answers: "Does this paragraph make a claim or mention a topic that the new piece substantiates or expands on? If yes, output the exact sentence where a link belongs and proposed anchor text. If no, output NONE."
3. Surviving candidates become `internal_link_suggestions` records.

### 2.2 The Link Sweep UI

New tab under Content: **Library > Link Sweep**. A queue of proposed backward links:

```
LINK SWEEP                                           12 suggestions pending
──────────────────────────────────────────────────────────────────────────

NEW PIECE: "How to Foster Shelter Dogs" (published Jun 2)

  → In "How to Help Shelter Dogs" (hub, published Mar 14)
    Section: "Beyond adoption"
    "...many shelters are desperate for short-term homes, and fostering
    is often the highest-impact way to help [LINK: fostering is often
    the highest-impact way to help → /how-to/foster-shelter-dogs]..."

    Why: The hub mentions fostering in one sentence; the new piece is a
    full guide. Linking strengthens the hub-spoke relationship.

    [Approve]  [Edit Anchor]  [Skip]

  → In "What Animal Shelters Actually Need" (legacy, imported)
    ...

[Approve All]  [Approve All in Dark Madder Pieces Only]
```

**Approval behavior:**
- For Dark Madder-managed pieces: approval queues a micro-refresh - the link is inserted into the stored body and pushed through the Framer integration as a CMS item update. Batched: all approved links to the same piece publish as one update.
- For legacy pieces (not Framer-managed or not adopted): approval exports the suggestion to a copy-paste checklist ("add this link manually"), since Dark Madder can't write to pages it doesn't manage. If the org's legacy pieces live in the connected Framer CMS, offer adoption (PATCH-004 §6) to enable direct updates.

**Cadence:** The sweep runs automatically on every publish. A full-corpus sweep (every piece against every piece) runs monthly and after legacy imports, capped at 50 suggestions per run, highest-similarity first, to avoid burying the user.

### 2.3 Schema

```sql
CREATE TABLE internal_link_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  source_piece_id UUID REFERENCES content_pieces(id) ON DELETE CASCADE,  -- piece getting the link
  target_piece_id UUID REFERENCES content_pieces(id) ON DELETE CASCADE,  -- piece being linked to
  source_chunk_anchor TEXT,
  insertion_sentence TEXT NOT NULL,    -- exact sentence where link goes
  proposed_anchor_text TEXT NOT NULL,
  rationale TEXT,
  similarity FLOAT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','published','skipped','manual_export')),
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
```

---

## 3. The Corpus Map

### 3.1 Purpose

A visual, navigable map of everything the org has published - the org's content as a molecular structure. This is the single most on-brand feature in the product: the UI brand spec literally calls for "molecular structures, node graphs, chemical bonds." The Corpus Map is where that becomes functional, not decorative.

### 3.2 Design

New top-level view: **Library > Corpus Map** (also linked from the Research Overview).

- **Projection:** Piece-level embeddings reduced to 2D via UMAP (computed server-side on snapshot, not live). Each piece is a node.
- **Node encoding:** Size = monthly clicks (from analytics snapshots). Color = cluster (consistent with cluster colors elsewhere). Ring = status (solid white ring = published, dashed = draft, grey = legacy). A faint madder-red glow on pieces flagged by the Freshness Engine (PATCH-004) or cited by AI engines (PATCH-007) - the map becomes the shared canvas for the whole intelligence layer.
- **Edges:** Internal links drawn as bonds between nodes. Approved-but-unpublished link suggestions render as dotted bonds.
- **Hover:** Title, cluster, performance score, trajectory arrow.
- **Click:** Side panel with the piece's stats, links in/out, similar pieces, and quick actions (Open, Refresh, Sweep Links).

### 3.3 What the Map Reveals (Annotated Insights)

The map is not just pretty - it renders three computed overlays, toggleable:

**Topical Authority overlay:** For each cluster, compute a cohesion score = mean pairwise similarity of its pieces (0-100 scale). Tight molecules = real authority. Display per-cluster:

```
Bee Conservation        ●●●●● 87  Tight - strong topical signal
Effective Giving        ●●●○○ 61  Moderate - 2 pieces are outliers
Misc / Unclustered      ●○○○○ 22  Scattered - 6 orphan pieces
```

**Drift overlay:** Compare the centroid of the last 10 published pieces against the centroid of the org's defined Authority Territories (embed each territory's name + description). If the recent-content centroid is moving away from all territory centroids, flag it: *"Your last 10 pieces are drifting from your defined territories. Biggest drift source: 4 pieces about [topic]. Either add this as a territory or reconsider the direction."* This surfaces on the map, the Research Overview, and the Monthly Content Health Report.

**Orphan overlay:** Pieces with zero inbound internal links glow amber. One click on an orphan jumps to a Link Sweep scoped to that piece.

### 3.4 Implementation Notes

- UMAP runs as a scheduled job (weekly + after imports), storing `map_x, map_y` on a `corpus_map_positions` table. The frontend renders from stored positions - never compute projection client-side.
- Render with the existing visualization stack; nodes capped at ~500 before clustering into super-nodes ("23 pieces - zoom to expand").
- Empty state (new org, no content): show the territory centroids as ghost molecules with "Your first pieces will appear here" - the map should feel like an instrument warming up, not a blank error.

---

## 4. Cannibalization Detection v2

Replace the keyword-overlap check in the Research Planner with a two-stage semantic check, run at two moments:

**At planning time (brief creation):** Embed the proposed title + primary keyword + brief summary as a query. If any published/legacy piece-level embedding is within cosine distance 0.15, flag before the piece enters the calendar:

```
⚠ POSSIBLE OVERLAP
"Are Bee Hotels Worth It?" is 91% similar to your published piece
"Do Bee Hotels Actually Work?" (/what-works/bee-hotels, ranking #4
for 'do bee hotels work', 480 clicks/mo)

  ○ Merge: expand the existing piece instead (creates a refresh job)
  ○ Differentiate: proceed, but I'll constrain the angle to [suggested
    distinct angle] and the generator will avoid overlapping sections
  ○ Proceed anyway
```

**At approval time (pre-publish):** Same check against the actual draft embedding, as a pre-publish checklist item in the Content Generator. Catches drift that happened during generation.

The Sonnet call for the "differentiate" option receives both pieces' outlines and produces the distinct-angle constraint injected into the brief.

---

## 5. Generation Context Retrieval

Small change, large quality effect. Before the Content Generator writes each section, retrieve the top 3 most similar chunks from the corpus and inject them with this instruction:

```
YOUR ORG HAS ALREADY PUBLISHED THE FOLLOWING ON ADJACENT TOPICS.
Do not repeat these points at depth - reference and link instead.
Where this section would duplicate an existing section, summarize in
one sentence and link. Your job is to add NEW ground.
```

This is how a real staff writer behaves - they know what the publication has already said. It eliminates the corpus-wide redundancy that makes AI-operated blogs feel thin, and it compounds the internal-linking density for free.

---

## 6. Technical Implementation Notes

### New API Routes

```
POST   /api/corpus/import/scan          -- Fetch + parse sitemap, return URL candidates
POST   /api/corpus/import/run           -- Start legacy import job
GET    /api/corpus/import/status        -- Import progress
POST   /api/corpus/embed/[pieceId]      -- (Re)embed a piece (internal, also Edge Function)
GET    /api/corpus/similar              -- Similarity query (pieceId or raw text, granularity, k)
POST   /api/corpus/sweep/run            -- Run link sweep (scope: piece | full)
GET    /api/corpus/sweep/suggestions    -- Pending suggestions
POST   /api/corpus/sweep/resolve        -- Approve/skip/edit a suggestion
GET    /api/corpus/map                  -- Map nodes, edges, overlays
POST   /api/corpus/cannibalization      -- Check a title/brief/draft against corpus
```

### Model Usage (additions to TASK_MODELS in 11-MODEL-STRATEGY.md)

```typescript
  // --- Corpus Intelligence (PATCH-003) ---
  linkPlacementCheck:      MODEL_CONFIG.HAIKU,   // Does this paragraph warrant a link? Where?
  linkAnchorGeneration:    MODEL_CONFIG.HAIKU,   // Natural anchor text proposal
  differentiationAngle:    MODEL_CONFIG.SONNET,  // Distinct-angle constraint for near-duplicate briefs
  legacyContentExtraction: MODEL_CONFIG.HAIKU,   // Clean article body from crawled HTML when readability extraction is ambiguous
```

Embeddings themselves are Voyage API calls, governed by `EMBEDDING_CONFIG`.

### Cost Controls

- Content hash check before every embed - unchanged text never re-embeds.
- Link sweep Haiku calls only run on candidates that pass the vector pre-filter (distance < 0.25), keeping per-publish sweeps to ~10-30 cheap calls.
- Full-corpus monthly sweep is capped and runs in the lowest-priority job queue.

---

## 7. UX Principles for This Patch

**Infrastructure should be silent; surfaces should be obvious.** The user never sees "embedding"; they see better links, a map, and smarter warnings. Never expose vector jargon in the UI.

**Propose, don't publish.** Link insertions, merges, and refreshes are always queued for approval, consistent with the Adjuster philosophy. The one exception the user can opt into: "Auto-approve link sweeps into Dark Madder-managed pieces" toggle in org settings, off by default.

**Every suggestion shows its evidence.** Similarity scores, the exact sentence, the rationale. Per PATCH-001's principle: every decision is explained.

**Legacy content is a guest, not a hostage.** Imported pieces are read-only until explicitly adopted. Dark Madder never modifies a page the user didn't hand over.

---

## 8. What to Keep From Current Implementation

- `internal_links_needed` in briefs and the planner's link-dependency sequencing - keep both; the semantic pass supplements them
- The existing keyword-overlap cannibalization check - keep as a fast pre-filter before the vector check
- Existing Content Library views - the Corpus Map and Link Sweep are new tabs, not replacements
- All Framer publish code - link micro-refreshes reuse the existing CMS item update path

---

## 9. Implementation Order

1. **pgvector + content_embeddings table + embedding service** (config, Voyage client, hash-skip logic)
2. **Embed-on-publish trigger** for native pieces (the pipeline proves itself silently)
3. **Legacy import** (sitemap scan → extract → embed) - unlocks full-corpus value for existing orgs
4. **Generation context retrieval** (§5) - smallest surface, immediate quality gain
5. **Cannibalization v2** (§4) - plugs into existing brief + pre-publish flows
6. **Link Sweep** (backward linking pipeline + UI + Framer micro-refresh path)
7. **Corpus Map** (UMAP job + map view + overlays) - the showcase, built last so it has real data to show

Test end-to-end: import a legacy site → publish a new piece → verify forward links appeared in the draft, sweep suggestions appeared for old pieces, the map renders, and a deliberately duplicated brief gets flagged.

---

*Dark Madder PATCH-003 - Corpus Intelligence - June 2026*
