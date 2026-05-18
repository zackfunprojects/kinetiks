# Platform Contract 2027 Addendum: Pattern Library, Authority Grants, Operator Workflows

> Read this alongside `docs/platform-contract.md`. This addendum introduces three additions, one extension, and one synthesis that the original contract did not anticipate. Once accepted, these become part of the canonical contract, and every app, integration, and agent built after this date conforms to them. The platform contract is updated to reference this addendum; this document is not a parallel source of truth.

**Status:** Draft for review. Author: Zack Holland.

---

## Why This Exists

The original platform contract was designed around the first four customer-facing apps: Harvest, Dark Madder, Hypothesis, and Litmus. Those four share a common shape. Each one generates a relatively small number of consequential actions per day - send this email, publish this post, pitch this journalist, ship this landing-page variant. Each action is discrete, individually surfaceable, and well-served by the existing per-action confidence model.

Implosion does not have that shape. Implosion is the AI ads product, scheduled to ship after Hypothesis and before Litmus. Its design is an innovation in three directions at once:

1. **Tagged creative at volume.** Every visual asset Implosion generates is tagged by the AI on multiple dimensions (lighting, subject, framing, product presence, color story, energy, format) and paired with a messaging signature and a target ICP, producing a unique fingerprint per ad.
2. **Continuous performance loop.** Ads run in deliberately broad audiences to let platform algorithms do their work. As signatures emerge as winners, Implosion's creative engine generates more variants in the winning direction automatically.
3. **Cross-app learning.** The winning signatures are not just Implosion's data. They are the most valuable empirical learning the entire customer's GTM produces, and they belong upstream where every other app can use them.

That shape pressure-tests three things in the existing platform contract:

**There is no first-class home for cross-app performance intelligence.** The eight existing `ContextLayer` values describe identity (voice, brand, customers, products, narrative, market, competitive, org), not empirical learnings about what wins in operation. Implosion's most valuable cross-app output - the signatures that convert - has no canonical location.

**The Approval System assumes low-frequency, individually-surfaced actions.** A continuous optimization loop firing three hundred decisions per day into the customer's queue is noise, not safety. Auto-approving them all without explicit, scoped, time-bounded user consent is reckless.

**The Workflow primitive is specced for cross-app coordination, not for coordinating an app's own internal Operators.** Implosion has eight tightly-coupled internal agents (Foundation, Creative, Tagger, Launcher, Auditor, Optimizer, Pattern-Recognizer, Reporter) that must coordinate with explicit dependencies, conditional branches, and internal approval checkpoints. The contract does not currently say whether the existing Workflow primitive is the right home for that, or whether intra-app coordination is a separate concern.

This addendum adds two first-class structures (Pattern Library, Authority Grants), one extension (Operator Workflows), and one foundation (multi-user placeholder schema) to the platform contract to address all of the above. Each is designed to compose cleanly with the existing platform - Cortex Operators, Synapse, Approval System, Learning Ledger, Programs, Workflows - not to replace any part of it.

---

## Customer Principles

These design choices are made in service of the end customer: the founder or small team running their entire GTM through Kinetiks. The 2027 vision is a system the customer trusts deeply enough to grant real authority over real spend and real outreach, while remaining fully in control. Five principles shape every decision in this document.

**Innovation through composition.** Every structure here reuses primitives that already exist (Cortex objects, Synapse Proposals, Learning Ledger entries, the Approval System, Programs, Workflows). No new architectural concept is invented unless absolutely necessary. The novelty lives in how the pieces compose.

**Safety through reversibility.** Every action taken by the system is logged, attributable, and reversible to the extent the underlying platform supports it. Authority Grants can be paused, narrowed, or revoked at any moment. The Pattern Library never overwrites user-entered data. The customer can export their patterns and walk away at any time.

**Safety through transparency.** The customer always sees what authority is in effect, what has been done with it, what patterns are emerging from their operation, and why the system did what it did. The system never operates in a way the customer cannot reconstruct after the fact.

**Safety through composition with existing guardrails.** Budget approvals remain non-negotiable and never bypassed. The Approval System remains the dominant safety mechanism for any action outside an explicit Authority Grant. Per-tool `autoApproveThreshold` values remain the fallback for anything not covered by a grant.

**Innovation through learning.** The Pattern Library grows with operation. The Authority Agent learns to propose better-shaped grants over time. Pattern decay is empirically calibrated by the system rather than statically declared. The Learning Ledger now operates at three levels: per-action confidence (as before), per-grant authority (new), and per-pattern-type decay (new).

---

## What's New, At A Glance

| Structure | Type | Peer Of | Solves |
|---|---|---|---|
| Pattern Library | First-class Cortex structure | Identity, Goals, Budget | Where empirical cross-app performance intelligence lives |
| Authority Grants | First-class Cortex structure plus Approval System extension | Approval queue, Budget approvals | Tiered autonomy at high-frequency cadence without losing customer control |
| Operator Workflows | Clarifying extension of the existing Workflow primitive | (same primitive, extended scope) | How intra-app agent coordination is structured |
| Multi-user placeholders | Schema-only forward-compatibility | (additive) | The schema is ready when team semantics ship; v1 is solo-builder-only |

---

## §1. Pattern Library

### 1.1 What It Is

The Pattern Library is a first-class structure in Cortex, sitting alongside Identity, Goals, and Budget on the Cortex tab. It holds empirically validated signatures of what works for this customer's business. A signature is a multi-dimensional fingerprint of an artifact or action (creative tags, messaging frames, content topics, audience segments, headline structures, send times, anything an app instruments) paired with outcome data and confidence.

Patterns are produced by apps from their own operational data and read by all apps to inform their own decisions. Implosion emits a creative-signature pattern saying "warm-lit close-up product shots paired with the `the X problem you didn't know you had` messaging hit 3.2x baseline CTR for the cybersecurity-IC ICP." Dark Madder reads it and proposes thumbnail directions for blog posts targeting the same ICP. Hypothesis reads it and proposes headline structures for landing-page A/B tests. Harvest reads it and proposes outbound subject-line frames.

The Pattern Library is the structural answer to "how does cross-app intelligence actually flow." Before this addendum, the answer was implicit: apps emitted Proposals to the eight context layers, and other apps read those layers. That works for identity-shaped data (this is our voice, these are our customers) but not for empirical-shaped data (this combination of attributes won at this rate with this sample size, decaying at this rate over time).

### 1.2 Schema

```typescript
interface Pattern {
  id: string;
  account_id: string;
  team_scope_id: string | null;          // v2 placeholder; always null in v1

  // Source
  source_app: string;                    // 'implosion', 'dark_madder', 'harvest', 'hypothesis', 'litmus'
  source_workflow_id: string | null;     // The workflow run that produced this pattern, if applicable

  // Identity
  pattern_type: string;                  // App-defined; validated against the Pattern Type Registry
  dimensions: Record<string, unknown>;   // The signature - shape validated per pattern_type
  applies_to_icp: string | null;         // ICP segment ID from the customers layer, or null for global

  // Outcome
  outcome_metric: string;                // 'ctr', 'cpa', 'reply_rate', 'conversion_rate', 'open_rate', etc.
  outcome_value: number;
  outcome_direction: 'higher_is_better' | 'lower_is_better';
  baseline_value: number | null;         // What an average pattern of this type produces for this account
  lift_ratio: number | null;             // outcome_value / baseline_value when both are present

  // Evidence
  sample_size: number;
  confidence_score: number;              // 0-1, derived from sample size, variance, recency
  variance: number | null;
  first_observed_at: string;
  last_observed_at: string;

  // Lifecycle
  status: 'emerging' | 'validated' | 'declining' | 'archived';
  effective_decay_days: number;          // The currently active decay window for this pattern; see §1.6
  decay_at: string | null;               // last_observed_at + effective_decay_days

  // Provenance
  imported: boolean;                     // True if seeded via the import endpoint
  imported_from: { account_id: string | null; exported_at: string } | null;

  // User overrides
  user_starred: boolean;                 // User-marked "always weight this highly"
  user_suppressed: boolean;              // User-marked "ignore this pattern"
  user_annotation: string | null;

  created_at: string;
  updated_at: string;
}
```

Patterns are stored in `kinetiks_pattern_library`. The table is **hybrid**: every field declared on the `Pattern` interface above is a top-level column (lifecycle fields, outcome fields, evidence fields, override fields, provenance fields, the source attribution). The variable-shape payload — `dimensions` and `evidence_summary` — lives in jsonb columns on the same row. RLS is account-scoped; `team_scope_id` is described in §4.

The hybrid shape is a deliberate divergence from the pure `(account_id, data jsonb, confidence_score)` posture of the `kinetiks_context_*` tables. The Pattern Library read path filters and ranks on `(pattern_type, status, applies_to_icp, confidence_score, lift_ratio, decay_at)` — those need to be indexed B-tree columns, not jsonb fields. The same hybrid pattern is used by `kinetiks_authority_grants` (§2.3) for the same reason: identity-shaped data uses `data` jsonb; evidence/lifecycle/authority data uses top-level columns.

### 1.3 The Pattern Type Registry

Every `pattern_type` value is registered in a global Pattern Type Registry, analogous to the Tool Registry but pattern-scoped. A registry entry declares:

```typescript
interface PatternTypeDescriptor {
  pattern_type: string;
  source_app: string;                    // Which app owns this type
  description: string;                   // LLM-readable: what this pattern represents
  example?: Record<string, unknown>;     // Example dimensions block for LLM grounding

  // Identity and read scope
  dimensions_schema: JSONSchema;         // Zod-validated shape of the dimensions field
  fingerprint_dimensions: string[];      // Declared identity-relevant dims in canonical order; identity is the tuple of these values
  read_apps: string[];                   // Which apps may read this pattern type; '*' for all
  customer_visible: boolean;             // Whether this type appears in the Cortex Patterns sub-tab (orthogonal to read_apps)

  // Outcome (canonical single-primary; one outcome per pattern type)
  outcome_metric: string;                // e.g. 'reply_rate', 'meeting_book_rate', 'deal_close_rate'
  outcome_unit: string;                  // e.g. 'ratio_0_1', 'count', 'seconds', 'currency_usd'
  outcome_direction: 'higher_is_better' | 'lower_is_better';

  // Cardinality discipline (see §1.14 below)
  bucketize?: (raw: Record<string, unknown>) => Dimensions;  // Optional but REQUIRED for high-cardinality dimensions
  expected_max_fingerprints_per_account?: number;            // Cardinality intent; warns if absent, fails if absurdly high

  // Decay (see §1.6)
  initial_decay_days: number;            // Seed value used until the system has enough evidence to learn
  decay_floor_days: number;              // Minimum decay; empirical calibration cannot go below this
  decay_ceiling_days: number;            // Maximum decay; empirical calibration cannot go above this
  calibration_sample_threshold: number;  // How many pattern uses before learned decay takes over from seed

  // Confidence thresholds for the lifecycle state machine
  confidence_thresholds: {
    validate_at: number;                 // emerging → validated when confidence crosses this
    decline_at: number;                  // validated → declining when confidence falls below this
  };
}
```

The registry serves five purposes. First, it validates pattern shape on write — an app cannot emit a malformed pattern. Second, it makes patterns discoverable — Marcus and other agents can list available pattern types and reason about which ones are relevant. Third, it documents the cross-app contract — Dark Madder explicitly declares which pattern types from which apps it reads, auditable. Fourth, it bounds the empirical decay calibration (§1.6) so the system cannot diverge wildly from the app's understanding of its own domain. Fifth, it enforces **cardinality discipline** via `bucketize` and `expected_max_fingerprints_per_account` — the single biggest failure mode of the Pattern Library is pattern type explosion (dimensions too narrow to ever validate). The descriptor's `bucketize` function is run server-side BEFORE canonicalization and fingerprinting, collapsing high-cardinality raw inputs (free-text industries, granular titles, continuous numerics) to coarse buckets (~15 NAICS-L2 industries, ~12 title families, ~10 employee-count bands). Without it, every minor variation becomes a new fingerprint and confidence never accumulates.

`expected_max_fingerprints_per_account` declares cardinality intent at registration. Registration warns when absent on a non-trivial descriptor and fails when declared above a hard ceiling (1000 default soft / 100,000 hard). A pattern type that violates the soft ceiling is signaling its bucketization may be insufficient; one above the hard ceiling cannot register at all.

Pattern types are registered at app boot, the same way tools and capabilities are. A pattern type whose `source_app` is unregistered, whose schema is invalid, whose decay bounds are inconsistent, whose `confidence_thresholds.validate_at <= decline_at`, or whose `expected_max_fingerprints_per_account` exceeds the hard ceiling does not load.

### 1.4 Write Path

Apps emit patterns via Synapse, using the same up-channel as Proposals. The shape is slightly different - patterns are not arbitrated against existing context the way scalar identity fields are. Instead, the Archivist evaluates each incoming pattern for:

- Schema validity (against the registered `dimensions_schema`)
- Statistical soundness (sample size above the registered threshold, variance within bounds)
- Duplicate or update detection (does an existing pattern with these dimensions already exist for this ICP?)

If a pattern is novel, it is inserted with `status: 'emerging'`. If it matches an existing pattern, the existing pattern's evidence is updated (sample size grows, confidence recalculates, `last_observed_at` advances, `decay_at` extends). If a previously-validated pattern's recent evidence trend reverses, status moves to `declining`.

Apps never write directly to `kinetiks_pattern_library`. The Archivist is the canonical writer, just as it is for every other context-layer table.

### 1.5 Read Path

Apps and agents read patterns through a single Cortex tool: `query_patterns`. The tool takes filters (pattern_type, ICP, source_app, minimum_confidence, status) and returns a ranked list. Confidence, recency, and `lift_ratio` drive the ranking. Declining patterns are still returned but flagged.

```typescript
interface QueryPatternsInput {
  pattern_types?: string[];
  source_apps?: string[];
  applies_to_icp?: string | null;
  minimum_confidence?: number;
  status_in?: ('emerging' | 'validated' | 'declining')[];
  exclude_user_suppressed?: boolean;     // Default true
  limit?: number;                        // Default 20
}
```

The tool is available to every app's agents and to Marcus. The `read_apps` allowlist on each pattern type is enforced at the tool layer. An app querying for patterns it is not allowed to read gets an empty result for those types, with a structured warning logged to the Ledger.

Marcus uses the same tool. When the customer asks "what's been working in our ads?", Marcus calls `query_patterns({ source_apps: ['implosion'], minimum_confidence: 0.7, status_in: ['validated'] })` and reads the results into its evidence brief before responding.

### 1.6 Lifecycle and Empirical Decay Calibration

Patterns have four lifecycle states.

**`emerging`** - newly observed. Sample size below the validation threshold for this pattern type (declared in the registry, typically 30-100 observations). Visible to apps and Marcus, but consumers should treat them as hypotheses rather than facts. The Pattern Library UI flags them visually.

**`validated`** - sample size above threshold, confidence above the registered minimum, variance within bounds. This is the state in which other apps act on a pattern.

**`declining`** - either the recent evidence trend has reversed, or the `decay_at` timestamp has passed without re-validation. Still queryable, but downweighted in ranking and flagged.

**`archived`** - decayed past usefulness, explicitly retired by the user, or the ICP segment has been removed. Not returned by default queries; retained for audit and Learning Ledger correlation.

#### Empirical Decay Calibration

`decay_at` is computed as `last_observed_at + effective_decay_days`. The interesting design choice is how `effective_decay_days` is computed.

The app declares `initial_decay_days` for each pattern type in the registry. This is a seed - the app developer's best initial guess at how fast patterns of this type decay in this domain. Creative signatures in paid social probably decay in 30 days; messaging frames in 90; topic-format patterns in 180; audience preference patterns in 365.

But decay is not a config knob. It is an empirical claim about reality, and the system has the data to learn the actual decay curve. The Archivist runs a nightly Decay Calibration job per account, per pattern type:

1. Pull every pattern of this type that has been used to drive an action in the last 365 days, joined with the outcome data attached to each use (via the Learning Ledger).
2. For each use, compute `pattern_age_at_use = use_timestamp - first_observed_at` and `outcome_accuracy = actual_outcome / predicted_outcome`.
3. Bin uses by age (e.g., 0-7 days, 7-14, 14-30, 30-60, 60-120, 120-365) and compute mean and variance of `outcome_accuracy` per bin.
4. Identify the age bin at which mean `outcome_accuracy` falls below the configured threshold (default 0.7).
5. That age is the empirically-calibrated decay for this account-pattern-type pair, clamped to the registry's `decay_floor_days` and `decay_ceiling_days`.

The calibration only takes over from the declared seed once the sample size exceeds `calibration_sample_threshold`. Before that, `effective_decay_days = initial_decay_days`. After that, it is the calibrated value, with the seed as a fallback if calibration fails (insufficient bin coverage, all bins below threshold, etc.).

This is stored in a new table:

```typescript
interface PatternDecayCalibration {
  account_id: string;
  team_scope_id: string | null;
  source_app: string;
  pattern_type: string;
  effective_decay_days: number;
  sample_size: number;
  last_calibrated_at: string;
  calibration_version: number;           // Incremented each successful calibration; for audit
}
```

The `effective_decay_days` on each Pattern row is denormalized from this table at write time, so reads are fast. The calibration job updates it nightly.

This makes decay a learnable parameter of the system itself. When Implosion adds Snap or Bing as a new platform with different audience-cadence behavior, the system figures out the right decay automatically. When a customer's audience changes (new ICP, new market), decay re-calibrates around the new context. The declared seed becomes the bootstrap for a system that knows its own domain better than its initial configuration did.

### 1.7 Pattern Export and Import

Patterns are empirical learnings derived from the customer's own operational data. They belong to the customer, not the platform. This addendum makes that commitment structural by shipping export and import in v1.

**Export endpoint:** `GET /api/cortex/patterns/export`

```typescript
interface PatternExportRequest {
  pattern_types?: string[];              // Filter; default all
  source_apps?: string[];                // Filter; default all
  status_in?: string[];                  // Filter; default all
  format: 'json';                        // v2 may add CSV or Parquet
}

interface PatternExportPayload {
  schema_version: '1.0.0';
  exported_at: string;
  account_id: string;                    // The exporting account; redacted on cross-account import
  export_type: 'full' | 'filtered';
  filters: PatternExportRequest;
  patterns: Pattern[];                   // Internal IDs preserved for round-trip; not used on import
  pattern_type_registry_snapshot: PatternTypeDescriptor[];  // Only types present in the export
}
```

The export is self-describing. It includes the registry descriptors for every pattern type it contains. A downstream consumer of the JSON has enough context to interpret the dimensions field.

**Import endpoint:** `POST /api/cortex/patterns/import`

Imported patterns enter with:

- A fresh `id` (the imported ID is logged but not used)
- `status: 'emerging'` regardless of imported status
- `confidence_score` halved (the system signals "we don't know if this still applies in your context yet")
- `imported: true` and `imported_from: { account_id, exported_at }`
- `effective_decay_days` reset to the declared seed for the relevant pattern type in the importing account

Imported patterns must validate against the importing system's Pattern Type Registry. If a pattern type referenced in the import is not registered in the importing system, those patterns are rejected with a clear error.

**Use cases for v1:**

1. **Customer self-service portability.** The customer downloads their patterns at any time. The export format is human-readable JSON; they own it.
2. **Developer seeding for build and test.** During development, filler patterns can be imported to populate the library without waiting for real operational data. The Implosion team will seed an initial library before the first real campaigns run.
3. **Account migration.** A customer who creates a new Kinetiks account can transfer their patterns from the old account. The system flags them as imported and conservatively-confident.

**Use cases explicitly deferred to v2:**

- Cross-account pattern sharing (with consent flows)
- Pattern marketplaces or templates
- Compressed binary formats

The export and import endpoints are available to authenticated users only, RLS-scoped, rate-limited, and logged in the Learning Ledger.

### 1.8 Surface in the Cortex Tab

The Cortex tab gains a Pattern Library section, peer to Identity, Goals, Budget, Integrations. The UI is not a CRUD table; it is a curated view designed for the customer to understand what their system has learned.

The top of the Library is a digest section: "What your system has learned this month." Three to five top patterns across all source apps, each presented as a plain-language statement with the lift, the sample size, and a link to the underlying evidence. This is the highest-value customer surface; it is the "wow, this is what wins" moment that makes the cross-app intelligence visceral.

Below the digest, patterns are browsable by source app, by ICP, by outcome metric, by status. Each pattern has a detail view showing dimensions, evidence over time (a chart), the apps that have read it, and the actions taken because of it (pulled from the Learning Ledger). The customer can star a pattern (marking it as "always weight this highly"), suppress it ("ignore this pattern; I don't trust it"), or annotate it. Star, suppress, and annotation are user-entered data; per the existing CLAUDE.md rule, they override AI-generated arbitration.

A "Calibration" tab on each pattern type shows the empirical decay curve for the customer's account, including the declared seed value and the current effective value. Power users can see what the system has learned about how fast their patterns decay.

A prominent "Export" button at the top of the Library lets the customer download all patterns in a single JSON file. An "Import" affordance is present but de-emphasized; importing is a power-user action.

The customer can never directly edit the dimensions or outcome data of a pattern. Those are empirical observations, not opinions. Star, suppress, and annotation are the customer's mechanisms for disagreeing with the system's conclusions.

### 1.9 Relationship to Existing Structures

The Pattern Library does not replace any context layer. The eight existing `ContextLayer` values remain unchanged. Patterns are about performance; layers are about identity. A customer's voice is identity. The fact that emails opening with a question outperform statements by 40% in their account is a pattern.

The Pattern Library does not replace the Insight Store. Insights are one-time, natural-language observations (anomalies, trends, correlations, recommendations) generated by agents for delivery. Patterns are persistent, structured, multi-dimensional signatures with outcome data that get queried repeatedly. An agent can generate an Insight that references a Pattern. They are complementary.

The Pattern Library composes with the Learning Ledger. Every pattern's evidence is sourced from Ledger entries; every action taken because of a pattern is logged back to the Ledger with the pattern_id attached. This creates a closed loop for the Oracle to reason about: what patterns drove what actions, what outcomes did those actions produce, do those outcomes update the patterns that drove them.

### 1.10 Marcus Usage Rules

Marcus reads from the Pattern Library to ground recommendations. The existing rule that Marcus must never hard-sell app activations and must back recommendations with user-specific data is now structurally easier to honor. When recommending Dark Madder activation, Marcus can cite specific patterns from Harvest or Implosion that suggest content would amplify what is already working. Recommendations without pattern evidence remain suspect.

Marcus does not surface raw pattern data conversationally unless asked. The digest in the Cortex tab is the primary customer surface for patterns. In Chat, patterns become evidence inside Marcus's reasoning, not lists of statistics in responses.

---

## §2. Authority Grants

### 2.1 What It Is

An Authority Grant is an explicit, scoped, time-bounded, user-approved delegation of decision authority from the customer to the system. It declares: "Within this scope, for this duration, the system may take these classes of action without surfacing each one for approval, subject to these constraints and these escalation conditions."

Authority Grants are a first-class structure in Cortex, peer to Budget. They live in `kinetiks_authority_grants`, are visible to the customer in a dedicated surface in the Cortex tab, and are revocable at any moment. Every action taken under a grant is logged to the Learning Ledger with the grant_id attached. The customer can audit any grant's usage in full detail at any time.

The Approval System is not replaced by Authority Grants. It is extended. Actions outside any active grant continue to flow through the existing per-action approval flow. Actions inside a grant skip per-action surfacing but log just as completely. Budget approvals remain non-negotiable; a grant operates within an approved Budget and never around it.

### 2.2 Why This Shape

Authority Grants exist because the per-action confidence model breaks down at high cadence. Consider Implosion's Optimizer: hundreds of bid adjustments per day, each individually low-stakes, each individually high-confidence. The existing system has two options for this volume, and both fail.

**Option A: auto-approve everything above a confidence threshold.** Works mechanically but produces no record of what authority the system was operating under, no envelope the customer has explicitly consented to, and no way for the customer to grant looser authority for one campaign than another.

**Option B: surface every action.** So noisy the customer stops reading the queue, and the queue becomes worse than useless. It actively trains the customer to ignore approval requests, which compromises safety for the *important* approvals.

The agentically innovative move is to make the unit of trust the grant, not the action. Humans delegate this way already. You don't approve each thing a subordinate does; you set a scope and trust within it, and you adjust the scope based on outcomes.

### 2.3 Schema

```typescript
interface AuthorityGrant {
  id: string;
  account_id: string;
  team_scope_id: string | null;          // v2 placeholder; always null in v1
  granted_by: string;                    // user_id

  // Scope
  scope_type: 'campaign' | 'workflow' | 'program' | 'standing';
  scope_id: string | null;               // Reference to the scoped object; null for standing grants
  scope_description: string;             // Plain-language: "Acme Q1 LinkedIn Campaign"

  // Nesting
  parent_grant_id: string | null;        // For Workflow grants nested inside a Program grant

  // Envelope
  granted_capabilities: GrantedCapability[];
  escalation_triggers: EscalationTrigger[];

  // Spending envelope (operates inside Budget)
  max_unapproved_spend_per_day: number | null;
  max_unapproved_spend_per_action: number | null;
  spending_currency: string;

  // Lifecycle
  status: 'proposed' | 'active' | 'paused' | 'revoked' | 'expired';
  proposed_by_agent: string | null;       // The Authority Agent invocation that proposed this grant
  proposed_at: string;
  granted_at: string | null;              // Set when status moves to 'active'
  expires_at: string | null;              // Auto-revoke timestamp
  revoked_at: string | null;
  revocation_reason: string | null;

  // Learning
  usage_summary: AuthorityUsageSummary;   // Computed nightly; feeds future grant proposals

  created_at: string;
  updated_at: string;
}

interface GrantedCapability {
  action_class: string;                   // e.g. 'implosion.adjust_bid', 'implosion.pause_ad_set'
  description: string;                    // Plain-language for the customer-facing card
  constraints: Record<string, unknown>;   // Action-class-specific bounds (validated per registry)
  rate_limit: { count: number; window: 'minute' | 'hour' | 'day' | 'week' } | null;
  llm_judgment_budget_override?: {        // See §2.10
    daily_usd?: number;
    monthly_usd?: number;
  };
}

interface EscalationTrigger {
  type: 'anomaly' | 'novelty' | 'pacing' | 'threshold' | 'llm_judged';
  description: string;                    // Plain-language
  condition: Record<string, unknown>;     // Machine-readable
}

interface AuthorityUsageSummary {
  action_counts: Record<string, number>;
  total_spend_under_grant: number;
  escalations_triggered: number;
  outcome_metrics: Record<string, number>;
  computed_at: string;
}
```

### 2.4 The Action Class Registry

Every `action_class` value is registered in a global Action Class Registry, similar in spirit to the Pattern Type Registry. A registry entry declares:

```typescript
interface ActionClassDescriptor {
  action_class: string;                   // <app>.<verb>_<noun>, e.g. 'implosion.adjust_bid'
  source_app: string;
  description: string;                    // LLM-readable
  constraint_schema: JSONSchema;          // Zod-validated shape of GrantedCapability.constraints
  rate_limit_default: { count: number; window: string } | null;

  // Customer-facing template (see §2.14)
  customer_template: string;              // e.g. "Adjust bids up or down by up to {max_pct_change}% at a time."

  // LLM judgment budgeting (see §2.10)
  llm_judgment_budget?: {
    daily_usd: number;
    monthly_usd: number;
    model: 'haiku' | 'sonnet';
    fallback_on_budget_exhausted: 'structured_only' | 'escalate_to_user';
  };
  llm_judgment_required?: boolean;        // If true, exhausted budget escalates rather than degrades

  // Eligibility
  available_in_default_standing_grants: boolean;  // Whether this class can appear in a manifest's defaults
  always_requires_budget_attachment: boolean;     // True for any spend-bearing action
}
```

Action classes are registered at app boot. An unregistered action class cannot be referenced in a `GrantedCapability`, ever.

### 2.5 The Authority Agent

The Authority Agent is a new Cortex Operator. Its job is to propose Authority Grants. It does not approve them; the customer does, always.

When a campaign launches, a workflow is configured to start, or a Program is being scoped, the relevant app requests an authority proposal from the Authority Agent. The agent reads:

- The campaign or workflow brief (what is being attempted)
- The Pattern Library (what is empirically known to work for this account and ICP)
- The Learning Ledger (historical grants for this account: shape, outcomes, customer adjustments)
- The Budget allocation for the relevant category
- The customer's standing preferences (from Cortex Identity: risk tolerance, autonomy preferences accumulated over time)
- Any parent grant if this is a nested proposal (§2.8)

The agent produces a grant proposal: scope, capabilities with constraints, escalation triggers, spending envelope, suggested expiry. The proposal is rendered for the customer as a plain-language summary alongside the structured form, with each constraint editable.

The customer reviews, edits, and approves; or rejects with a reason. The reason is a Learning Ledger entry that calibrates future proposals.

The Authority Agent's system prompt and tool whitelist live in Cortex, like the other four Operators. It is not user-facing. The customer sees its output (the grant proposal) but not the agent itself, the same way Oracle is not user-facing.

### 2.6 Default Standing Grants

Per the customer-principles commitment to "useful out of the box," each app's manifest declares its `default_standing_grants`. These are the minimal authority the app needs to be useful without explicit customer action, proposed automatically the first time the app is connected to Kinetiks.

```typescript
interface KineticsAppManifest {
  // ... existing fields
  default_standing_grants?: DefaultStandingGrant[];
}

interface DefaultStandingGrant {
  description: string;                    // Plain-language: "Read your ad performance data and detect patterns"
  granted_capabilities: GrantedCapability[];
  escalation_triggers: EscalationTrigger[];
  expires_at: null;                       // Standing grants never expire (until revoked)
}
```

**Contract constraint:** an `action_class` may only appear in a `default_standing_grant` if its registry entry has `available_in_default_standing_grants: true`. This flag is false by default, and is only set true for action classes that involve no external spend and no external state changes beyond reads.

Implosion's defaults will include things like:

- "Read your ad performance data from connected platforms"
- "Generate and tag creative variants in the Implosion workspace (not published)"
- "Detect emerging patterns from your historical campaigns"

Explicitly not in defaults (and not eligible to be):

- "Launch a campaign"
- "Adjust live bids"
- "Pause an ad set"
- "Spend any money on any platform"

The line is the contract: defaults make the app useful for understanding, never for acting. Acting requires explicit grants.

At signup or first-connect, the Authority Agent reviews each connected app's default grants and proposes them as the customer's first authority decisions. The customer can approve, edit, or reject each. Rejection is a strong signal that feeds the Authority Agent's calibration.

### 2.7 Grant Proposal and Approval Flow

Authority Grants flow through the existing Approval System with a new approval class: `authority_grant_proposal`.

Visually, the approval card is similar to the Budget approval card: distinct, prominent, with editable structured fields, a plain-language summary, and never auto-approved. Like Budget approvals, this is a non-negotiable user surface.

The proposal card shows:

- Scope description in plain language ("Implosion Authority for Acme Q1 LinkedIn Campaign")
- Plain-language list of granted capabilities, each with editable constraints (§2.14)
- Escalation triggers, each with a plain-language explanation
- Spending envelope and how it nests inside the parent Budget category
- Suggested expiry (editable)
- The Authority Agent's reasoning for each decision in the proposal

The customer can:

- **Approve as proposed** - the grant becomes active
- **Edit and approve** - tighten any constraint or add new escalation triggers, then approve. Edits feed the Learning Ledger.
- **Reject and request revision** - send it back with notes. The Authority Agent re-proposes.
- **Decline entirely** - no grant is created. Actions flow through standard per-action approval.

### 2.8 Nested Grants: Programs and Workflows

Programs are cross-app coordination structures (a "Product Launch Program" containing content workflows, outbound workflows, PR workflows, ad workflows, landing-page workflows). For Programs and the Workflows inside them, authority composes through nesting.

The `parent_grant_id` field on `AuthorityGrant` is set when a Workflow-scoped grant nests inside a Program-scoped grant. Validation rules at proposal time:

1. The child grant's `granted_capabilities` must be a subset of the parent's: for each capability in the child, the same `action_class` must be present in the parent.
2. For each capability appearing in both, each constraint in the child must be at least as restrictive as the parent's. Numeric constraints are bounded by the parent's; rate limits cannot exceed the parent's; LLM judgment budget overrides cannot exceed the parent's.
3. The child's `max_unapproved_spend_per_day` and `max_unapproved_spend_per_action` cannot exceed the parent's.
4. The child's `expires_at` cannot exceed the parent's.

The Authority Agent proposes Program-level grants and child Workflow grants as a bundle, with the customer reviewing both in a single approval card. Editing either side triggers real-time re-validation. If the customer narrows the parent, all children automatically narrow to remain valid. If the customer expands a child beyond what the parent allows, the bundle becomes invalid and the customer must either widen the parent or tighten the child.

The Pattern Library informs the proposed split. When the Authority Agent proposes how to divide authority across child Workflows, it queries patterns relevant to each Workflow's domain: "paid social outperformed paid search 3x in your last two launches; proposing 70/30 in favor of paid social this cycle."

Future composition: a quarterly Program can contain monthly Programs, each containing Workflows. The `parent_grant_id` chain supports arbitrary depth; validation is recursive. The Authority Agent learns multi-level proposal shapes from the Learning Ledger over time.

### 2.9 Action Execution Under a Grant

When an app agent attempts a consequential action, the Agent Runtime resolves authority as follows:

1. Identify the `action_class`.
2. Find any active grant whose `scope_type` and `scope_id` apply to this action's context. If multiple match (e.g., a standing grant and a campaign grant both cover this action), the narrowest-scope grant wins.
3. Check the matching grant's `granted_capabilities` for that action class. If present, verify:
   - Action parameters satisfy the registered `constraint_schema` and the grant's `constraints`
   - Rate limits have not been exceeded
   - Spending envelope is not exceeded
   - No escalation trigger fires (§2.10)
4. If all checks pass, execute the action and log it to the Learning Ledger with `grant_id` attached. The action does not surface to the customer.
5. If any check fails, the action is escalated: it does not execute, it is added to the approval queue with full context (the grant it would have used, the specific check that failed, the action parameters), and the customer is notified at urgency-appropriate cadence.
6. If no active grant covers this action class, fall back to the existing per-tool `autoApproveThreshold` and confidence-based flow.

Every action under a grant emits a Learning Ledger entry with `grant_id` attached. The entries are not surfaced individually to the customer; they are aggregated into the grant's `usage_summary` and the periodic digest.

### 2.10 Escalation Triggers

An escalation trigger is a condition that, when met during an action's execution, suspends the grant's authority for that action and surfaces it to the customer as if no grant existed. Triggers exist because a grant cannot anticipate every situation, and the system must surface anything that looks abnormal even when it falls within constraints.

Five trigger types are supported in v1:

**`anomaly`** - statistical anomaly detection in the metric stream relevant to this action. For a `pause_ad_set` action, a sudden CPA spike or impression drop triggers anomaly review. Backed by Oracle's existing pattern detector.

**`novelty`** - the action's parameters differ significantly from any pattern of action the system has previously taken under authority for this customer. New ground, surface it.

**`pacing`** - the rate of actions under this grant is significantly higher or lower than historical baselines, suggesting the system may be looping, stuck, or out of control.

**`threshold`** - explicit numeric thresholds on parameters: spend amount, percentage change, action count in a window.

**`llm_judged`** - an LLM is asked to evaluate the action in context and return a confidence that it is appropriate.

#### LLM-Judged Trigger Cost Budgets

LLM judgment is the most expensive trigger type. Each evaluation is an inference call. To keep costs bounded and predictable, the Action Class Registry includes per-class budget declarations.

Each `ActionClassDescriptor` optionally declares `llm_judgment_budget`: a daily and monthly USD cap, the model to use, and fallback behavior when the cap is hit. The Agent Runtime tracks per-account-per-class spend and applies the fallback when the budget is exhausted.

Two fallback modes:

- **`structured_only`** - when budget is hit, the trigger silently falls back to structured-only triggers (anomaly, novelty, pacing, threshold). The action proceeds if those pass.
- **`escalate_to_user`** - when budget is hit and `llm_judgment_required: true`, the action escalates to the customer as if it failed the trigger. This is the safer default for high-stakes classes.

Grants can override the per-class budget through the `llm_judgment_budget_override` field on `GrantedCapability`. This is how an Authority Agent can propose: "for this high-stakes campaign, increase the LLM judgment budget to $10/day on `implosion.iterate_creative_direction` because the cost of a wrong creative direction is higher than baseline." The override is bounded by parent grants per the nesting rules.

This puts the cost-value tradeoff in the hands of the app that knows its action classes best, scales naturally as new apps with different cadences join, and composes with Authority Grants for context-specific tuning.

### 2.11 Relationship to the Approval System and the Budget

Authority Grants extend the Approval System; they do not replace it.

For any action outside an active grant: existing flow unchanged. Per-tool confidence threshold, per-tool approval class, per-action surfacing.

For any action inside an active grant: the grant is the approval. The customer's prior approval of the grant *is* approval of every action that falls within it. The action does not appear in the approval queue; it appears in the grant's usage log and in the periodic digest.

For any action inside a grant that triggers an escalation: the action does not execute; it is surfaced to the approval queue with full context (the grant it would have used, why it failed). The customer can approve the specific action without changing the grant, or pause the grant, or narrow it.

For any action that would affect Budget: regardless of grant status, Budget approvals remain non-negotiable. A grant authorizes spend up to its envelope, but the envelope itself cannot exceed the approved Budget for the relevant category. If the system attempts to spend beyond the Budget category, that is always a Budget overage approval (per the existing analytics-goals-engine-spec), not a grant action.

### 2.12 Learning Loop

Authority Grants close a learning loop the Approval System does not.

When a grant is proposed and the customer approves it as-is, that is positive signal: the proposed shape was correct. When the customer edits before approving, the diff is learning signal: this account prefers tighter constraints on this action class, or wider constraints, or different escalation triggers. When the customer rejects, the rejection reason is the strongest signal. When a grant expires without escalations and the underlying campaign succeeded, the grant shape was well-calibrated. When a grant produces escalations the customer approves anyway, the trigger was too sensitive. When a grant produces escalations the customer declines, the trigger was correctly tuned.

All of these flow into the Authority Agent's next proposal. Over time, the Authority Agent should propose grants that match what the customer would have edited to anyway. This is the agentically innovative core: the system gets better at asking for the right authority, not just at executing within it.

The `usage_summary` on each grant is the artifact that captures the loop's learnings. It feeds back into the Identity layer (over time, the customer's autonomy profile is built from observed grant behavior) and into the Authority Agent's next proposal.

### 2.13 Surface in the Cortex Tab

Authority Grants get a dedicated section in the Cortex tab, peer to Budget. The default view shows active grants, each rendered as a card with: scope, plain-language summary of capabilities, days remaining, usage summary at a glance, and three buttons (Pause, Narrow, Revoke).

Each grant has a detail view: the full structured capability list, the escalation triggers, the usage timeline, the actions taken (grouped by class, not enumerated; "view all" expansion), the outcomes attributed to the grant, and the option to extend, modify, or revoke.

A history view shows past grants - revoked, expired, completed - with their outcomes and lessons. This is the audit surface. The customer can reconstruct every authority decision the system has ever operated under.

In Chat, the customer can ask "what authority do you have right now?" and the system answers with a plain-language summary of all active grants. They can ask "what have you done with that authority today?" and the system summarizes from the usage logs.

### 2.14 Customer-Facing Language

The product never uses the word "Authority Grant" in customer-facing copy. Internal name only. Customer-facing language is "Authority" (in nav) and the grant itself is framed as a permission: "Give Kit permission to optimize this campaign." The card title is the scope description ("Acme Q1 LinkedIn Campaign Authority").

Constraints are rendered as plain-language sentences, not field labels:

- Not: "max_pct_change: 25"
- Yes: "Adjust bids up or down by up to 25% at a time."

- Not: "implosion.iterate_creative, rate_limit: { count: 20, window: 'week' }"
- Yes: "Generate up to 20 new creative variants per week, staying within the brand and current creative direction."

Plain language is enforced at the schema level. Every `ActionClassDescriptor` includes a `customer_template` field that produces the customer-facing sentence from the constraints. The Authority Agent always uses these templates for the proposal summary, and the Cortex tab uses them in the active-grant cards. The customer reads sentences, not types.

---

## §3. Operator Workflows (Clarifying Extension)

### 3.1 The Question

The existing platform addendum defines Workflows as task graphs with edges, approval checkpoints, conditional branches, triggers, and learning metrics. Workflows live inside Programs, and Programs are described as cross-app coordination structures.

The unspecced question: when Implosion has eight internal Operators that must coordinate among themselves, does that coordination use the Workflow primitive, or is it ad-hoc?

The original Three-Layer Agent System answer: app Operators report to their Synapse only; cross-app intelligence flows via Proposal up or Routing Event down. That is sufficient for Harvest's two or three internal agents to coordinate via the app's own database. It is not sufficient for Implosion's eight-Operator dance with explicit handoffs, conditional branches, and internal approval checkpoints.

### 3.2 The Answer: Workflows Extend Down

The Workflow primitive is generalized to support both cross-app and intra-app coordination. A Workflow task references a target by capability descriptor. Capability descriptors come in two flavors:

- **`cross_app`** - target is an app capability (existing). Dispatched via Synapse Routing Event. The target Synapse runs the app's relevant Operator.
- **`internal_operator`** - target is a specific Operator within the executing app. Dispatched directly by the app's own runtime to its own Operator registry.

The `WorkflowTask` schema gains:

```typescript
interface WorkflowTask {
  // ... existing fields
  target_type: 'cross_app' | 'internal_operator';
  target_capability: string;              // For cross_app: <app>.<capability>. For internal_operator: <operator_key>.
  target_app: string;                     // Required for internal_operator: scopes the operator lookup
}
```

The runtime distinguishes at dispatch time. Cross-app dispatch goes through Synapse as today. Internal dispatch goes through the executing app's Operator registry. The Workflow itself is agnostic; the same graph structure handles both.

Programs continue to be cross-app coordination structures. An app's internal Workflow is owned by that app, not by a Program, and lives in the app's own database (`<prefix>_workflows`). Implosion's "Campaign Optimization Workflow" lives in `imp_workflows`, not in `kinetiks_workflows`.

### 3.3 Operator Registration

Each app maintains an Operator registry analogous to the platform's Tool Registry but scoped to the app. An Operator is registered with:

```typescript
interface OperatorDescriptor {
  key: string;                            // <operator_key>, e.g. 'creative_generator'
  description: string;                    // LLM-readable
  inputs_schema: JSONSchema;
  outputs_schema: JSONSchema;
  required_tools: string[];               // Tool registry keys this Operator depends on
  required_patterns: string[];            // Pattern type keys this Operator reads
  action_classes: string[];               // Action classes this Operator may invoke
}
```

This makes Operators addressable, validateable, and inspectable, by other Operators in the same app via Workflows, by the app's own runtime, and by Marcus when reasoning about an app's internal structure for debugging or explanation.

The app manifest gains an optional `operator_registry` field:

```typescript
interface KineticsAppManifest {
  // ... existing fields
  operator_registry?: OperatorDescriptor[];
}
```

Apps without internal Workflows can omit this field entirely.

### 3.4 What Does Not Change

The Three-Layer Agent System's absolute communication rules remain in force. Operators in app A still cannot talk to Operators in app B. An internal Workflow in Implosion cannot reference Harvest's Composer as a task target; it must go through a Synapse Routing Event to Harvest, which then dispatches internally. Cross-app intelligence still flows via Proposal up and Routing Event down. The boundary is preserved; the Workflow primitive just becomes the canonical orchestration form on both sides of it.

Synapses still do not talk to other Synapses. Marcus still orchestrates conversationally. The Cross-App Command Router still handles imperative cross-app user commands. Operator Workflows are a new addressing mode for an existing primitive; they do not introduce a new communication path.

### 3.5 When to Use Workflows Inside an App

Most apps will not need internal Workflows. Harvest's Scout-Composer-Sender chain is sequential, low-frequency, and well-served by direct database state and scheduled Operators. Litmus, Hypothesis, and Dark Madder are similar.

Implosion needs internal Workflows because its eight Operators have explicit dependencies (Foundation outputs feed Creative, Creative outputs feed Tagger, Tagger outputs feed Launcher), conditional branches (if pattern confidence is high enough, run expansion path; otherwise run exploration path), and internal approval checkpoints (creative direction changes require human review even when the rest of the campaign is under grant). That is exactly the Workflow primitive's purpose.

**The rule:** if an app's internal coordination has any combination of conditional branches, parallel-then-merge structure, or internal approval checkpoints, use a Workflow. If the coordination is a linear sequence with no branching, the existing scheduled-Operator pattern is sufficient and a Workflow is overhead. Apps may evolve from the second to the first as they grow.

---

## §4. Multi-User Foundations

### 4.1 Solo-Builder First

Kinetiks v1 is built to be operated by a single user per account. The customer profile is founders and small teams running their entire GTM through Kinetiks. Multi-user team semantics are a v2 concern, not a v1 capability.

This addendum does not ship team features. It does, however, lay the schema foundation so that adding team semantics in v2 does not require a migration of existing data.

### 4.2 Schema Shape for v2

Three places in this addendum carry a `team_scope_id: string | null` placeholder field:

- `AuthorityGrant.team_scope_id`
- `Pattern.team_scope_id`
- Learning Ledger entries (existing table, additive column)

In v1, this field is always `null`. Every query is written to filter by `account_id` as today, with `team_scope_id` as an optional additional filter for future use. The default behavior of every query treats `team_scope_id = NULL` as "the implicit team of the single-user account."

When team semantics ship in v2:

- Each existing single-user account gets an implicit team object created (`team_id = account_id` by convention, or a fresh UUID, design decision deferred)
- Every existing row gets `team_scope_id` populated with that team_id
- New rows can be team-scoped or user-scoped per v2 design
- Queries gain team-aware filtering

The migration path is data-only (a backfill), not schema-changing. This is the entire point of the placeholder.

### 4.3 What Will Not Ship in v1

Explicitly not in v1:

- Team invitation flow
- Admin UI
- Role-based permissions
- Permission inheritance from team to user
- Multi-user Authority Grant proposals (who can grant; who can revoke)
- Cross-user audit views

Each of these is a v2 design problem on top of the placeholder schema. Customers who need multi-user today are not the target customer for v1.

---

## §5. Composition With Existing Specs

This addendum modifies four existing documents. The modifications are additions and clarifications; nothing in the existing specs is removed or invalidated.

**`platform-contract.md`** gets:

- §1 App Manifest gains two optional fields: `default_standing_grants` and `operator_registry`.
- §13 Types Reference gains: `Pattern`, `PatternTypeDescriptor`, `PatternDecayCalibration`, `AuthorityGrant`, `GrantedCapability`, `EscalationTrigger`, `AuthorityUsageSummary`, `ActionClassDescriptor`, `OperatorDescriptor`, `DefaultStandingGrant`.
- §6 Agent Contract gains a section noting that agents may operate under Authority Grants and must check authority resolution through the Agent Runtime.
- §14 What the Core Gives You for Free gains "Pattern Library writes and reads," "Authority Grant participation," "Pattern export and import," and "LLM judgment budgeting" as no-extra-work platform features.

**`approval-system-spec.md`** gets:

- A new approval class `authority_grant_proposal`, rendered with the same prominence as `budget_proposal`.
- A new section on the relationship between grants and per-action approvals (authority resolution flow per §2.9).
- Confirmation that Budget approvals remain non-negotiable regardless of grant status.

**`analytics-goals-engine-spec.md`** gets:

- §10 Budget System is unchanged in substance. Authority Grants operate inside Budget allocations; they do not modify Budget.
- A clarifying note that a grant's `max_unapproved_spend_per_day` is always nested inside the relevant Budget category's daily pacing.

**`kinetiks-platform-addendum.md`** (the Programs and Workflows spec, currently being renamed to `programs-spec.md` per the cleanup plan) gets:

- The `WorkflowTask` schema gains `target_type` and `target_app` per §3.2.
- Programs are clarified to remain cross-app coordination structures; intra-app Workflows are app-owned and live in app-prefixed tables.

---

## §6. Implementation Order

These structures do not all ship together. The dependency order:

**Phase 1: Pattern Type Registry and Pattern Library tables.** Clean addition. New table (`kinetiks_pattern_library`), new registry, new tool (`query_patterns`), Archivist extension, export and import endpoints. No existing behavior changes. The Pattern Library can ship before Implosion exists, because Harvest and Dark Madder can start emitting patterns immediately on their existing operational data. Ships first.

**Phase 2: Empirical Decay Calibration.** Depends on Phase 1. Adds `kinetiks_pattern_decay_calibration` table, the nightly calibration job in the Archivist, and the per-pattern denormalization of `effective_decay_days`. Ships as a v1.1 extension to Phase 1 once enough operational data exists to calibrate meaningfully (typically 90 days after first patterns emerge).

**Phase 3: Operator Workflows extension.** Small schema change to the existing Workflow type. New `operator_registry` field on app manifests. Runtime distinction between cross-app and internal dispatch. Apps that do not use internal Workflows are unaffected. Ships when Implosion is being scoped, in time for Implosion to use it.

**Phase 4: Authority Grants and the Authority Agent.** Largest of the four. New tables (`kinetiks_authority_grants`, action class registry), new agent, new approval class, new approval flow, action execution path changes in the Agent Runtime, per-class LLM judgment budget tracking. Ships closer to the Implosion launch, because Implosion is the first app that requires it. Other apps can opt in later.

**Phase 5: Default standing grants and signup flow.** Depends on Phase 4. Each app's manifest declares its defaults; the Authority Agent reviews at signup and first-connect. Ships with Phase 4.

The Pattern Library does not wait for Implosion. The Authority Grants system does not ship before the Agent Runtime extensions it depends on. Multi-user placeholders are added to every table from the moment that table is created; no follow-up migrations.

---

## §7. Customer Trust Architecture

This section synthesizes the philosophy that connects the three structures. It is intentionally short and deliberately framed for the customer rather than the implementer, because the value of these structures is the trust loop they enable.

The customer grants the system real authority over real spend, real outreach, real creative direction. That sentence is not possible without all three structures in place at once:

- The **Pattern Library** is the system's evidence. It is what the system has learned about the customer's business, visible to the customer at any time, exportable at any time. The customer can see what the system knows.
- **Authority Grants** are the unit of trust. The customer grants scoped, time-bounded, plain-language authority. The system operates inside the envelope. The customer can revoke, narrow, or audit at any moment.
- **Operator Workflows** are the mechanism. They let agents coordinate at the cadence the customer expects from a 2027 product, with explicit handoffs and internal approval checkpoints where reasoning needs to pause for human input.

The loop closes like this. The customer grants authority. The system uses authority transparently, logging every action. The system surfaces what it learned (in the Pattern Library digest, in periodic summaries, in answers to Chat questions). The Authority Agent uses that learning to propose better-shaped grants next time. The customer's trust either deepens (broader grants, longer durations, more action classes) or contracts (narrower grants, tighter constraints, more escalations). Either way, the system gets better at asking for the right authority.

The customer's exit ramp is always present. Patterns are exportable. Grants are revocable. Workflows are pauseable. Budget approvals are non-negotiable and never bypassed. The customer is never locked in to a system they cannot reconstruct or walk away from.

This is what "build for 2027 innovation while being safe and solid" means structurally. Innovation through composition. Safety through reversibility, transparency, and the existing guardrails. The customer's relationship with the system is one of earned, granular, observable, revocable trust.

---

## §8. Risks and Mitigations

Honest discussion of what could go wrong and how the design handles it.

**1. The Authority Agent proposes grants too aggressively.** The customer revokes them, learns to distrust grant proposals, and falls back to per-action approval forever. The product loses its central value proposition.

*Mitigation:* Conservative defaults at signup (App-declared standing grants, all non-spending). Plain-language rendering of every constraint via the `customer_template` system, with no jargon leaking. The Authority Agent's first proposals for a new account skew tight; learned calibration loosens over time as the Learning Ledger fills with positive signal. Revocation reasons are first-class learning input.

**2. The Pattern Library fills with low-signal patterns; noise overwhelms signal.** Customers see a digest of mediocre patterns and stop trusting the surface.

*Mitigation:* `confidence_score` threshold for validation; emerging patterns are flagged. The digest surfaces top-N by `lift_ratio * confidence_score`, not by count. Customers can suppress patterns they distrust; suppressions persist and influence future ranking. Archival of declining patterns removes them from the active surface.

**3. The LLM judgment budget hits its cap silently; actions execute without judgment when they shouldn't.** A high-stakes action class falls back to structured-only triggers, misses something an LLM would have caught.

*Mitigation:* The `llm_judgment_required` flag on each action class makes the fallback explicit: if `true`, budget exhaustion escalates rather than degrades. The daily digest includes a "budget pressure" callout when any action class is approaching its cap. Authority Grants can override per-class budgets for specific scopes, so customers can pay for more judgment where they need it.

**4. Nested grants get too complex; the customer cannot reason about what authority is in effect.** Three or four levels of nesting, multiple active campaigns, dozens of constraints. The Authority tab becomes overwhelming.

*Mitigation:* The Cortex Authority section shows the full active hierarchy in plain language, not as raw tree data. Marcus can summarize on demand ("what authority do you have right now"). Active grant count is capped (configurable; default 20) and the customer is alerted when grants are stacking up. Standing grants and per-campaign grants are visually separated.

**5. The pattern export endpoint is used to leak proprietary patterns.** A competitor obtains a customer's export, gains insight into their winning signatures.

*Mitigation:* Export is self-service only, account-scoped, authenticated, rate-limited, and logged. The customer is the only one who can export their own patterns. Cross-account export is not in v1. If a customer's patterns leak, that is the customer's own data leaving their own control, not a platform breach. The platform's responsibility is keeping the export secure to the customer, not preventing the customer from exporting.

**6. Empirical decay calibration overfits to recent data; patterns die prematurely.** A short stretch of unusual outcomes causes the calibration to declare decay much faster than reality justifies, archiving patterns that would still be useful.

*Mitigation:* `decay_floor_days` and `decay_ceiling_days` in the registry bound the calibration. Calibration requires a minimum sample size before taking over from the declared seed. Calibration runs nightly but uses a 365-day window to dampen short-term noise. The calibration version is tracked, so a recent bad calibration can be detected and reverted.

**7. Default standing grants accidentally grant more authority than intended.** An app's manifest declares a default that, combined with another grant or a runtime context, allows an action the customer never expected.

*Mitigation:* The `available_in_default_standing_grants` flag is set per-action-class in the registry, off by default, and is the single source of truth for what can appear in a default. No spending or external-state-changing action class is eligible. Defaults are reviewed at signup and any time the app updates its manifest; the customer sees a clear diff and approves changes.

**8. The Authority Agent itself is wrong about what authority the customer wants.** Pattern Library data plus Learning Ledger history leads it to a confidently wrong proposal.

*Mitigation:* The customer always approves. Edits are first-class signal; rejections are stronger signal. The Authority Agent never executes its own proposals. Proposal reasoning is shown alongside the proposal so the customer can see why the agent thinks the shape is right and disagree from a position of information.

---

## §9. Open Questions Now Resolved

The first draft of this addendum listed six open questions. All six are resolved as follows:

1. **Pattern decay defaults per type:** App declares the seed (`initial_decay_days` in the registry); system empirically calibrates (`PatternDecayCalibration` table, nightly Archivist job). Best for long-term learning and performance. (§1.6)

2. **Authority Grant defaults at signup:** App-declared sensible defaults via the new `default_standing_grants` manifest field, with strict eligibility limited to non-spending non-external-state action classes. (§2.6)

3. **Grant inheritance from Programs:** Propagate with per-Workflow narrowing via `parent_grant_id`, validated recursively. Best for scalable future-building including patterns-informed splits and arbitrary-depth nesting. (§2.8)

4. **LLM-judged escalation triggers and cost:** Apps declare per-class cost budgets in the Action Class Registry, with grants able to override per scope. (§2.10)

5. **Multi-user authority:** Solo-builder-first v1 with `team_scope_id` placeholder fields on all relevant tables. No team features ship; schema is forward-compatible. (§4)

6. **Pattern Library export:** Ships in v1 with both export and import endpoints. Import enables developer seeding for build and test, and supports future account migration. The principle that patterns belong to the customer is structural, not aspirational. (§1.7)

---

## §10. Authorship and Adoption

Drafted in conversation with Zack Holland for the Kinetiks AI monorepo.

This addendum is intended to be merged into `docs/specs/` as `platform-contract-2027-addendum.md`, and referenced from `docs/CLAUDE.md` and `docs/platform-contract.md`. Once accepted, subsequent build plans for the Pattern Library subsystem (Phase 1-2), the Operator Workflows extension (Phase 3), and the Authority Grants system including the Authority Agent (Phase 4-5) each reference this document as their architectural foundation.

The platform contract version bumps with the merger of this addendum. Apps, integrations, and agents built or updated after the merge conform to the extensions described here.
