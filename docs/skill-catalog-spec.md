# Skill Catalog Specification

> Read this alongside `docs/platform-contract.md` and `docs/specs/platform-contract-2027-addendum.md`. This document introduces one new first-class Cortex structure (the Skill Catalog), one new Cortex Operator role (the Authority Agent extends to Skill proposals), one new platform-level aggregation layer (cross-customer Skill performance), and a small set of additions to the app manifest, the Marcus engine v2 pre-analysis brief, and the Insight Store. Once accepted, these become part of the canonical contract. The platform contract is updated to reference this spec; this document is not a parallel source of truth.

**Status:** Draft for review. Author: Zack Holland.

---

## Why This Exists

The 2027 addendum gave Cortex an empirical learning layer: the Pattern Library, where signatures of what works for the customer's business accumulate from operation. Patterns answer "what wins" — warm-lit close-up product shots, opening-with-a-stat subject lines, question-led blog intros for security-IC readers.

There is a layer below patterns that the contract has not yet named: **how artifacts are produced in the first place**. When Dark Madder writes a blog post, somewhere inside the app is a methodology — structural template, opening conventions, section pacing, CTA placement. When Harvest writes a cold email, there is a methodology — subject-line shape, paragraph cadence, P.S. usage, signature. When Implosion designs a static ad, there is a methodology — composition rules, copy structure, hook style. Today these methodologies are baked into app code and prompts. The customer cannot see them, cannot edit them, cannot share them, cannot version them, and cannot attribute performance changes to changes in them.

This is a structural problem with three consequences. First, the customer cannot encode their hard-won knowledge of how their work should be done. A founder who has spent a decade perfecting a cold-email style cannot teach Kinetiks that style explicitly; they can only correct individual outputs and hope the system learns. Second, performance regressions tied to methodology changes are invisible. If a methodology drifts, the customer sees the reply-rate drop but cannot attribute it. Third, there is no shareable unit of methodology. A team that figures out a great blog-writing approach cannot give it to a peer team in another org without copy-pasting and re-explaining.

The Skill Catalog is the structural answer. Skills are first-class, customer-owned methodology objects: platform-level singletons per artifact category, versioned, performance-attributed, editable, shareable as files, and consumed by apps at artifact generation time. Patterns answer *what wins*; Skills answer *how artifacts are produced*. They compose: Skills define the methodology; Patterns inform which dimensions of that methodology to bias toward. Both belong to the customer.

This spec also resolves the long-standing ambiguity about where customer methodology lives. It is not in app code (apps execute, they do not own methodology). It is not in Cortex Voice (which is cross-app prose conventions, not artifact-category structure). It is not in the Pattern Library (which is empirical, not declarative). It is a new structure, peer to those three, with its own surface and its own lifecycle.

---

## Customer Principles

These design choices serve the same founder or small team the 2027 addendum serves. Five principles shape every decision in this document. The first four mirror the 2027 addendum directly; the fifth is added for this spec.

**Innovation through composition.** The Skill Catalog reuses primitives that already exist: app manifests (for declaring consumption), the Learning Ledger (for performance attribution), the Insight Store (for surfacing Skill-related observations), the Authority Agent (for proposing edits), and the Cortex tab pattern (for the user-facing surface). No new architectural concept is invented unless absolutely necessary.

**Safety through reversibility.** Every Skill version is preserved. The customer can revert to the default at any moment. Imported Skills land as new history entries the customer can activate or discard, never auto-applied. Edits never delete previous versions.

**Safety through transparency.** The customer always sees what version of each Skill is active, what changed between versions, what performance has been observed per version, and what the Authority Agent is proposing. The system never produces an artifact under a methodology the customer cannot inspect.

**Safety through composition with existing guardrails.** Skills do not bypass approvals, do not bypass Budget, and do not bypass Authority Grants. A Skill describes *how* an artifact is produced; the existing systems still govern *whether* that artifact may be sent, published, or spent on.

**The customer's methodology is the customer's property.** Skills are export-shareable as files, owned by the org, and never used by Kinetiks to train models or shape product features without explicit opt-in. Aggregate cross-customer performance learning is opt-out by default; raw Skill content from one customer is never directly visible to another customer or to the Kinetiks team in identified form.

---

## What's New, At A Glance

| Structure | Type | Peer Of | Solves |
|---|---|---|---|
| Skill Catalog | First-class Cortex structure | Identity, Goals, Budget, Pattern Library, Authority | Where customer-owned production methodology lives |
| Skill Versions | Object owned by Skills | (versions within a Skill) | Versioned, revertable, performance-attributable methodology |
| Cross-Customer Skill Aggregation | Platform-level aggregation table | (admin-scoped, no peer in the existing contract) | Evidence base for cross-customer Authority Agent proposals and Kinetiks-shipped default upgrades |
| App Skill Consumption | New manifest section on existing apps | (extends `KineticsAppManifest`) | How apps declare which Skills they consume at generation time |

---

## §1. The Skill Catalog

### 1.1 What It Is

The Skill Catalog is a first-class structure in Cortex, sitting alongside Identity, Goals, Budget, Pattern Library, and Authority on the Cortex tab — though presented as its own top-level tab in `apps/id` due to its size and edit frequency (see §6).

The Catalog holds **Skills**: platform-level singletons per artifact category that describe how an app should produce that category of artifact. Examples: Blog Writing, Cold Email, Static Ad Creative, Landing Page Hero, Newsletter Writing, Press Release. There are roughly 15-25 Skills at v1 (see §1.7), not 75; granularity matches how the customer thinks about their work.

Each Skill has a default version shipped by Kinetiks and an active version (the user's latest fork if they have edited, otherwise the default). Apps declare which Skills they consume in their manifest. At artifact generation time, the app pulls the active version of the relevant Skill and composes the production prompt from Cortex Voice, Cortex Identity, relevant Patterns from the Library, and the active Skill content.

Skills are strictly **app-consumed**. Marcus has full read access to the Catalog and speaks about Skills conversationally, but Marcus does not execute Skills to produce artifacts. When a user asks Marcus to write a blog post, Marcus orchestrates Dark Madder to produce it using the active Blog Writing Skill. The "Marcus does not bypass the app layer" rule is structural (see §4).

### 1.2 Schema

```typescript
interface Skill {
  id: string;                            // Stable identifier across versions
  name: string;                          // 'Blog Writing', 'Cold Email', 'Static Ad Creative'
  slug: string;                          // 'blog_writing', 'cold_email', 'static_ad_creative'
  category: SkillCategory;               // For Catalog organization (see §1.7)
  description: string;                   // Plain-language: what this Skill governs

  // Consumption
  consumed_by_apps: string[];            // ['dark_madder', 'hypothesis'] — declared via manifest
  variants: SkillVariant[];              // Named sub-templates (e.g., 'first_touch', 'follow_up')

  // Ownership and scope
  org_id: string;                        // Skills are org-owned, not per-account
  team_scope_id: string | null;          // v2 placeholder; null in v1 (see §5)

  // Current state
  active_version_id: string;             // Which version apps actually use right now
  default_version_id: string;            // The Kinetiks-shipped default at the customer's current default channel

  // Lifecycle
  created_at: string;
  updated_at: string;
}

interface SkillVersion {
  id: string;
  skill_id: string;                      // Parent Skill
  version_label: string;                 // 'default-v4', 'org-v1', 'org-v2', 'imported-from-zack-2026-05-18'
  origin: SkillVersionOrigin;
  content: SkillVersionContent;          // The methodology itself
  parent_version_id: string | null;      // Lineage: which version this was forked or imported from
  performance_summary: SkillPerformanceSummary | null;  // Computed; populated by aggregation job
  notes: string | null;                  // Optional author note: "tightened the opening hook"
  created_at: string;
  created_by_account_id: string;         // Who authored or activated this version
}

type SkillVersionOrigin =
  | 'kinetiks_default'                   // Shipped by Kinetiks; updated when defaults advance
  | 'manual_edit'                        // User authored
  | 'authority_agent_own_data'           // Authority Agent proposal accepted, from this org's data
  | 'authority_agent_cross_customer'     // Authority Agent proposal accepted, from cross-customer aggregate
  | 'imported_from_file';                // Imported via share-file (§1.8)

interface SkillVersionContent {
  // The actual methodology. Shape varies per Skill but follows a common envelope.
  structural_rules: string;              // Plain-language methodology body
  variant_templates: Record<string, string>;  // Keyed by variant name; produces variant-specific prompts
  style_directives: Record<string, unknown>;  // Optional structured directives (length, sections, tone hints)
  composition_notes: string | null;      // How this Skill should compose with Cortex Voice and Patterns
}

interface SkillVariant {
  name: string;                          // 'first_touch', 'follow_up', 'breakup'
  description: string;                   // Plain-language: when this variant is used
}

type SkillCategory =
  | 'content_inbound'
  | 'outbound'
  | 'ads_conversion'
  | 'pr_sales';

interface SkillPerformanceSummary {
  sample_size: number;
  outcome_metric: string;                // 'reply_rate', 'open_rate', 'ctr', 'conversion_rate'
  outcome_value: number;
  outcome_delta_vs_previous_version: number | null;
  observed_window_start: string;
  observed_window_end: string;
  confidence: number;
  computed_at: string;
}
```

Skills are stored in `kinetiks_skills`. Skill versions are stored in `kinetiks_skill_versions`. Both use the standard `data` jsonb payload with sibling structured columns, RLS scoped to `org_id`.

### 1.3 Org Scoping

Skills are owned by the org, not by individual accounts. Every member of the org reads from the same `active_version_id`. Every member of the org can edit (creating a new version), revert, and import. The `created_by_account_id` on a version records authorship for audit; it does not gate access. The `team_scope_id` field is reserved for future intra-org segmentation (see §5).

Performance data is gathered from every account in the org that produced an artifact under a given Skill version. The Authority Agent reasons over the org-level aggregate, not per-account.

This means the team-shared-Skills story has a free synergy with the per-version performance story: the more teammates use a version, the faster the system gets signal on whether it is working.

### 1.4 App Consumption Declaration

Apps declare which Skills they consume in their `KineticsAppManifest`:

```typescript
interface KineticsAppManifest {
  // ... existing fields
  consumes_skills?: SkillConsumptionDescriptor[];
}

interface SkillConsumptionDescriptor {
  skill_slug: string;                    // 'cold_email', 'blog_writing'
  variants_used: string[];               // Which named variants this app invokes
  required: boolean;                     // If true, the app cannot produce this artifact category without the Skill
  fallback_behavior: 'use_default' | 'block_generation';  // What to do if active version is corrupted or missing
}
```

A Skill slug referenced in `consumes_skills` must exist in the platform-shipped Skill registry (see §1.7) or registration fails at app boot. Apps cannot invent Skill slugs at runtime.

### 1.5 Resolution at Generation Time

When an app produces an artifact under a Skill, the resolution order is:

1. Look up the Skill by slug for the current org.
2. Resolve `active_version_id`. If null (first-time consumption), the Skill is initialized with the current Kinetiks default as the active version.
3. Load `SkillVersionContent`.
4. If a variant is specified, pull `variant_templates[variant_name]`. Fail loudly if the variant does not exist on the active version (this signals a manifest/Skill drift bug).
5. Compose the generation prompt as: Cortex Voice + Cortex Identity (relevant layers) + relevant Patterns + active SkillVersion content + variant template + concrete generation context (the actual prospect, blog topic, ad target, etc.).
6. Generate. Tag the resulting artifact with `(skill_id, skill_version_id, variant_name)` in the artifact's own table.

Step 6 is the foundation for performance attribution (§2). Every app that consumes Skills must record these tags or its outcomes cannot be regressed against Skill versions.

### 1.6 Voice vs. Skill Ownership Split

A clean line here prevents users from having to edit the same convention in seven places.

**Cortex Voice owns cross-app prose conventions** that apply regardless of artifact category: tone, vocabulary, comma vs em-dash, emoji policy, sentence-length preference, formality level, signature style.

**Skills own artifact-category-specific structure and methodology**: blog post section ordering, cold email subject-line shape, ad creative composition, landing page hero pacing, lead magnet length and gating.

When the two overlap (e.g., "use sentence case for headlines"), Voice wins. Skills should compose with Voice, not override it. The `composition_notes` field on a SkillVersion is for explicit guidance to the model about how to honor Voice while applying the Skill's methodology.

### 1.7 Default Skills Shipped at v1

These ship as Kinetiks-authored defaults at launch. The list is the v1 Catalog; additional Skills can be added in subsequent releases, but slugs are stable forever once introduced.

**Content & inbound:**
- `blog_writing` — Blog Writing
- `newsletter_writing` — Newsletter Writing
- `lead_magnet_writing` — Lead Magnet Writing
- `social_post_writing` — Social Post Writing (variants: `twitter`, `linkedin`, `reddit`)
- `case_study_writing` — Case Study Writing

**Outbound:**
- `cold_email` — Cold Email (variants: `first_touch`, `follow_up`, `breakup`)
- `linkedin_outreach` — LinkedIn Outreach (variants: `connection_request`, `follow_up_message`)
- `cold_call_script` — Cold Call Script

**Ads & conversion:**
- `static_ad_creative` — Static Ad Creative
- `video_ad_creative` — Video Ad Creative
- `ad_copy` — Ad Copy
- `landing_page_hero` — Landing Page Hero
- `landing_page_long_form` — Landing Page Long-form

**PR & sales:**
- `press_release` — Press Release
- `journalist_pitch_email` — Journalist Pitch Email
- `discovery_call_script` — Discovery Call Script

Granularity rule: a Skill is the highest level the customer thinks about it. Customers think "cold email," not "cold email first touch." Sub-variants live inside the Skill as named templates and apps request them by name. This keeps the Catalog browsable and prevents Skill sprawl.

The default content for each Skill is authored by the Kinetiks team, treated as the elite baseline, and improved over time (see §3.4).

### 1.8 Export and Import (Sharing)

Skills are shareable as files between users. There is no marketplace in v1; sharing is direct file transfer.

**Export endpoint:** `GET /api/cortex/skills/:skill_id/versions/:version_id/export`

```typescript
interface SkillVersionExportPayload {
  schema_version: '1.0.0';
  exported_at: string;
  exported_from_org_id: string;          // Redacted on import
  exported_by_account_id: string;        // Redacted on import
  skill_slug: string;                    // Required for import validation
  skill_name: string;                    // Human-readable, for the import preview
  version_label: string;                 // From the exporting org
  content: SkillVersionContent;
  notes: string | null;
  parent_version_lineage: string[];      // Labels only, for context; not used on import
}
```

The export is a single JSON file. The customer downloads it via a "Share" button on any version in the Catalog. They can send the file to a peer through any channel (email, Slack, file share).

**Import endpoint:** `POST /api/cortex/skills/import`

The import accepts a `SkillVersionExportPayload`. The import:

- Validates that `skill_slug` exists in the importing org's Catalog.
- Validates that `content` matches the `SkillVersionContent` shape and that all variants referenced exist in the target Skill.
- Creates a new SkillVersion with `origin: 'imported_from_file'`, fresh `id`, `parent_version_id: null` (lineage from another org does not transfer), and the imported content.
- The new version lands in the org's Skill history as inactive. The customer must explicitly activate it to make it the `active_version_id`.

Imported versions are never auto-activated. The customer always reviews before adopting an imported methodology.

**Use cases v1:**

1. **Peer sharing.** One founder mails another a Cold Email Skill version they have refined.
2. **Internal team distribution.** A team member who has spent time tuning a Skill shares it with peers in other orgs (or in their own org if intra-org scoping ever splits, see §5).
3. **Backup and portability.** A customer downloads their Skill versions at any time as part of their broader Cortex export.

**Use cases explicitly deferred:**

- Centralized marketplace or community indexing
- Skill discovery surfaces inside the product
- Rating, attribution, or social signals on shared Skills

Sharing is private and direct in v1. The infrastructure is intentionally minimal because the value of Skills depends on trust between the people sharing them, and a marketplace prematurely introduces noise into a system that should reward signal.

---

## §2. Versioning and Performance Attribution

### 2.1 Version Lifecycle

Every Skill has at least one version at any moment: the current Kinetiks default. As the customer interacts, additional versions accumulate.

Legal state transitions for `active_version_id`:

- **Initial state.** On first consumption of a Skill, `active_version_id` is set to the current `default_version_id`.
- **Manual edit.** The user opens a Skill, edits it, and saves. A new SkillVersion is created with `origin: 'manual_edit'`, becomes the `active_version_id`, and the previous version is preserved in history.
- **Revert to default.** The user clicks "Revert to default" on a Skill. `active_version_id` is set back to the current `default_version_id`. No version is deleted; the user's prior versions remain in history and can be reactivated.
- **Activate an existing version.** The user opens history and activates a prior version. `active_version_id` is set to that version's id. No new version is created.
- **Activate an imported version.** Same as above, but the version's origin is `imported_from_file`.
- **Accept an Authority Agent proposal.** The proposed SkillVersion is created with the appropriate origin (`authority_agent_own_data` or `authority_agent_cross_customer`) and becomes active.
- **Kinetiks ships a new default.** `default_version_id` advances. If the org's `active_version_id` was the previous default, it advances silently. If not, the org sees a diff notification (see §3.4).

Versions are immutable once created. Editing a version creates a new version. This is a hard rule and the foundation of performance attribution.

### 2.2 Performance Attribution Path

Every artifact produced under a Skill must record `(skill_id, skill_version_id, variant_name)` at production time. This is the app's responsibility, enforced by the Synapse capability descriptor for any capability that produces a Skill-consuming artifact.

The Learning Ledger captures outcome events with those tags attached. A cold email sent under Cold Email v3.1 that gets a reply produces a Ledger entry with `skill_id`, `skill_version_id`, and the outcome metric (`reply_received`). The same Ledger that already drives confidence scoring, Pattern observation, and Authority Grant calibration now drives Skill performance attribution.

A nightly aggregation job rolls Ledger entries into `kinetiks_skill_performance_summaries`:

```typescript
interface SkillPerformanceSummaryRow {
  org_id: string;
  skill_id: string;
  skill_version_id: string;
  variant_name: string | null;
  outcome_metric: string;                // 'reply_rate', 'open_rate', etc.
  window_start: string;
  window_end: string;
  sample_size: number;
  outcome_value: number;
  variance: number;
  computed_at: string;
}
```

This is the table Marcus, the Authority Agent, the Insight Store, and the Catalog UI all read from for per-version performance numbers.

### 2.3 The query_skill_performance Tool

A new tool registered in the Tool Registry, available to Marcus and the Authority Agent:

```typescript
interface QuerySkillPerformanceInput {
  skill_slug: string;
  variant_name?: string;
  version_ids?: string[];                // If provided, restrict to specific versions
  window?: { start: string; end: string };
  outcome_metric?: string;               // If provided, restrict to one metric
}

interface QuerySkillPerformanceOutput {
  rows: SkillPerformanceSummaryRow[];
  active_version_id: string;
  default_version_id: string;
  comparison_summary: string | null;     // Plain-language: 'v3.1 reply rate is 6 points below v3.0 across 47 sends'
}
```

The `comparison_summary` is generated by a Haiku call when the query is called with multiple version IDs or when a notable regression is detected. Marcus uses this directly in conversation; the Authority Agent uses it as the human-readable basis for proposals.

### 2.4 Insight Store Integration

A new insight type: `skill_performance_observation`. Generated by the aggregation job when:

- A version's outcome value drops by more than a configurable threshold (default 10%) versus the prior version, with sample size above a minimum (default 30).
- A version's outcome value rises significantly versus the prior version.
- A new Kinetiks default ships and differs from the org's active version (see §3.4).
- An Authority Agent proposal is generated (see §3.2 and §3.3).

These insights are read by Marcus and woven into Chat naturally, per the existing Insight Store consumption pattern.

---

## §3. The Four Sources of Skill Improvement

A Skill version can be created from one of four sources. Each has different signals, evidence requirements, and customer controls.

### 3.1 Manual Edits

The user opens a Skill in the Catalog, edits the content, and saves. A new version is created with `origin: 'manual_edit'`. This is the simplest path and has no system-side gating; the user is the author and the authority.

### 3.2 Authority Agent Proposals from the Customer's Own Data

When the aggregation job detects a meaningful performance regression on a Skill version (or a clear improvement opportunity inferred from Pattern Library evidence), it triggers an Authority Agent proposal. The proposal is built from:

- The Skill's recent `SkillPerformanceSummaryRow` history (this org's data only).
- Relevant entries from the Pattern Library at signature granularity (e.g., "your data shows stat-led openings outperform question-led openings 1.8x").
- Cortex Voice and Identity for compositional grounding.
- The customer's standing preferences from Cortex Identity.

The proposal is rendered with three things visible: the proposed new SkillVersion content, the evidence that justifies it (sample sizes, deltas, attribution to specific Pattern Library entries), and a plain-language summary suitable for Chat surfacing.

The customer reviews, edits, and approves; or rejects with a reason. Approval creates a SkillVersion with `origin: 'authority_agent_own_data'` and activates it. Rejection is a Learning Ledger entry that calibrates the Authority Agent's future proposals.

The customer always approves. The Authority Agent never activates its own proposals. This is the same rule as Authority Grant proposals.

### 3.3 Authority Agent Proposals from Cross-Customer Learning

This is the sensitive source. The Authority Agent reads from `kinetiks_skill_cross_customer_aggregates` (see §3.5) to identify performance patterns across the customer base, and proposes adaptations of a customer's Skill based on what is working for similar customers.

The proposal is rendered with explicit attribution: "Across 142 B2B SaaS founders with similar ICPs to yours, this opening pattern outperformed yours by an average of 11 points over the last quarter. Here is a proposed adaptation to your Cold Email Skill." The customer sees the sample size, the ICP similarity scope, and the proposed content. They review, edit, approve, or reject.

Three requirements for any cross-customer proposal to be generated:

1. The aggregate evidence must include at least the configured minimum sample size (default 50 orgs with comparable usage) and confidence (default 0.8).
2. The customer must be opted into cross-customer learning proposals (default on; see §3.7).
3. The ICP similarity scope must match (see §3.6). A pattern that works for B2B SaaS founders does not generate a proposal for a DTC ecommerce customer.

Approved cross-customer proposals create a SkillVersion with `origin: 'authority_agent_cross_customer'` and activate it. The lineage is preserved in `parent_version_id`.

### 3.4 Default Version Upgrades Shipped by Kinetiks

This is the same underlying mechanism as §3.3, but operated by the Kinetiks team rather than by the Authority Agent in real time.

The Kinetiks team observes aggregate cross-customer Skill performance. When a methodology change demonstrates broad lift, the team ships a new default version. The mechanism:

- A new SkillVersion is published as the new `default_version_id` for the affected Skill, platform-wide.
- Orgs whose `active_version_id` was the previous default advance silently to the new default. A passive notification appears in the Catalog: "Default updated. Here's what changed."
- Orgs whose `active_version_id` was a fork (manual, Authority Agent proposal, or imported) see an active notification: "We shipped a new default for Cold Email. Here's what changed. Want to see how it compares to your current version?" The customer can view a diff, optionally activate the new default, or dismiss.
- Customer edits are never automatically merged into a new default. The customer either adopts the new default wholesale or stays on their fork; merging is a manual action.

This is intentionally conservative. Auto-merging customer edits with shipped defaults is a trust failure waiting to happen.

### 3.5 Cross-Customer Aggregation Architecture

A new platform-level table:

```typescript
interface SkillCrossCustomerAggregateRow {
  skill_id_slug: string;                 // Stable slug, not internal id (which is per-org)
  variant_name: string | null;
  content_fingerprint: string;           // Hash of structural_rules + variant_templates + style_directives
  outcome_metric: string;
  window_start: string;
  window_end: string;
  icp_segment: string | null;            // From the Customers layer, normalized
  sample_size_orgs: number;              // Number of distinct orgs contributing
  sample_size_artifacts: number;
  outcome_value: number;
  variance: number;
  computed_at: string;
}
```

This table is platform-scoped, readable only by Kinetiks platform admins and by the Authority Agent's reasoning layer (via a privileged tool). It is never readable from customer accounts directly.

The aggregation job that populates it:

- Runs nightly.
- Pulls `SkillPerformanceSummaryRow` from every org's row in `kinetiks_skill_performance_summaries`.
- Groups by `content_fingerprint` (so identical Skill content across orgs aggregates together regardless of which org authored it).
- Excludes orgs that have opted out of cross-customer learning contribution (see §3.7).
- Enforces a minimum org count for any aggregate row (default 10) so that no single org's data is identifiable from the aggregates.

The `content_fingerprint` is the privacy hinge. It groups *methodology* across customers without revealing which customer authored what.

### 3.6 ICP Similarity Matching

A Skill version that lifts performance for B2B SaaS seed-stage founders is not automatically right for DTC ecommerce brands. Cross-customer proposals must scope to "customers like you" or they produce noise.

The Customers layer of Cortex Identity already segments accounts by ICP. A normalized `icp_segment` value is derived from the customer's primary ICP (and updated when their primary ICP changes). The aggregation table is keyed by `icp_segment`; cross-customer proposals filter to the requesting org's segment.

ICP normalization is the responsibility of the Archivist. The exact normalization function lives in `packages/cortex/icp-segmentation.ts` and is calibrated against the customer base over time.

If a customer's ICP is too narrow to match any segment with enough volume for cross-customer learning, cross-customer proposals are simply not generated for them. The customer is not penalized; they continue to receive proposals from their own data (§3.2) and from new shipped defaults (§3.4).

### 3.7 Customer Opt-In

Two distinct toggles in settings:

1. **Receive cross-customer Authority Agent proposals.** Default: on. When off, the org never receives §3.3 proposals on its own Skills. Their data still flows into aggregate metrics for shipping new defaults, since that is how the platform improves for everyone.

2. **Contribute to cross-customer aggregates.** Default: on. When off, this org's Skill performance data is excluded from the aggregation in §3.5 entirely. Their own per-version performance still works (§2.1-§2.4) and their own-data proposals still fire (§3.2); they simply do not contribute to the cross-customer learning loop.

Both toggles have plain-language explanations at the settings surface and at onboarding. The customer is told exactly what each toggle does and what it does not do.

---

## §4. Marcus Integration

### 4.1 Read Access

Marcus reads the full Skill Catalog for the current org: active versions, full version history, performance summaries, pending Authority Agent proposals, recent insights of type `skill_performance_observation`. RLS-scoped to `org_id`.

### 4.2 New Tools

Two tools are added to the Tool Registry and available to Marcus and the Authority Agent:

- **`query_skills`** — returns Skill metadata (active version, history summary, recent insights) for a given skill_slug or for all Skills in the org.
- **`query_skill_performance`** — defined in §2.3.

These tools are read-only. Marcus cannot edit Skills directly via tools; edits are structured updates surfaced through the Catalog UI or as Authority Agent proposals.

### 4.3 Pre-Analysis Brief Integration

Per the Marcus engine v2 plan, the pre-analysis Haiku step builds an evidence brief adjacent to the user's question. The brief is extended:

- When the user's question references a specific artifact type (blog, email, ad, landing page), the pre-analysis step calls `query_skills` for the relevant slug and `query_skill_performance` for the active version.
- The brief includes: active version label, version history depth, most recent performance summary, whether an Authority Agent proposal is pending.
- Marcus reasons over the brief and grounds responses in what is actually running and how it is performing.

Example: user asks "how should I improve my outreach." Pre-analysis pulls active Cold Email Skill metadata plus recent reply-rate trend. Marcus responds grounded in the actual current methodology and the actual current performance, not generic best-practice advice.

### 4.4 Conversational Skill Management

Marcus answers Skill questions directly in Chat:

- "What version of my Cold Email Skill is active?"
- "What changed between v3.0 and v3.1?"
- "Which Skills have I customized?"
- "How is my Blog Writing Skill performing?"
- "What's the Authority Agent proposing for my Skills right now?"

These are reads against the Catalog and the Learning Ledger. Marcus already serves as the conversational interface to those structures for Patterns and Authority Grants; the same pattern applies here.

When the user wants to act ("I want to edit my Cold Email Skill"), Marcus can either navigate them to the Catalog with that Skill open, or surface the version diff and proposed edits inline in Chat for review — but the edit itself is a structured update to the Skill object, not Marcus rewriting the Skill freehand.

### 4.5 Proactive Surfacing

Marcus weaves Skill-related insights into Chat naturally. When the `skill_performance_observation` insight type fires:

- Significant regression: "Your Cold Email Skill's reply rate has dropped 4 points since v3.1 was uploaded. The Authority Agent has a proposed v3.2 ready when you want to look at it."
- New Kinetiks default shipped: "We shipped a new default for Blog Writing. The biggest change is in section pacing. Want to see how it compares to your current version?"
- Authority Agent proposal pending: surfaced once at appropriate moment, not repeatedly.

The existing Insight Store delivery semantics apply: insights are surfaced once, marked as delivered, and not repeated.

### 4.6 The No-Bypass Principle

When the user asks Marcus to produce an artifact ("write a blog post about X"), Marcus orchestrates the appropriate app (Dark Madder), which produces the artifact using the active Skill. Marcus does not generate the artifact himself, even when he has full read access to the Skill content.

This is not a technical limitation. It is a structural choice. The apps-first model depends on apps being the producers of work; if Marcus bypasses the app layer, attribution breaks, performance tracking breaks, and the architecture's clarity erodes. Marcus is the orchestrator and the explainer. He is not the executor.

---

## §5. Multi-User and Org Scoping

Skills are org-owned from v1, not user-owned. Every member of the org reads the same `active_version_id` and can edit, revert, and import.

The `team_scope_id` placeholder field on `kinetiks_skills` and `kinetiks_skill_versions` matches the 2027 addendum's forward-compatibility pattern. It is null in v1. When intra-org segmentation ships (separate teams within one org needing separate Skill sets), the schema is already shaped to support it without migration.

Performance aggregation is org-scoped: the `org_id` keys every `SkillPerformanceSummaryRow`, and the Authority Agent reasons over the combined org-level data. When two teammates produce cold emails under the same Skill version, both sets of outcomes attribute to that version.

Audit trails preserve `created_by_account_id` on every version, even though the version itself is org-owned. This satisfies the "who changed what" question without complicating access control.

---

## §6. UI Surface

### 6.1 The Skill Catalog Tab

Skills get a top-level tab in `apps/id`, peer to Chat, Analytics, and Cortex. The size of the Catalog (15-25 Skills) and the edit frequency justify a dedicated surface; folding it into Cortex would either bury it or unbalance the Cortex tab.

The default Catalog view is a grid of Skills, organized by category (Content & Inbound, Outbound, Ads & Conversion, PR & Sales). Each Skill card shows: name, description, active version label, recent performance trend (sparkline), whether a proposal is pending. A "Customized" badge appears on Skills with `active_version_id ≠ default_version_id`.

### 6.2 Skill Detail View

Clicking into a Skill opens the detail view with three tabs: **Active** (the current version content, editable in place), **History** (all versions with timestamps, origins, performance summaries, and a diff viewer), and **Performance** (chart of outcome metrics over time, broken down by version).

The Active tab is the primary editing surface. The user can edit the structural rules, variant templates, style directives, and composition notes directly. Saving creates a new version and activates it.

A "Revert to default" button is present and prominent. A "Share" button generates a downloadable file for the current version. An "Import" affordance accepts a shared file and adds it to history as inactive.

### 6.3 Authority Agent Proposals

Pending proposals appear at the top of the Catalog as a notification banner ("3 proposed Skill updates ready for review") and within each affected Skill's detail view. A proposal review screen shows the proposed content, the diff against the current active version, the evidence basis (own data and/or cross-customer aggregates with attribution), and three actions: Approve, Approve with edits, Reject (with optional reason).

### 6.4 Cross-Customer Learning Settings

The two toggles from §3.7 live in account settings under a "Cross-customer learning" section with a one-paragraph plain-language explanation. The current state is visible alongside the toggle.

---

## §7. Customer-Facing Language

Skills are unusual among the new platform structures in that the customer-facing name and the internal name are the same. "Skill" is what we call them in code, in product, in Chat, in marketing, and in support docs. There is no parallel internal-only term.

This is a deliberate departure from the Authority Grant / Authority split, and from Marcus / [user's named system]. Skills are simple enough as a concept that no friction emerges from using the architectural name in product. The plain-language layer is in the Skill *content* (the methodology body is in natural language), not in the wrapping name.

The Catalog is "the Skill Catalog" everywhere. Versions are "versions." A user-edited version is a "fork" internally and a "customized version" in product copy. Authority Agent proposals are surfaced as "proposed updates" in product.

The customer never sees "SkillVersionOrigin" or "content_fingerprint" or "cross_customer_aggregate_row." All proposals, diffs, and performance summaries are rendered in plain language. The internal cast of objects exists in code only.

---

## §8. Risks and Mitigations

**1. The Catalog becomes a sprawling configuration surface, overwhelming users.** A customer opens the Catalog and faces 25 Skills, each with deep customization. Most never touch them. The feature becomes power-user-only.

*Mitigation:* Sensible Kinetiks-shipped defaults that 90% of users never need to edit. The Catalog leads with active version performance and the "Customized" badge; users only dig in when they have reason to. The Authority Agent does the deep work for most customers, surfacing proposals only when there is evidence-backed reason to change something.

**2. A user-customized Skill silently underperforms the default and the customer doesn't notice.** They edited Cold Email three months ago, reply rates dropped, but they never re-opened the Catalog.

*Mitigation:* Performance regression triggers a `skill_performance_observation` insight, which surfaces through Marcus and through the Catalog banner. The customer sees a comparison against the prior version (and optionally against the current default) without having to look for it.

**3. Cross-customer proposals leak proprietary methodology.** A customer worries that their Skill edits will be visible to other customers via the aggregation layer.

*Mitigation:* The `content_fingerprint` is a one-way hash of methodology content. Aggregation rows expose the content (as fingerprint and metadata about its performance) but never the org that authored it. Minimum-org thresholds (default 10) prevent any single org's content from being uniquely identifiable. The customer can opt out of contributing entirely (§3.7).

**4. Shared Skill files contain malicious prompt content.** A user imports a file from a peer that includes prompt-injection-style content designed to subvert the generation.

*Mitigation:* Imports validate against the `SkillVersionContent` shape. The content is rendered to the user before activation, never auto-activated. The Marcus engine v2's pre-analysis brief structure (treating Skill content as data to reason over, not as instructions to follow) limits the blast radius of any malicious content that survives review. Long-term, a content sanitization pass on imported Skills is a phase-2 addition.

**5. A Kinetiks-shipped default upgrade breaks methodology customers depended on.** Your team ships v5 of Cold Email, customers on v4 of the default advance silently, and reply rates drop for some of them.

*Mitigation:* Default upgrades are tested against the cross-customer aggregate before shipping (the upgrade only ships if v5 outperforms v4 in the aggregate). Customers can revert to a prior default (the system retains prior default version IDs). A "rollback" surface in the Catalog lets the customer pin to a specific default version if the new one performs worse for them than the old one.

**6. Performance attribution is corrupted by external factors and the system proposes changes based on false signal.** A market shift causes reply rates to drop; the system attributes the drop to a recent Skill change and proposes a revert that does not actually help.

*Mitigation:* The aggregation job includes a window comparison against the same Skill version's earlier performance and against other Skills in the same org. Cross-Skill comparisons reveal whether the regression is Skill-specific or account-wide. The Authority Agent's proposal text surfaces this context to the customer ("we noticed Cold Email reply rate dropped; we also notice your other channels dropped in the same window, so this may be an external shift rather than a Skill issue").

**7. The Skill abstraction proves wrong for some artifact category and apps fight against it.** A new app type (e.g., voice agents) does not fit the Skill model cleanly.

*Mitigation:* The Skill consumption descriptor in the manifest is opt-in. Apps that do not consume Skills do not interact with the Catalog. New artifact categories can either add new Skills to the Catalog or operate outside it; the choice is per-app. The Catalog should not be forced on artifact types it does not fit.

---

## §9. Open Questions Now Resolved

The conversation that produced this spec opened with several open questions. Each is resolved as follows:

1. **Are Skills app-declared or platform-level?** Platform-level. Skills are singletons per artifact category, consumed by zero or more apps via manifest declaration. (§1.1, §1.4)

2. **Can Marcus invoke a Skill directly to produce an artifact in Chat?** No. Marcus has full read access and conversational coverage of Skills, but execution always routes through the consuming app. The apps-first model is preserved. (§4.6)

3. **Are Skills per-user or per-org?** Per-org. All teammates share the same active version, with performance aggregating across the org. The `team_scope_id` placeholder is shaped for future intra-org segmentation. (§1.3, §5)

4. **How is sharing structured?** File-based export/import via a Share button. No marketplace, no community indexing, no rating system in v1. (§1.8)

5. **How does cross-customer learning work without violating customer data ownership?** Aggregation by `content_fingerprint` strips authorship; minimum-org thresholds prevent identification; opt-out is available for both proposal reception and aggregate contribution. (§3.5, §3.6, §3.7)

6. **What is the customer-facing name?** "Skills." No internal/external split needed; the concept is simple enough that no friction emerges from the architectural name. (§7)

---

## §10. Authorship and Adoption

Drafted in conversation with Zack Holland for the Kinetiks AI monorepo.

This document is intended to be merged into `docs/specs/` as `skill-catalog-spec.md`, and referenced from `docs/CLAUDE.md`, `docs/platform-contract.md`, and `docs/specs/platform-contract-2027-addendum.md`. Once accepted, subsequent build plans for the Skill Catalog subsystem (Phase 1: schema, manifests, app consumption wiring; Phase 2: Catalog UI surface; Phase 3: performance attribution; Phase 4: Authority Agent Skill proposal extension; Phase 5: cross-customer aggregation) each reference this document as their architectural foundation.

The platform contract version bumps with the merger of this spec. Apps, integrations, and agents built or updated after the merge conform to the structures described here.
