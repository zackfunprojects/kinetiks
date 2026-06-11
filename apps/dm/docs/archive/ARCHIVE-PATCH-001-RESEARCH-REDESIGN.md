> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: specs/research-architecture.md; its seven failures are product law in dm-product-spec.md
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# PATCH-001: Research Section Redesign

## Dark Madder - Research & Planner Overhaul

**Date:** March 2026
**Applies to:** Phase 3 (Research & Planner)
**Priority:** Critical - this section is the strategic brain of the product
**References:** 03-RESEARCH-PLANNER.md (original spec, partially superseded by this patch)

---

## IMPORTANT: Read Before Implementing

This patch redesigns the Research section substantially. Before making any changes:

1. Read through the ENTIRE patch document first
2. Review the current state of the research section code - pages, components, API routes, database queries
3. Identify what existing work can be kept, adapted, or must be replaced
4. Produce a written plan listing what changes, what stays, and what gets built new
5. Get approval before writing any code

The developer and Claude Code have already made UX improvements to this section (including educational headers explaining what each tab means). Preserve those improvements. This patch builds on top of existing work, not from scratch.

---

## Problem Summary

The research section currently operates as a one-directional pipeline: the system generates seeds from the website scan, clusters them, and pushes output at the user. The user has no meaningful input into the strategic direction of their content, no way to see the data behind decisions, and no collaborative control over the most important architectural decisions (what to write about, how to structure it, when to publish it).

Seven specific failures:

1. **Seeds are too narrow.** They come from the website scan only, producing seeds like "best fintech apps for social impact" but missing the broader authority territories the org wants to own (e.g., "how to support shelter dogs"). The user has no way to shape the strategic direction.

2. **Seeds lack data.** They show tags but no real SEO/AEO data. The user is asked to trust the LLM with no evidence. The SEO APIs are connected but their data isn't surfaced meaningfully.

3. **Clusters are opaque.** They say "7 keywords" but there's no way to expand and see what those keywords are, their volumes, difficulty, or why they were grouped together.

4. **Content Gaps are unclear.** The feature exists but the UX doesn't communicate what the app will do with the gaps or show supporting data.

5. **Hub & Spoke is underbuilt.** This is where the most important content architecture decisions happen, and it's currently auto-generated with no collaborative input. The user can't structure, prioritize, reorder, or visualize their content architecture.

6. **Calendar population is arbitrary.** The system places pieces on random dates with no discussion about volume, pacing, aggression level, or sequencing logic. The user doesn't understand why specific pieces landed on specific dates.

7. **No research home.** There's no overview showing where the org's research stands, what stage they're in, or what needs attention. The user jumps straight into tabs with no orientation.

8. **Calendar "generate" button is disorienting.** Going to a separate Calendar nav item and clicking "generate calendar" doesn't connect to the research flow. Calendar should be populated as the final step of the research process.

---

## Redesigned Architecture

### Navigation Structure

The Research section gets a new tab structure:

```
Research (main nav item)
  |
  |-- Overview (default landing page - the research "home")
  |-- Discovery (replaces "Seeds" - collaborative topic exploration)
  |-- Keywords (enriched clusters with expandable data)
  |-- Opportunities (replaces "Content Gaps" - clearer name, clearer purpose)
  |-- Architecture (replaces "Hub & Spoke" - collaborative content structure builder)
  |-- Publishing Plan (replaces calendar generation - pacing and scheduling decisions)
```

Calendar remains its own top-level nav item, but it gets populated FROM the Publishing Plan step inside Research.

---

## 1. Overview (Research Home)

### Purpose

The landing page when you click "Research" in the main nav. Shows the current state of research for this org at a glance. Orients the user on where they are in the process and what needs attention.

### Design

A single-page dashboard with these sections:

**Research Status Bar**
A horizontal progress indicator showing which stages have been completed:
```
[Discovery] → [Keywords] → [Opportunities] → [Architecture] → [Publishing Plan]
  ✓ Done       ✓ Done       In Progress       Not Started       Not Started
```

Each stage is clickable to jump to that tab. Completed stages show a check. The current stage pulses subtly with the accent color.

**Key Metrics (if research has been run)**
- Total seed topics: [count]
- Total keyword clusters: [count] covering [total keyword count] keywords
- Total search volume across all clusters: [sum]
- Opportunities identified: [count]
- Hubs defined: [count] with [count] spokes planned
- Next scheduled piece: [title, date] (if publishing plan exists)

**Recent Activity**
A short log of recent research actions: "Added 3 new authority territories," "Expanded bee conservation cluster to 34 keywords," "Approved hub structure for shelter dogs."

**Quick Actions**
- "Start Discovery" (if no research yet)
- "Add New Territory" (opens Discovery in add-territory mode)
- "Review Opportunities" (jumps to Opportunities tab)
- "View Publishing Plan" (jumps to Publishing Plan tab)

### Implementation Notes

This is a new page. No existing page to modify. Build it as the default view when navigating to the Research section.

---

## 2. Discovery (Replaces Seeds)

### The Core Problem Being Solved

The current seed generation is a one-shot process: scan website, generate seeds, done. This misses the most important input: what the human knows about their audience and what authority territories they want to own. A B2B SaaS company's website talks about their product, but their content strategy might need to cover industry trends, buyer education, and adjacent topics that aren't on the website at all.

### Redesigned Flow

Discovery is a **conversational, iterative process** with three components that work together:

#### 2.1 Authority Territories

Before generating any seeds, the system needs to understand what broad territories the org wants to own. This is the strategic layer above individual keywords.

**Initial setup (first time):**

The system presents a conversational UI (not a form, not a wizard - a chat-like back-and-forth in a dedicated panel):

```
Dark Madder: I've scanned [domain] and understand your brand. Let me ask a few
questions to map out where you want to build authority.

Based on your site, I see you're positioned around: [2-3 territories extracted
from voice profile and website scan]

1. What topics should someone associate your brand with? Not your product
   specifically - the broader knowledge areas where you want to be the
   trusted expert.

2. Who is your ideal reader? What are they searching for when they don't
   know your product exists yet?

3. Are there adjacent spaces you want to own that aren't on your website
   today? For example, a fintech app might want to be an authority on
   financial literacy even though their site only talks about the product.
```

The user responds conversationally. The AI synthesizes their answers into a list of **Authority Territories** - broad thematic areas that will each generate multiple clusters.

**Example for Talvi:**
- Cause-specific guidance (how to help bees, coral reefs, shelter animals, food insecurity, affordable housing)
- Effective giving and charity evaluation
- Micro-philanthropy and round-up mechanics
- Impact measurement and transparency
- Environmental science explainers for non-scientists

Each territory shows up as a card with:
- Territory name
- Brief description (1-2 sentences)
- Estimated search potential (aggregate volume from a quick API check on 3-5 representative queries)
- Relevance score to the org
- Status: Active / Paused / Exploring

**The user can:**
- Edit territory names and descriptions
- Add new territories at any time (not just during initial setup)
- Pause territories (stops generating seeds for them, but keeps existing work)
- Delete territories
- Re-open the conversational flow to explore new directions

**Implementation:**

New database table or JSONB field on the org:

```sql
CREATE TABLE authority_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'exploring')),
  estimated_volume INT,        -- Aggregate volume from representative queries
  relevance_score FLOAT,       -- AI-assessed relevance to org
  source TEXT,                 -- 'website_scan', 'user_input', 'ai_suggested'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

The conversational UI can be a simple chat component (not full chat infrastructure - just alternating user/AI messages stored in component state, with the final output being the territories). Use Opus for this conversation since it's strategic and nuanced.

#### 2.2 Seed Generation (Data-Backed)

Once territories are defined, seeds are generated PER TERRITORY with real SEO data attached.

**For each active territory, the system:**

1. Uses the LLM to generate 10-20 candidate seed queries based on the territory description, ICP data, and org context
2. Immediately runs each candidate through the SEO API to pull: monthly search volume, keyword difficulty, CPC (as a proxy for commercial intent), SERP features present, trend direction (rising/falling/stable)
3. Filters out seeds with zero volume or extremely high difficulty (configurable thresholds)
4. Presents the enriched seeds to the user, sorted by a composite score of volume + relevance + opportunity

**Each seed card shows:**
```
┌─────────────────────────────────────────────────────────────┐
│ "how to help shelter dogs"                                  │
│                                                             │
│ Volume: 2,400/mo    Difficulty: 34/100    Trend: ↑ Rising   │
│ CPC: $0.45          SERP Features: PAA, AI Overview         │
│ Territory: Cause-specific guidance                          │
│                                                             │
│ [Include] [Exclude] [Research Deeper]                       │
└─────────────────────────────────────────────────────────────┘
```

**"Research Deeper"** triggers a more thorough API pull: full keyword expansion, People Also Ask questions, related queries, competitor content analysis. This data feeds directly into the Keywords tab when the user moves forward.

**The user can:**
- Include or exclude individual seeds
- Add their own seed queries manually (with instant API data lookup)
- Sort/filter by volume, difficulty, territory, trend
- Bulk select by territory
- Request "Generate more seeds for [territory]" to get additional suggestions

**Key difference from current:** Every seed has real data visible. Nothing is "trust the LLM." If a seed has 0 volume, the user sees that and can make an informed decision about whether to pursue it anyway (some topics are worth creating content for even without current search demand - that's an AEO play for emerging queries).

#### 2.3 Discovery Summary

Before moving to Keywords, show a summary:
- [X] territories defined
- [Y] seeds selected across [Z] total monthly search volume
- Top 5 seeds by volume
- Any territories with few/no seeds selected (potential gap)
- "Proceed to Keywords" button that triggers the clustering process

---

## 3. Keywords (Enriched Clusters)

### The Core Problem Being Solved

Clusters currently say "7 keywords" with no way to see what they are. The user can't evaluate whether a cluster makes sense, whether it's worth pursuing, or how it relates to their authority territories.

### Redesigned Cluster View

#### 3.1 Cluster List

Each cluster card in the list view shows:

```
┌─────────────────────────────────────────────────────────────┐
│ 🟢 How to Help Shelter Dogs                                │
│ Territory: Cause-specific guidance                          │
│                                                             │
│ Primary keyword: "how to help shelter dogs"                 │
│ Volume: 2,400/mo     Difficulty: 34     Keywords: 23        │
│ Combined volume: 8,750/mo                                   │
│ AI Overview present: Yes                                    │
│ Opportunity score: 87/100                                   │
│                                                             │
│ [Expand] [Edit] [Archive]                                   │
└─────────────────────────────────────────────────────────────┘
```

The **opportunity score** is a computed composite: volume (30%) + competition gap (40%) + relevance (30%). Show the formula in a tooltip so the user understands it. This replaces the vague "priority score" with a transparent calculation.

#### 3.2 Expanded Cluster Detail

Clicking "Expand" (or clicking the cluster card) opens a detail view showing ALL keywords in the cluster:

```
HOW TO HELP SHELTER DOGS
Territory: Cause-specific guidance
─────────────────────────────────────────────────

Primary keyword: "how to help shelter dogs"
  Volume: 2,400/mo | Difficulty: 34 | CPC: $0.45 | Trend: ↑

Related keywords (22):
┌──────────────────────────────────────┬────────┬──────┬───────┐
│ Keyword                              │ Volume │ Diff │ Trend │
├──────────────────────────────────────┼────────┼──────┼───────┤
│ how to volunteer at animal shelter    │ 1,900  │ 28   │ →     │
│ best ways to help dogs in shelters    │ 880    │ 31   │ ↑     │
│ what do animal shelters need most     │ 720    │ 22   │ ↑     │
│ dog shelter volunteer requirements    │ 590    │ 19   │ →     │
│ how to foster shelter dogs            │ 480    │ 25   │ ↑     │
│ ...                                  │        │      │       │
└──────────────────────────────────────┴────────┴──────┴───────┘

People Also Ask:
• What is the best way to help dogs in shelters?
• How can I help my local animal shelter without money?
• Is volunteering at an animal shelter worth it?
• What do shelter dogs need most?

SERP Analysis:
• Top 3 results: ASPCA.org, Humane Society, BarkPost
• Content quality: Generic, outdated (2022-2023)
• Gap: No results cover fostering logistics or non-monetary help in depth

AI Overview:
• Present for primary keyword: Yes
• Sources cited: ASPCA, Humane Society
• Gap: No citation for foster-specific guidance
```

**The user can:**
- Remove individual keywords from a cluster
- Move keywords between clusters
- Split a cluster into two
- Merge two clusters
- Add manually researched keywords to a cluster
- Sort the keyword table by any column

---

## 4. Opportunities (Replaces Content Gaps)

### The Core Problem Being Solved

"Content Gaps" is a label that doesn't tell the user what happens next. The user sees gaps but doesn't know: what will the app do with these? How confident is the assessment? What's the potential upside?

### Redesigned Opportunities View

Rename to **Opportunities** - a more action-oriented framing.

Each opportunity is a specific, actionable finding with clear data and a clear next step.

#### Opportunity Card

```
┌─────────────────────────────────────────────────────────────┐
│ 🟡 OPPORTUNITY                                              │
│                                                             │
│ "Non-monetary ways to help shelter dogs"                    │
│                                                             │
│ Why this is an opportunity:                                 │
│ 3 of the top 5 results for "how to help shelter dogs"       │
│ focus exclusively on donations. Reddit threads show strong   │
│ demand for non-monetary options (volunteering, fostering,    │
│ supplies). No comprehensive guide exists.                    │
│                                                             │
│ Estimated value:                                            │
│ Combined volume of related queries: 3,200/mo                │
│ Current best result: Thin ASPCA listicle (400 words, 2021)  │
│ Difficulty to rank: Low (28/100)                            │
│ AI citation potential: High (clear Q&A opportunity)         │
│                                                             │
│ Suggested action:                                           │
│ Create a spoke page under "How to Help Shelter Dogs" hub     │
│ targeting "how to help shelter dogs without money"           │
│                                                             │
│ Related cluster: How to Help Shelter Dogs                    │
│                                                             │
│ [Add to Architecture] [Dismiss] [Research More]              │
└─────────────────────────────────────────────────────────────┘
```

**Key changes from current:**
- Every opportunity has a clear "why" with data
- Every opportunity has a suggested action (create a hub, create a spoke, add to existing cluster)
- "Add to Architecture" directly creates the piece in the hub-and-spoke structure
- "Research More" triggers deeper API analysis on the opportunity
- "Dismiss" removes it from the list (with an optional reason for learning)

**Opportunity sources:**
- Keyword gaps (high-volume queries in the org's territories with no strong existing content)
- SERP weakness (top results are thin, outdated, or generic)
- AI citation gaps (AI engines are answering queries in the org's territory but citing weak sources)
- Reddit/PAA demand (questions being asked that nobody answers well)

---

## 5. Architecture (Replaces Hub & Spoke)

### The Core Problem Being Solved

This is the single most important page in the entire Research section. It's where the user defines what content gets created and how it's structured. Currently it's auto-generated and non-collaborative. It needs to be a visual, interactive workspace where the user and the AI build the content architecture together.

### Redesigned Architecture View

#### 5.1 The Visual Canvas

The main view is a visual node graph (fits the molecule aesthetic perfectly). Each hub is a large node. Each spoke is a smaller node connected to its hub. Clusters that aren't yet assigned to a hub appear in a sidebar.

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  UNASSIGNED CLUSTERS (sidebar)        CONTENT ARCHITECTURE          │
│  ┌──────────────────────┐                                           │
│  │ Effective Giving     │             ┌───────────────┐             │
│  │ Vol: 12,400          │        ┌────│  How to Help  │────┐        │
│  │ [Create Hub]         │        │    │ Shelter Dogs  │    │        │
│  ├──────────────────────┤        │    │  (Hub - Draft)│    │        │
│  │ Impact Measurement   │        │    └───────────────┘    │        │
│  │ Vol: 3,200           │        │           │             │        │
│  │ [Create Hub]         │    ┌───┴───┐  ┌───┴───┐   ┌───┴───┐     │
│  └──────────────────────┘    │Volun- │  │Foster │   │Non-$  │     │
│                              │teering│  │Guide  │   │Help   │     │
│                              │(Spoke)│  │(Spoke)│   │(Spoke)│     │
│                              └───────┘  └───────┘   └───────┘     │
│                                                                     │
│              ┌───────────────┐                                      │
│         ┌────│  How to Help  │────┐                                 │
│         │    │  Save Bees    │    │                                 │
│         │    │  (Hub - Live) │    │                                 │
│         │    └───────────────┘    │                                 │
│         │           │             │                                 │
│     ┌───┴───┐  ┌───┴───┐   ┌───┴───┐                              │
│     │Native │  │Bee    │   │Garden │                              │
│     │Plants │  │Hotels │   │Guide  │                              │
│     │(Live) │  │(Draft)│   │(Plan) │                              │
│     └───────┘  └───────┘   └───────┘                              │
│                                                                     │
│  [+ Add Hub Manually]  [AI: Suggest Structure]  [Zoom] [Filter]    │
└─────────────────────────────────────────────────────────────────────┘
```

This is the molecule visualization. Hubs are the heavy atoms. Spokes are bonded elements. The visual directly communicates the content architecture.

#### 5.2 Hub Creation

The user creates hubs in two ways:

**From unassigned clusters:** Click "Create Hub" on a cluster in the sidebar. The system proposes:
- Hub title (phrased as a compelling headline, not just the keyword)
- Target keyword
- Recommended word count
- Pillar assignment
- 3-5 proposed spoke topics (each with keyword, volume, and rationale)

The user can modify everything before confirming.

**AI-suggested structure:** Click "AI: Suggest Structure" and the system analyzes all unassigned clusters and proposes a complete hub-and-spoke structure across them. The user reviews, modifies, accepts, or rejects each proposed hub.

**Manual creation:** Click "+ Add Hub Manually" to create a hub from scratch, optionally linking it to a cluster.

#### 5.3 Spoke Management

Each hub can be expanded (click the hub node) to show its spokes in detail:

```
HUB: How to Help Shelter Dogs
Primary KW: "how to help shelter dogs" | 2,400/mo | Diff: 34
Target: 3,000 words | Pillar: How to Help
Status: Draft
────────────────────────────────────

SPOKES (4 defined):

1. "How to Volunteer at an Animal Shelter: The Complete Guide"
   KW: "how to volunteer at animal shelter" | 1,900/mo | Diff: 28
   Target: 1,500 words | Status: Planned
   [Edit] [Remove] [↑ Move Up] [↓ Move Down]

2. "How to Foster Shelter Dogs: What You Need to Know"
   KW: "how to foster shelter dogs" | 480/mo | Diff: 25
   Target: 1,500 words | Status: Planned
   [Edit] [Remove] [↑ Move Up] [↓ Move Down]

3. "How to Help Shelter Dogs Without Spending Money"
   KW: "help shelter dogs without money" | 320/mo | Diff: 19
   Target: 1,200 words | Status: Planned
   (Added from Opportunities)
   [Edit] [Remove] [↑ Move Up] [↓ Move Down]

4. "What Do Animal Shelters Actually Need? A Realistic Guide"
   KW: "what do animal shelters need most" | 720/mo | Diff: 22
   Target: 1,200 words | Status: Planned
   [Edit] [Remove] [↑ Move Up] [↓ Move Down]

[+ Add Spoke]  [AI: Suggest More Spokes]

INTERNAL LINKING MAP:
  All spokes → this hub
  This hub → "Effective Giving" hub (cross-pillar, when built)
  Spoke 1 → Spoke 2 (volunteering → fostering natural progression)
```

**The user can:**
- Reorder spokes (drag-and-drop or arrow buttons)
- Add spokes manually or via AI suggestion
- Edit any spoke's title, keyword, target word count
- Remove spokes
- See the internal linking map and modify it
- Set the publishing priority order (which spoke gets written first)

#### 5.4 Architecture Summary

Below the visual canvas, a summary panel shows:

```
ARCHITECTURE SUMMARY
─────────────────────
Hubs defined: 3          Spokes planned: 14
Total pieces: 17         Est. total word count: ~32,000
Combined search volume: 34,200/mo
Unassigned clusters: 2

Pillar distribution:
  How to Help: 2 hubs, 8 spokes
  What Works: 1 hub, 4 spokes
  Trust & Verification: 0 hubs (gap!)
  How to Participate: 0 hubs (gap!)

[Proceed to Publishing Plan →]
```

The pillar distribution actively flags gaps. If an entire pillar has no hubs, that's a strategic blind spot.

---

## 6. Publishing Plan (Replaces Calendar Generation)

### The Core Problem Being Solved

The current flow takes the hub-and-spoke structure and dumps it onto random calendar dates with no user input on volume, pacing, or sequencing rationale. The user doesn't know why piece X is on Tuesday and piece Y is on Thursday, or why 3 pieces per week and not 1 or 5.

### Redesigned Publishing Plan Flow

This is the bridge between Research and Calendar. It's a guided, collaborative step - not an auto-generate button.

#### 6.1 Pacing Configuration

First, the system asks the user to set their content pace:

```
PUBLISHING PACE
─────────────────────

How aggressively do you want to publish?

[Conservative]     [Moderate]        [Aggressive]
1 piece/week       2-3 pieces/week   4-5 pieces/week
~4 pieces/month    ~10 pieces/month  ~18 pieces/month
Best for: solo     Best for: small   Best for: dedicated
operators with     team or solo w/   content teams or
limited review     dedicated content AI-first workflows
bandwidth          time

Your architecture has 17 total pieces planned.

At Conservative pace: ~4 months to complete
At Moderate pace: ~7 weeks to complete
At Aggressive pace: ~4 weeks to complete

Selected pace: [dropdown or click to select]
```

#### 6.2 Sequencing Preview

After selecting pace, the system proposes a sequence with clear reasoning:

```
PROPOSED PUBLISHING SEQUENCE
─────────────────────────────

The system follows these rules (adjustable):
✓ Hubs publish before their spokes
✓ Highest-opportunity clusters go first
✓ Cross-pillar variety (alternate between pillars)
✓ No more than 2 pieces from the same cluster in a row

PHASE 1 (Weeks 1-2): Foundation
Rationale: Publish highest-volume hubs first to establish authority anchors.

  Week 1:
  ├ Mon Mar 24: "How to Help Shelter Dogs" (Hub, 3,000w)
  │              Vol: 2,400/mo | This is your highest-opportunity hub.
  │              Publishing first gives spokes something to link back to.
  │
  └ Thu Mar 27: "How to Help Save the Bees" (Hub, 3,000w)
                 Vol: 4,100/mo | Second-highest volume cluster.

  Week 2:
  ├ Mon Mar 31: "How to Volunteer at an Animal Shelter" (Spoke → Shelter Dogs)
  │              Vol: 1,900/mo | Highest-volume spoke in the shelter cluster.
  │              Links back to shelter dogs hub immediately.
  │
  └ Thu Apr 3:  "Best Native Plants for Pollinators" (Spoke → Bees)
                 Vol: 1,200/mo | Cross-cluster variety.

PHASE 2 (Weeks 3-4): Build Depth
Rationale: Add spokes to strengthen the two foundation hubs.

  Week 3:
  ├ Mon Apr 7: "How to Foster Shelter Dogs" (Spoke → Shelter Dogs)
  │             ...
  ...

[Each piece shows: title, type, word count, volume, and a 1-line rationale
for why it's placed where it is]
```

**The user can:**
- Change the pace (recomputes the entire schedule)
- Drag pieces to different dates
- Reorder the sequence
- Remove pieces from the schedule (they stay in Architecture but aren't scheduled)
- Add buffer days or blackout dates ("don't schedule anything the week of April 14")
- Override the sequencing rules (e.g., "I want all shelter dog content done before moving to bees")
- Adjust the publishing days (default Mon/Thu, but configurable)

#### 6.3 Commit to Calendar

Once the user is satisfied with the publishing plan:

```
READY TO COMMIT
─────────────────

This will:
• Create 17 content pieces in your calendar
• Set generation dates (drafts auto-generate 3 days before publish date)
• First draft will generate: March 21
• Last piece publishes: May 8

[Commit to Calendar]    [Save as Draft]    [Back to Edit]
```

"Commit to Calendar" pushes all pieces to the Calendar section with their scheduled generation and publish dates. The Calendar nav item now shows populated data.

"Save as Draft" saves the plan without committing - the user can come back and modify later.

---

## 7. Technical Implementation Notes

### New Database Table

```sql
CREATE TABLE authority_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'exploring')),
  estimated_volume INT,
  relevance_score FLOAT,
  source TEXT DEFAULT 'user_input',
  conversation_history JSONB,  -- Store the discovery conversation for context
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Modified Tables

**content_clusters:** Add `territory_id UUID REFERENCES authority_territories(id)` to link clusters to their parent territory.

**content_pieces:** Ensure `scheduled_generate_at` is set to 3 days before the intended publish date (configurable) when the publishing plan is committed.

### New API Routes

```
POST   /api/research/territories          -- Create territory
PUT    /api/research/territories/[id]      -- Update territory
DELETE /api/research/territories/[id]      -- Delete territory
POST   /api/research/territories/discover  -- AI conversation for territory discovery
POST   /api/research/seeds/generate        -- Generate seeds for a territory (with SEO data)
POST   /api/research/seeds/research-deeper -- Deep research on a specific seed
POST   /api/research/clusters/expand       -- Get full keyword data for a cluster
POST   /api/research/opportunities/detect  -- Analyze clusters for opportunities
POST   /api/research/architecture/suggest  -- AI suggests hub-and-spoke structure
POST   /api/research/publishing/preview    -- Generate publishing sequence preview
POST   /api/research/publishing/commit     -- Commit plan to calendar
```

### Model Usage (Reference 11-MODEL-STRATEGY.md)

- Territory discovery conversation: **Opus** (strategic, nuanced, needs to understand business context)
- Seed generation from territories: **Sonnet** (structured output from clear inputs)
- Opportunity analysis: **Sonnet** (analytical, data-driven)
- Hub-and-spoke structure suggestion: **Sonnet** (structural, pattern-matching)
- Publishing sequence reasoning: **Sonnet** (rule-based with natural language explanation)

### SEO API Calls

Every seed must have real data before being shown to the user. The flow:

1. LLM generates candidate seed queries
2. Batch API call to SEO tool for volume, difficulty, CPC, trend for all candidates
3. Filter candidates with zero volume (but still show them with a "0 volume" badge - the user might want them for AEO reasons)
4. Present enriched seeds to user

For cluster expansion, pull the full keyword list from the SEO API and display in the sortable table.

For opportunity detection, combine: SEO API SERP analysis (who ranks, content quality assessment), PAA questions from the API, and LLM analysis of the gaps between what's ranking and what the org could provide.

---

## 8. UX Principles for This Section

### Everything Has Data

No card, no cluster, no seed, no opportunity should ever appear without supporting data. If the SEO API returns data, show it. If the data is unavailable, say "No data available" explicitly rather than hiding the field.

### Every Decision Is Explained

When the system proposes something (a seed, a cluster structure, a publishing date), it should show WHY. "This piece is scheduled for Monday because hubs publish before spokes and this cluster has the highest opportunity score." The user should never wonder "why is this here?"

### The User Has the Final Word

Auto-generation is fine as a starting point. But the user must be able to modify, override, reorder, add, and remove anything. The AI proposes, the human disposes.

### Progressive Disclosure

Don't dump all data at once. Show summary metrics on cards. Let the user click "Expand" to see the full keyword table. Let them click "Research Deeper" to trigger a more thorough analysis. Respect their attention.

### The Flow Is Resumable

The user can leave at any stage and come back. The Overview page shows where they left off. They don't have to complete Discovery before looking at Keywords if they already have seeds from a previous session.

---

## 9. What to Keep From Current Implementation

Before implementing this patch, verify what exists and preserve:

- **Educational headers** on tabs explaining what each section means - keep these, update text to match new tab names
- **SEO API integration** - keep all API connection code, reuse for the enriched data displays
- **Cluster creation logic** - the clustering algorithm likely works fine, just needs better display
- **Any existing UI components** (cards, tables, status indicators) - reuse where they fit
- **Database schema for content_clusters, content_pieces** - extend, don't replace

---

## 10. Implementation Order

Build this patch in this order:

1. **New database work** - authority_territories table, add territory_id to content_clusters
2. **Overview page** - the research home (lightweight, can be a placeholder that fills in as other pieces ship)
3. **Discovery** - authority territories + enriched seeds (this changes the foundation of everything downstream)
4. **Keywords** - enriched cluster view with expandable detail (mostly a UI improvement on existing data)
5. **Opportunities** - new opportunity cards with data and actions
6. **Architecture** - the collaborative hub-and-spoke builder (most complex new UI)
7. **Publishing Plan** - pacing configuration + sequencing preview + commit to calendar

Test the full flow end-to-end after step 7: Discovery → Keywords → Opportunities → Architecture → Publishing Plan → verify Calendar is populated correctly.

---

*Dark Madder PATCH-001 - Research Section Redesign - March 2026*
