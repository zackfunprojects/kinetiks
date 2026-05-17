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

> **L1a phase deliverable. The full canonical text is authored in the immediately following commit.** This stub establishes the section outline so cross-references from code comments compile to a real anchor.

§1 covers:

- **§1.1 Why patterns exist** — empirical evidence layer, replaces vibe-based recommendations, source of truth for what is working for this customer's business.
- **§1.2 Data model** — `kinetiks_pattern_library` hybrid table shape (top-level lifecycle columns + jsonb `dimensions` and `outcome_metrics`), indexes, RLS, UNIQUE constraint on `(account_id, pattern_type, fingerprint)`, `team_scope_id` placeholder.
- **§1.3 Pattern Type Registry** — `PatternTypeDescriptor` shape, boot-time registration in `@kinetiks/tools`, validation of dimensions schema, outcome metrics, read allowlist, decay bounds, confidence thresholds, mandatory bucketization for high-cardinality dimensions, `customer_visible` orthogonal axis.
- **§1.4 Emission path** — Synapse `/api/synapse/patterns` endpoint, server-side fingerprint computation, evidence-ref idempotency, discriminated emission outcome, registry-enforced rejection of unregistered types.
- **§1.5 Read path (`query_patterns`)** — tool input/output contract, read_apps allowlist enforcement, suppressed-pattern exclusion default, single shared helper feeding both the tool and the Cortex Patterns UI Server Action.
- **§1.6 Confidence formula** — pinned deterministic Phase 1 formula (observation term + recency term + stability term, with constants pinned in spec). Phase 2 layers LLM calibration.
- **§1.7 Pattern lifecycle state machine** — legal transitions (`emerging → validated`, `validated → declining`, `declining → validated`, any → `archived`), terminal `archived`, three-layer enforcement (server action + Postgres trigger + RLS), Archivist as sole writer.
- **§1.8 User overrides** — `user_starred`, `user_suppressed`, `user_annotation`. Override semantics: suppressed excluded from default reads; starred never auto-archives; annotation is free-text for the customer's own record.
- **§1.9 Empirical decay** — Phase 1 ships time-based decay only (`validated → declining` when `now - last_observed_at > effective_decay_days * 0.7`; `declining → archived` when `now > decay_at`). Phase 2 adds the nightly calibration that adjusts `effective_decay_days` within `decay_bounds` based on observed outcome stability.
- **§1.10 Export and import** — `/api/cortex/patterns/export` (full portability, Ledger-based rate limit) and `/api/cortex/patterns/import` (schema-versioned, conservative re-emerging behavior, cross-account allowed with hashed source attribution in the Ledger).
- **§1.11 Customer surface** — Cortex Patterns sub-tab between Goals and Authority in the seven-section sub-nav (Identity → Goals → Budget → Patterns → Authority → Integrations → Ledger). Filter, list, detail, star/suppress/annotate/archive, export, import.
- **§1.12 Marcus integration** — Patterns enter the evidence brief manifest passively, alongside Cortex context layers. `query_patterns` remains a tool for explicit "what patterns do you have about X" questions. The response body weaves the implication; no raw statistics in Chat.
- **§1.13 Ledger integration** — every state-changing pattern action emits a Ledger entry with `pattern_id` in `detail`. Pattern arbitration, user overrides, exports, imports, lifecycle transitions all log.
- **§1.14 Cardinality discipline** — `expected_max_fingerprints_per_account` declared at registration. Mandatory `bucketize` for high-cardinality dimensions. Phase 1 acceptance criterion: at least one pattern of each registered type reaches `validated` within two weeks of real emissions.

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
