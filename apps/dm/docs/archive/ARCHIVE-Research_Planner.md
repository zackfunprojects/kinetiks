> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: specs/research-architecture.md (PATCH-001 wins all conflicts)
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# 03 - Research & Planner

## Keyword Research, Cluster Mapping & Content Calendar

**System:** Dark Madder
**Depends on:** 01-DATA-MODEL
**Depended on by:** 04-CONTENT-GENERATOR, 07-ANALYTICS-ADJUSTER

---

## 1. Purpose

The Research & Planner system answers three questions for each org: What should we write about? How should the content be organized? When should each piece be published? It combines automated keyword research with intelligent cluster mapping and a cannibalization-aware editorial calendar.

This system implements the methodology from the Talvi Web Content Strategy doc (the four-step research workflow, hub-and-spoke architecture, and pillar structure) as a repeatable, automated process that works for any org.

---

## 2. Research Pipeline

### 2.1 Data Sources

**Automated (API-driven):**
- **Ahrefs API** or **Semrush API** - keyword volumes, keyword difficulty, SERP features, competitor keyword gaps, backlink data. User provides their own API key during org setup.
- **DataForSEO API** - SERP analysis, People Also Ask extraction, AI Overview detection. More cost-effective for bulk queries.
- **Google Search Console API** - existing ranking data, impressions, clicks, query data for sites already live. Connected via OAuth during org setup.

**Manual input:**
- User can paste in their own keyword lists, topic ideas, or research exports
- User can add competitor domains for gap analysis
- User can flag specific topics or questions they want covered

### 2.2 The Four-Step Automated Workflow

This mirrors the Talvi Web Content Strategy methodology but automates each step.

**Step 1: Seed Query Generation (Automated + User Input)**

When a new org is created (or when the user triggers a research refresh), the system generates seed queries by:

1. Analyzing the org's website content (from the voice onboarding scan) to extract core topics
2. Analyzing the product descriptions to extract use cases and features
3. Combining core topics with intent modifiers across four categories:
   - **How to / Getting started:** "how to [topic]," "best way to [action]"
   - **Does it work / What works:** "does [approach] actually work," "[method A] vs [method B]"
   - **How to participate / Take action:** "[action] near me," "best [tools] for [need]"
   - **Trust & evaluation:** "is [product/approach] legit," "[category] reviews"
4. Presenting the seed list to the user for approval, deletion, or additions

**Implementation:**

```
LLM prompt for seed generation:

You are a content strategist. Given the following organization description and product information, generate 30-50 seed search queries that potential customers would use to find this business through content.

Org: {org.name}
Description: {org.description}
Industry: {org.industry}
Products: {products[].name, description, target_audience}
Website topics: {extracted_topics_from_scan}

For each seed query, categorize it into one of four intent types:
- how_to: People trying to learn or do something
- evaluation: People comparing options or checking if something works
- action: People ready to take a specific action
- trust: People verifying credibility or understanding how something works

Return as JSON array: [{query, intent_type, estimated_relevance: high/medium/low}]
```

**Step 2: Keyword Expansion and Clustering (Automated)**

For each approved seed query:

1. Call the SEO API to pull the full keyword expansion (related keywords, questions, long-tail variations)
2. Pull volume, difficulty, and SERP feature data for each keyword
3. Run automated clustering using the API's clustering feature or a custom LLM-based clustering pass

**Clustering logic:**

```
For a set of expanded keywords, group them into clusters where:
- Keywords in the same cluster can be served by a single piece of content
- Each cluster has one primary keyword (highest volume) and multiple supporting keywords
- A good cluster: 1 primary keyword (500+ volume) + 10-30 long-tail keywords (50-200 volume each)

The long-tail keywords become subheadings, FAQ questions, and semantic depth within the piece.
```

Store each cluster as a `content_clusters` record with all keyword data in the `related_keywords` JSONB field.

**Step 3: SERP and AI Analysis (Automated)**

For each cluster's primary keyword:

1. Call DataForSEO or equivalent for full SERP analysis:
   - Top 10 organic results (title, URL, domain authority)
   - Presence of AI Overview (yes/no + sources cited)
   - Featured snippet (yes/no + type)
   - People Also Ask questions
   - Video carousel presence
2. Run a separate check against AI answer engines:
   - Query Perplexity API (if available) or use web fetch to check if the keyword returns AI-synthesized answers
   - Document which sources get cited
3. Identify content gaps:
   - What questions in this cluster aren't well-answered by existing top results?
   - Where is existing content outdated (check publish dates)?
   - Where is existing content thin (word count, depth of coverage)?

Store in the cluster's `serp_analysis` and `content_gaps` JSONB fields.

**Step 4: Prioritization (Automated + User Review)**

Score each cluster on three dimensions:

| Dimension | High | Medium | Low |
|-----------|------|--------|-----|
| **Search volume** | Primary keyword 1,000+ | 500-999 | Under 500 |
| **Competition** | Top results are weak/outdated (opportunity) | Mixed quality | Top results are strong/recent |
| **Relevance** | Directly related to org's core offering | Adjacent to core offering | Tangential |

Composite score: `(volume_score * 0.3) + (competition_opportunity_score * 0.4) + (relevance_score * 0.3)`

Present the prioritized cluster list to the user. They can adjust scores, reorder priorities, or kill clusters they don't want to pursue.

---

## 3. Content Architecture: Hub-and-Spoke Mapping

### 3.1 Automatic Pillar Assignment

Each cluster gets assigned to a pillar based on its primary intent. The default pillar structure (adaptable per org):

| Pillar | URL Pattern | Intent | Content Types |
|--------|------------|--------|--------------|
| How to Help / Getting Started | `/how-to/[slug]` | Instructional | Hub pages, step-by-step guides |
| What Works / Analysis | `/what-works/[slug]` | Evaluative | Comparison guides, deep dives |
| How to Participate / Action | `/participate/[slug]` | Action-oriented | Playbooks, resource directories |
| Trust & Verification | `/trust/[slug]` | Trust-building | Case studies, methodology explainers |

For orgs that don't fit this exact structure (e.g., DayScore is a productivity tool, not a cause platform), the system generates pillar suggestions based on the org's topic clusters and presents them for user approval.

### 3.2 Hub and Spoke Generation

For each prioritized cluster, the system proposes a content structure:

**Hub page:**
- Title: based on the cluster's primary keyword, phrased as a compelling headline
- Content type: comprehensive guide (2,500-4,000 words)
- Target keyword: the cluster's primary keyword
- Subheadings: derived from the top related keywords, phrased as searchable questions

**Spoke pages:**
- 3-8 spoke pages per hub (depending on cluster depth)
- Each spoke targets a specific long-tail keyword from the cluster
- Content type: focused guide or article (1,200-2,000 words)
- Internal linking: every spoke links to the hub, hub links to all spokes, related spokes cross-link

**Example for a "How to Help Save the Bees" cluster:**

```
HUB: "How to Help Save the Bees: What Actually Works" (2,500 words)
  |
  |-- SPOKE: "Best Native Plants for Pollinators by Region" (1,500 words)
  |-- SPOKE: "Do Bee Hotels Actually Work? What the Research Says" (1,200 words)
  |-- SPOKE: "How to Start a Pollinator Garden in a Small Space" (1,500 words)
  |-- SPOKE: "What's Killing the Bees? Causes, Myths, and Reality" (1,800 words)
  |-- SPOKE: "Best Organizations Working on Bee Conservation" (1,200 words)
```

### 3.3 Cannibalization Prevention

Before any new piece is added to the plan, the system checks:

1. **Keyword map scan:** Does any existing or planned piece target the same primary keyword? If yes, flag the conflict and suggest either: consolidating into one piece, differentiating the angles clearly, or killing the duplicate.
2. **Semantic overlap check:** Run an LLM analysis comparing the new piece's brief against existing pieces in the same cluster. If the overlap is >60%, flag for review.
3. **Internal link audit:** Ensure the new piece has a unique position in the link graph and doesn't create competing paths for the same query.

The keyword map is maintained automatically: every content piece has a `primary_keyword` field, and the system enforces uniqueness at the org level (with a clear error if a user tries to assign a keyword that's already claimed).

---

## 4. Content Calendar Generation

### 4.1 Volume Calculation

The system recommends a publishing cadence based on:

- Number of active clusters
- Total hub + spoke pages needed
- Historical velocity (how fast the user reviews and approves drafts)
- Industry benchmarking (for a new site building authority, 2-4 pieces/week is aggressive but effective; 1-2/week is sustainable for a solo operator)

For v1, the user sets their desired weekly output and the system schedules accordingly.

### 4.2 Sequencing Logic

Content is not published in random order. The sequencing follows these rules:

**Rule 1: Hubs before spokes.** Publish the hub page first (or at least a solid v1 of it), then publish spokes that link back to it. This establishes the topical authority anchor.

**Rule 2: Highest-priority clusters first.** Work through clusters in priority order, completing a hub + 2-3 spokes before moving to the next cluster.

**Rule 3: Cross-pillar variety.** Don't publish five How-To pieces in a row. Mix pillars for a natural content cadence. The calendar should alternate between pillars when possible.

**Rule 4: Seasonal and trending awareness.** If a keyword has seasonal spikes (e.g., "how to help bees" peaks in spring), schedule that cluster's content to publish 6-8 weeks before the peak.

**Rule 5: Internal linking dependencies.** If Piece A needs to link to Piece B, Piece B should be published first (or simultaneously). The calendar resolves these dependencies automatically.

### 4.3 Calendar Output

The system generates a `content_calendar` record for each planning period (monthly by default). It also sets the `scheduled_generate_at` date on each `content_piece` record.

**Calendar view for the user:**
- Monthly grid showing planned pieces by date
- Color-coded by cluster and content type
- Status indicators (planned, generating, draft, in review, approved, published)
- Drag-and-drop rescheduling
- One-click "generate now" for any planned piece

### 4.4 Calendar Adjustments

The calendar is not static. It gets adjusted by:

1. **User action:** Drag a piece to a new date, add new pieces, remove pieces
2. **Analytics adjuster (doc 07):** Monthly recommendations to double down on performing clusters or deprioritize stalled ones
3. **Research refresh:** When new keyword data reveals opportunities, the system can propose calendar additions

All adjustments are logged in the calendar's `adjustments` JSONB field for audit trail.

---

## 5. Content Brief Generation

For each planned piece, before generation day arrives, the system produces a **Content Brief** that serves as the input to the Content Generator (doc 04).

### Brief Contents

```json
{
  "piece_id": "uuid",
  "content_type": "hub",
  "title_suggestions": ["How to Help Save the Bees: What Actually Works", "..."],
  "primary_keyword": "how to help save the bees",
  "secondary_keywords": ["best way to help bees", "bee conservation actions", "..."],
  "target_word_count": 3000,
  "target_url": "/how-to/help-save-the-bees",
  "pillar": "how-to-help",
  "cluster_context": {
    "related_spokes": ["native-plants-pollinators", "do-bee-hotels-work"],
    "internal_links_needed": ["what-works/bee-conservation", "participate/pollinator-garden"]
  },
  "serp_context": {
    "top_results_summary": "Current top results are primarily from large environmental orgs. Most are generic and outdated (2022-2023). Gap: none provide region-specific plant recommendations or address the bee hotel controversy.",
    "ai_overview_present": true,
    "ai_overview_sources": ["EPA.gov", "NWF.org"],
    "people_also_ask": ["Why are bees dying?", "How can I help bees in my backyard?", "Do bee hotels work?", "What flowers help bees the most?"],
    "content_gap_opportunities": ["Region-specific advice", "Honest assessment of bee hotels", "Distinction between native bees and honeybees"]
  },
  "structural_requirements": {
    "ai_hook_in_first_150_words": true,
    "headings_as_searchable_questions": true,
    "definition_boxes_needed": ["native bee", "pollinator corridor", "neonicotinoid"],
    "key_takeaways_section": true,
    "faq_section": true,
    "faq_questions": ["sourced from People Also Ask + Reddit"],
    "internal_links": 5,
    "sources_required": true
  },
  "voice_brief_pointer": "Resolved at generation time from voice profiles"
}
```

---

## 6. Research Refresh Cadence

Keyword data goes stale. The system schedules automatic research refreshes:

- **Monthly:** Re-pull keyword volumes and difficulty for all active clusters. Flag significant changes (>20% volume shift).
- **Quarterly:** Full SERP re-analysis for all active clusters. Check for new competitors, new AI Overview presence, content gap changes.
- **On demand:** User can trigger a full research refresh at any time.

Refresh results are compared against the previous snapshot. Significant changes surface as recommendations in the monthly content health report (doc 07).

---

## 7. User Interface Requirements

### Research Dashboard (per org)

- **Cluster map view:** Visual representation of all clusters, hubs, and spokes with status indicators. Think node graph (fits the molecule aesthetic).
- **Keyword explorer:** Search and filter across all researched keywords with volume, difficulty, and current ranking data.
- **Content gap report:** What opportunities exist that aren't yet in the plan.
- **Competitor tracker:** What competitors are ranking for in your clusters.

### Calendar View (per org)

- **Monthly grid:** Published and upcoming content by date.
- **Pipeline view:** Kanban-style board showing pieces moving through planned > generating > draft > review > approved > published.
- **Cluster progress:** How complete is each cluster (hub published? how many spokes live?).

---

*Dark Madder Specification - 03 Research & Planner - March 2026*
