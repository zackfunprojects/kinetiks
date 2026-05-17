# F3 follow-ups — status

F3 (Approval pipeline end-to-end + Cortex Identity edit via Proposals +
Insight Store) is functionally complete. Workspace type-check, AI
boundary, runtime boundary, unit tests (66 across tools + runtime +
threshold-math), and the apps/id production build are all green.

## Done in F3

### Migration 00033 — approval class, state-machine triggers, insights table
- [x] `kinetiks_approvals.approval_class` text column (`standard` | `budget_proposal` | `authority_grant_proposal`). UI for budget + authority lands in L2b but the contract is in place today.
- [x] Postgres trigger `kinetiks_approvals_check_transition` enforces one-way state transitions: terminal states (`approved`/`rejected`/`expired`) cannot be left; `auto_approved` → `flagged` only; `flagged` → `approved`/`rejected` only; `pending` → any allowed successor.
- [x] Postgres trigger `kinetiks_proposals_check_transition` enforces the proposal state machine: terminal states (`declined`/`expired`/`superseded`); `submitted` → `accepted`/`declined`/`escalated`/`expired`; `escalated` → `accepted`/`declined`/`expired`; `accepted` → `superseded` only.
- [x] `kinetiks_insights` first-class table with RLS, indexes on (account, severity, created_at), proposal/approval/correlation linkages, expires_at, and one-way triggers for `dismissed` + `acted_on` (cannot revert).

### `@kinetiks/lib` state-machine registration
- [x] `apps/id/src/lib/state-machines-init.ts` registers the approvals + proposals state machines with `@kinetiks/lib/state-machines` so the server-action layer (`canTransition` / `assertTransition`) enforces the same rules as the trigger.
- [x] `instrumentation.ts` calls `registerKinetiksStateMachines()` at Node-runtime boot, alongside the AI logger / prompt-task registry / tool registry boot.

### Insights module ([apps/id/src/lib/insights/](apps/id/src/lib/insights/))
- [x] `emit(admin, input)` writes one row with default delivery + expiry routing by severity (urgent → chat, notable → email, info → analytics; matching default expires_at windows of 365d/90d/30d).
- [x] `markInsightDelivered` (idempotent), `listUndeliveredInsights` (severity-filtered, paginated).
- [x] Strict primitives-only `evidence` + `suggested_action` shape per CLAUDE.md PII rules.

### Cortex Identity edit → Proposal pipeline
- [x] [submitContextEditProposal](apps/id/src/lib/cortex/submit-context-edit.ts) creates a Proposal (status `submitted`, action `update`, confidence `validated`), submits an Approval audit card via `processApproval`, calls `evaluateProposal` to drive the Archivist's schema + conflict + relevance + merge pipeline, and emits an `identity_update` Insight.
- [x] PUT/PATCH `/api/context/[layer]` now route through this helper — direct upserts to `kinetiks_context_*` are gone. Edits return `{ outcome, proposal_id, approval_id, approval_status, confidence }`.
- [x] PATCH preserves RFC 7386 deep-merge semantics by computing the merged state at the API layer before submitting the proposal.

### Approval action handler resolves the linked Proposal
- [x] `processApprovalDecision` (approve branch): when the approval's preview is `context_edit`, look up the linked `proposal_id` and call `resolveProposal('accept')` to apply the merge into `kinetiks_context_{layer}`. Emits an `identity_update` Insight tagged with the layer + proposal.
- [x] Reject branch: calls `resolveProposal('decline', rejection_reason)` and emits a `notable` `approval_outcome` Insight. Trust contraction still fires via the existing `calibrateThreshold` path.
- [x] All approve/reject decisions write an Insight, so Analytics has a queryable feed of every approval outcome.

### Sentinel splice in the approval brand gate
- [x] [brand-gate.ts](apps/id/src/lib/approvals/brand-gate.ts) now runs two parallel signals: the existing Voice-layer Haiku check (now via the router → `ai_calls` observable as `approval.brand_gate`) and `@kinetiks/sentinel.reviewContent` when the preview type maps to a `SentinelContentType` (email/content/social/pitch). Sentinel `held` blocks the approval; `flagged` passes but is surfaced in the gate feedback; Sentinel outages degrade permissively to Haiku-only.
- [x] [edit-analyzer.ts](apps/id/src/lib/approvals/edit-analyzer.ts) migrated to the router as `approval.edit_analyzer` so the post-approve edit classification is observable in `ai_calls`.

### Approval expiry CRON + default windows
- [x] [approvals/pipeline.ts](apps/id/src/lib/approvals/pipeline.ts) sets default `expires_at` per approval type when the caller does not specify: quick=24h, review=72h, strategic=7d. Pass `expires_in_hours: 0` to opt out.
- [x] `supabase/functions/expire-cron/index.ts` extended with a fourth pass that expires `pending` approvals past their `expires_at`, writes ledger entries, and emits `approval_outcome` Insights. Uses the same BATCH_SIZE cap as the proposal sweeps.

### Trust-contraction tests (Vitest, pure math)
- [x] [threshold-math.ts](apps/id/src/lib/approvals/threshold-math.ts) extracted from threshold.ts. No `server-only` deps so it's unit-testable.
- [x] [threshold-math.test.ts](apps/id/src/lib/approvals/__tests__/threshold-math.test.ts) — 13 tests covering:
  - Expansion: counter increments, threshold drop at 20 + 50 consecutive clean, clamp at 0.
  - Edits: streak reset to 0, total_approvals still increments, approval_rate recomputes.
  - Contraction: 1 rejection → +10, 2 in 7d → +20, 3 in 7d → reset to 100, clamp at 100.
  - One-way semantics: a single rejection contracts; recovery requires 20+ clean approvals before another −5.

### pgTAP coverage for the new tables and triggers
- [x] `supabase/tests/approvals_state_machine.sql` — 13 assertions over allowed and denied transitions, plus terminal locks and the new `approval_class` CHECK.
- [x] `supabase/tests/proposals_state_machine.sql` — 9 assertions over the proposal state machine including the `accepted` → `superseded` one-way rule.
- [x] `supabase/tests/insights_cross_tenant.sql` — 8 assertions over RLS isolation, the `dismissed` / `acted_on` one-way trigger, and timestamp stamping.

### Verification gates
- [x] Workspace type-check 15/15 clean.
- [x] AI SDK boundary check clean.
- [x] Runtime boundary check clean.
- [x] `@kinetiks/tools` 44/44 Vitest pass.
- [x] `@kinetiks/runtime` 9/9 Vitest pass.
- [x] `apps/id` threshold-math 13/13 Vitest pass.
- [x] `apps/id` production `next build` green.

## Out-of-F3 scope (named successor phases)

- **L2a (Authority Grants core):** the `authority_grant_proposal` approval class column is in place; the rendering of authority-grant cards in the approvals panel (with the Authority Agent's plain-language `customer_template`) lands in L2b.
- **L1a (Pattern Library core):** the approval/insight system emits `pattern_update` insight types as a forward-compatible label; the actual pattern emit/read paths land in L1a.
- **Oracle migration off `kinetiks_oracle_insights`:** the Oracle still writes to its dedicated table. A future migration unifies into `kinetiks_insights` (or sets up a view); deferred so this phase doesn't pre-empt Oracle's own ownership.
- **Marcus integration with insights:** the engine can already see the registry inventory and the brief; pulling undelivered urgent insights into the brief (so Marcus can lead with them) is a Marcus-side hardening that fits inside the F2 follow-up.
- **Approval card UI surfaces for context_edit previews:** the approval is created and the proposal applies via `resolveProposal`; the Approvals panel may want a specialized `ContextEditApprovalCard` that shows the field-by-field diff. Today the existing review/strategic cards render the preview generically.

## Manual ops checks (Docker required)

```bash
# 1. Apply migrations + regenerate types
supabase start
supabase db reset
pnpm db:types

# 2. Run pgTAP suite
brew install pg_prove   # if missing
./scripts/test-rls.sh

# Expected:
#   proposals_cross_tenant.sql   passes (F0)
#   user_preferences_cross_tenant.sql passes (F0)
#   ai_calls_cross_tenant.sql    passes (F0)
#   tool_calls_cross_tenant.sql  passes (F0)
#   approvals_state_machine.sql  passes (F3)
#   proposals_state_machine.sql  passes (F3)
#   insights_cross_tenant.sql    passes (F3)

# 3. End-to-end proof point
#    a) Edit a Cortex Identity field via the UI (or PUT /api/context/voice with { data: {...} })
#    b) Verify a proposal row landed:
#       SELECT id, status, source_operator FROM kinetiks_proposals
#       ORDER BY submitted_at DESC LIMIT 1;
#    c) Verify an approval audit card landed:
#       SELECT id, status, approval_type, approval_class FROM kinetiks_approvals
#       ORDER BY created_at DESC LIMIT 1;
#    d) Verify the layer was merged:
#       SELECT data, confidence_score FROM kinetiks_context_voice WHERE account_id = ...;
#    e) Verify the insight landed:
#       SELECT id, type, severity, summary FROM kinetiks_insights
#       WHERE proposal_id = (the proposal id from step b);
```

## Files added in F3

- `supabase/migrations/00033_approval_state_machines_and_insights.sql`
- `apps/id/src/lib/state-machines-init.ts`
- `apps/id/src/lib/insights/{types,deliver,emit,index}.ts`
- `apps/id/src/lib/cortex/submit-context-edit.ts`
- `apps/id/src/lib/approvals/threshold-math.ts`
- `apps/id/src/lib/approvals/__tests__/threshold-math.test.ts`
- `supabase/tests/approvals_state_machine.sql`
- `supabase/tests/proposals_state_machine.sql`
- `supabase/tests/insights_cross_tenant.sql`
- `docs/build-phases/F3_FOLLOW_UPS.md` (this file)

## Files modified in F3

- `apps/id/src/lib/approvals/{pipeline,brand-gate,edit-analyzer,learning-loop,threshold,types}.ts` — Sentinel splice, router migration, default expiry windows, context_edit proposal application, insight emission, new `approval_class` + `context_edit` preview types
- `apps/id/src/app/api/context/[layer]/route.ts` — PUT/PATCH route through Proposal pipeline
- `apps/id/src/lib/ai/task-registry.ts` — `approval.brand_gate` + `approval.edit_analyzer` tasks
- `apps/id/src/instrumentation.ts` — registers state machines at Node-runtime boot
- `supabase/functions/expire-cron/index.ts` — fourth pass that expires pending approvals + emits insights
