> **SUPERSEDED — June 2026. Historical reference only. NEVER BUILD FROM THIS DOCUMENT.**
> Superseded by: phase plans in docs/build-phases/upcoming/ (authored after v2 docs complete)
> Authority and merge map: dark-madder-v2-doc-system.md (Dark Madder v2 Documentation System Plan)

# 09 - Phase Plan

## Claude Code Build Plan

**System:** Dark Madder
**Purpose:** Phased implementation plan designed for Claude Code execution

---

## Build Philosophy

### Plan First, Build After

Every phase follows the same two-step discipline:

**Step 1: PLAN.** Before writing a single line of code, Claude Code produces a written plan for the phase. The plan includes: what will be built, what files will be created or modified, what dependencies exist, what the data flow looks like, and what the definition of done is. The plan is reviewed and approved by the developer before any implementation begins.

**Step 2: BUILD.** Only after the plan is approved does Claude Code begin implementation. During the build, Claude Code follows the plan. If it encounters something the plan didn't account for, it stops, explains the issue, proposes options, and waits for a decision before proceeding.

This is non-negotiable. No phase begins with code. Every phase begins with a plan.

### Why This Matters

Claude Code is powerful but opinionated. Without the plan-first discipline, it will make architectural decisions on the fly that compound into problems later. A 5-minute planning step prevents hours of rework. The plan also serves as documentation - after the phase is complete, the plan describes what was built and why.

### Additional Principles

- Each phase produces a working, testable increment. No phase depends on unbuilt future phases.
- Every phase ends with something you can use, even if the full system isn't complete.
- Test after every phase, not at the end.
- When in doubt, stop and ask. Never assume.

Estimated total build time: 6-8 weeks at focused pace (not full-time - this runs alongside other portfolio priorities).

---

## CLAUDE.md Specification

The CLAUDE.md file is created in Phase 0 and lives at the project root. It governs how Claude Code behaves across all phases. Here is the full content to be placed in the file:

```markdown
# Dark Madder - CLAUDE.md

## Project Overview

Dark Madder is an AI-powered content engine that handles the full lifecycle of inbound content creation: brand understanding, research, planning, generation, publishing to Framer CMS, analytics, and continuous improvement. It is the inbound partner to Fortune Farms (outbound) in the Daydreamer Ventures portfolio.

Full specification lives in /docs (00 through 10). Read the relevant spec doc before starting any phase.

## How You Work on This Project

### 1. No Sycophancy

Do not compliment code, decisions, or ideas unless genuinely warranted. Do not say "great question" or "excellent point." Do not pad responses with encouragement. Be direct. Be honest. If something is wrong, say it is wrong. If something could be better, say how. Treat the developer as a peer, not a client to be managed.

### 2. Research and Provide Options

When you encounter a decision point (architectural, library choice, data modeling, UI pattern, or anything non-trivial), do not pick one and implement it. Instead:

1. Identify the decision clearly
2. Research the viable options (2-3 minimum)
3. Present each option with tradeoffs (what is better, what is worse, what is riskier)
4. Make a recommendation with reasoning
5. Wait for the developer to decide

This applies to everything from "which rich text editor library" to "how should we structure the API routes" to "should this be a server component or client component." No exceptions.

### 3. Do Not Change Things Without Collaboration

Never refactor, restructure, rename, or redesign existing code without explicit approval. If you think something should change:

1. Explain what you think should change and why
2. Show what the change would look like
3. Explain what it would affect (other files, patterns, downstream dependencies)
4. Wait for approval before implementing

This is especially critical for: database schema changes, API route structures, component hierarchies, state management patterns, and anything that touches multiple files.

### 4. Plan Before You Build

Every task follows the plan-first/build-after pattern:

Before writing any code:
- State what you are about to build
- List the files you will create or modify
- Describe the approach and any key decisions
- Identify dependencies and potential issues
- Wait for approval

During implementation:
- Follow the approved plan
- If you hit something unexpected, stop and discuss before changing course
- Do not add features, optimizations, or "improvements" that were not in the plan
- Do not silently refactor adjacent code that "could be better"

### 5. Ask When Uncertain

If you are less than 80% confident about a decision, ask. Do not guess. Do not assume the developer wants the "standard" approach. Dark Madder has specific architectural patterns documented in the spec docs, and deviating from them without discussion creates problems.

## Tech Stack

- Framework: Next.js (App Router, TypeScript)
- Database: Supabase (PostgreSQL + Auth + Edge Functions + Storage)
- AI: Anthropic Claude API (Sonnet for generation, Haiku for classification)
- CMS: Framer Server API (framer-api npm package)
- SEO Research: Ahrefs/Semrush API + DataForSEO API
- Analytics: Google Search Console API + GA4 API + Ahrefs API
- Scheduling: Supabase Edge Functions + pg_cron
- Hosting: Vercel
- Styling: Tailwind CSS (dark theme only, see /docs/10-UI-BRAND.md)
- Font: SF Pro (system font stack, see /docs/10-UI-BRAND.md)

## File Structure

/app                    - Next.js App Router pages and layouts
  /api                  - API routes
  /(auth)               - Auth pages (sign in, sign up)
  /(dashboard)          - Authenticated app pages
    /[orgSlug]          - Org-scoped pages
      /voice            - Voice engine
      /research         - Research and planner
      /calendar         - Content calendar
      /content          - Content pieces and editor
      /analytics        - Analytics and adjuster
      /splits           - Splits engine
      /settings         - Org settings + Framer connection
/components             - Shared React components
  /ui                   - Base UI primitives (button, card, input, etc.)
  /layouts              - Layout components (sidebar, page shells)
  /features             - Feature-specific components by domain
/lib                    - Shared utilities, API clients, helpers
  /supabase             - Supabase client, queries, types
  /ai                   - Claude API integration, prompt builders
  /framer               - Framer Server API integration
  /seo                  - SEO tool API integrations
  /analytics            - Analytics data source integrations
/types                  - TypeScript type definitions
/supabase               - Supabase migrations and seed files
/docs                   - Specification documents (00-10)

## Naming Conventions

- Files: kebab-case (voice-profile-editor.tsx)
- Components: PascalCase (VoiceProfileEditor)
- Database tables: snake_case (content_pieces)
- API routes: kebab-case (/api/voice/scan-website)
- TypeScript types: PascalCase (ContentPiece, VoiceProfile)
- Environment variables: UPPER_SNAKE_CASE (SUPABASE_URL)

## Testing Requirements

- Every database query should be tested with actual Supabase calls (not mocked)
- Every API route should handle errors gracefully and return appropriate status codes
- Every LLM integration should handle API failures, rate limits, and malformed responses
- UI components should render correctly with empty states, loading states, and error states

## Style Rules

- No em dashes anywhere in the codebase or generated content. Use commas, periods, or parentheses.
- Dark theme only. No light mode. See /docs/10-UI-BRAND.md for the complete color system.
- SF Pro font stack. Never Inter. Always use the full stack from /docs/10-UI-BRAND.md.
- Maximum one primary (accent) button per view.
- Monospace font (SF Mono stack) for all numerical/machine data (scores, counts, analytics).
- See /docs/10-UI-BRAND.md for all color tokens, spacing, radius, and component patterns.
```

---

## Phase 0: Foundation

**Duration:** 1-2 days
**Goal:** Project scaffolding, database, auth, and deployment pipeline

### Plan Step

Before any code, Claude Code produces a written plan covering:
- Exact Next.js configuration (app router setup, typescript config, tailwind config with full Dark Madder theme tokens from doc 10)
- Complete list of Supabase tables to create (from doc 01), ordered by foreign key dependencies
- RLS policy definitions for each table
- Supabase Auth configuration details (provider, redirect URLs, session handling)
- Vercel deployment configuration
- Environment variable list with descriptions
- The CLAUDE.md file content (specified above)
- Any library choices or configuration decisions that need input

**Developer reviews and approves the plan before implementation begins.**

### Build Step

1. Initialize Next.js project with App Router, TypeScript, Tailwind CSS
2. Configure Tailwind with the full Dark Madder color system, font stack, and spacing scale from doc 10
3. Create Supabase project and run all table creation SQL from doc 01
4. Enable RLS and create policies on all tables
5. Set up Supabase Auth (email/password for v1)
6. Connect Vercel to git repo, configure environment variables
7. Create CLAUDE.md at project root
8. Copy spec docs to `/docs` directory
9. Verify deployment pipeline (push to main = deploy to Vercel)

### Definition of Done
- Next.js app deploys to Vercel with dark theme applied globally
- All Supabase tables exist with RLS policies active
- Auth flow works (sign up, sign in, sign out)
- CLAUDE.md committed and spec docs in `/docs`
- Tailwind config matches 10-UI-BRAND.md tokens exactly

---

## Phase 1: Multi-Tenant Core

**Duration:** 2-3 days
**Goal:** User can log in, create orgs, add products, and navigate between them

### Plan Step

Before any code, Claude Code produces a written plan covering:
- Page routing structure: how `/(auth)` vs `/(dashboard)/[orgSlug]` works, middleware for auth guards
- Sidebar component architecture: org switcher mechanics, navigation items, active state indicator, collapsed/expanded behavior
- Organization and Product CRUD: which pages, which forms, which API routes, validation rules
- How org context is managed across the app (URL params, React context, or both)
- Component library decisions: any base UI primitives needed (Radix? shadcn/ui? Custom?), with options and tradeoffs
- Layout component structure: authenticated layout wrapper, sidebar + main content area composition

**Developer reviews and approves the plan before implementation begins.**

### Build Step

1. Auth pages (sign up, sign in, redirect to dashboard after auth)
2. Organization CRUD (create, edit, list/switcher in sidebar)
3. Product CRUD (create, edit, list within org, detail/edit page)
4. Navigation shell (sidebar with org switcher, main nav items, active state indicator, dark theme)
5. Dashboard placeholder (per-org, shows org name, product count, "Get Started" prompts)

### Definition of Done
- User can create account, create 3 orgs (Talvi, DayScore, Bloomify), add products to each
- Navigation works across orgs with proper URL routing
- UI matches dark theme specification from 10-UI-BRAND.md
- All data persisted in Supabase with RLS enforced

---

## Phase 2: Voice Engine

**Duration:** 4-5 days
**Goal:** Complete voice onboarding flow and voice profile management

### Plan Step

Before any code, Claude Code produces a written plan covering:
- Website scanning approach: server-side fetch vs. headless browser (options with tradeoffs), how to extract body text and strip navigation/footer/boilerplate, how many pages to crawl per domain, error handling for sites that block crawlers or return errors
- LLM integration architecture: exact prompt structure for voice extraction (reference doc 02 Section 3), how to handle website content that exceeds context window limits (chunking strategy), response parsing and JSON validation, retry logic for API failures
- Sample draft refinement UX: the inline editor component, how paragraph-level diffs are captured and stored, how the voice profile update works after each editing round, how the flow progresses through 2-3 rounds
- Document upload processing: which libraries for .docx extraction (mammoth vs. alternatives), .pdf extraction (pdf-parse vs. alternatives), .md parsing, how extracted text is chunked for LLM analysis, how extracted voice signals merge with or override the existing profile, conflict resolution UI
- Voice profile data structure: how the JSONB fields (adjectives, sentence_rhythm, vocabulary_preferences, banned_phrases, etc.) map to editable UI components, validation rules
- Three-layer system UI: how user/org/product voice profiles are displayed, how layer stacking is visualized, how the user understands what overrides what

**Developer reviews and approves the plan before implementation begins.**

### Build Step

1. Website scanner (fetch pages, extract text, LLM voice analysis, store profile, display summary card)
2. Sample draft refinement (generate sample paragraphs, inline editor, capture edits, re-analyze profile, repeat 2-3 rounds)
3. Document upload processing (upload UI, text extraction, LLM analysis, profile merge, conflict resolution)
4. Voice profile viewer/editor (all JSONB fields editable, sample excerpts, anti-examples, confidence score)
5. Three-layer management UI (user/org/product profile pages, layer stacking visualization)

### Definition of Done
- Can scan talvi.app and generate a voice profile
- Can refine through sample paragraph editing (2-3 rounds)
- Can upload Talvi's Content Guidelines doc and have it extracted and merged
- Voice profiles for user, org, and product are viewable and editable
- All three layers are persisted and retrievable

---

## Phase 3: Research & Planner

**Duration:** 4-5 days
**Goal:** Keyword research pipeline, cluster mapping, and content calendar

### Plan Step

Before any code, Claude Code produces a written plan covering:
- SEO API selection: which API(s) to integrate first (Ahrefs vs. Semrush vs. DataForSEO), with pricing/rate limit/data quality comparison, endpoint mapping for keyword expansion, SERP analysis, and competitor gaps, authentication and key management patterns
- Seed query generation: exact LLM prompt structure, how org description and product data feed in, output format and validation, how the user reviews and modifies seed queries
- Clustering approach: API-based clustering (if the chosen SEO tool supports it) vs. LLM-based clustering, how clusters map to content_clusters records, how priority scoring works
- Hub-and-spoke proposal generation: algorithm for deciding hub vs. spoke topics, how the system proposes spoke count and topics per cluster, how user modifications are handled
- Cannibalization detection: keyword uniqueness enforcement at the database level, semantic overlap measurement approach (embedding similarity vs. LLM comparison)
- Content brief generation: exact JSON structure, how it pulls from cluster research data, how SERP context and content gaps are incorporated
- Calendar generation algorithm: how sequencing rules (hubs before spokes, cross-pillar variety, seasonal timing) are implemented, how user-set weekly volume maps to specific dates, dependency resolution
- UI architecture: cluster map visualization approach (node graph vs. list vs. tree), calendar grid component (library or custom), kanban/pipeline board component, drag-and-drop library choice

**Developer reviews and approves the plan before implementation begins.**

### Build Step

1. SEO API integration (API key management in org settings, keyword expansion calls, SERP analysis, result caching)
2. Seed query generation pipeline (LLM-based, user review/edit UI)
3. Keyword clustering and cluster creation
4. Cluster management UI (list view, detail view, hub-and-spoke structure proposal, pillar assignment)
5. Cannibalization checker (keyword map, semantic overlap detection, warning display)
6. Content brief generation (auto-generate from cluster data, brief viewer/editor)
7. Content calendar (generation algorithm, monthly grid view, pipeline/kanban view, drag-and-drop rescheduling, "Generate Now" per piece)

### Definition of Done
- Can run keyword research for Talvi and get cluster recommendations
- Can view and manage clusters with hub-and-spoke structures
- Content calendar generates with proper sequencing logic
- Content briefs are auto-generated for planned pieces
- Cannibalization checker flags duplicate keyword targets

---

## Phase 4: Content Generator

**Duration:** 5-7 days
**Goal:** Full generation pipeline producing publish-ready drafts

### Plan Step

Before any code, Claude Code produces a written plan covering:
- Template data structure: how hub/spoke/playbook templates (from doc 04 Section 2) are stored and referenced, section-level configuration format
- Generation pipeline architecture: how the multi-stage pipeline is orchestrated (sequential async calls vs. queue system vs. state machine), how pipeline state is persisted (so a failed run can resume), timeout handling for long generations, error recovery strategy at each stage
- Prompt engineering: exact prompt structures for each stage (outline generation, section-by-section generation, transition audit, voice audit), referencing docs 02 and 04. How voice briefs are assembled per-section from the three-layer voice system. How corrections ledger rules are queried, filtered by section type, and formatted as "Learned Preferences" in the prompt. Token budget management across multiple section calls.
- Voice audit scoring: implementation of the composite voice match score (banned phrase detection, rhythm analysis, transition word scanning, warmth-integration analysis), must-fix vs. warning classification logic, auto-rewrite loop design (max attempts, what changes between attempts)
- Scheduler: Supabase Edge Function structure, cron expression, how it discovers pieces due for generation, queue management (sequential per org), notification mechanism when draft is ready
- Draft editor: rich text editor library selection (Tiptap vs. Plate vs. Lexical vs. others, with tradeoffs), how edit tracking works at paragraph granularity (debounced saves, diff computation, storage in content_edits), checklist sidebar integration, version history storage approach
- Markdown to Framer-compatible HTML conversion approach (for Phase 6 downstream)

**Developer reviews and approves the plan before implementation begins.**

### Build Step

1. Content type templates (hub, spoke, playbook as structured config data)
2. Outline generation stage (LLM call with template + brief, output parsing)
3. Section-by-section generation (iterative LLM calls with per-section voice briefs, corrections injection, previous section context)
4. Transition audit stage (dedicated LLM pass, automated transition repair)
5. Voice audit stage (scoring, violation detection, must-fix classification)
6. Auto-rewrite loop (rewrite flagged sections, re-audit, max 3 attempts)
7. Metadata generation (meta description, schema data, FAQ extraction, key takeaways)
8. Draft queueing (status update, notification creation)
9. Scheduler (Edge Function, cron, queue management)
10. Draft editor (rich text display, edit capture, checklist sidebar, voice match score, approval flow)
11. Version history (store versions, diff viewer, restore)

### Definition of Done
- Can generate a full Talvi blog post from a content brief through all pipeline stages
- Voice match score is computed and displayed with violation details
- Draft editor captures paragraph-level edits accurately
- Scheduler auto-generates drafts on schedule
- Pre-publish checklist works with auto-checked items
- Approve and regenerate (full or per-section) both work

---

## Phase 5: Learning Loop

**Duration:** 2-3 days
**Goal:** Edit classification, corrections ledger, and voice drift detection

### Plan Step

Before any code, Claude Code produces a written plan covering:
- Edit processing trigger architecture: when exactly does processing run (on piece approval? async background job? batch?), how it handles large numbers of edits per piece
- Noise filtering implementation: exact heuristics for distinguishing substantive edits from typos (Levenshtein threshold, semantic change detection), Haiku classification prompt for edge cases, how filtered-out edits are handled (discarded vs. logged separately)
- Diff classification system: Sonnet classification prompt structure (reference doc 05 Section 3), how rules are extracted from diffs with specific enough language to be useful, how the scope (user/org/product) is determined
- Deduplication strategy: how new rules are checked against existing ledger entries for semantic similarity (embedding comparison vs. LLM comparison vs. keyword overlap, with tradeoffs), merge behavior when a duplicate is detected
- Corrections ledger injection at generation time: exact query for retrieving relevant rules (reference doc 05 Section 4.2), how the top-20 filter and effectiveness sort works, how the "Learned Preferences" prompt block is formatted and positioned in generation prompts
- Effectiveness tracking: how "overrides" are detected (comparing new edits on a generated piece against the rules that were active during its generation), decay algorithm specifics (0.15 per override from doc 05, or adjusted?), when rules become inactive
- Voice drift metrics: rolling window size, computation frequency, threshold values for alerts, alert display component

**Developer reviews and approves the plan before implementation begins.**

### Build Step

1. Edit processing pipeline (trigger on piece approval, filter noise with Haiku, classify with Sonnet, extract rules)
2. Rule deduplication and conflict detection
3. Corrections ledger persistence and CRUD
4. Corrections ledger UI (view by scope and category, edit rules manually, see provenance, see effectiveness)
5. Injection into generation pipeline (query active rules, filter by scope/section type, format as Learned Preferences block)
6. Effectiveness tracking (detect overrides, apply decay, deactivate low-effectiveness rules)
7. Voice drift monitoring (rolling metrics computation, trend detection, alert logic)
8. Drift alert UI (dashboard display, recalibration prompt)
9. Recalibration flow (re-run voice onboarding Phase 2 with current profile as starting point)

### Definition of Done
- Edits from approved pieces are classified and rules are extracted
- Corrections ledger is populated and viewable with provenance
- Rules are injected into subsequent generation prompts
- Effectiveness decay works and low-performing rules are deactivated
- Voice drift metrics are computed and displayed
- Drift alerts trigger when thresholds are crossed

---

## Phase 6: Framer Integration

**Duration:** 2-3 days
**Goal:** Connect to Framer, push content, publish

### Plan Step

Before any code, Claude Code produces a written plan covering:
- Framer Server API integration: how the `framer-api` npm package works (WebSocket connection lifecycle, authentication, error handling), how to manage long-lived connections vs. per-request connections
- Collection and field discovery: how to programmatically read a Framer project's CMS collections and their field schemas, how to present this for user mapping
- Field mapping UI: how the user maps Dark Madder fields to Framer CMS fields, how mappings are persisted, how to handle schema changes on the Framer side (field renamed, deleted, type changed)
- Content transformation: markdown to Framer-compatible rich text HTML conversion (which elements Framer's rich text field supports, how definition boxes and FAQ sections render, how internal links are resolved to absolute URLs)
- Schema markup generation: how Article/FAQ/HowTo/Breadcrumb JSON-LD is generated per content type, how it maps to Framer CMS fields for template variable injection, the 5k character limit workaround if needed
- Publish flow: exact API call sequence (connect > get collection > validate > create item > set fields > trigger publish), error recovery (what happens if the connection drops mid-publish, if a field fails validation), rollback strategy
- Setup documentation: what guide/instructions Dark Madder provides to the user for configuring their Framer project templates (Custom Code section for schema, CMS field structure)

**Developer reviews and approves the plan before implementation begins.**

### Build Step

1. Framer connection setup (API key input, connect via framer-api, fetch collections and fields, mapping UI, health check)
2. Content transformation pipeline (markdown to Framer-compatible HTML, definition box rendering, FAQ field splitting)
3. Publish flow (validation > transform > create CMS item > populate fields > trigger publish > update status)
4. Content update flow (fetch existing item by stored ID, update changed fields, trigger republish)
5. Schema markup generation (Article, FAQ, HowTo, Breadcrumb JSON-LD per content type)
6. Setup guide (documentation for one-time Framer template configuration)

### Definition of Done
- Can connect Dark Madder to a Framer project and map collections/fields
- Can publish an approved draft to Framer CMS with all fields populated
- Published URL is tracked and stored on the content_pieces record
- Schema markup data is generated and available for Framer template injection
- Content updates push changes to already-published Framer CMS items

---

## Phase 7: Analytics & Adjuster

**Duration:** 3-4 days
**Goal:** Data ingestion, performance scoring, and plan adjustment recommendations

### Plan Step

Before any code, Claude Code produces a written plan covering:
- OAuth flow for GSC and GA4: library choices (googleapis vs. google-auth-library vs. next-auth Google provider), token storage (encrypted in Supabase), refresh token handling, scope requirements
- GSC API data pull: which endpoints, which dimensions/metrics, date range handling, how to handle properties with no data, pagination for large result sets
- GA4 API data pull: Data API vs. Admin API, which metrics (engagementTime, scrollDepth, bounceRate equivalent), event-based vs. session-based metrics, quota management
- Ahrefs/Semrush API: which tool, which endpoints for keyword rank tracking and backlink data, rate limits and cost per call, caching strategy
- Analytics snapshot computation: exact implementation of the composite performance score formula (weights from doc 07 Section 3.1), trajectory calculation algorithm (comparing consecutive snapshots), handling of missing data (not all sources may have data for all pieces)
- Biweekly scan automation: Edge Function structure, how it iterates across multiple orgs, timeout handling for slow API responses, error isolation (one org's API failure shouldn't block others)
- Monthly report generation: data aggregation queries (cluster-level from piece-level), how top/bottom performers are identified, report data structure and storage
- Adjuster agent: trigger condition evaluation logic (reference doc 07 Section 5.1), recommendation template structures, how "Add to Calendar" creates content_pieces records and updates the calendar
- Chart/visualization: library choice for analytics charts (Recharts vs. Chart.js vs. alternatives, with tradeoffs)

**Developer reviews and approves the plan before implementation begins.**

### Build Step

1. GSC OAuth flow and data pull pipeline
2. GA4 OAuth flow and data pull pipeline
3. Ahrefs/Semrush API integration and data pull
4. Analytics snapshot creation and storage
5. Performance score computation (composite score, trajectory)
6. Biweekly scan Edge Function (cron, multi-org iteration, outlier flagging)
7. Monthly report generation (cluster aggregation, performer identification, opportunity detection)
8. Adjuster agent (trigger evaluation, recommendation generation, action buttons)
9. Analytics dashboard (org-level overview charts, cluster health map, piece-level detail view)

### Definition of Done
- GSC and GA4 data flows into analytics_snapshots
- Performance scores computed for all published pieces with trajectory tracking
- Monthly report generates with cluster-level analysis
- Adjuster agent produces actionable recommendations with clear reasoning
- Recommendations can be accepted directly into the content calendar

---

## Phase 8: Splits Engine

**Duration:** 2-3 days
**Goal:** Generate platform-specific derivative content from published pieces

### Plan Step

Before any code, Claude Code produces a written plan covering:
- Insight extraction: LLM prompt for identifying standalone compelling insights from a long-form piece (not summarizing, extracting), ranking criteria (uniqueness, specificity, engagement potential), how many insights to extract, output format
- Platform-specific generation: exact prompt structures for LinkedIn, TikTok, Reddit, and Instagram (reference doc 08 Section 2), how voice layers stack differently per platform (user-only for Reddit/TikTok, user+org for LinkedIn/Instagram), how platform best practices are enforced in the prompt
- Alternative hooks: how 2-3 alternative opening hooks are generated for LinkedIn and TikTok, how the user selects between them
- Splits queue architecture: data model for tracking splits by source piece and platform, status management (draft > approved > posted), how the queue UI is organized
- Edit capture: how edits to splits integrate with the learning loop, what "social" context tagging means in practice
- Manual posting workflow: copy-to-clipboard UX, posting notes display (suggested time, platform-specific instructions like "put link in first comment"), engagement tracking UI

**Developer reviews and approves the plan before implementation begins.**

### Build Step

1. Insight extraction pipeline (LLM analysis of source piece, ranking, storage)
2. LinkedIn post generator (with voice adaptation, alternative hooks, best practices enforcement)
3. TikTok script generator (spoken words + text overlays, voice adaptation)
4. Reddit answer generator (subreddit targeting, disclosure language, voice adaptation)
5. Instagram carousel generator (slide-by-slide content, caption, hashtags)
6. Splits queue UI (organized by source/platform, inline editor, status management)
7. Copy-to-clipboard and posting notes
8. Edit capture integration with learning loop (social context tagging)

### Definition of Done
- Can generate LinkedIn, TikTok, Reddit, and Instagram splits from any published piece
- LinkedIn and TikTok splits include 2-3 alternative opening hooks
- Splits queue shows all generated splits organized by platform and source
- User can review, edit, approve, copy, and mark as posted
- Edits to splits are captured for the learning loop

---

## Phase 9: Polish & Integration Testing

**Duration:** 2-3 days
**Goal:** End-to-end testing, UI polish, edge case handling

### Plan Step

Before any code, Claude Code produces a written plan covering:
- End-to-end test scenarios: exact user flows to test with expected outcomes at each step, covering the full lifecycle (create org > voice onboard > research > calendar > generate > edit > approve > publish > analytics > splits)
- Known issues list: compile anything flagged, deferred, or noted during previous phases
- UI audit checklist: every view in the application, every empty state, every loading state, every error state, every responsive breakpoint
- Performance inventory: any slow queries, heavy API calls, or long generation times identified during build
- Remaining TODO items from previous phases

**Developer reviews and approves the plan before implementation begins.**

### Build Step

1. End-to-end flow testing with Talvi as primary test org
2. End-to-end flow testing with DayScore and Bloomify
3. UI/UX polish (loading states with thematic microcopy, error handling, empty states, responsive check, dark theme consistency audit, molecule aesthetic elements)
4. Edge case handling (API rate limits, failed generation recovery, Framer connection loss, large content pieces, concurrent generation requests)
5. Performance optimization (database query optimization, API call batching, generation pipeline timing)

### Definition of Done
- Full end-to-end flow works for all three orgs
- No broken UI states across any view
- Error handling covers all API failure modes with user-friendly messages
- Performance is acceptable (draft generation < 5 minutes, page loads < 2 seconds)
- All loading states use Dark Madder thematic microcopy

---

## Dependency Graph

```
Phase 0 (Foundation)
  |
  v
Phase 1 (Multi-Tenant Core)
  |
  +---> Phase 2 (Voice Engine)
  |       |
  |       +---> Phase 4 (Content Generator) <--- Phase 3 (Research & Planner)
  |               |
  |               +---> Phase 5 (Learning Loop)
  |               |
  |               +---> Phase 6 (Framer Integration)
  |               |       |
  |               |       +---> Phase 7 (Analytics & Adjuster)
  |               |
  |               +---> Phase 8 (Splits Engine)
  |
  +---> Phase 3 (Research & Planner)
  
Phase 9 (Polish) runs after all others
```

**Critical path:** 0 > 1 > 2 > 4 > 6 (Voice + Generation + Framer is the core value chain)

**Can be parallelized:** Phase 3 (Research) can start alongside Phase 2 (Voice) since they share no code dependencies. Phase 5 (Learning Loop) and Phase 6 (Framer) can be built simultaneously after Phase 4.

---

## Post-v1 Roadmap (Not in Scope, but Documented)

- Image generation: AI-generated featured images and in-content visuals
- Multi-CMS support: WordPress and Webflow connectors
- Social API integration: Direct posting to LinkedIn, Twitter/X, Instagram
- Multi-user: Team roles (editor, viewer, admin) per org
- Client-facing version: DDL clients get their own org with managed access
- Email sequence generation: Extend content types beyond blog/guide/playbook
- Webhook integrations: Slack notifications, Zapier triggers
- A/B testing: Generate multiple title/meta description variants and track which performs better
- Greenhaus/Plantr integration: Pull ICP data from the Fortune Farms ecosystem into the voice engine

---

*Dark Madder Specification - 09 Phase Plan - March 2026*
