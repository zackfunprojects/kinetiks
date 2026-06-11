# Dark Madder — Research & Architecture

> **Spec:** `specs/research-architecture.md` — subsystem spec 2 of 10 per `dark-madder-v2-doc-system.md` §7.
> **Date:** June 2026 · **Status:** Draft for approval
> **Authority:** `dm-product-spec.md` (when written) > `dark-madder-v2-doc-system.md` > `platform-contract.md` and `dm-platform-integration.md` (binding at the app boundary) > `ux/experience-architecture.md` (binding for surfaces; not yet written — primitives cited are the four from doc-system §3.3, to be reconciled) > `platform-asks.md` > this spec.
> **Sources consolidated:** ARCHIVE-PATCH-001 (the base — wins all conflicts), ARCHIVE-Research_Planner (workflow detail, sequencing rules, brief shape, refresh cadence where PATCH-001 is silent), ARCHIVE-PATCH-003 (corpus intelligence, intact), ARCHIVE-Patch_002 (campaigns only). All superseded by this document.
> **Depends on:** `specs/knowledge-trainer.md` (Cortex layers it populates; the customer lexicon).
> **Locked decisions honored:** Cortex canonical (territories draw from it); zero analytics ingestion (all SEO/search data via platform integration tools); calendar registers as a Kinetiks Program; one approval decision; single company per account; standalone-first.

---

## 1. Purpose

Research & Architecture is the strategic brain: it answers *what should we write about, how should it be structured, and when does each piece ship* — collaboratively, with evidence, and with the user holding the final word. PATCH-001's redesign is the base, and its seven failures are now product law (per the doc-system): every section has a home that orients; every AI claim ships with its evidence; every consequential decision is a collaborative checkpoint; every system decision has a clickable "why."

Three capabilities, one subsystem:

1. **The research spine** — Overview → Discovery → Keywords → Opportunities → Architecture → Publishing Plan. Resumable at any stage, data-backed at every step, ending in a committed plan that is operated work (a Kinetiks Program), not a report.
2. **Corpus intelligence** — the embedding layer that lets DM understand what the org's content *means*: semantic internal linking forward and backward, cannibalization detection that catches intent overlap rather than just keyword overlap, the Corpus Map, topical authority and drift measurement, legacy content adoption, and generation context retrieval. One table, many consumers — lifecycle-freshness, radar-response, ai-visibility, and measurement all read it.
3. **Campaigns** — time-bound initiatives with their own goals, audiences, messages, and voice adjustments, woven through the architecture and the generation context rather than bolted alongside it.

Strategic inputs are no longer outside-in only: territories draw from Cortex (products, customers, competitive, market) *and* from mined customer language (the trainer's lexicon), so research starts from what the business is, who its customers are, and how those customers actually talk.

---

## 2. Mechanism

### 2.1 The research spine

Six stages, one nav structure (PATCH-001 carried intact):

```
Research
  ├─ Overview          the research home — status, metrics, recent activity, quick actions
  ├─ Discovery         authority territories + data-backed seeds
  ├─ Keywords          enriched clusters with expandable keyword data
  ├─ Opportunities     specific, evidenced, actionable findings
  ├─ Architecture      the collaborative hub-and-spoke canvas
  └─ Publishing Plan   pacing, sequencing with rationale, commit
```

The flow is **resumable** (leave at any stage, the Overview shows where you are), **progressive** (summary metrics on cards, expand for full data, "research deeper" for thorough pulls), and **collaborative** (auto-generation is a starting point; everything is modifiable; the AI proposes, the human disposes).

### 2.2 Discovery

#### Authority territories

The strategic layer above keywords: the broad thematic areas the org wants to own. Built in a conversational panel (alternating turns, final output = territory cards), now **pre-seeded from Cortex and the lexicon**:

- **Cortex-derived candidates:** products (problem dimensions and personas from the ask #1 depth seed territories directly), customers (persona pain points and search behavior), competitive (spaces competitors own that the org contests), market (trends and seasonal patterns), narrative (the angles the org tells). Rich Cortex shortens the conversation — the AI opens with "Based on your Context Structure, I see you positioned around: …" and the user corrects and extends rather than starting cold. It never *replaces* the conversation: adjacent spaces the org wants to own that exist nowhere in its data are exactly what the conversation is for.
- **Lexicon-derived candidates:** clusters of high-distinctiveness lexicon entries arrive as pre-evidenced territory cards (*"Your customers talk constantly about distrust of donation apps — 88 objections, 39 'is it legit' questions. Proposed territory: Trust & transparency in giving apps."*), `source = 'customer_language'`, ear-icon evidence convention carried.
- **Routed signals:** cross-app learnings and Oracle suggestions stored as research signals (§2.10) weight matching candidates and appear in their evidence drawers.

Territory cards carry name, description, estimated search potential (aggregate volume from 3–5 representative queries via the platform DataForSEO tools), relevance score, status (`active | paused | exploring`), and source. Users edit, add, pause, delete, and reopen the conversation at any time. Each territory is embedded (name + description) — territory centroids power drift measurement (§2.7) and radar relevance scoring (`specs/radar-response.md`).

#### Seed generation (data-backed)

Per active territory: generate 10–20 candidate queries from the territory description, Cortex context, intent modifiers (the four intent categories carry: how-to / evaluation / action / trust), and **customer vocabulary** (top lexicon phrases, with the instruction to phrase seeds in customer language — seeds so derived carry the ear icon with frequency counts: demand evidence keyword tools cannot provide).

Every candidate is enriched **before display** through the platform DataForSEO integration: volume, difficulty, CPC, SERP features, trend. Zero-volume seeds are shown with a `0 volume` badge, not hidden — some topics are AEO plays for emerging queries, and that is the user's call to make. "Research deeper" triggers the thorough pull (full expansion, PAA, related queries, competitor content analysis) that feeds Keywords. Users include/exclude, add their own (instant data lookup), sort/filter, bulk-select by territory, and request more per territory.

**No keyword data, no fabrication.** When the DataForSEO integration is unavailable (platform-ask #2 interim), seeds render with explicit "no keyword volume data" evidence states; ranking falls back to corpus-gap and competitive signals; the degradation is stated, never hidden. GSC data (already-ranking queries) flows through the platform GSC tools where connected, as a seed source and a "you already rank #11 for this" evidence layer.

#### Discovery summary

Before Keywords: territories defined, seeds selected across total volume, top seeds, territories with thin coverage flagged, "Proceed to Keywords."

### 2.3 Keywords (enriched clusters)

For approved seeds: full keyword expansion via the platform tools, then clustering — embedding-assisted (group by semantic intent: keywords servable by a single piece) with the lexical method as the pre-filter and the fallback when pgvector is unavailable (ask #5 interim). The v1 shape target stands: one primary keyword (highest volume) plus 10–30 long-tail keywords that become subheadings, FAQ entries, and semantic depth.

Cluster cards show territory, primary keyword with data, keyword count, combined volume, AI Overview presence, and the **opportunity score** — the transparent composite carried from PATCH-001: volume 30% + competition gap 40% + relevance 30%, formula shown in the tooltip. Expanded detail shows the full sortable keyword table, PAA questions, SERP analysis (top results, content quality and age, the gap), and AI Overview state with cited sources. Cluster operations carry intact: remove/move keywords, split, merge, add manual keywords.

**Evidence snapshots, not a query cache.** The keyword data attached to clusters and seeds is the *evidence at decision time* — work product, stored on the research artifacts (`keyword_data`, `serp_analysis` JSONB) with a `fetched_at` stamp and surfaced age ("data from May 12 — refresh?"). The v1 `research_cache` dies: raw SEO-API response caching is the platform integration's job (contract §11). DM stores what the user decided on and when; the platform stores what the API said.

### 2.4 Opportunities

Specific, actionable findings — each with a clear *why*, evidenced value, and a suggested action. Sources, expanded from PATCH-001's four:

| Source | Detection |
|---|---|
| Keyword gaps | High-volume in-territory queries with no strong existing content (SEO tools + corpus embeddings) |
| SERP weakness | Top results thin, outdated, or generic (SERP analysis) |
| AI citation gaps | Engines answering in-territory queries citing weak sources (SERP AI Overview data; deepened by `specs/ai-visibility.md`, whose uncited probe questions feed back in here as opportunities — the doc-system's loop) |
| PAA / community demand | Questions asked that nobody answers well |
| Lexicon demand | Uncovered lexicon questions (coverage check, §2.7) — instant, evidence-backed ideas with built-in demand proof |
| Oracle insights | Routed insights with `suggested_action.app = 'dark_madder'` surface as proposed briefs with the Oracle evidence attached; the insight id rides for attribution (integration §4.3 event 2) |
| Cross-app learnings | Research signals (§2.10) that weight existing opportunities and territories |

Card anatomy (carried): the finding, *why this is an opportunity* (named evidence), estimated value (related-query volume, current best result quality and age, difficulty, AI citation potential), suggested action (create hub / create spoke under X / add to cluster), related cluster. Actions: **Add to Architecture** (creates the piece in the structure), **Research more**, **Dismiss** (optional reason, captured as learning). Dismissal feedback informs future detection ranking.

### 2.5 Architecture

The most important page in Research: the visual, collaborative content-structure workspace.

**The canvas:** a node graph — hubs as large nodes, spokes bonded to them, unassigned clusters in a sidebar; status encoded per node (live / draft / planned / legacy). The molecule rendering itself is `ux/design-language.md`'s call; this spec defines what the canvas must express: structure, status, associations, and gaps.

**Pillars** are generated per org rather than hardcoded: the system proposes a pillar structure (URL pattern, intent, content types per pillar) derived from the org's territories and intent distribution, for user approval and editing. The v1 four (How to Help / What Works / How to Participate / Trust & Verification) survive as the worked example, not the default. Pillar distribution actively flags gaps ("Trust: 0 hubs") in the architecture summary — strategic blind spots made visible.

**Hub creation** three ways, carried: from an unassigned cluster (system proposes title-as-headline, target keyword, word count, pillar, 3–5 spokes each with keyword/volume/rationale — all modifiable before confirming); "AI: suggest structure" across all unassigned clusters (review/modify/accept/reject per hub); manual. **Spoke management** carried: reorder, add (manual or suggested), edit title/keyword/word count, remove, publishing priority, and the **internal linking map** (spokes→hub, hub→spokes, cross-links, cross-pillar hub links) — visible and editable, and consumed by the brief generator and sequencing rule 5.

**Product and campaign tagging** (PATCH-002): hubs are org-level authority; spokes can carry product associations (`none | mention | feature | primary` — each level changing generation behavior per §2.8) and campaign associations, shown as badges on the canvas and edited in the spoke panel.

**Cannibalization detection v2** runs at two moments:
- *Planning time* (a piece enters the architecture / a brief is created): the proposed title + primary keyword + summary is embedded as a query; any published or legacy piece within cosine distance 0.15 triggers the three-way checkpoint — **Merge** (expand the existing piece instead → creates a refresh job via `specs/lifecycle-freshness.md`), **Differentiate** (proceed with a generated distinct-angle constraint injected into the brief; the generator avoids overlapping sections), **Proceed anyway**. The flag shows the similar piece, its similarity, its current ranking/clicks where platform data is connected.
- *Approval time*: the same check against the actual draft embedding, as a pre-publish checklist item (generation-engine consumes; the check is defined here). Catches drift introduced during generation.
- The keyword-map uniqueness check (one primary keyword per account, enforced with a clear error) carries from doc 03 as the fast pre-filter.

### 2.6 Publishing Plan

The bridge from architecture to operated work — a guided step, never an auto-generate button.

**Pacing:** conservative / moderate / aggressive presets with honest framing (who each suits, total-completion projections for *this* architecture), publishing days configurable.

**Sequencing:** the system proposes a phased sequence governed by adjustable rules — hubs before spokes; highest-opportunity clusters first; cross-pillar variety; ≤2 same-cluster pieces in a row; plus doc 03's rules where PATCH-001 is silent: **seasonal awareness** (seasonal-spiking clusters scheduled 6–8 weeks pre-peak, trend data as evidence) and **link dependencies** (if A links to B, B publishes first or simultaneously — resolved automatically from the linking map). Every placed piece shows its one-line rationale; every phase states its strategy. Users change pace (full recompute), drag pieces, reorder, remove (stays in Architecture, unscheduled), add buffer/blackout dates, and override sequencing rules.

**Commit:** the commit preview states exactly what will happen — pieces created, generation dates (drafts generate N days pre-publish, default 3, configurable), first draft date, last publish date, and *which Program action this is* (create the content Program, or mutate the existing one — integration §6.1's one-Program-per-goal rule, stated in the preview). Commit calls **`dm_propose_calendar`**: a strategic approval; nothing changes until approved. On approval, connected mode registers/mutates the Program (clusters as "{Cluster} Engine" Workflows, pieces as Tasks with mirrored state, campaign pushes and radar fast-tracks as one-shot Workflows — all per integration §6); goal linkage follows §6.1 (no content goal → the proposal bundles a goal suggestion, swappable before approval). Standalone mode commits to `dm_calendar` with identical UI semantics and no registration. "Save as draft" persists the plan without committing.

**Brief generation** (the contract consumed by `specs/generation-engine.md`): before a piece's generation date, the system produces its brief —

```jsonc
{
  "piece_id": "...", "content_type": "hub" | "spoke",
  "title_suggestions": [...], "primary_keyword": "...", "secondary_keywords": [...],
  "target_word_count": 3000, "target_url": "/…", "pillar": "...",
  "cluster_context": { "related_spokes": [...], "internal_links_needed": [...] },
  "serp_context": { "top_results_summary": "...", "ai_overview_present": true, "ai_overview_sources": [...],
                    "people_also_ask": [...], "content_gap_opportunities": [...] },
  "customer_language": { "required_questions": [{"text","frequency"}],          // lexicon, with counts
                          "required_objections": [{"text","frequency"}],
                          "exemplar_quotes": [/* ≤3, redacted */],
                          "seed_vocabulary": [...] },
  "associations": { "products": [{"product_id","integration_level"}], "campaigns": [{"campaign_id"}] },
  "campaign_context": { "key_messages": [...], "tone_shift": "...", "urgency_level": "...", "cta": "...",
                         "narrative_arc_position": "...", "content_themes": [...] },
  "differentiation_constraint": "…",                                            // from cannibalization checkpoint, when set
  "applicable_policies": [...],                                                 // from the Task's ContextPack (integration §6.4)
  "structural_requirements": { "ai_hook_in_first_150_words": true, "headings_as_searchable_questions": true,
                                "definition_boxes_needed": [...], "key_takeaways_section": true,
                                "faq_section": true, "faq_questions": [...], "internal_links": 5, "sources_required": true },
  "correlation_id": "…"                                                         // when Task-originated
}
```

Lexicon enrichment is PATCH-005 §4.1 carried: briefs in lexicon-derived clusters require the documented questions and objections as material — the generator writes toward documented doubts, not imagined ones.

### 2.7 Corpus intelligence

The embedding layer. Mostly invisible infrastructure with visible surfaces (the Corpus Map, the Link Sweep); the user never sees the word "embedding."

**Pipeline.** Two granularities per piece — piece-level (title + meta + first 1,500 words: mapping, cannibalization, drift) and chunk-level (per H2 section: link placement and generation retrieval). Triggers: publish → embed piece + chunks within minutes; draft approved → piece-level (pre-publish cannibalization); refresh published → re-embed; legacy import → batch; unpublished → soft-deactivate. Content-hash check skips unchanged text. Requires pgvector on the shared project (ask #5); until it ships, corpus features sit behind a feature flag, clustering falls back lexical, and cannibalization v2 is disabled rather than faked. Requires `dm_pieces.published_body` retention post-publish (a stated requirement on `specs/publishing.md`).

**Legacy import** (Settings → Content Library → Import Existing Content): sitemap scan → user selects path patterns → readability extraction per page → pieces stored `source = 'legacy'`, read-only, badged, embedded like native pieces. Legacy content is a guest, not a hostage: linkable, mappable, cannibalization-aware, never modified until explicitly adopted (adoption: `specs/lifecycle-freshness.md`). Crawling the org's *own* site is DM-owned (training-input class, like the trainer's scan) — it is not platform-owned sensing, which watches the outside world.

**Semantic internal linking, forward:** before each section generates, the 8 most similar chunks across published + legacy pieces are injected as available link targets (title, url, section, anchor, relevance), with the discipline carried verbatim in spirit: natural anchor text, ≤1 link per 250 words, relevance over quota. New pieces link richly and *specifically* — to sections, not vaguely at articles.

**Generation context retrieval:** the top 3 most similar corpus chunks are injected per section with the add-new-ground instruction — reference and link instead of repeating; summarize-and-link where a section would duplicate. The retrieval API (`/api/dm/research/corpus/similar`) is defined here; generation-engine consumes it.

**Semantic internal linking, backward — the Link Sweep:** on every publish, active chunks within cosine distance 0.25 of the new piece are candidates; a fast-tier call per candidate identifies the exact sentence where a link belongs and proposes anchor text, or outputs NONE. Survivors become suggestions with rationale and similarity. Cadence: per-publish sweep automatic; full-corpus sweep monthly and post-import, capped at 50 suggestions, highest-similarity first. Resolution: approving suggestions into DM-managed pieces batches them per target piece into a **link micro-refresh** executed via `dm_update_article` (approval handling in §5); suggestions into non-managed legacy pieces export to a copy-paste checklist, with adoption offered where the pieces live in the connected CMS.

**The Corpus Map:** piece-level embeddings projected to 2D server-side on snapshot (weekly + post-import), positions stored, never computed client-side. Node encoding: size = monthly clicks **from platform GA4/GSC tools where connected** (node sizes uniform with a stated "connect GA4 for traffic sizing" note otherwise — zero ingestion, honest degradation); color = cluster; ring = status; glow = freshness-flagged or AI-cited (shared canvas for lifecycle-freshness and ai-visibility). Edges = internal links; dotted = approved-but-unpublished suggestions. Three toggleable overlays:
- **Topical authority:** per-cluster cohesion = mean pairwise similarity, 0–100. Computed here; reported by `specs/measurement.md` as a component of `dm_corpus_authority_score`. One owner per number: research computes, measurement reports.
- **Drift:** centroid of the last 10 published pieces vs territory centroids; drifting → a named, evidenced flag ("4 pieces about [topic] — add the territory or reconsider"), surfaced on the map, the Overview, and measurement's health report.
- **Orphans:** zero-inbound-link pieces glow; one click scopes a Link Sweep to the orphan.

Nodes cap ~500 before clustering into super-nodes. Empty state: territory centroids as ghost structure — an instrument warming up, not a blank error.

### 2.8 Campaigns

A campaign is a time-bound initiative with its own goals, timeline, audience, key messages, narrative arc, CTA, and voice adjustments — not a product, possibly referencing products, possibly none. Carried from PATCH-002: identity + timeline + key dates; goal + success metrics + target audience with `audience_difference`; key messages (prioritized, contextualized); narrative arc; CTA; tone shift + urgency level; content themes, hashtags, brand-asset notes. Intake follows the trainer's section-by-section pattern with completion tracking and AI assist.

**Campaign voice is an adjustment layer, not a fourth voice:** the stack is template → campaign adjustments (when associated) → product knowledge → Cortex Voice (org hard rules always win: banned phrases and required patterns are non-negotiable) → author characteristics. Campaigns adjust soft dimensions only — urgency, messaging emphasis, CTA.

**Associations:** pieces ↔ campaigns (junction), pieces ↔ products with integration level (`none` = knowledge informs, product unnamed; `mention` = one option among several; `feature` = meaningful depth; `primary` = the subject), clusters ↔ products with relevance (`primary | related | supporting`). Generation effects per level carried verbatim from PATCH-002 §3.3; campaign key messages inject as messaging guardrails, the CTA replaces the default, hashtags flow to splits, the arc positions the piece in the larger story.

**Campaigns and Programs:** settled by `dm-platform-integration.md` §6.2 — a committed campaign push enters the *existing* content Program as a **one-shot Workflow** (compressed schedule, 24h checkpoints, identical quality gates). Campaigns never spawn their own Programs; the campaign entity is DM-owned generation/research context, the Program is the operating record. Campaign scheduling honors `key_dates` as sequencing constraints in the Publishing Plan.

### 2.9 Research refresh

Data ages; the system says so and re-pulls on schedule: monthly volume/difficulty re-pull for active clusters (>20% shifts flagged), quarterly full SERP re-analysis (new competitors, AI Overview changes, gap changes), on-demand always. Each refresh writes a snapshot diffed against the prior one; significant changes surface as Opportunities and feed measurement's monthly health report. All pulls go through platform integration tools (their caching, their rate limits); snapshots are decision-evidence history, not an API cache (§2.3 distinction).

### 2.10 Research signals

`handleRoutingEvent` deliveries stored as first-class evidence (integration §4.3 events 1–2): cross-app learnings (e.g., Harvest's "security messaging resonates with fintech buyers") and Oracle insights targeting DM. Signals weight Discovery candidates and Opportunity ranking, appear in the evidence drawer of any territory/cluster/opportunity they influenced, and **never trigger generation by themselves**. Radar events are not research signals — they route to `specs/radar-response.md`; a radar response *outwrite* enters research only as a normal piece in the architecture.

---

## 3. Tools exposed

This subsystem's agent-facing surface is the `content_research` capability — three tools, defined canonically in `dm-platform-integration.md` §3 (descriptions there are final and ship verbatim; restated here for completeness). Per integration decision C, `tools.ts` is the single definition; the command handler and capability registration generate from it.

| Tool | `isConsequential` / `autoApproveThreshold` | `surface` / `actionCategory` | Description (as shipped) | Returns |
|---|---|---|---|---|
| `dm_run_discovery` | `false` / `null` | `query` / — | Run content discovery: derive authority territories from Cortex (products, customers, competitive, market) plus mined customer language, and score them. Use when the user wants to know what topics to own or to start a content strategy. Long-running; returns a discovery id and streams progress. | `{ discovery_id, territories: [{name, rationale, evidence, score}], status }` |
| `dm_get_architecture` | `false` / `null` | `query` / — | Get the current content architecture: clusters, hub-and-spoke structure, keyword data per cluster, cluster health, and gaps. Use when the user asks about content structure, coverage, or what exists versus what is planned. | `{ clusters: [{id, name, hub, spokes, keywords, health, gaps}], summary }` |
| `dm_propose_calendar` | **`true`** / `null` | `consequential` / `dm_program_change` | Propose creating or changing the content publishing calendar, which is registered as the account's content Program (clusters as Workflows, pieces as Tasks). Always a strategic approval: it changes direction and affects many future outputs. Use when the user wants to commit a publishing plan, change cadence, or restructure the calendar. Returns the proposal and its approval id; nothing changes until approved. | `{ proposal_id, approval_id, program_id?, summary, status: 'pending_approval' }` |

`dm_run_discovery` streams stage progress through the command channel (`CommandProgress`), rendered as generation theater in Marcus chat and in-app. Tool returns follow contract §3.5 discipline: ids, scores, evidence pointers, summaries — never `{success: true}`. Internal routes (not agent tools): `/api/dm/research/*` for territories, seeds, clusters, opportunities, architecture, publishing preview; `/api/dm/research/corpus/*` for import, similarity, sweep, map; `/api/dm/research/campaigns/*`.

---

## 4. Cortex layers read and written

**Reads:** `org` (fundamentals ground relevance scoring), `products` (problem dimensions, personas, terminology seed territories and seeds; ask #1 depth via Cortex or the trainer's interim overlay — research reads through the trainer's accessor so the plumbing difference is invisible), `customers` (personas, pain points, search behavior), `competitive` (known competitors for gap analysis and SERP framing), `market` (trends, seasonality → sequencing rule), `narrative` (validated angles weight opportunity framing), `voice` (light: phrasing seeds and titles in-voice). Empty/partial layers degrade to the conversation and the scan — never an error (§8).

**Writes — `competitive` proposals only** (Discovery's provenance boundary with the trainer: research proposes what it learned from the *outside world*; the trainer proposes what it learned from the org's own materials):

```jsonc
{
  "targetLayer": "competitive", "action": "enrich", "confidence": 0.0-1.0,
  "payload": {
    "competitors": [{ "name": "...", "website": "...", "positioning": "…",
                       "content_strategy": { "territories_active": [...], "publishing_cadence": "…", "formats": [...] },
                       "strengths": [...], "weaknesses": [...] }],
    "positioning_observations": [{ "observation": "...", "territory": "..." }]
  },
  "evidence": [
    { "source": "dm_research_serp_analysis", "detail": "SERP positions per keyword, fetched_at, ranking URLs" },
    { "source": "dm_research_competitor_content_analysis", "detail": "analyzed competitor URLs + coverage/quality findings" }
  ]
}
```

**Evidence floor:** a competitor proposal requires named URLs and SERP placements; a content-strategy observation requires the analyzed pieces. Additive only (new competitors, new observations); scalar fields never touched. Operational research data — keyword tables, briefs, sweep candidates, embeddings — never becomes a proposal (blocked by `filterProposal`; structurally never emitted: proposals are constructed only from Discovery's explicit `toProposal()` output).

---

## 5. Approval touchpoints

| Action | Tool / path | Type | Notes |
|---|---|---|---|
| Commit / restructure the publishing plan | `dm_propose_calendar` | **strategic** | Never auto-approved (integration §5.3). Preview = `config_change` (calendar delta, affected clusters/dates, sequencing rationale). No-goal accounts: the goal-suggestion bundle rides the same approval (integration §6.1; platform-ask #8.3). Timeout: none / `pause_workflow`. |
| Adjuster recommendations mutating the Program | via measurement → same path | **strategic** | Originates in `specs/measurement.md`; executes through this subsystem's Program mutation. DM never silently edits a registered Program. |
| Link micro-refresh (approved sweep batch into a DM-managed piece) | `dm_update_article` | **review** (interim) | A body change to live content; §5.2 of the integration doc has no link-class scope, so review is the safe interim classification. **Write-back filed** (§10) proposing a `dm_content_link_insertion` quick-class scope — small, fully card-visible, batched per target piece, lowest blast radius after metadata. The v1 "auto-approve link sweeps" org toggle does not return: per integration decision B, autonomy is the approval system's per-category threshold plus user `approval_override` policies ("auto-approve link insertions"), not an app-side switch. |
| Cannibalization "Merge" | creates a refresh job | review (downstream) | The refresh diff approval belongs to `specs/lifecycle-freshness.md`; this subsystem only originates the job. |
| Everything else | — | none | Territory/seed/cluster/opportunity/architecture edits, brief acceptance, campaign creation, legacy import, sweep *suggestion* review, map interactions: in-app collaborative checkpoints on DM-internal state — non-consequential by the contract ("nothing leaves the system"), no cards. |

In-flight sequencing honors platform-initiated transitions (checkpoint timeouts holding pieces at `in_review` with the visible "held by Program" state, cancels) per integration §6.3.

---

## 6. Data — Data Tables appendix

All tables `account_id`-scoped (`uuid not null references auth.users(id)`), **RLS mandatory** (`using (account_id = auth.uid())`), migrations sequential in the monorepo `supabase/migrations/`. SQL-sketch format for `specs/data-model.md` consolidation.

```sql
-- Authority territories
create table dm_territories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active','paused','exploring')),
  estimated_volume int,                -- aggregate of representative queries; null when SEO data unavailable
  relevance_score float,
  source text not null default 'user_input' check (source in
    ('user_input','cortex_derived','website_scan','customer_language','ai_suggested')),
  conversation_history jsonb,          -- the discovery exchange that produced/refined this territory
  evidence jsonb,                      -- lexicon counts, Cortex field refs, research-signal ids that supported it
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seeds (first-class for resumability and decision-time evidence)
create table dm_seeds (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  territory_id uuid not null references dm_territories(id) on delete cascade,
  query text not null,
  intent_type text check (intent_type in ('how_to','evaluation','action','trust')),
  keyword_data jsonb,                  -- {volume, difficulty, cpc, serp_features, trend, fetched_at} — evidence snapshot; null fields stated, never fabricated
  source text not null default 'generated' check (source in ('generated','user_added','customer_language','gsc')),
  lexicon_entry_id uuid,               -- ear-icon provenance
  status text not null default 'candidate' check (status in ('candidate','included','excluded')),
  created_at timestamptz default now()
);
create index idx_dm_seeds_territory on dm_seeds (account_id, territory_id, status);

-- Clusters
create table dm_clusters (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  territory_id uuid references dm_territories(id),
  name text not null,
  primary_keyword text not null,
  related_keywords jsonb,              -- [{keyword, volume, difficulty, trend}] evidence snapshot + fetched_at
  serp_analysis jsonb,                 -- top results, quality/age read, gaps, fetched_at
  ai_overview jsonb,                   -- presence, cited sources, gap
  opportunity_score float,             -- volume .3 + competition gap .4 + relevance .3 (formula surfaced in UI)
  pillar_id uuid,                      -- references dm_pillars
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (account_id, primary_keyword)  -- the keyword-map uniqueness rule (fast cannibalization pre-filter)
);

-- Org-derived pillars (user-approved; no hardcoded defaults)
create table dm_pillars (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  name text not null,
  url_pattern text not null,           -- '/how-to/[slug]'
  intent text,
  content_types jsonb,
  position int not null default 0,
  created_at timestamptz default now()
);

-- Opportunities
create table dm_opportunities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  title text not null,
  source text not null check (source in
    ('keyword_gap','serp_weakness','ai_citation_gap','paa_demand','lexicon_demand','oracle_insight','cross_app_signal','refresh_delta')),
  why text not null,                   -- the named, evidenced rationale (no opportunity without it)
  estimated_value jsonb,               -- related volume, best-result quality/age, difficulty, citation potential
  suggested_action jsonb,              -- {action: create_hub|create_spoke|add_to_cluster, target_cluster_id?, hub_id?}
  related_cluster_id uuid references dm_clusters(id),
  origin_ref jsonb,                    -- oracle insight id / lexicon entry id / probe id / signal id — attribution
  status text not null default 'open' check (status in ('open','added','dismissed')),
  dismissal_reason text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- Briefs (the generation contract, §2.6 shape in `brief` jsonb)
create table dm_briefs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,              -- dm_pieces
  brief jsonb not null,
  differentiation_constraint text,     -- from the cannibalization checkpoint
  correlation_id uuid,                 -- Task provenance (integration §6.5)
  created_at timestamptz default now()
);

-- Campaigns (PATCH-002 carried, account-scoped)
create table dm_campaigns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  name text not null,
  slug text not null,
  status text not null default 'planning' check (status in ('planning','active','paused','completed','cancelled')),
  start_date date, end_date date, key_dates jsonb,
  goal text not null, success_metrics jsonb,
  target_audience text, audience_difference text,
  key_messages jsonb, narrative_arc text, call_to_action text,
  tone_shift text,
  urgency_level text not null default 'low' check (urgency_level in ('none','low','moderate','high')),
  content_themes jsonb, hashtags jsonb, brand_assets_notes text,
  section_completion jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (account_id, slug)
);

-- Associations
create table dm_piece_campaigns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,
  campaign_id uuid not null references dm_campaigns(id) on delete cascade,
  created_at timestamptz default now(),
  unique (piece_id, campaign_id)
);

create table dm_piece_products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,
  cortex_product_id text not null,
  integration_level text not null default 'mention' check (integration_level in ('none','mention','feature','primary')),
  created_at timestamptz default now(),
  unique (piece_id, cortex_product_id)
);

create table dm_cluster_products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  cluster_id uuid not null references dm_clusters(id) on delete cascade,
  cortex_product_id text not null,
  relevance text not null default 'related' check (relevance in ('primary','related','supporting')),
  created_at timestamptz default now(),
  unique (cluster_id, cortex_product_id)
);

-- Embeddings (pgvector; platform-ask #5; feature-flagged until enabled)
create table dm_embeddings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,
  entity_kind text not null default 'piece_content' check (entity_kind in ('piece_content','territory')),
  granularity text not null check (granularity in ('piece','chunk')),
  chunk_index int, chunk_heading text, chunk_anchor text,
  content_hash text not null,          -- skip re-embed when unchanged
  embedding vector(1024) not null,
  is_active boolean not null default true,
  embedded_at timestamptz default now(),
  created_at timestamptz default now()
);
create index idx_dm_embeddings_account_active on dm_embeddings (account_id) where is_active;
create index idx_dm_embeddings_vector on dm_embeddings using hnsw (embedding vector_cosine_ops);
-- Index convention (HNSW, 1024 dims) to be ratified project-wide under ask #5.

-- Link sweep suggestions
create table dm_link_suggestions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  source_piece_id uuid not null,       -- piece receiving the link
  target_piece_id uuid not null,       -- piece being linked to
  source_chunk_anchor text,
  insertion_sentence text not null,
  proposed_anchor_text text not null,
  rationale text not null,
  similarity float not null,
  status text not null default 'pending' check (status in
    ('pending','approved','submitted','published','skipped','manual_export')),
  approval_id uuid,                    -- the dm_update_article approval (per batch)
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- Corpus map positions (server-computed snapshot)
create table dm_corpus_positions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  piece_id uuid not null,
  map_x float not null, map_y float not null,
  snapshot_at timestamptz not null default now(),
  unique (account_id, piece_id)
);

-- Routed research signals
create table dm_research_signals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  signal_type text not null check (signal_type in ('cross_app_learning','oracle_insight')),
  source_app text,
  summary text not null,
  payload jsonb not null,              -- the routed event, incl. evidence + insight/learning ids
  influenced jsonb,                    -- territory/cluster/opportunity ids this signal weighted (evidence-drawer wiring)
  created_at timestamptz default now()
);

-- Standalone calendar (identical UI semantics, no Program registration; backfills on upgrade per data-model)
create table dm_calendar (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  plan jsonb not null,                 -- pacing, rules, phases, per-piece schedule + rationale
  status text not null default 'draft' check (status in ('draft','committed','superseded')),
  committed_at timestamptz,
  adjustments jsonb,                   -- audit trail of changes (user / adjuster / refresh)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Research refresh snapshots (decision-evidence history — NOT an API cache; platform owns caching)
create table dm_research_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id),
  scope text not null check (scope in ('monthly_volumes','quarterly_serp','on_demand')),
  cluster_ids uuid[],
  snapshot jsonb not null,
  delta jsonb,                         -- significant changes vs prior snapshot (>20% volume shifts, SERP movement)
  created_at timestamptz default now()
);
```

**Columns this spec contributes to shared tables** (canonical definition in `specs/data-model.md`): `dm_pieces.cluster_id`, `dm_pieces.primary_keyword` (uniqueness via the cluster rule), `dm_pieces.source ('darkmadder'|'legacy')`, `dm_pieces.published_body` (retention required for embeddings and freshness), `dm_pieces.scheduled_generate_at`, planned-state statuses, `correlation_id`.

**v1 tables that do not return:** `research_cache` (→ platform integration caching), org-scoped `authority_territories`/`content_clusters`/`campaigns`/junctions (rebuilt account-scoped above), `content_embeddings` org-scoped (→ `dm_embeddings`), SEO API connection tables (→ platform integrations).

---

## 7. Surfaces & Explainability

Primitives per doc-system §3.3 (reconcile with `ux/experience-architecture.md` on landing): **P1** propose→review→approve · **P2** diff surface · **P3** generation theater · **P4** evidence drawer. Every screen: purpose, primary action, five states, evidence on every claim, "why" on every system decision.

### S1 — Research Overview
**Purpose:** the research home — stage progress, key metrics, recent activity, quick actions; the orientation PATCH-001 found missing. **Narrative moment:** Monday planning. **Primary action:** the current stage's next step. **Primitives:** P4 (every metric opens its computation; the drift flag opens the centroid evidence).
**Five states:** empty (standalone: "Start Discovery" with what-this-does framing; activated: "Your Context Structure already suggests 4 territories — review them") · loading · populated (status bar with clickable stages, metrics, activity log, drift/refresh flags) · in-progress (a running discovery/refresh renders inline via P3) · failed/partial (stage-scoped errors with retry; completed stages unaffected).
**Why:** the status bar explains what each stage produces; every flagged item links to its evidence.

### S2 — Discovery
**Purpose:** territories (conversation + cards) and data-backed seeds. **Primary action:** define/confirm territories → generate seeds. **Primitives:** P3 (the discovery run: Cortex read → candidates → conversation → seed generation with per-territory progress), P1 (territory candidates and the competitive proposals they yield), P4 (every candidate opens its provenance — Cortex fields, lexicon counts with exemplars, signals; every seed opens its keyword data with `fetched_at`).
**Five states:** empty (the conversation opener, Cortex-aware in activated mode, first-principles in standalone) · loading · in-progress (P3) · populated (territory cards + seed grid with include/exclude, ear icons, sort/filter, "generate more") · failed/partial (SEO tool unavailable → seeds render with explicit "no keyword volume data" badges and the fallback ranking explained — degraded and honest, per ask #2).
**Why:** every relevance score, every seed's composite ranking, every "based on your Context Structure" opens the exact inputs.

### S3 — Keywords
**Purpose:** enriched clusters; the end of "7 keywords" opacity. **Primary action:** expand and shape clusters. **Primitives:** P4 (the expanded detail *is* an evidence surface: full keyword table, PAA, SERP analysis, AI Overview state), P1 (split/merge confirmations).
**Five states:** empty (no seeds included yet → route to Discovery) · loading (clustering progress, method stated: semantic / lexical-fallback) · populated · in-progress (re-cluster/refresh running with stale-data banner) · failed/partial (per-cluster data gaps stated: "difficulty unavailable for 3 keywords").
**Why:** the opportunity score shows its formula and inputs in the tooltip; cluster membership answers "why are these grouped?" with the intent rationale.

### S4 — Opportunities
**Purpose:** evidenced, actionable findings. **Primary action:** Add to Architecture. **Primitives:** P1 (each card is a proposal: add / dismiss / research more), P4 (the *why*, the value estimate, and the origin — Oracle insight, lexicon entry with counts and quotes, SERP read — every claim opens its data).
**Five states:** empty (what detection looks for + which sources are currently feeding it, with connect-state honesty) · loading · populated (cards grouped/filterable by source) · in-progress (detection running post-refresh) · failed/partial (source-scoped: "AI citation gaps need probe data — runs after your first ai-visibility cycle").
**Why:** every card's *why this is an opportunity* is mandatory at creation (schema-enforced: no `why`, no row).

### S5 — Architecture
**Purpose:** the collaborative structure canvas. **Primary action:** build/confirm hubs and spokes. **Primitives:** P1 (AI-suggested structures and pillar proposals reviewed before acceptance; cannibalization checkpoint is a three-option proposal), P4 (hub/spoke nodes open keyword data, linking map, association badges; the summary's pillar-gap flags open the distribution math), P2 (the cannibalization checkpoint renders the overlapping pieces side-by-side).
**Five states:** empty (unassigned clusters in the sidebar + "AI: suggest structure"; truly-empty shows territory ghosts) · loading · populated (canvas + summary panel with pillar distribution and gap flags) · in-progress (structure suggestion computing across clusters) · failed/partial (suggestion failure leaves manual creation fully functional; canvas never blanks).
**Why:** every proposed hub states why this cluster, why this title, why these spokes; every cannibalization flag shows similarity, the overlapping piece, and its live performance where platform data is connected.

### S6 — Publishing Plan
**Purpose:** pacing → sequenced preview with rationale → commit. **Primary action:** Commit to Calendar (→ strategic approval). **Primitives:** P1 (the commit is the canonical propose→review→approve moment: preview, approval, Program registration), P4 (every placed piece's date opens its sequencing rationale; every phase opens its strategy; pace projections open their arithmetic).
**Five states:** empty (no architecture yet → route back, with the why) · loading · populated (pace selector with honest framing; the phased sequence; drag/reorder/blackout controls) · in-progress (recompute after a pace change; pending approval renders the awaiting-decision state with the card deep-link) · failed/partial (Program registration unavailable (ask #8 interim) → commits to `dm_calendar` with the difference stated, not hidden).
**Why:** the rules panel shows which sequencing rules are active and lets the user override each; "why is this piece on this date" is answerable for every piece — the PATCH-001 law.

### S7 — Corpus Map
**Purpose:** the org's content as navigable structure; the shared canvas for the intelligence layer. **Primary action:** investigate (hover/click → side panel → act: open, refresh, sweep links). **Primitives:** P4 (overlays *are* evidence renderings: cohesion scores per cluster, drift with its centroid math, orphan lists).
**Five states:** empty (territory centroids as ghost structure — "your first pieces appear here") · loading (positions from snapshot; "map updated weekly" stamp) · populated (nodes, bonds, overlays toggleable; traffic sizing only with platform GA4/GSC connected, stated otherwise) · in-progress (post-import re-projection running; stale positions banner) · failed/partial (pgvector unavailable → the map is feature-flagged off with the honest explanation, not a broken view).
**Why:** every overlay score opens its computation; the drift flag names the drifting pieces and the nearest territory.

### S8 — Link Sweep
**Purpose:** the backward-linking queue. **Primary action:** approve suggestions (batched per target piece → `dm_update_article`). **Primitives:** P1 + P2 (each suggestion is a proposal rendered as a diff: the exact insertion sentence with the link in place), P4 (similarity, rationale, the chunk it matched).
**Five states:** empty ("suggestions appear when new pieces publish"; post-import full-sweep CTA) · loading · populated (queue grouped by new piece, then by target; approve / edit anchor / skip; approve-all scoped to DM-managed) · in-progress (sweep running with candidate counts) · failed/partial (legacy targets → manual-export checklist with the why: "Dark Madder never modifies pages you haven't handed over").
**Why:** every suggestion's rationale is mandatory; batch approvals state exactly which live pieces change and that one approval covers one target piece's batch.

### S9 — Campaigns
**Purpose:** campaign intake and association management. **Primary action:** complete sections / associate pieces. **Primitives:** P1 (intake section confirmations), P4 (readiness % opens the section breakdown; association badges open generation-effect explanations: "mention level — the product appears as one option among several").
**Five states:** empty (what campaigns change about generation, with an example) · loading · populated (campaign list with readiness, timeline, associated pieces) · in-progress (AI-assist drafting a section) · failed/partial (incomplete campaigns generate with defaults for missing soft dimensions, stated on associated briefs).
**Why:** every campaign-affected draft can answer "why this tone/CTA" — the campaign association and its fields, in the drawer.

---

## 8. Standalone mode

The full spine works standalone — research is a first-hour standalone flow:

- **SEO data:** the DataForSEO platform integration is available to standalone accounts (they hold Kinetiks IDs — ask #2's explicit requirement). Until it ships, the honest-degradation mode applies in both modes equally: LLM-derived territories, explicit no-volume evidence states, never fabricated numbers, opportunity ranking on corpus-gap and competitive signals.
- **Empty Cortex:** Discovery prompts for minimum viable context (org + one product) and routes to the trainer first (integration §9) — the trainer is the fill mechanism, and a standalone first hour naturally runs trainer → discovery in sequence. The conversation carries the full weight that Cortex pre-seeding carries in activated mode; the *flow* is identical, only the opener differs.
- **Lexicon inputs** work identically (the trainer is fully standalone).
- **Commit:** `dm_calendar`, identical UI semantics, no Program registration; the in-app approval surface handles the commit decision (integration §5.7 — significant actions always ask, no strategic type, no central queue). Upgrade backfills Program registration from calendar state per the migration mapping in `specs/data-model.md`.
- **Corpus intelligence** is Cortex-independent: import, embeddings, sweeps, and the map run on the published corpus in either mode (pgvector availability is the only gate).
- **Research signals** are connected-mode inputs (routing events require orchestration); standalone simply has none, and nothing references their absence as an error.
- **Competitive proposals** flow in both modes (Cortex proposals are account-scoped, not orchestration-gated).

---

## 9. Model/task mapping (`@kinetiks/ai` configuration)

Tiering as configuration; no hardcoded model strings. Strategic tier is reserved for the one genuinely strategic judgment in the subsystem.

| Task key | Tier | Used in |
|---|---|---|
| `territory_discovery_conversation` | strategic | §2.2 — business-context judgment; the same bar applies to lexicon-derived territory proposal framing |
| `seed_generation` | standard | §2.2 — structured output from territory + Cortex + vocabulary inputs |
| `semantic_clustering_assist` | standard | §2.3 — cluster naming and intent grouping over embedding pre-groups |
| `opportunity_analysis` | standard | §2.4 — gap synthesis from SERP + corpus + lexicon data |
| `architecture_suggestion` | standard | §2.5 — hub/spoke structure, pillar proposals |
| `differentiation_angle` | standard | §2.5 — distinct-angle constraint for near-duplicate briefs |
| `sequencing_reasoning` | standard | §2.6 — rule application + per-piece rationale prose |
| `brief_generation` | standard | §2.6 |
| `campaign_intake_assist` | standard | §2.8 |
| `link_placement_check` | fast | §2.7 — does this paragraph warrant a link, and where |
| `link_anchor_generation` | fast | §2.7 |
| `legacy_content_extraction` | fast | §2.7 — body extraction when readability parsing is ambiguous |
| `refresh_delta_summarization` | fast | §2.9 — naming significant snapshot changes |

**Embeddings:** `voyage-3-large`, 1024 dimensions, document/query input types — carried from PATCH-003 as configuration (provider swap = config change + re-embed migration). Whether `@kinetiks/ai` routes embedding calls is a platform question → **proposed platform-ask #12** (§10); interim is a DM-local `EMBEDDING_CONFIG` module honoring the same no-hardcoding rule, deleted when the package surface ships.

**Cost controls carried:** content-hash skip on every embed; sweep fast-tier calls only on vector-pre-filtered candidates (distance < 0.25, ~10–30 calls per publish); full-corpus sweep monthly, capped, lowest-priority queue; SEO pulls batched and platform-cached; UMAP server-side on snapshot only.

---

## 10. Platform dependencies and write-backs

**Existing asks this spec depends on:** #2 (DataForSEO + standalone access — degradation per its interim clause, applied in §2.2/§7-S2), #5 (pgvector — feature flag + lexical fallback per its interim clause), #8 (Programs app surfaces — §2.6 commit path; `dm_calendar` interim costs no extra build because it *is* the standalone path), #4 (GA4/GSC tools — map traffic sizing and seed/GSC evidence only; everything degrades to stated absence).

**Proposed addition to `platform-asks.md` — Ask 12: embedding routing in `@kinetiks/ai`.**
*What DM needs:* embedding calls routed through `@kinetiks/ai` configuration the way completion calls are — provider/model/dimensions as config (`voyage-3-large`, 1024, document/query input types), so "no hardcoded model strings" holds for embeddings too. *Why:* the corpus layer re-embeds on provider swap; that must be a config change plus migration, not a code hunt. The knowledge-trainer (rule dedup, lexicon merging) and radar-response (relevance scoring) are second and third consumers. *Suggested owner:* platform (`@kinetiks/ai`); DM-contributed: the config shape and the Voyage client from v1 experience. *If late:* a DM-local `EMBEDDING_CONFIG` module with identical discipline; deleted when the package ships.

**Write-back flags (filed, not silently applied):**
1. `dm-platform-integration.md` §5.2: add a `dm_content_link_insertion` row (quick type) for batched link micro-refreshes via `dm_update_article`, with `change_scope` derived from the actual diff as that section already requires. Interim classification here is review (§5).
2. `platform-asks.md`: append Ask 12; under Ask 3, note that this spec's territory embeddings are the subscription payload radar-response will register (no new ask — a cross-reference).
3. `/api/dm/status` features: additive `legacy_pieces_count` alongside the existing `pgvector_enabled` and `dataforseo_available` flags (Marcus connection-awareness for import and corpus features).

---

## 11. Self-check

| Mandatory section | Present |
|---|---|
| Purpose | §1 |
| Mechanism | §2 |
| Data (dm_* tables, SQL-sketch Data Tables appendix) | §6 |
| Tools exposed (names, consequential flags, Marcus-grade descriptions) | §3 |
| Cortex layers read/written, proposal shapes, evidence requirements | §4 |
| Approval touchpoints and types | §5 |
| Surfaces & Explainability (screens, five states each, evidence, "why", canonical primitives only) | §7 (S1–S9; P1–P4 only) |
| Standalone mode (exact empty-Cortex behavior) | §8 |
| Model/task mapping via `@kinetiks/ai` | §9 |

**Locked decisions:** zero analytics ingestion — all SEO/SERP/GSC/GA4 data via platform tools; snapshots are decision evidence, not caches (§2.3, §2.9) ✓ · calendar as Kinetiks Program — §2.6, §5 ✓ · Cortex canonical — territories read it, competitive proposals feed it, research never forks a private copy of shared layers (§4) ✓ · one approval decision — commit is one strategic approval; link batches are one approval per target piece; no parallel approval surface (§5) ✓ · sensing platform-owned — no DM crawlers; legacy import reads the org's own site only; radar events route elsewhere (§2.7, §2.10) ✓ · single company per account — account-scoped schema throughout (§6) ✓ · standalone-first — §8 ✓ · PATCH-001 wins all conflicts — the spine, scores, and laws are its design; doc 03 contributes only where it was silent ✓.
**No surface without five states** — S1–S9 ✓. **No invented primitives** — P1–P4 only ✓. **New platform dependencies** filed as proposed asks (#12), not assumed — §10 ✓. **Changes to approved docs** flagged for write-back — §5, §10 ✓.

---

*Dark Madder v2 — specs/research-architecture.md — June 2026*
