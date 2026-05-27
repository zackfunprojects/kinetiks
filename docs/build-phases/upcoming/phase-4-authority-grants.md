# Phase 4: Marcus action-bearing tools + Authority Grants + Authority Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal.** Bundle the Authority Grants machinery with the underlying Marcus action-bearing tools they gate. Per the master plan, Phase 4 builds both halves in one phase because the action classes need real tools to authorize, and the tools need the Authority machinery to be meaningfully gated.

**Why now.** Phase 4 is the trust layer the 2027 architecture turns on. With the apps/id-only scope, Marcus's own actions (Slack notify, draft email, calendar invite) become the first concrete consumers of the Action Class Registry, the Authority Agent, and the resolver in `packages/runtime/src/authority.ts`. Phase 4 retires the `f2StubAuthorityResolver` placeholder.

**Spec references**
- `docs/Kinetiks Contract Addendum.md` §2 (Authority Grants), §2.4 (Action Class Registry), §2.5 (Authority Agent), §2.6 (Default Standing Grants — note Phase 5 ships the signup flow), §2.7 (Grant proposal flow), §2.9 (Action execution under a grant), §2.10 (Escalation triggers), §2.13 (Surface in Cortex), §2.14 (Customer-facing language)
- `docs/specs/approval-system-spec.md` (existing Approval System; Phase 4 extends it with `authority_grant_proposal` class)
- `packages/runtime/src/authority.ts` (`f2StubAuthorityResolver` to be replaced)
- `packages/tools/src/action-class-registry.ts` (descriptor type scaffold exists; register-at-boot mechanism to be wired)

---

## Sub-track 4a — Marcus action-bearing tools (~4-6 days, parallelizable with 4b)

Three new tools, each registered in the Tool Registry with full LLM-readable description, input/output schemas, per-account availability resolver. Each declares both an `approval_class` (for cases where no grant covers it) and an `action_class` (for grant-covered cases, populated in 4b).

| Path | What it does |
|---|---|
| `apps/id/src/lib/tools/send-slack-notification.ts` | Sends a Slack DM or channel message via existing `@kinetiks/ai/slack-dispatcher`. Inputs: channel/user, body. Pre-execution: authority resolution runs before invocation |
| `apps/id/src/lib/tools/draft-email.ts` | Drafts (does not send) an email. Stores the draft in the existing email outbox/draft system (Gmail/Microsoft Graph). Inputs: recipient, subject, body, thread |
| `apps/id/src/lib/tools/add-calendar-event.ts` | Creates a calendar event via the existing calendar MCP / Google integration. Inputs: title, start, end, attendees, agenda |

Per-tool unit tests + integration tests with mocked external sends.

## Sub-track 4b — Authority Grants machinery (~6-9 days)

### Schema

| Path | Change |
|---|---|
| `supabase/migrations/00045_kinetiks_authority_grants.sql` | **New** hybrid table per addendum §2.3. Top-level columns: `id`, `account_id`, `status`, `scope_type`, `scope_id`, `parent_grant_id` (nullable), `expires_at`, `granted_at`, `revoked_at`, `team_scope_id` (nullable, always null in v1). jsonb columns: `granted_capabilities`, `escalation_triggers`, `usage_summary`. RLS: account-scoped reads, service-role writes only. State machine trigger enforcing transitions (`pending → active`, `active → paused | revoked | expired`, terminal states block). pgTAP cross-tenant test in `supabase/tests/authority_grants_cross_tenant.sql` |
| `supabase/migrations/00046_authority_grant_proposal_approval_class.sql` | Drop + recreate the `approval_class` CHECK union to include `authority_grant_proposal`. Existing values `standard` and `budget_proposal` preserved |
| `supabase/migrations/00047_authority_ledger_event_types.sql` | Drop + recreate `kinetiks_ledger_event_type_valid` CHECK with: `authority_grant_proposed`, `authority_grant_approved`, `authority_grant_paused`, `authority_grant_narrowed`, `authority_grant_revoked`, `authority_grant_expired`, `authority_action_taken`, `authority_action_escalated` |
| `packages/types/src/billing.ts` | Add the eight new keys to `LedgerEventDetailMap` (each with `grant_id` at minimum; action entries include `action_class` and `outcome`) |

### Registries and runtime

| Path | Change |
|---|---|
| `packages/tools/src/action-class-registry.ts` | Wire register-at-boot mechanism. `registerActionClass(descriptor)`, `getActionClass(key)`, `getRegistry()`. Boot fails if duplicate keys or if `customer_template` is missing |
| `apps/id/src/lib/action-classes/seeds/kinetiks-id.ts` | **New**. Register three action classes: `kinetiks_id.send_slack_notification`, `kinetiks_id.draft_email`, `kinetiks_id.add_calendar_event`. Each with constraint schema (Zod), `customer_template` plain-language renderer, LLM judgment budget config (daily/monthly cap), default-standing-grant eligibility (`true` for slack/email, `false` for calendar v1) |
| `apps/id/src/lib/action-classes/registry-boot.ts` | **New**. Registers the seed pack at app boot |
| `packages/runtime/src/authority.ts` | **Replace** `f2StubAuthorityResolver` with the real flow per addendum §2.9. Takes `(account_id, action_class, action_input)`. Returns `{ outcome: 'execute' | 'escalate' | 'deny', grant_id?: string, reason }` |
| `packages/runtime/src/llm-judgment-budgets.ts` | **New**. Per-class daily/monthly budget enforcement for `llm_judged` escalation triggers. Reads class config from the Action Class Registry. Exhaustion applies the declared fallback (`structured_only` or `escalate_to_user`) |
| `apps/id/src/lib/operators/authority-agent/index.ts` | **New** operator. Proposes grants by reading Pattern Library + Ledger + Budget context. Emits `authority_grant_proposal` approvals. Never approves, never executes. Registered in `apps/id/src/lib/operators/registry-boot.ts` (replacing the Phase 3 stub) |
| `apps/id/src/lib/approvals/pipeline.ts` | Extend to route `authority_grant_proposal` class — same shape as `budget_proposal` (highest bar, never auto-approved) |

### UI

| Path | Change |
|---|---|
| `apps/id/src/app/(app)/cortex/authority/page.tsx` | **Replace** Phase 1.6 stub with the real sub-tab. Sections: Active grants, Paused grants, Proposed grants pending review, Recent activity (last 7 days of `usage_summary` aggregates) |
| `apps/id/src/components/cortex/AuthorityGrantCard.tsx` | **New**. Renders a grant by composing the `customer_template` string from `granted_capabilities`. Actions: pause, narrow, revoke. Reflects state machine transitions. |
| `apps/id/src/components/approvals/AuthorityGrantProposalCard.tsx` | **New**. Renders a proposed grant for review. Same `customer_template` rendering plus the Authority Agent's evidence summary |

### Trust language enforcement

The literal phrase "Authority Grant" must not appear in customer-rendered HTML. Add either:
- A pre-commit hook script `scripts/check-authority-grant-phrase.sh` that greps `apps/id/src/components/` and `apps/id/src/app/(app)/` for the literal phrase, failing CI if any non-comment occurrence is found; OR
- A render-time runtime assertion in a wrapper component (lower confidence, harder to fail fast).

Recommend the script.

## Definition of Done

- Authority Agent runs at the scheduled cadence (or on demand via internal API) and emits `authority_grant_proposal` approvals.
- Approval flow surfaces them in the existing Approvals tab at the same prominence as budget proposals.
- Customer approving a proposed grant transitions it `pending → active`. Pausing transitions `active → paused`. Narrowing rewrites `granted_capabilities` and re-validates in-flight actions. Revoking transitions to `revoked` (terminal). Expiry runs on cron.
- Marcus invoking `send_slack_notification` against a covered active grant executes immediately, logs `authority_action_taken` Ledger entry with `grant_id`. Same call outside any grant falls back to the per-tool approval flow.
- Escalation triggers (anomaly, novelty, pacing, threshold, llm_judged) route the specific action back into the per-action approval flow without modifying the grant. `authority_action_escalated` Ledger entry fires.
- LLM judgment budgets enforced; exhaustion applies declared fallback.
- Cortex Authority sub-tab renders all sections with `customer_template`; grep for "Authority Grant" in customer HTML returns zero matches.
- Action Class Registry boot fails if `customer_template` is missing or duplicate keys exist.
- pgTAP cross-tenant isolation on `kinetiks_authority_grants`.
- State-machine tests for every transition: `pending → active`, `active → paused | revoked | expired`, `paused → active | revoked`. Terminal states block.
- Resolver tests: grant covers / grant fails constraint / grant triggers escalation / no grant falls back.
- Marcus tool tests for slack, email draft, calendar — each with mocked external dispatch.

## Verification

1. Boot apps/id. Confirm Action Class Registry has three entries.
2. Trigger the Authority Agent. Confirm it emits an `authority_grant_proposal` approval.
3. Open Approvals tab. Confirm the proposal renders via `customer_template`.
4. Approve the proposal. Confirm the grant flips to `active` and shows on `/cortex/authority`.
5. Ask Marcus to send a Slack notification covered by the grant. Confirm it sends without an additional approval. Confirm `authority_action_taken` Ledger entry with `grant_id`.
6. Ask Marcus to send a Slack notification outside the grant's channel allowlist. Confirm the resolver returns `escalate`; the action lands in standard per-action approval; `authority_action_escalated` Ledger entry fires; the grant is not modified.
7. Pause the grant. Ask Marcus again — confirm fallback to per-tool approval.
8. Revoke the grant. Confirm Ledger entry. Try to flip it back to active — confirm denied at server action + trigger + RLS.
9. Run the trust-language script: `bash scripts/check-authority-grant-phrase.sh`. Confirm zero matches.
10. Trigger an `llm_judged` escalation enough times to exhaust the daily budget. Confirm the declared fallback applies.

## Out of scope (these are Phase 5)

- Default standing grants at signup flow. Phase 4 declares `available_in_default_standing_grants: true | false` on each action class; Phase 5 wires the onboarding surface.
- Manifest-change diff renderer (when an app changes its defaults later).

## Risks

- The flow spans schema, runtime, UI, and customer language. Bundle as one phase per master plan to ship coherently; resist pulling forward to land "just the table." A half-shipped Authority Grants feature is worse than no Authority Grants feature.
- Customer-language enforcement is the easiest part to defer and the highest-trust failure to ship without. Land the script in the same PR as the UI.
- Budget remains non-negotiable: a grant authorizes spend up to its envelope, but the envelope itself never exceeds the relevant Budget category. Document this explicitly in the resolver and test it.
