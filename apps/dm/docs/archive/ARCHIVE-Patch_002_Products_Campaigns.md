> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: platform-asks.md (Cortex Products schema extension) and specs/research-architecture.md (campaigns)
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# PATCH-002: Products & Campaigns Expansion

## Deep Product Profiles, Campaign Entity & Content Architecture Integration

**Date:** March 2026
**Applies to:** Phase 1 (Data Model), Phase 2 (Voice Engine), Phase 3 (Research & Planner)
**Priority:** High - content quality ceiling is constrained until the AI has deep product knowledge
**References:** 01-DATA-MODEL.md, 02-VOICE-ENGINE.md, 03-RESEARCH-PLANNER.md, PATCH-001

---

## IMPORTANT: Read Before Implementing

1. Read through the ENTIRE patch document first
2. Review the current Products implementation - database schema, pages, components, API routes
3. Check what the current product creation form collects and how product data is used in voice profiles and content generation
4. Produce a written plan listing what changes, what gets migrated, and what gets built new
5. Get approval before writing any code

This patch makes database schema changes. Migration of existing product records must be handled carefully.

---

## Problem Summary

**Products are too shallow.** The current product intake collects a name, description, target audience, key features, and differentiators. That's enough for a CRM record, not enough for an AI to write like a genuine product expert. An expert writer knows the mechanism, the problem space at depth, the competitive landscape with honest positioning, the objections people actually raise, the origin story, the specific language rules, and the current state vs. what's coming. Without this, the AI produces surface-level content that sounds like it read the landing page once.

**Campaigns don't exist.** A company runs things that aren't products but need their own content context - a product launch, a seasonal push, a partnership announcement, an awareness campaign. These have goals, timelines, target audiences that may differ from the org's overall ICP, key messages, and their own voice adjustments. Currently there's no way to represent this.

**Content architecture doesn't connect to products/campaigns.** The hub-and-spoke structure lives at the org level (which is correct - Talvi's authority on shelter dogs is Talvi's authority). But individual content pieces within that architecture need to know which product(s) they integrate and which campaign(s) they serve, because that changes the voice layer, the integration depth, the CTA, and the specific knowledge the AI draws on during generation.

---

## 1. Expanded Product Profile

### What the AI Needs to Write Like an Expert

The product profile is not a form to fill out once and forget. It's the knowledge base that gets injected into every content generation prompt where this product is relevant. The depth of this profile directly determines the quality ceiling of the content.

### 1.1 Product Schema (Replaces Current)

```sql
-- Drop or migrate the existing products table to this expanded schema
-- Preserve existing records by mapping: name, slug, description, target_audience,
-- key_features, differentiators into the new structure

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,                          -- "Talvi Round-Up App"
  slug TEXT NOT NULL,
  tagline TEXT,                                -- One-line positioning statement
  status TEXT DEFAULT 'active' CHECK (status IN ('concept', 'building', 'beta', 'live', 'sunset')),

  -- The Problem Space
  -- (This is what lets the AI write about the problem WITHOUT mentioning the product)
  problem_statement TEXT,                      -- The core problem this solves, in 2-3 sentences
  problem_depth JSONB,                         -- Array of deeper problem dimensions:
                                               -- [{dimension, description, who_it_affects, severity}]
                                               -- e.g., "Donor fatigue" / "People want to help but feel
                                               -- overwhelmed by the number of causes" / "Millennials and
                                               -- Gen Z with giving intent but decision paralysis" / "high"
  world_without_product TEXT,                  -- What does the user's world look like before this product?
                                               -- Paint the picture the AI needs to empathize with.

  -- The Mechanism
  -- (How it actually works - step by step, not marketing-speak)
  how_it_works TEXT,                           -- Plain-language explanation of the core mechanism
  how_it_works_steps JSONB,                    -- Array of [{step_number, title, description}]
                                               -- e.g., Step 1: "Link your debit card" / "Talvi connects
                                               -- to your bank via Plaid. No access to move money -
                                               -- read-only transaction data only."
  technical_details TEXT,                      -- For products where technical depth matters:
                                               -- architecture, APIs, integrations, data handling
  key_features JSONB,                          -- Array of [{name, description, why_it_matters}]
                                               -- "why_it_matters" forces the feature to be tied to a benefit

  -- The User
  target_audience TEXT,                        -- Primary audience description
  user_personas JSONB,                         -- Array of detailed personas:
                                               -- [{name, description, pain_points, goals,
                                               --   objections, where_they_hang_out, search_behavior}]
                                               -- e.g., "Casual Giver" / "Wants to help but doesn't
                                               -- research charities or set up recurring donations" /
                                               -- ["Doesn't trust where donations go", "Feels too small
                                               -- to make a difference"] / ["Feel connected to causes
                                               -- without guilt"] / ["It's just rounding up pennies -
                                               -- does that even matter?"] / ["r/personalfinance,
                                               -- TikTok, Instagram"] / ["best way to donate small
                                               -- amounts", "apps that donate for you"]
  user_journey TEXT,                           -- How does someone go from not knowing about this
                                               -- to being an active user? The narrative arc.

  -- Positioning & Competition
  differentiators JSONB,                       -- Array of [{claim, evidence, vs_what}]
                                               -- "claim" is the differentiator, "evidence" is
                                               -- the proof, "vs_what" is what it's compared against
  competitive_landscape JSONB,                 -- Array of [{competitor_name, what_they_do,
                                               --   how_we_differ, where_they_win, where_we_win}]
                                               -- Honest positioning. Not marketing - the AI needs to
                                               -- know where competitors are genuinely strong too,
                                               -- so it can write credible comparison content.
  positioning_statement TEXT,                  -- "For [audience] who [need], [product] is a [category]
                                               -- that [key benefit]. Unlike [alternative], we [difference]."

  -- Objections & Honest Answers
  common_objections JSONB,                     -- Array of [{objection, honest_answer, evidence}]
                                               -- e.g., "Rounding up pennies can't actually make a
                                               -- difference" / "Individual round-ups are small, but
                                               -- aggregated across thousands of users the impact is
                                               -- meaningful. In our first quarter..." / "link to impact data"
                                               -- The AI uses these for FAQ sections, comparison content,
                                               -- and naturally addressing skepticism in guides.

  -- Origin & Story
  origin_story TEXT,                           -- Why does this product exist? What frustration or
                                               -- insight led to building it? This gives the AI
                                               -- narrative material for thought leadership content.
  founding_insight TEXT,                       -- The single core insight that makes this product
                                               -- make sense. One sentence.

  -- Current State & Roadmap
  current_state TEXT,                          -- What's true TODAY. What's live, what works, what's
                                               -- the honest current capability. The AI must never
                                               -- overstate what the product can do right now.
  known_limitations TEXT,                      -- What the product doesn't do well yet. Honesty here
                                               -- prevents the AI from making claims it shouldn't.
  roadmap_public JSONB,                        -- Array of [{feature, timeline, description}]
                                               -- Only things safe to reference publicly.
                                               -- The AI can hint at "coming soon" but never promise dates
                                               -- unless explicitly marked as public.

  -- Language Rules
  terminology JSONB,                           -- Array of [{term, definition, usage_note}]
                                               -- What does the product call things? "Builds" not
                                               -- "donations." "Round-ups" not "micro-donations."
                                               -- "Causes" not "charities."
  banned_terms JSONB,                          -- Array of [{term, reason}]
                                               -- Product-specific banned language beyond org-level bans.
  approved_descriptions JSONB,                 -- Array of [{context, approved_text}]
                                               -- Pre-approved ways to describe the product in
                                               -- different contexts: one-liner, paragraph, technical.

  -- Proof Points
  metrics JSONB,                               -- Array of [{metric, value, date, public}]
                                               -- Traction data, impact numbers, user counts.
                                               -- "public" flag controls whether the AI can cite it.
  testimonials JSONB,                          -- Array of [{quote, attribution, context, public}]
  case_studies JSONB,                          -- Array of [{title, summary, link, public}]

  -- Integration with Content
  content_integration_rules TEXT,              -- How should this product appear in content?
                                               -- "Never the first CTA. Always one of several options.
                                               -- Mention no earlier than the second half of any guide.
                                               -- Frame as 'one way to participate' not 'the solution.'"
                                               -- This replaces the generic integration spectrum with
                                               -- product-specific rules.

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, slug)
);
```

### 1.2 Product Intake UX

Do NOT present this as one massive form. That's overwhelming and will result in shallow answers for everything.

**Use a guided, section-by-section approach:**

The product page has a sidebar showing completion status of each section:

```
PRODUCT: Talvi Round-Up App
──────────────────────────

Section completion:
  ✓ Identity              (complete)
  ✓ The Problem           (complete)
  ◐ The Mechanism         (partial - missing steps)
  ✓ The User              (complete)
  ○ Competition           (not started)
  ○ Objections            (not started)
  ◐ Story                 (partial)
  ○ Current State         (not started)
  ◐ Language Rules        (partial)
  ○ Proof Points          (not started)
  ○ Content Integration   (not started)

  Profile strength: 42%
  [AI: Help me fill this in]
```

**Each section is its own page/tab** with:
- A brief explanation of why this section matters for content quality (e.g., "The AI uses this to write about the problem space without mentioning your product - which is how the best content marketing works")
- Smart form fields appropriate to the data type (text areas for narratives, structured inputs for arrays of objects)
- An "AI: Help me fill this in" option that uses the existing org context, website scan, and any already-completed sections to draft initial content for the section. The user then edits/approves.

**Profile strength score:** A percentage showing how much of the product profile is filled in. Content generated for products with <60% profile strength should show a warning: "Product profile is incomplete - content quality may be limited. [Complete profile]"

### 1.3 AI-Assisted Product Intake

For each section, the "AI: Help me fill this in" button triggers a targeted LLM call:

```
Given this organization: {org context}
And this product so far: {already completed sections}
And this website content: {relevant pages from website scan}

Draft the {section_name} section of the product profile.

For "The Problem Space": Write the problem statement, identify 3-5 problem
dimensions with who they affect and severity, and describe the user's world
before this product exists.

Be specific and honest. Do not use marketing language. Write as if explaining
to a journalist who will fact-check everything.
```

The user reviews and edits the AI's draft. The AI gets them 70% there; the user's edits add the 30% of insider knowledge the AI can't infer.

---

## 2. Campaigns Entity

### What a Campaign Is

A campaign is a time-bound initiative with its own goals, audience, messages, and content needs. It is NOT a product. It may reference one or more products, or no products at all.

Examples:
- A product launch campaign (associated with a product)
- A seasonal awareness campaign ("Giving Season 2026")
- A partnership announcement
- A content series tied to an event or milestone
- A rebrand or repositioning campaign

### 2.1 Campaign Schema

```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,                          -- "Talvi Launch Campaign"
  slug TEXT NOT NULL,
  status TEXT DEFAULT 'planning' CHECK (status IN (
    'planning', 'active', 'paused', 'completed', 'cancelled'
  )),

  -- Timeline
  start_date DATE,
  end_date DATE,
  key_dates JSONB,                             -- Array of [{date, event, description}]
                                               -- e.g., "2026-04-01" / "Beta opens" / "First public access"

  -- Strategic Context
  goal TEXT NOT NULL,                          -- What this campaign is trying to achieve
  success_metrics JSONB,                       -- Array of [{metric, target, measurement_method}]
                                               -- e.g., "Signups" / "1,000 in first week" / "Supabase auth count"
  target_audience TEXT,                        -- May be narrower than org ICP
  audience_difference TEXT,                    -- How this audience differs from the org's general audience
                                               -- "This campaign targets existing fintech app users who are
                                               -- already comfortable with linked bank accounts, vs our
                                               -- general audience which includes people new to fintech."

  -- Messaging
  key_messages JSONB,                          -- Array of [{message, priority, context}]
                                               -- The core messages this campaign needs to land.
                                               -- e.g., "Talvi makes giving effortless - no decisions,
                                               -- no guilt, no large commitments" / "primary" / "All content"
  narrative_arc TEXT,                          -- The story this campaign tells across its content pieces.
                                               -- "Week 1: Establish the problem (giving is broken).
                                               -- Week 2: Show the alternative (what if it was automatic?).
                                               -- Week 3: Introduce the product. Week 4: Social proof."
  call_to_action TEXT,                         -- The primary CTA for campaign content

  -- Voice Adjustments
  tone_shift TEXT,                             -- How the campaign voice differs from the org's default.
                                               -- "More urgency than usual. Time-bounded language is OK
                                               -- for this campaign (unlike evergreen content). But still
                                               -- no guilt, no pity - that's org-level and overrides."
  urgency_level TEXT CHECK (urgency_level IN (
    'none', 'low', 'moderate', 'high'
  )) DEFAULT 'low',                            -- Guides how much time-pressure language the AI uses

  -- Content Context
  content_themes JSONB,                        -- Array of theme strings that should run through
                                               -- all campaign content
  hashtags JSONB,                              -- Campaign-specific hashtags for splits
  brand_assets_notes TEXT,                     -- Notes on any visual or brand elements specific to
                                               -- this campaign (for image placeholders and split generation)

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, slug)
);
```

### 2.2 Campaign Voice Layer

Campaigns get their own voice layer, sitting alongside (not replacing) the product voice layer. The generation stack becomes:

```
Content Template (structural requirements)
  + Campaign voice adjustments (if piece is associated with a campaign)
  + Product voice rules (if piece is associated with a product)
  + Org voice constraints (always applied)
  + User voice characteristics (always applied)
```

Campaign voice adjustments are lighter-weight than full voice profiles. They don't replace the org voice - they modify it. Stored as fields on the campaign record (tone_shift, urgency_level, key_messages) rather than as a separate voice_profiles record. The org voice always wins on hard rules (banned phrases, required patterns). The campaign can adjust softer dimensions (urgency, messaging emphasis, CTA).

### 2.3 Campaign Intake UX

Simpler than product intake - fewer sections, more focused:

```
CAMPAIGN: Talvi Launch
──────────────────────

Section completion:
  ✓ Identity & Timeline   (complete)
  ✓ Goals & Audience       (complete)
  ◐ Messaging              (partial)
  ○ Voice Adjustments      (not started)
  ○ Content Themes         (not started)

  Campaign readiness: 55%
```

Same pattern as products: section-by-section, AI-assisted intake available, completion tracking.

---

## 3. Many-to-Many Relationships

### 3.1 Content Piece Associations

A content piece can serve multiple products and multiple campaigns. Two junction tables:

```sql
CREATE TABLE content_piece_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_piece_id UUID REFERENCES content_pieces(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  integration_level TEXT DEFAULT 'mention' CHECK (integration_level IN (
    'none',         -- Product not mentioned, but product knowledge informs the writing
    'mention',      -- Product is mentioned as one of several options
    'feature',      -- Product is a significant part of the content
    'primary'       -- Product is the primary subject (comparison page, product guide)
  )),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(content_piece_id, product_id)
);

CREATE TABLE content_piece_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_piece_id UUID REFERENCES content_pieces(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(content_piece_id, campaign_id)
);
```

### 3.2 Cluster Associations

Clusters (the research-level groupings) can also be associated with products, though this is looser. A cluster about "how to help shelter dogs" is org-level authority, but it might be particularly relevant to one product.

```sql
CREATE TABLE cluster_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID REFERENCES content_clusters(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  relevance TEXT DEFAULT 'related' CHECK (relevance IN (
    'primary',      -- This cluster is directly about this product's domain
    'related',      -- This cluster is adjacent to this product
    'supporting'    -- This cluster builds general authority that supports this product
  )),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cluster_id, product_id)
);
```

### 3.3 How Associations Affect Generation

When a content piece is generated, the generator queries its product and campaign associations and adjusts the prompt:

**Product associations at each integration level:**
- `none`: Product knowledge is available to the AI (injected as background context) but the AI is instructed not to mention the product by name. This produces pure authority content informed by product expertise.
- `mention`: Product appears as one option among several. The AI has access to the full product profile for accuracy but is instructed to present it alongside alternatives.
- `feature`: Product is discussed in meaningful depth. Multiple features may be highlighted. The AI draws heavily on the mechanism, differentiators, and objections sections.
- `primary`: Product is the main subject. Comparison pages, product deep dives, how-to guides for the product itself.

**Campaign associations:**
- Key messages from the campaign are injected into the generation prompt as messaging guardrails
- Tone shift is applied on top of the org voice
- Campaign CTA replaces default CTA
- Campaign hashtags are included in splits generation
- Narrative arc context helps the AI understand where this piece fits in the larger campaign story

---

## 4. Architecture Integration (Connects to PATCH-001)

### 4.1 Org-Level Hubs, Contextual Spokes

The content architecture from PATCH-001 (the Architecture tab in Research) operates at the org level. Hubs represent the org's authority topics. But spokes within those hubs can be tagged with product and campaign associations.

**In the Architecture visual canvas (from PATCH-001):**

Each spoke node shows small badges indicating its product/campaign associations:

```
┌───────────────┐
│  How to Help   │  ← Hub (org-level, no product tag)
│ Shelter Dogs   │
└──────┬────────┘
       │
  ┌────┴────────────────┐
  │                     │
┌─┴───────────┐  ┌─────┴───────────────┐
│ Volunteering │  │ Effortless Giving    │
│ Guide        │  │ for Animal Lovers    │
│              │  │ 🏷️ Round-Up App     │
│ (org-level)  │  │ 🎯 Launch Campaign   │
└──────────────┘  └─────────────────────┘
```

The "Effortless Giving for Animal Lovers" spoke is tagged with the Round-Up App product (integration level: `mention`) and the Launch Campaign. When generated, the AI will:
- Write about effortless giving as the topic (org authority)
- Naturally mention the round-up app as one way to participate (product mention, informed by the deep product profile)
- Align messaging with the launch campaign's key messages
- Use the launch campaign's tone shift and CTA

The "Volunteering Guide" spoke has no product or campaign tags. It's pure org authority content. The AI writes it using only org-level voice and knowledge.

### 4.2 Tagging UI in Architecture

When creating or editing a spoke in the Architecture view, the user sees:

```
SPOKE: Effortless Giving for Animal Lovers
──────────────────────────────────────────

Primary KW: "automatic donation app for animal shelters"
Word count: 1,500
Pillar: How to Participate

Product associations:
  ┌────────────────────────────────────────┐
  │ 🏷️ Talvi Round-Up App                 │
  │    Integration: Mention (one of many)  │
  │    [Change Level] [Remove]             │
  └────────────────────────────────────────┘
  [+ Associate Product]

Campaign associations:
  ┌────────────────────────────────────────┐
  │ 🎯 Talvi Launch Campaign              │
  │    [Remove]                            │
  └────────────────────────────────────────┘
  [+ Associate Campaign]
```

This is optional - not every spoke needs associations. Pure authority content (most hubs, many spokes) has no associations and that's correct.

---

## 5. Products & Campaigns in the Sidebar

### 5.1 Navigation Update

The main sidebar navigation should include Products & Campaigns as a section accessible from the org level:

```
[Org Name]
  Dashboard
  Voice
  Products & Campaigns    ← New or renamed nav item
  Research
  Calendar
  Content
  Analytics
  Splits
  Settings
```

### 5.2 Products & Campaigns Landing Page

A combined view showing all products and all campaigns for the org:

```
PRODUCTS & CAMPAIGNS
────────────────────

Products (3)
┌──────────────────────────────────────────────────────┐
│ Talvi Round-Up App              Live    Profile: 42% │
│ Cause-based micro-donation via round-ups             │
│ [Edit Profile]  [View in Architecture]               │
├──────────────────────────────────────────────────────┤
│ Talvi Voxel World               Building Profile: 18%│
│ Digital world users build as they give               │
│ [Edit Profile]  [View in Architecture]               │
├──────────────────────────────────────────────────────┤
│ Talvi Alliances                 Concept  Profile: 5% │
│ Group giving goals with friends                      │
│ [Edit Profile]  [View in Architecture]               │
└──────────────────────────────────────────────────────┘
[+ Add Product]

Campaigns (1)
┌──────────────────────────────────────────────────────┐
│ 🎯 Talvi Launch Campaign        Planning   55%      │
│ Goal: 1,000 signups in first week                    │
│ Timeline: Apr 1 - Apr 30, 2026                       │
│ Products: Round-Up App, Voxel World                  │
│ [Edit Campaign]  [View Content]                      │
└──────────────────────────────────────────────────────┘
[+ Add Campaign]
```

**"View in Architecture"** jumps to the Architecture tab in Research, filtered to show clusters and spokes associated with that product.

**"View Content"** jumps to the Content section, filtered to show pieces associated with that campaign.

---

## 6. Campaign-Product Linkage

Campaigns can be associated with products (a launch campaign is for a specific product). This is a simple junction table:

```sql
CREATE TABLE campaign_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, product_id)
);
```

When a campaign is associated with products, the campaign intake can pre-populate some fields from the product profile (key messages can draw from the product's positioning statement, target audience can start from the product's user personas).

---

## 7. Impact on Voice Engine (Doc 02)

### 7.1 Product Voice Layer Update

The existing product voice profile (from voice_profiles table with scope = 'product') now has much richer source material. The voice extraction for a product should pull from:
- `terminology` and `banned_terms` (hard rules)
- `content_integration_rules` (how the product appears in content)
- `approved_descriptions` (pre-approved language)
- `positioning_statement` (how the product is positioned)

The voice profile extraction prompt for products should be updated to incorporate these fields.

### 7.2 Campaign Voice (New)

Campaigns don't get a full voice_profiles record. Their voice influence is lighter:
- `tone_shift` modifies the org voice softness
- `urgency_level` controls time-pressure language
- `key_messages` are injected as messaging guardrails
- Org-level hard rules (banned phrases, required patterns) always override

This is implemented at generation time, not as a stored voice profile.

---

## 8. Impact on Content Generator (Doc 04)

### 8.1 Generation Prompt Assembly

When generating a piece with product and campaign associations, the prompt assembly order becomes:

1. Content template (structural requirements)
2. Content brief (topic, keywords, research data)
3. **Product context blocks** (for each associated product, at the appropriate integration level):
   - At `none`: "Background context (do not mention by name): {product profile summary}"
   - At `mention`: "This product may be mentioned as one option among several: {product profile summary including differentiators and approved descriptions}"
   - At `feature`: "This product is featured in this content: {full product profile}"
   - At `primary`: "This content is primarily about this product: {full product profile including competitive landscape and objections}"
4. **Campaign context block** (if associated):
   - Key messages to weave in
   - Tone shift instructions
   - CTA override
   - Where this piece fits in the campaign narrative arc
5. Voice brief (user + org layers, plus product terminology/banned terms)
6. Corrections ledger rules

### 8.2 Product Profile Summary Generation

The full product profile is too large to inject into every prompt. The system should generate a **Product Context Summary** - a compressed version appropriate to the integration level:

- `none` integration: 200-word summary focusing on problem space and mechanism (so the AI understands the domain deeply without needing to reference the product)
- `mention` integration: 400-word summary including positioning, key differentiators, and approved one-liner description
- `feature` integration: 800-word summary including mechanism, features, differentiators, objections, and approved descriptions
- `primary` integration: Full profile injected (or as much as token budget allows)

These summaries are generated once and cached, regenerated when the product profile is updated.

---

## 9. Migration Plan

### Existing Product Records

Current products have: name, slug, description, target_audience, key_features, differentiators.

Migration:
1. Add all new columns to the products table (nullable)
2. Map existing fields:
   - `description` → `how_it_works` (or `problem_statement`, depending on content)
   - `target_audience` → `target_audience` (same field, no change)
   - `key_features` → `key_features` (JSONB structure may need transformation if the current format differs from `[{name, description, why_it_matters}]`)
   - `differentiators` → `differentiators` (JSONB structure may need transformation)
3. New fields start empty. Profile strength score reflects what's filled in.
4. Prompt user to complete expanded profile with "AI: Help me fill this in" assistance

### New Tables

- `campaigns`: New table, no migration needed
- `content_piece_products`: New junction table. Migrate any existing product_id foreign keys on content_pieces to this table (if content_pieces currently has a product_id column, move those associations to the junction table then drop the column)
- `content_piece_campaigns`: New junction table
- `cluster_products`: New junction table
- `campaign_products`: New junction table

### Existing content_pieces.product_id

If the content_pieces table currently has a `product_id` column (from doc 01), this becomes the many-to-many junction table `content_piece_products`. Migrate existing associations, then drop the `product_id` column from content_pieces.

Similarly, if content_clusters has a `product_id`, migrate to `cluster_products` and drop the column.

---

## 10. Implementation Order

1. **Database migration** - new columns on products, new campaigns table, new junction tables, data migration for existing records
2. **Product intake UI** - section-by-section expanded form with completion tracking and AI-assisted intake
3. **Campaign CRUD** - create, edit, list campaigns with all fields
4. **Products & Campaigns landing page** - combined view in sidebar
5. **Association UI** - ability to tag content pieces and spokes with products/campaigns in the Architecture view (PATCH-001) and content editor
6. **Generation prompt update** - product context blocks and campaign context blocks in the generation pipeline
7. **Product context summary generation** - cached summaries at each integration level
8. **Voice engine update** - product voice extraction draws from expanded profile fields

Test: Create a full Talvi product profile, create a launch campaign, associate both with a spoke in the architecture, and verify the generated content reflects the deep product knowledge and campaign messaging.

---

*Dark Madder PATCH-002 - Products & Campaigns Expansion - March 2026*
