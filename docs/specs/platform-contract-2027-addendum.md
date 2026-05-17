# Platform Contract: 2027 Addendum

> **Status:** Bootstrap stub. §1 (Pattern Library) is the L1a phase deliverable and is authored in the next commit. §2-§5 are placeholders elaborated in their respective phases.
>
> **Authoritative.** This document is canonical alongside `docs/platform-contract.md`. Apps, integrations, agents, and Operators built or updated after the merge of §1 conform to it. Where this addendum and the base platform contract conflict, this addendum wins for the structures it introduces (Patterns, Authority Grants, Operator Workflows extensions, multi-user placeholder schema).

---

## Why this addendum exists

Three structures together make Kinetiks safe enough for real spend and real outreach delegation:

1. **Pattern Library** (§1, this phase) - the system's *evidence*. What it has learned, exportable, visible at any time. Apps emit empirical signatures with outcome data; the Archivist arbitrates; agents and the customer read through a typed contract.
2. **Authority Grants** (§2, Phase 4) - the *unit of trust*. Scoped, time-bounded, plain-language, revocable delegations of action authority. Every action under a grant logs to the Ledger with `grant_id`.
3. **Operator Workflows extension** (§3, Phase 3) - the *mechanism* for intra-app agent coordination with explicit handoffs and approval checkpoints. The cross-app communication rules from the base platform contract remain unchanged.

§4 (Default Standing Grants) is the signup-flow surface that makes Authority Grants usable from day one. §5 (Multi-user placeholders) is the schema-forward placeholder layer that lets v1 ship single-user while making the path to v2 a configuration change rather than a migration.

The customer's relationship with the system becomes one of **earned, granular, observable, revocable trust**. Patterns are the evidence layer. Authority Grants are the trust layer. Operator Workflows are the coordination layer. The Learning Ledger (existing, base platform contract) is the audit layer.

---

## Cross-section invariant: `team_scope_id`

Every table that participates in the 2027 trust architecture (`kinetiks_pattern_library`, `kinetiks_authority_grants`, and any new Ledger-adjacent calibration tables) carries the following column from its first migration:

```sql
team_scope_id text -- nullable, always null in v1; placeholder for v2 multi-user team scoping
```

**Rules:**
- Always `null` in v1.
- Every query filters by `account_id`; `team_scope_id` is an optional additional filter for v2 forward-compatibility.
- Never default it to anything other than `null` in v1 code.
- The column ships in the first migration of each participating table. No follow-up migration is required for v2; the placeholder is there from day one.
- Indexes that include `account_id` may include `team_scope_id` as a trailing column for v2 readiness, but no functional dependency on the column exists in v1.

This invariant lives at the addendum level because it spans every section.

---

## §1 Pattern Library

### §1.1 Why patterns exist

The Pattern Library is the evidence layer of the 2027 trust architecture. Without it, every recommendation Marcus makes and every action the Authority Agent proposes is unfalsifiable. The customer cannot audit what the system believes; the system cannot ground its confidence in anything more rigorous than rolling counts in operational tables; and the cross-app intelligence claim of Kinetiks is reduced to coincidence.

A pattern is an empirically validated multi-dimensional signature with outcome data, observed across a representative number of events for one customer's business, with explicit confidence and explicit decay. Apps emit patterns from their own operational data. The Archivist is the canonical writer. Agents and the customer read through a typed contract. The Learning Ledger is the upstream of every observation and the downstream of every action taken because of one.

Three product effects depend on the Pattern Library shipping:

1. Marcus can ground recommendations in patterns rather than vibe-driven heuristics. The evidence brief carries patterns alongside context layers; the response body weaves the implication.
2. The Authority Agent (Phase 4) can propose grants whose scope is justified by a body of patterns rather than by single-event reasoning. A proposed grant says "in your last 90 days, sequences with this shape booked meetings at 3.1x the rate of the rest of your list, across 47 evidence events" rather than "this seems reasonable."
3. Implosion (the AI ads product, scheduled after Hypothesis) ships with cross-app intelligence from day one. Patterns emitted by Harvest and Dark Madder are visible to Implosion's Creative Generator and Bidder Operators through the same `query_patterns` tool the rest of the platform uses.

### §1.2 Data model

Patterns live in `kinetiks_pattern_library`. The table uses the hybrid shape established by Authority Grants (top-level queryable lifecycle columns + jsonb for variable-shape payload). This is a deliberate divergence from the pure `data` jsonb shape used by `kinetiks_context_*` tables: the read path needs indexed access on `(pattern_type, status, applies_to_icp, confidence_score, decay_at)`, which a single jsonb column cannot give without per-query index gymnastics.

```sql
CREATE TABLE kinetiks_pattern_library (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES kinetiks_accounts(id) ON DELETE CASCADE,
  team_scope_id         text,                                       -- v2 placeholder; null in v1
  pattern_type          text NOT NULL,                              -- registered type key
  emitting_app          text NOT NULL,
  applies_to_icp        text,                                       -- nullable
  fingerprint           text NOT NULL,                              -- deterministic hash; see §1.4
  status                text NOT NULL DEFAULT 'emerging'
                        CHECK (status IN ('emerging','validated','declining','archived')),
  confidence_score      double precision NOT NULL DEFAULT 0
                        CHECK (confidence_score BETWEEN 0 AND 1),
  observation_count     integer NOT NULL DEFAULT 0,
  first_observed_at     timestamptz NOT NULL DEFAULT now(),
  last_observed_at      timestamptz NOT NULL DEFAULT now(),
  effective_decay_days  integer NOT NULL,                           -- from descriptor at creation
  decay_at              timestamptz NOT NULL,                       -- last_observed_at + effective_decay_days
  validated_at          timestamptz,
  declining_at          timestamptz,
  archived_at           timestamptz,
  user_starred          boolean NOT NULL DEFAULT false,
  user_suppressed       boolean NOT NULL DEFAULT false,
  user_annotation       text,
  dimensions            jsonb NOT NULL,                             -- validated against descriptor.dimensions_schema
  outcome_metrics       jsonb NOT NULL DEFAULT '[]'::jsonb,         -- see §1.4
  evidence_summary      jsonb NOT NULL DEFAULT '{}'::jsonb,         -- { last_n_ledger_ids: text[], summary: {...} }
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (account_id, pattern_type, fingerprint)
);
```

Indexes (justified by the read paths in §1.5 and the decay sweep in §1.9):

```sql
CREATE INDEX idx_pattern_library_account_status_type
  ON kinetiks_pattern_library (account_id, status, pattern_type);
CREATE INDEX idx_pattern_library_account_emitter
  ON kinetiks_pattern_library (account_id, emitting_app);
CREATE INDEX idx_pattern_library_account_icp
  ON kinetiks_pattern_library (account_id, applies_to_icp);
CREATE INDEX idx_pattern_library_account_decay
  ON kinetiks_pattern_library (account_id, decay_at)
  WHERE status IN ('emerging','validated','declining');
CREATE INDEX idx_pattern_library_account_observed
  ON kinetiks_pattern_library (account_id, last_observed_at DESC);
CREATE INDEX idx_pattern_library_account_starred
  ON kinetiks_pattern_library (account_id)
  WHERE user_starred = true;
```

RLS posture: account-scoped reads via `auth.jwt() ->> 'kinetiks_account_id'`. Writes are denied to all callers at the RLS layer; service-role inserts and updates flow exclusively through the Archivist write path and the per-pattern Server Actions in `apps/id`, both of which scope by `account_id` server-side. A user `UPDATE` directly through PostgREST is structurally impossible.

The `outcome_metrics` jsonb is an array of:

```ts
{
  metric_name: string;        // must match an entry in descriptor.valid_outcome_metrics
  value: number;
  sample_count: number;       // contributes to confidence stability term
  confidence: number;         // [0,1]; per-metric, not the pattern-level confidence_score
  unit: string;               // must match descriptor.valid_outcome_metrics[i].unit
}
```

The `evidence_summary` jsonb is:

```ts
{
  last_n_ledger_ids: string[];     // capped at 50; most recent evidence Ledger entries
  summary: {
    total_evidence_count: number;
    period_days: number;
    primary_metric: string;        // the descriptor's first valid_outcome_metric by convention
    primary_metric_value: number;
  };
}
```

### §1.3 Pattern Type Registry

Every `pattern_type` value emitted to the Pattern Library is declared at app boot via the Pattern Type Registry in `@kinetiks/tools` (peer to the Tool Registry, Action Class Registry, and Operator Registry). The descriptor lives in `@kinetiks/types/src/descriptors.ts` alongside the others:

```ts
export interface PatternTypeDescriptor<TDimensions extends Record<string, unknown> = Record<string, unknown>> {
  readonly pattern_type: string;                                    // e.g. "harvest.outreach_angle_performance"
  readonly description: string;                                     // LLM-readable
  readonly emitting_apps: readonly string[];                        // who may emit
  readonly read_apps: readonly string[];                            // who may read via query_patterns
  readonly customer_visible: boolean;                               // orthogonal to read_apps; controls Cortex UI exposure
  readonly dimensions_schema: ZodSchema<TDimensions>;               // validates the signature
  readonly fingerprint_dimensions: readonly (keyof TDimensions)[];  // declared identity-relevant fields, in canonical order
  readonly bucketize?: (raw: TDimensions) => TDimensions;           // optional; required for high-cardinality types
  readonly valid_outcome_metrics: readonly PatternOutcomeMetricDescriptor[];
  readonly decay_bounds: PatternDecayBounds;
  readonly confidence_thresholds: PatternConfidenceThresholds;
  readonly expected_max_fingerprints_per_account?: number;          // cardinality intent; warning if absent for non-trivial types
}
```

Registration model (mirrors the Tool Registry):

- `definePatternType({ ... })` builds and structurally validates the descriptor.
- `registerPatternType(descriptor)` is process-global and called at app boot.
- `getPatternType(name)` and `assertPatternType(name)` are the read accessors.
- `listPatternTypes()` is the iteration accessor.
- `_resetPatternTypeRegistryForTests()` is the test-only escape hatch.

Boot wiring: `bootPatternTypeRegistry()` is called from `instrumentation-node.ts` BEFORE `bootToolRegistry()` so the cross-registry validator can resolve `required_patterns` from `OperatorDescriptor` against a populated registry.

**Read scoping axes are orthogonal.** `read_apps` is a runtime trust boundary (which agent app may invoke `query_patterns` and see this type's rows). `customer_visible` is a UI exposure boundary (whether the type's rows appear in the Cortex Patterns sub-tab). The Cortex UI Server Action calls the same shared helper as the tool, with `caller_app: 'customer_ui'`; the helper applies `customer_visible === true` when the caller is the UI, and applies `caller_app in descriptor.read_apps` when the caller is an agent app. Conflating the two axes (e.g., "cortex_ui" as a synthetic entry in `read_apps`) is a category error: the UI is a Server Action, not a runtime tool consumer.

**Mandatory bucketization for high-cardinality dimensions.** The single biggest failure mode of the Pattern Library is pattern type explosion: a descriptor emits patterns whose `dimensions` are too narrow to ever reach `confidence_thresholds.validate_at`, because each variation creates a new fingerprint. A `harvest.outreach_angle_performance` descriptor with `{angle_kind, industry, seniority}` where `industry` has 200 values and `seniority` has 5 and `angle_kind` has 20 yields 20,000 possible fingerprints; with 100 emissions per week, every pattern stays at `observation_count = 1` and the Library is a graveyard of `emerging` records.

Prevention is built into the descriptor:

1. `bucketize: (raw: TDimensions) => TDimensions` is optional in the type signature but **required** at registration time for any dimension whose raw values exceed a low threshold of distinct values. The server runs `bucketize` on raw input before canonicalization and fingerprinting.
2. `expected_max_fingerprints_per_account` declares cardinality intent. If absent on a non-trivial descriptor, registration emits a warning. If declared above a hard ceiling, registration fails.
3. The Phase 1 acceptance criterion (§1.14) is a 14-day test: at least one pattern of each registered type must reach `validated`. If none do, the dimensions are too narrow; revisit bucketization before adding more types. Do not paper over with lower confidence thresholds.

`PatternOutcomeMetricDescriptor` shape:

```ts
export interface PatternOutcomeMetricDescriptor {
  readonly name: string;                  // e.g. "reply_rate"
  readonly description: string;           // LLM-readable
  readonly unit: string;                  // e.g. "ratio_0_1", "count", "seconds", "currency_usd"
}
```

`PatternDecayBounds` shape:

```ts
export interface PatternDecayBounds {
  readonly initial_decay_days: number;          // default effective_decay_days at creation
  readonly decay_floor_days: number;            // Phase 2 calibration cannot adjust below this
  readonly decay_ceiling_days: number;          // Phase 2 calibration cannot adjust above this
  readonly calibration_sample_threshold: number; // Phase 2 calibration requires this many observations before adjusting
}
```

`PatternConfidenceThresholds` shape:

```ts
export interface PatternConfidenceThresholds {
  readonly validate_at: number;   // [0,1] confidence to promote emerging -> validated
  readonly decline_at: number;    // [0,1] confidence below which validated -> declining
}
```

Constraint: `validate_at` must be strictly greater than `decline_at`. Registration fails otherwise.

### §1.4 Emission path

Apps emit patterns through Synapse via a new endpoint `/api/synapse/patterns`, separate from `/api/synapse/propose`. The platform contract distinguishes "Proposals up, commands down, Patterns up." Proposals carry layered Context Structure updates; patterns carry empirical signatures with outcome data. They are not the same flow, and conflating them would force pattern emissions to either pretend to be Proposals (loses type safety, breaks dedup) or fork the propose handler internally (worse abstraction).

The Synapse client gets a new method:

```ts
synapse.emitPattern(payload: PatternEmissionPayload): Promise<PatternEmissionResult>
```

`PatternEmissionPayload` shape:

```ts
export interface PatternEmissionPayload {
  pattern_type: string;
  dimensions: Record<string, unknown>;        // pre-bucketization; server runs bucketize then canonicalizes
  outcome_metrics: Array<{
    metric_name: string;
    value: number;
    sample_count: number;
    confidence: number;
    unit: string;
  }>;
  applies_to_icp?: string | null;
  evidence_refs: string[];                    // Ledger entry IDs that constitute the evidence for this emission
}
```

`PatternEmissionResult` is a discriminated union over `outcome`:

```ts
export type PatternEmissionResult =
  | { outcome: 'created_emerging';   pattern_id: string; status: 'emerging';   confidence_score: number; observation_count: number }
  | { outcome: 'evidence_added';     pattern_id: string; status: 'emerging'|'validated'|'declining'; confidence_score: number; observation_count: number }
  | { outcome: 'promoted';           pattern_id: string; status: 'validated'; confidence_score: number; observation_count: number; transitioned_from: 'emerging'|'declining' }
  | { outcome: 'demoted';            pattern_id: string; status: 'declining'; confidence_score: number; observation_count: number; transitioned_from: 'validated' }
  | { outcome: 'duplicate_ignored';  pattern_id: string; reason: 'evidence_refs_covered' }
  | { outcome: 'rejected_unregistered_type'; reason: string }
  | { outcome: 'rejected_schema';            reason: string; zod_issues?: unknown }
  | { outcome: 'rejected_metric_unit';       reason: string; metric_name?: string }
  | { outcome: 'rejected_emitting_app';      reason: string };
```

Server-side validation chain on emission:

1. Authenticate the request (Synapse session token or service-to-service auth).
2. Resolve the account from the session.
3. Verify the calling synapse row in `kinetiks_synapses` exists and has `status = 'active'`.
4. Look up the `PatternTypeDescriptor` for `payload.pattern_type`. If unregistered, return `rejected_unregistered_type`.
5. Verify the calling app is in `descriptor.emitting_apps`. If not, return `rejected_emitting_app`.
6. Validate `payload.dimensions` against `descriptor.dimensions_schema`. On Zod failure, return `rejected_schema`.
7. Apply `descriptor.bucketize(payload.dimensions)` if declared.
8. Validate each `payload.outcome_metrics[i]`: `metric_name` matches one in `descriptor.valid_outcome_metrics`; `unit` matches that descriptor's declared unit string exactly. On any mismatch, reject the whole emission with `rejected_metric_unit`. Lenient acceptance creates silent data drift.
9. Compute the fingerprint:
   - Take the bucketized dimensions.
   - Extract the fields named in `descriptor.fingerprint_dimensions`, in declared order.
   - Canonicalize each value: strings as-is; numbers rounded to 4 decimal places; booleans as-is; arrays sorted; nested objects with sorted keys; `null` and `undefined` collapsed to `null`.
   - Serialize as a single canonical JSON string with sorted top-level keys.
   - Hash with SHA-256 and take the first 32 hex characters.
10. Look up any existing pattern by `(account_id, pattern_type, fingerprint)`.
11. Check idempotency: if existing and every entry in `payload.evidence_refs` is already in `existing.evidence_summary.last_n_ledger_ids`, return `duplicate_ignored`. This composes with "patterns sourced from Ledger entries" rather than introducing a new idempotency surface.
12. If no existing: insert. Compute initial `confidence_score` from §1.6. Set `effective_decay_days = descriptor.decay_bounds.initial_decay_days`. Set `decay_at = last_observed_at + effective_decay_days`. Return `created_emerging`.
13. If existing: merge. Append new `evidence_refs` to `evidence_summary.last_n_ledger_ids` (cap 50). Increment `observation_count` by the count of distinct new evidence refs (not by 1 per emission; observation count is the count of distinct Ledger evidence events). Merge each outcome metric via running average weighted by `sample_count`. Bump `last_observed_at = now()`. Recompute `confidence_score` per §1.6. Extend `decay_at = last_observed_at + effective_decay_days`. Return `evidence_added`.
14. Apply lifecycle transitions per §1.7. If the updated `confidence_score >= descriptor.confidence_thresholds.validate_at` and the current `status === 'emerging'`, transition to `validated` and return `promoted`. If the updated `confidence_score <= descriptor.confidence_thresholds.decline_at` and the current `status === 'validated'`, transition to `declining` and return `demoted`.
15. Emit Ledger entries: `pattern_observed` for every emission (with `pattern_id`, evidence refs, outcome snapshot). `pattern_arbitrated` additionally when a lifecycle transition fires.

The endpoint is synchronous. The read path needs patterns queryable in the same conversation as the emission so Marcus can cite them in the same turn that triggered them. This also bounds the latency budget: an emission that times out is a clear failure rather than a deferred mystery.

The Archivist write path (`apps/id/src/lib/patterns/pattern-write.ts`) is a separate module from the existing Archivist clean pipeline (`apps/id/src/lib/archivist/*`). The clean pipeline is a batch operation over already-stored Cortex data; the pattern write path is single-record, transactional, idempotent by fingerprint and evidence-ref overlap. Do not fold them into each other.

### §1.5 Read path (`query_patterns`)

Agents read patterns through the `query_patterns` tool. The tool descriptor is registered in `@kinetiks/tools` at the same boot pass as every other tool. Its input and output schemas are:

```ts
inputSchema: z.object({
  pattern_types: z.array(z.string()).optional(),
  source_apps: z.array(z.string()).optional(),                           // filter by emitting_app
  applies_to_icp: z.string().nullable().optional(),                      // null matches null
  minimum_confidence: z.number().min(0).max(1).optional(),
  status_in: z.array(z.enum(['emerging','validated','declining'])).optional(), // 'archived' is excluded from default reads
  exclude_user_suppressed: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(100).optional().default(20),
})

outputSchema: z.object({
  patterns: z.array(z.object({
    id: z.string(),
    pattern_type: z.string(),
    emitting_app: z.string(),
    applies_to_icp: z.string().nullable(),
    status: z.enum(['emerging','validated','declining','archived']),
    confidence_score: z.number(),
    observation_count: z.number().int(),
    first_observed_at: z.string(),
    last_observed_at: z.string(),
    decay_at: z.string(),
    dimensions: z.record(z.unknown()),
    outcome_metrics: z.array(z.object({
      metric_name: z.string(),
      value: z.number(),
      sample_count: z.number().int(),
      confidence: z.number(),
      unit: z.string(),
    })),
    user_starred: z.boolean(),
    user_suppressed: z.boolean(),
    user_annotation: z.string().nullable(),
  })),
  total: z.number().int().nonnegative(),
})
```

This shape matches the F2 stub at `apps/id/src/lib/tools/query-patterns.ts`, extended with the user-override fields and without the `stub: boolean` field that the L1a implementation no longer needs. The atomic swap (Zod schema + stub removal + executor replacement) lands in a single commit so callers never see an inconsistent schema.

Enforcement of the read allowlist happens at the tool's `execute()` layer, not in the DB. The execute context resolves the calling app from the agent runtime context; the underlying shared helper `apps/id/src/lib/cortex/patterns/list.ts` takes a `{ caller_app: string | 'customer_ui' }` parameter and applies the orthogonal axes:

- `caller_app !== 'customer_ui'`: include only patterns whose `descriptor.read_apps` contains `caller_app`.
- `caller_app === 'customer_ui'`: include only patterns whose `descriptor.customer_visible === true`.

The shared helper is also the read path for the Cortex Patterns Server Action that backs the UI. There is exactly one place that knows how to read the Pattern Library; everything else routes through it. No raw `.from('kinetiks_pattern_library').select(...)` from feature code.

Default ordering when the caller does not specify: `confidence_score DESC, last_observed_at DESC, observation_count DESC`. This puts validated, recently observed, well-evidenced patterns first.

### §1.6 Confidence formula

Phase 1 ships a pinned deterministic formula. Constants are pinned in this spec, not in code comments, so the formula is reproducible and reviewable independent of implementation drift.

```
confidence_score = w_obs * obs_term
                 + w_recency * recency_term
                 + w_stability * stability_term

with:
  w_obs       = 0.5
  w_recency   = 0.2
  w_stability = 0.3
  (sum to 1.0)

  obs_term = 1 - exp(-observation_count / k_obs)
    where k_obs = 8

  recency_term = exp(-days_since_last_observation / k_recency)
    where k_recency = effective_decay_days / 2
    and days_since_last_observation = (now() - last_observed_at).days

  stability_term = 1 - clamp(0, 1, normalized_variance(primary_metric_values))
    where primary_metric is descriptor.valid_outcome_metrics[0].name
    and primary_metric_values are the per-emission values of the primary metric across
        the last min(observation_count, 50) observations
    and normalized_variance = sample_variance / (sample_mean^2 + epsilon)
    and epsilon = 1e-6
    (when observation_count < 2, stability_term = 0; the formula has no signal without variance)
```

User overrides interact with the score:

- `user_suppressed = true`: the read-time projection forces `confidence_score = 0`. The stored value is unchanged; the customer can unsuppress and the original score returns.
- `user_starred = true`: no effect on the score. Starred patterns retain their computed confidence. The override is purely on the decay lifecycle (§1.9) and the UI surface.

Phase 2 calibration layers on top of this formula by adjusting `effective_decay_days` within `decay_bounds` based on observed outcome-metric stability over time. Phase 2 may also introduce LLM-judged stability evaluation for outcomes that resist normalized-variance calculation (e.g., categorical or text-heavy outcomes). The Phase 1 formula remains the deterministic baseline.

### §1.7 Pattern lifecycle state machine

Legal transitions:

- `emerging → validated` (Archivist: confidence crosses `validate_at`)
- `emerging → archived` (Archivist: archived for ICP removal or customer archive action)
- `validated → declining` (Archivist: confidence falls below `decline_at` OR time-based decay sweep triggers)
- `validated → archived` (Archivist: customer archive action)
- `declining → validated` (Archivist: re-validation after fresh evidence pushes confidence back above `validate_at`)
- `declining → archived` (Archivist: `decay_at` passed; time-based decay sweep)

Terminal: `archived`. Once archived, never returns.

User-starred patterns are exempt from auto-archive. The Archivist's decay sweep skips them. The customer can still manually archive a starred pattern; the override is on automatic decay, not on customer agency.

Three-layer enforcement per CLAUDE.md:

1. The `pattern-write.ts` module calls `assertTransition({ entity: 'kinetiks_pattern_library', from, to, actor })` from `@kinetiks/lib/state-machines` before any UPDATE.
2. A Postgres trigger `enforce_pattern_lifecycle_transition()` validates the same rules at the DB layer.
3. RLS denies INSERT, UPDATE, and DELETE to all non-service-role callers. The Archivist is the sole writer; customer mutations route through Server Actions that use the service role with explicit account scoping enforced server-side.

### §1.8 User overrides

The customer can interact with patterns through three first-class overrides:

- **Star (`user_starred`)** - "this pattern is important to me; do not auto-archive it." Starred patterns are pinned in the UI default order, are still subject to confidence recalculation, but are exempt from the time-based decay sweep.
- **Suppress (`user_suppressed`)** - "this pattern is noisy or wrong; do not surface it." Suppressed patterns are excluded from default reads (`exclude_user_suppressed` defaults to `true` in `query_patterns`). Confidence projects to 0 at read time. The pattern persists in storage; the customer can unsuppress at any time. Marcus's evidence brief never includes suppressed patterns.
- **Annotate (`user_annotation`)** - free-text note attached to the pattern for the customer's own record. The annotation is not exposed to LLM prompts in v1 (PII risk; future versions may surface it explicitly).

User overrides win over AI-generated arbitration per the existing Cortex ownership hierarchy. The Archivist never clears a user override. The customer never edits `dimensions` or `outcome_metrics` directly; those are empirical and immutable from the UI surface.

Override actions emit Ledger entries (`pattern_user_starred`, `pattern_user_unstarred`, `pattern_user_suppressed`, `pattern_user_unsuppressed`, `pattern_user_annotated`). The Authority Agent and Pattern decay calibration (Phase 2) calibrate from this signal.

### §1.9 Empirical decay

Phase 1 ships time-based decay only. A daily sweep in `archivist-cron` runs the following SQL pass per account:

- For each pattern with `status = 'validated'` and `user_starred = false`: if `now() - last_observed_at > effective_decay_days * 0.7`, transition to `declining`.
- For each pattern with `status = 'declining'` and `user_starred = false`: if `now() > decay_at`, transition to `archived`.

The 0.7 coefficient is the spec's choice: declining is the leading indicator, archived is the terminal. A pattern that stops being observed enters declining at roughly two-thirds of its decay window and archives at the window's end. Phase 2 calibration adjusts `effective_decay_days` within `decay_bounds`; the sweep stays time-based.

The sweep is implemented in `apps/id/src/app/api/archivist/patterns/sweep/route.ts`. It is invoked from `supabase/functions/archivist-cron/index.ts` after the existing `/api/archivist/clean` fan-out for each account. Each lifecycle transition writes a `pattern_arbitrated` Ledger entry with `from`, `to`, and `reason: 'time_decay'`.

### §1.10 Export and import

Customer data is the customer's. The Pattern Library is no exception.

**Export.** `GET /api/cortex/patterns/export` returns the full Pattern Library for the authenticated account as a JSON file. Includes all patterns regardless of `status`, `user_starred`, or `user_suppressed`. The export schema:

```ts
{
  schema_version: '2027-1',
  exported_at: string,
  account_id: string,
  patterns: Array<{
    pattern_type: string;
    emitting_app: string;
    applies_to_icp: string | null;
    status: 'emerging'|'validated'|'declining'|'archived';
    confidence_score: number;
    observation_count: number;
    first_observed_at: string;
    last_observed_at: string;
    effective_decay_days: number;
    user_starred: boolean;
    user_suppressed: boolean;
    user_annotation: string | null;
    dimensions: Record<string, unknown>;
    outcome_metrics: Array<{ metric_name: string; value: number; sample_count: number; confidence: number; unit: string }>;
    // evidence_summary.last_n_ledger_ids is excluded — those reference rows in the source account's Ledger
  }>;
}
```

Rate-limited at 5 exports per hour per account via Ledger-based counting on the existing composite index `kinetiks_ledger (account_id, event_type, created_at desc)` from migration `00004_ledger_rate_limit_index.sql`. The existing `kinetiks_rate_limits` table is keyed by API key, not by account, so it does not express this constraint. Every export writes a `pattern_exported` Ledger entry.

**Import.** `POST /api/cortex/patterns/import` accepts the export schema. Validates `schema_version`. For each pattern in the payload:

1. Look up the `PatternTypeDescriptor`. If unregistered, skip with a logged warning (returned in the response `errors[]`).
2. Validate the imported `dimensions` against the descriptor's Zod schema. On failure, skip with the validation error.
3. Compute a fresh fingerprint via the descriptor's `fingerprint_dimensions` ordering.
4. Look up any existing pattern at `(account_id, pattern_type, fingerprint)`. If exists, skip with `errors[]` entry noting the existing pattern_id (the import does not overwrite live data; the customer must explicitly archive the existing pattern first).
5. Insert with these resets:
   - `account_id` rewritten to the current account.
   - `status = 'emerging'`.
   - `confidence_score = imported_confidence_score / 2`. Halving is the conservative re-emerging behavior; imported confidence is signal but not equivalent to fresh empirical evidence.
   - `effective_decay_days = descriptor.decay_bounds.initial_decay_days`.
   - `last_observed_at = now()`. `first_observed_at = now()`.
   - `decay_at = now() + effective_decay_days`.
   - `observation_count` preserved from the import (the evidence count is portable; the freshness is not).
   - `dimensions` preserved.
   - `outcome_metrics` preserved.
   - `applies_to_icp` preserved.
   - `user_annotation` preserved.
   - `user_starred = false`, `user_suppressed = false` (overrides are account-local).
   - `evidence_summary = { last_n_ledger_ids: [], summary: { total_evidence_count: observation_count, period_days: 0, primary_metric: ..., primary_metric_value: ... } }`.
6. Write a `pattern_imported` Ledger entry per imported pattern with `imported_from_account_id_hash` in `detail` (SHA-256 of the source account_id, truncated to 16 hex chars; preserves audit attribution without leaking the source account identity to the destination account's audit trail).

Returns `{ imported: number, skipped: number, errors: Array<{ pattern_type, fingerprint?, reason }> }`.

Cross-account imports are allowed (customer's own data, account A to account B - trial-to-real migration, fresh-account seeding). The import never overwrites existing patterns; the customer explicitly resolves collisions.

### §1.11 Customer surface

The Cortex Patterns sub-tab is the customer's first-person view of what the system has learned. It sits between Goals and Authority in the seven-section Cortex sub-nav (Identity → Goals → Budget → Patterns → Authority → Integrations → Ledger). In Phase 1, only Patterns and the pre-existing four (Identity, Goals, Integrations, Ledger) are present; Budget and Authority join in their respective phases.

The sub-tab renders:

- **Filter bar.** Pattern type select (populated from `listPatternTypes()` filtered by `customer_visible: true`). Status select (emerging / validated / declining / archived). Emitting app select. Minimum confidence slider. Starred toggle. Suppressed toggle (off by default; on shows suppressed patterns in faded styling).
- **List.** Each pattern renders as a `@kinetiks/ui` Card containing:
  - Status `Pill` (tone: `accent` for emerging, `success` for validated, `warning` for declining, `neutral` for archived).
  - `ConfidenceRing` rendering `confidence_score` (size `md`, threshold 0.6 for accent fill).
  - The pattern type (humanized).
  - One-line outcome summary (the primary metric: name, value, sample count).
  - Brief dimension preview (the fingerprint dimensions, humanized).
  - `last_observed_at` in mono.
  - Quick-action affordances: star/unstar, suppress/unsuppress, expand-to-detail.
- **Detail Dialog.** Opened from the Card's expand affordance. Shows:
  - Full pretty-printed `dimensions`.
  - Full `outcome_metrics` array.
  - `evidence_summary` with deep-links to the underlying Ledger entries.
  - Lifecycle history (derived from the pattern's `pattern_arbitrated` Ledger entries).
  - User override controls (star, suppress, annotation textarea).
  - Archive action with confirmation.
- **Header controls.** Export Button (triggers JSON download). Import Button (file picker).

All values reference `--kt-*` design tokens. Light and dark mode render intentionally. Status pills always pair color with text label. Accessibility: semantic HTML, keyboard navigation, focus states, `aria-live` regions on filter changes.

Data flow: the Server Component fetches the initial page via `apps/id/src/lib/cortex/patterns/list.ts` with URL-driven filters. Mutations (star, suppress, annotate, archive) go through Server Actions that enforce account ownership, route through the state machine, and write Ledger entries.

### §1.12 Marcus integration

Patterns enter Marcus's evidence brief manifest passively, alongside Cortex context layers. They are not pulled by Marcus's existing step 7.5 tool-decision pass (one tool per turn); they are pre-fetched into the brief before pre-analysis runs, the same way Cortex layer data is.

Pre-fetch logic (in `apps/id/src/lib/marcus/evidence-brief-builder.ts` or equivalent):

1. Query the patterns helper with `caller_app: 'marcus'`, `status_in: ['validated', 'emerging']`, `minimum_confidence: 0.6`, `exclude_user_suppressed: true`.
2. Rank by `(confidence_score, observation_count, applies_to_icp matches customer ICP)`.
3. Take the top N (default 5).
4. Compose one line per pattern into the brief: `pattern_type` (humanized), key fingerprint dimensions, primary outcome metric (name, value), confidence summary. No raw statistics, no jsonb dumps.

Marcus's persona prompt is updated with the rule: patterns in the brief are evidence to weave into the implication of the response, not statistics to dump. Example legal: "your outreach to head-of-marketing roles at 50-200 employee SaaS books meetings at roughly 2.3x the rate of your broader list." Example illegal: "Pattern harvest.outreach_angle_performance{angle_kind:'curiosity_hook',industry_bucket:'b2b_saas',seniority_tier:'director'} confidence 0.81 across 23 observations shows reply_rate 0.142..."

`query_patterns` remains a tool that Marcus's step 7.5 may select for the rare turn that is an explicit "what patterns do you have about X" question. Two decision paths (one passive, one active) is the correct division: passive evidence is always present; active tool calls are reserved for the user's explicit prompts.

The action-generation Haiku (second pass, where the response body is filtered structurally and actions are emitted separately) receives the same patterns context. Action suggestions can cite pattern evidence; doing so without it remains a structural prohibition.

### §1.13 Ledger integration

Every state-changing pattern action emits a Ledger entry. The Ledger is append-only; never delete. `LedgerEventType` gains these entries:

- `pattern_observed` - written on every successful emission. `detail` includes `pattern_id`, `pattern_type`, `outcome` (one of the discriminated emission outcomes), `evidence_refs[]`, `outcome_metrics_snapshot`.
- `pattern_arbitrated` - written on lifecycle transitions. `detail` includes `pattern_id`, `from`, `to`, `reason` ('confidence_threshold' | 'time_decay' | 'customer_archive' | 'icp_removed').
- `pattern_user_starred`, `pattern_user_unstarred` - customer override. `detail`: `pattern_id`.
- `pattern_user_suppressed`, `pattern_user_unsuppressed` - customer override. `detail`: `pattern_id`.
- `pattern_user_annotated` - customer override. `detail`: `pattern_id`, `annotation_length` (no raw text in detail).
- `pattern_exported` - export action. `detail`: `pattern_count`, `schema_version`.
- `pattern_imported` - per-pattern import action. `detail`: `pattern_id`, `pattern_type`, `imported_from_account_id_hash`, `original_confidence_score`.
- `pattern_archived` - terminal lifecycle entry. Same as `pattern_arbitrated` with `to: 'archived'`, kept distinct for query-side filtering.

The Ledger union remains a flat string union in `@kinetiks/types/src/billing.ts` with `detail: Record<string, unknown>`. A discriminated union refactor is a separate structural improvement; it is not scoped to L1a.

Patterns and the Ledger compose closed loop. Pattern emissions reference Ledger entries (via `evidence_refs`); pattern lifecycle transitions write Ledger entries; actions taken because of patterns (in future phases) reference patterns by `pattern_id` in their Ledger entries. The evidence trail is attributable both directions.

### §1.14 Cardinality discipline

Pattern type explosion is the failure mode that most threatens the Library's utility. The mitigations live at multiple layers:

1. **Bucketization at the descriptor.** Every dimension whose raw values exceed a low cardinality threshold must be bucketed before fingerprinting. `industry` ≠ `industry_bucket`; `title` ≠ `title_family`; `revenue` ≠ `revenue_band`. The `bucketize` function on the descriptor is run server-side before canonicalization.
2. **`fingerprint_dimensions` ordering.** Identity is by the declared subset of dimensions, not by every dimension. Free-form metadata fields (e.g. last seen geography, marker fields) can ride along in `dimensions` for the customer's record without affecting the fingerprint.
3. **`expected_max_fingerprints_per_account`.** Cardinality intent declared at registration. Warnings on absence; failures above a hard ceiling (currently 1,000 per pattern type per account).
4. **14-day acceptance criterion.** Within two weeks of real emissions from Harvest, at least one pattern of each registered Harvest pattern type must reach `validated`. If none do, the dimensions are too narrow. Revisit bucketization before adding more pattern types; do not paper over by lowering `confidence_thresholds.validate_at`.

The seed Harvest pattern types ship with bucketization explicit (see `apps/hv/src/lib/patterns/descriptors.ts`):

- `harvest.outreach_angle_performance`: `industry → ~15 NAICS L2 buckets`, `seniority → 5 tiers (IC, manager, director, VP, exec)`, `angle_kind` from closed enum.
- `harvest.sequence_step_conversion`: `step_index` and `channel` natural enums; `day_offset → day-buckets (0, 1-2, 3-5, 6-10, 11+)`.
- `harvest.icp_resonance`: `title → ~12 title families`, `employee_count_band` bucketed by definition, others natural enums.

---

## §2 Authority Grants (Phase 4)

> Placeholder. Authored when Phase 4 begins, closer to Implosion launch.

Sketch:
- **§2.1** First-class Cortex structure peer to Budget. Scoped, time-bounded, plain-language, customer-approved.
- **§2.2** `kinetiks_authority_grants` hybrid table.
- **§2.3** Lifecycle state machine.
- **§2.4** Action Class Registry (descriptor shape exists today in `@kinetiks/types/src/descriptors.ts`; this section codifies the registration model alongside the Pattern Type Registry).
- **§2.5** `customer_template` rendering rule. The literal phrase "Authority Grant" never appears in customer copy; the customer reads sentences produced by the action class's plain-language template.
- **§2.6** Authority Agent Operator - proposes grants from Pattern Library, Ledger, Budget context. Never grants. Never executes.
- **§2.7** New approval class: `authority_grant_proposal`.
- **§2.8** Nested grants (Workflow-scoped inside Program-scoped) - recursive validation: capabilities are subsets, constraints at least as restrictive, spend envelopes within parent, expiry within parent.
- **§2.9** Authority resolution flow - runs before every consequential action. Per-class LLM judgment budgets enforced by the AI router.
- **§2.10** Escalation triggers: `anomaly`, `novelty`, `pacing`, `threshold`, `llm_judged`.
- **§2.11** Revocation. Pause, narrow, revoke. Revocation reasons are first-class signal to the Authority Agent's next proposal calibration.

---

## §3 Operator Workflows extension (Phase 3)

> Placeholder. Authored when Implosion is being scoped.

Sketch:
- **§3.1** `WorkflowTask` gains `target_type: 'cross_app' | 'internal_operator'` and `target_app`.
- **§3.2** Apps with internal Workflows declare an `operator_registry` on their `KineticsAppManifest`. Apps without internal Workflows omit the field entirely.
- **§3.3** `OperatorDescriptor` (already exists in `@kinetiks/types/src/descriptors.ts`) is the contract. Unregistered Operators are not addressable from a Workflow task.
- **§3.4** Cross-app dispatch goes through Synapse Routing Event. Internal dispatch goes through the executing app's own Operator registry.
- **§3.5** Three-Layer communication rules from the base platform contract preserved. Operators in app A still cannot talk to Operators in app B.
- **§3.6** When to use a Workflow inside an app. Conditional branches, parallel-then-merge, internal approval checkpoints → Workflow. Linear sequences with no branching stay on the existing scheduled-Operator pattern.

---

## §4 Default Standing Grants (Phase 5)

> Placeholder. Ships with Phase 4 close to Implosion launch.

Sketch:
- **§4.1** Apps declare `default_standing_grants` in their manifest. Eligibility is `ActionClassDescriptor.available_in_default_standing_grants` (off by default; never includes spending or external-state classes).
- **§4.2** Proposed automatically on first-connect and reviewed at signup. Customer sees a diff if the manifest changes later.
- **§4.3** Customer reversibility identical to any grant: pause, narrow, revoke.

---

## §5 Multi-user placeholder schema (v2 preparation)

> Placeholder. Schema-forward today; functional in v2.

Sketch:
- **§5.1** The `team_scope_id text` column on every 2027-architecture table (see "Cross-section invariant" above). Always null in v1.
- **§5.2** Index strategy: includes `team_scope_id` as a trailing column where indexing on `account_id` already exists. Zero cost in v1.
- **§5.3** Query convention: every read filters by `account_id`; `team_scope_id` is an optional additional filter. v2 narrows reads by both.
- **§5.4** RLS: v1 policies key on `account_id`. v2 layer-adds team-scope policies; the v1 schema does not need re-migration.

---

## Versioning and compatibility

- Each section bumps the platform contract version when its content is added or its compatibility surface changes.
- Pattern Library export carries a `schema_version` field. Phase 1 emits `2027-1`. Imports from a higher version fail with a clear "your export is newer than this account" error. Imports from a lower version go through a migration adapter declared in `apps/id/src/lib/cortex/patterns/import-migrations.ts`.
- Pattern Type Registry, Action Class Registry, and Operator Registry are append-only without a version bump for the descriptor shape. Breaking changes to a descriptor field require a version bump.

---

## Read also

- `docs/platform-contract.md` — the base platform contract.
- `docs/kinetiks-product-spec-v3.md` — the canonical product spec.
- `docs/specs/approval-system-spec.md` — Approval System architecture; Authority Grants extend it.
- `docs/specs/marcus-engine-v2-plan.md` — Marcus engine architecture; the Pattern Library is read in §1.12 here.
- `docs/specs/programs-spec.md` — Programs / Workflows / Tasks hierarchy; Operator Workflows extension (§3) lives here.
