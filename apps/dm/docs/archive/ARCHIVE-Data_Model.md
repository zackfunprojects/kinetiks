> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: specs/data-model.md (tenancy/auth/org tables deleted; schemas rewritten as account-scoped dm_*)
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# 01 - Data Model

## Multi-Tenant Architecture & Entity Schemas

**System:** Dark Madder
**Depends on:** Nothing (foundation layer)
**Depended on by:** All other systems

---

## 1. Multi-Tenant Hierarchy

Dark Madder uses a three-level hierarchy: **User > Organization > Product**. A single user can manage multiple organizations, and each organization can have multiple products. This mirrors how a real content operation works: Zack (user) writes for Talvi (org) about the round-up app (product), and also writes for DayScore (org) about the habit tracker (product).

### Hierarchy Rules

- A **User** is a human with login credentials. Users have their own voice profile that persists across all orgs.
- An **Organization** is the primary entity. It has its own voice profile, content plan, analytics, and Framer CMS connection. Most features operate at the org level.
- A **Product** is optional. An org can operate without products (e.g., DDV as a personal brand). When products exist, they add a third voice layer and enable product-specific content targeting.
- A User can belong to multiple Orgs (with role-based access in future versions, but v1 is single-user).
- Content is always authored at the Org level, optionally scoped to a Product.

---

## 2. Entity Schemas

All tables use Supabase (PostgreSQL). UUIDs for all primary keys. Timestamps on all records. Row Level Security (RLS) policies enforced at the database level.

### 2.1 Users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

The user record is intentionally thin. Identity and auth are handled by Supabase Auth. The user's voice profile lives in a separate table (see Voice Engine, doc 02).

### 2.2 Organizations

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                          -- "Talvi"
  slug TEXT UNIQUE NOT NULL,                   -- "talvi"
  domain TEXT,                                 -- "talvi.app" (for website scanning)
  description TEXT,                            -- Brief org description
  industry TEXT,                               -- For research context
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.3 Organization Memberships

```sql
CREATE TABLE org_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'owner',                   -- v1: always 'owner'. Future: 'editor', 'viewer'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, org_id)
);
```

### 2.4 Products

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                          -- "Round-Up App"
  slug TEXT NOT NULL,                          -- "round-up-app"
  description TEXT,                            -- What the product is
  target_audience TEXT,                        -- Primary audience description
  key_features JSONB,                          -- Array of feature descriptions
  differentiators JSONB,                       -- What makes it unique
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, slug)
);
```

### 2.5 Voice Profiles

Voice profiles are the core differentiator. Three scopes: user, org, product. See doc 02 for the full voice engine specification.

```sql
CREATE TABLE voice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Polymorphic scope: exactly one of these should be set
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  
  scope TEXT NOT NULL CHECK (scope IN ('user', 'org', 'product')),
  
  -- Core voice attributes
  adjectives JSONB,                            -- e.g., ["warm", "direct", "curious", "specific", "honest"]
  tone_description TEXT,                       -- Free-text voice description
  sentence_rhythm JSONB,                       -- Rhythm preferences and patterns
  vocabulary_preferences JSONB,                -- Preferred/avoided words and phrases
  transition_style TEXT,                       -- How paragraphs connect
  
  -- Rules and constraints
  banned_phrases JSONB,                        -- Phrases to never use
  required_patterns JSONB,                     -- Patterns to always include
  style_rules JSONB,                           -- Additional style constraints
  tone_by_channel JSONB,                       -- Channel-specific tone adjustments
  
  -- Source documents
  source_documents JSONB,                      -- References to uploaded docs used to build this profile
  website_scan_data JSONB,                     -- Extracted voice signals from website scan
  
  -- Sample content for reference
  sample_excerpts JSONB,                       -- Best examples of the voice done right
  anti_examples JSONB,                         -- Examples of what the voice should NOT sound like
  
  -- Metadata
  confidence_score FLOAT DEFAULT 0.0,          -- 0-1, how refined this profile is
  generation_count INT DEFAULT 0,              -- How many pieces generated with this profile
  last_calibrated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure one profile per scope target
CREATE UNIQUE INDEX idx_voice_user ON voice_profiles(user_id) WHERE scope = 'user';
CREATE UNIQUE INDEX idx_voice_org ON voice_profiles(org_id) WHERE scope = 'org';
CREATE UNIQUE INDEX idx_voice_product ON voice_profiles(product_id) WHERE scope = 'product';
```

### 2.6 Content Clusters (Hub-and-Spoke Architecture)

```sql
CREATE TABLE content_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),     -- Optional: cluster may be org-wide
  
  name TEXT NOT NULL,                          -- "How to Help Save the Bees"
  slug TEXT NOT NULL,
  pillar TEXT NOT NULL,                        -- e.g., "how-to-help", "what-works", "how-to-participate", "trust-and-receipts"
  
  -- Research data
  primary_keyword TEXT NOT NULL,
  keyword_volume INT,
  keyword_difficulty FLOAT,
  related_keywords JSONB,                      -- Array of {keyword, volume, difficulty}
  serp_analysis JSONB,                         -- What currently ranks, AI overview presence, etc.
  content_gaps JSONB,                          -- Identified opportunities
  
  -- Status
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'paused', 'completed', 'killed')),
  priority_score FLOAT,                        -- Composite of volume, difficulty, relevance
  
  -- Performance
  aggregate_impressions INT DEFAULT 0,
  aggregate_clicks INT DEFAULT 0,
  authority_score FLOAT DEFAULT 0.0,           -- Calculated from backlinks, rankings, AI citations
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, slug)
);
```

### 2.7 Content Pieces

This is the central content table. Every blog post, guide, and playbook is a content piece.

```sql
CREATE TABLE content_pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  cluster_id UUID REFERENCES content_clusters(id),
  author_id UUID REFERENCES users(id),
  
  -- Content identity
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('hub', 'spoke', 'guide', 'playbook', 'faq')),
  
  -- The actual content
  body_markdown TEXT,                          -- Full content in markdown
  body_html TEXT,                              -- Rendered HTML for Framer
  
  -- SEO/AEO metadata
  meta_description TEXT,                       -- 140-155 characters
  primary_keyword TEXT NOT NULL,
  secondary_keywords JSONB,
  target_url TEXT,                             -- Intended published URL path
  
  -- Structured elements (extracted for schema markup and Framer CMS fields)
  ai_hook TEXT,                                -- First 150 words direct answer
  key_takeaways JSONB,                         -- Array of takeaway strings
  definition_boxes JSONB,                      -- Array of {term, definition}
  faq_items JSONB,                             -- Array of {question, answer}
  internal_link_placeholders JSONB,            -- Array of {anchor_text, target_slug, context}
  sources JSONB,                               -- Array of {org_name, year, url, claim}
  
  -- Publishing metadata
  ai_transparency_line TEXT DEFAULT 'Human Written, AI Supported',
  author_name TEXT,
  author_bio_link TEXT,
  
  -- Workflow
  status TEXT DEFAULT 'planned' CHECK (status IN (
    'planned',        -- In the content calendar but not yet generated
    'generating',     -- AI is currently producing the draft
    'draft',          -- Draft ready for review
    'in_review',      -- User is actively reviewing/editing
    'approved',       -- User approved, ready to publish
    'publishing',     -- Being pushed to Framer
    'published',      -- Live on Framer
    'needs_update',   -- Flagged by analytics for refresh
    'archived'        -- Removed from active use
  )),
  
  -- Scheduling
  scheduled_generate_at TIMESTAMPTZ,           -- When the draft should auto-generate
  scheduled_publish_at TIMESTAMPTZ,            -- Target publish date
  generated_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  
  -- Framer integration
  framer_item_id TEXT,                         -- ID in Framer CMS after publishing
  framer_collection_id TEXT,                   -- Which Framer collection
  framer_published_url TEXT,                   -- Live URL after publish
  
  -- Schema markup (generated, stored as JSON-LD)
  schema_article JSONB,
  schema_faq JSONB,
  schema_howto JSONB,
  schema_breadcrumb JSONB,
  
  -- Generation metadata
  generation_prompt_hash TEXT,                 -- Hash of the prompt used, for debugging
  generation_model TEXT,                       -- Which Claude model was used
  generation_tokens INT,                       -- Token count for cost tracking
  
  -- Quality metrics
  edit_count INT DEFAULT 0,                    -- How many times edited before approval
  voice_drift_score FLOAT,                     -- How well it matched the voice profile
  readability_score FLOAT,                     -- Flesch-Kincaid or similar
  word_count INT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, slug)
);
```

### 2.8 Content Edits (Learning Loop)

```sql
CREATE TABLE content_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_piece_id UUID REFERENCES content_pieces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  
  -- The diff
  original_text TEXT NOT NULL,                 -- What the AI wrote
  edited_text TEXT NOT NULL,                   -- What the user changed it to
  
  -- Context
  section_type TEXT,                           -- 'opening', 'body', 'transition', 'closing', 'faq', etc.
  paragraph_index INT,                         -- Which paragraph in the piece
  
  -- Classification (set by the pattern detector)
  edit_type TEXT CHECK (edit_type IN (
    'voice_correction',    -- Style/tone change
    'factual_addition',    -- Adding information AI didn't have
    'structural_change',   -- Reorganizing content
    'word_choice',         -- Specific word/phrase swap
    'transition_fix',      -- Fixing paragraph-to-paragraph flow
    'rhythm_adjustment',   -- Changing sentence length/cadence
    'deletion',            -- Removing AI-generated content
    'unclassified'         -- Not yet processed
  )),
  
  -- Extracted rule (if voice_correction or word_choice)
  extracted_rule TEXT,                         -- e.g., "Replace generic superlatives with concrete sensory details"
  rule_scope TEXT CHECK (rule_scope IN ('user', 'org', 'product')),
  
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.9 Corrections Ledger (Persistent Learning)

```sql
CREATE TABLE corrections_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scope: which voice profile does this rule apply to
  user_id UUID REFERENCES users(id),
  org_id UUID REFERENCES organizations(id),
  product_id UUID REFERENCES products(id),
  scope TEXT NOT NULL CHECK (scope IN ('user', 'org', 'product')),
  
  -- The rule
  category TEXT NOT NULL CHECK (category IN (
    'voice', 'structure', 'word_choice', 'transitions', 
    'tone', 'rhythm', 'formatting', 'terminology'
  )),
  rule_text TEXT NOT NULL,                     -- Human-readable rule
  
  -- Examples
  bad_example TEXT,                            -- What triggered this rule
  good_example TEXT,                           -- What the user changed it to
  
  -- Provenance
  derived_from_edit_id UUID REFERENCES content_edits(id),
  
  -- Effectiveness tracking
  times_applied INT DEFAULT 0,                 -- How many times used in generation
  times_overridden INT DEFAULT 0,              -- How many times user still edited despite this rule
  effectiveness_score FLOAT DEFAULT 1.0,       -- Decays if frequently overridden
  
  -- Status
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.10 Content Calendar

```sql
CREATE TABLE content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Calendar period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type TEXT CHECK (period_type IN ('weekly', 'monthly', 'quarterly')),
  
  -- Plan
  planned_pieces JSONB,                        -- Array of {content_piece_id, scheduled_date, content_type, cluster_id}
  total_planned INT,
  total_generated INT DEFAULT 0,
  total_published INT DEFAULT 0,
  
  -- Adjustment history
  adjustments JSONB,                           -- Array of {date, reason, changes_made, triggered_by}
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'superseded')),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.11 Analytics Snapshots

```sql
CREATE TABLE analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_piece_id UUID REFERENCES content_pieces(id) ON DELETE CASCADE,
  
  -- Snapshot date
  snapshot_date DATE NOT NULL,
  
  -- Google Search Console data
  gsc_impressions INT,
  gsc_clicks INT,
  gsc_ctr FLOAT,
  gsc_average_position FLOAT,
  gsc_queries JSONB,                           -- Top queries this piece appears for
  
  -- GA4 data
  ga4_pageviews INT,
  ga4_unique_visitors INT,
  ga4_avg_time_on_page FLOAT,                  -- Seconds
  ga4_scroll_depth FLOAT,                      -- Percentage
  ga4_bounce_rate FLOAT,
  
  -- SEO tool data
  ahrefs_domain_rating FLOAT,
  ahrefs_backlinks INT,
  ahrefs_referring_domains INT,
  ahrefs_organic_keywords INT,
  keyword_rankings JSONB,                      -- Array of {keyword, position, change}
  
  -- AI citation tracking
  ai_citations JSONB,                          -- Array of {engine, query, cited, date}
  
  -- Computed scores
  performance_score FLOAT,                     -- Composite score for this snapshot
  trajectory TEXT CHECK (trajectory IN ('rising', 'stable', 'declining', 'new')),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(content_piece_id, snapshot_date)
);
```

### 2.12 Splits (Derivative Content)

```sql
CREATE TABLE content_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_piece_id UUID REFERENCES content_pieces(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Platform targeting
  platform TEXT NOT NULL CHECK (platform IN ('linkedin', 'tiktok', 'reddit', 'instagram')),
  format TEXT NOT NULL,                        -- 'post', 'carousel', 'thread', 'script', 'caption'
  
  -- Content
  title TEXT,                                  -- For internal reference
  body TEXT NOT NULL,                          -- The actual split content
  hooks JSONB,                                 -- Alternative opening hooks
  hashtags JSONB,                              -- Platform-appropriate hashtags
  visual_notes TEXT,                           -- Notes for visual accompaniment
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'posted', 'archived')),
  approved_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  
  -- Performance (manually tracked in v1)
  engagement_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.13 Framer Connections

```sql
CREATE TABLE framer_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Framer project details
  framer_project_id TEXT NOT NULL,
  framer_api_key TEXT NOT NULL,                -- Encrypted at rest
  site_url TEXT,                               -- The published site URL
  
  -- CMS mapping
  blog_collection_id TEXT,                     -- Framer CMS collection ID for blog posts
  guide_collection_id TEXT,
  playbook_collection_id TEXT,
  
  -- Field mappings (maps Dark Madder fields to Framer CMS field IDs)
  field_mappings JSONB,                        -- {dm_field: framer_field_id, ...}
  
  -- Status
  connected BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  last_publish_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id)
);
```

### 2.14 Research Cache

```sql
CREATE TABLE research_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- What was researched
  query_type TEXT CHECK (query_type IN ('keyword', 'serp', 'competitor', 'ai_citation')),
  query_params JSONB,                          -- The parameters used
  
  -- Results
  results JSONB,                               -- Cached API response
  source TEXT,                                 -- 'ahrefs', 'semrush', 'dataforseo', 'gsc'
  
  -- Freshness
  fetched_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,                      -- When this cache should be refreshed
  
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 3. Row Level Security (RLS) Strategy

All tables enforce RLS through Supabase. The core pattern:

```sql
-- Users can only see their own data
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own orgs" ON organizations
  FOR SELECT USING (
    id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage their own orgs" ON organizations
  FOR ALL USING (
    id IN (SELECT org_id FROM org_memberships WHERE user_id = auth.uid())
  );
```

Apply the same pattern cascading down: org-level tables check org_memberships, product-level tables check through the org relationship.

---

## 4. Key Relationships Map

```
User
 |-- has many --> Org Memberships
 |-- has one --> Voice Profile (user scope)
 |
 Org Membership
  |-- belongs to --> Organization
  |
  Organization
   |-- has one --> Voice Profile (org scope)
   |-- has one --> Framer Connection
   |-- has many --> Products
   |-- has many --> Content Clusters
   |-- has many --> Content Pieces
   |-- has many --> Content Calendar entries
   |-- has many --> Research Cache entries
   |
   Product
    |-- has one --> Voice Profile (product scope)
    |-- has many --> Content Clusters (optional scoping)
    |-- has many --> Content Pieces (optional scoping)
    |
    Content Cluster
     |-- has many --> Content Pieces
     |
     Content Piece
      |-- has many --> Content Edits
      |-- has many --> Content Splits
      |-- has many --> Analytics Snapshots
      |-- generates --> Corrections Ledger entries (via edits)
```

---

## 5. Indexes for Performance

```sql
-- Content pieces: most common queries
CREATE INDEX idx_pieces_org_status ON content_pieces(org_id, status);
CREATE INDEX idx_pieces_org_scheduled ON content_pieces(org_id, scheduled_generate_at);
CREATE INDEX idx_pieces_cluster ON content_pieces(cluster_id);
CREATE INDEX idx_pieces_keyword ON content_pieces(primary_keyword);

-- Analytics: time-series queries
CREATE INDEX idx_analytics_piece_date ON analytics_snapshots(content_piece_id, snapshot_date DESC);

-- Corrections: lookup by scope
CREATE INDEX idx_corrections_user ON corrections_ledger(user_id) WHERE active = true;
CREATE INDEX idx_corrections_org ON corrections_ledger(org_id) WHERE active = true;
CREATE INDEX idx_corrections_product ON corrections_ledger(product_id) WHERE active = true;

-- Edits: lookup by piece
CREATE INDEX idx_edits_piece ON content_edits(content_piece_id);

-- Research cache: freshness queries
CREATE INDEX idx_research_org_type ON research_cache(org_id, query_type);
CREATE INDEX idx_research_expires ON research_cache(expires_at);
```

---

## 6. Data Migration & Seeding Notes

For v1 with Zack as the sole user and Talvi/DayScore/Bloomify as initial orgs:

1. Create Zack's user record on first auth
2. Create the three orgs with domains (talvi.app, dayscore.app, bloomify.dev or similar)
3. Voice profile seeding: Zack's user voice profile can be pre-populated from the uploaded writing samples. Talvi's org voice profile can be pre-populated from the Content Guidelines, Blog Writing Lessons, and Web Content Strategy docs.
4. Framer connections: require manual API key entry per org during setup

---

*Dark Madder Specification - 01 Data Model - March 2026*
