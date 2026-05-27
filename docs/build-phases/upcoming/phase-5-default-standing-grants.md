# Phase 5: Default Standing Grants + signup flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal.** Manifest-declared default standing grants surface at signup as opt-in defaults. The customer reviews each proposed default, accepts the subset they trust, and the accepted ones materialize as active grants in `kinetiks_authority_grants` immediately. The literal phrase "Authority Grant" never appears in customer copy.

**Why now.** Ships with Phase 4. Phase 4 declares which action classes are eligible for defaults (`available_in_default_standing_grants: true | false`); Phase 5 wires the customer-facing surface.

**Spec references**
- `docs/Kinetiks Contract Addendum.md` §2.6 (Default Standing Grants)
- Phase 4 plan (`docs/build-phases/upcoming/phase-4-authority-grants.md`) for the action class registrations and grant state machine

---

## Files to change / create

| Path | Change |
|---|---|
| `packages/types/src/synapse.ts` | Extend `KineticsAppManifest` with `default_standing_grants?: DefaultStandingGrant[]`. `DefaultStandingGrant` declares: `action_class`, default constraints (must validate against the action class constraint schema), default `expires_in_days` (or none for indefinite), default escalation triggers |
| `apps/id/src/lib/manifest/kinetiks-id-manifest.ts` (or the existing apps/id manifest definition) | Declare default standing grants for `kinetiks_id.send_slack_notification` and `kinetiks_id.draft_email` (both flagged `available_in_default_standing_grants: true` in Phase 4). Calendar invite stays opt-in only (no default per Phase 4 design) |
| `apps/id/src/app/(app)/onboarding/authority-defaults/page.tsx` | **New** signup-flow step. Lists each proposed default rendered via `customer_template`. Each item is opt-in (checkbox or toggle) |
| `apps/id/src/components/onboarding/AuthorityDefaultsReview.tsx` | **New**. Renders each proposed default; honors trust-language rule (no literal "Authority Grant" string). Submit creates grants via the same code path as Phase 4 approval |
| `apps/id/src/lib/onboarding/authority-defaults.ts` | **New** helper. Resolves the manifest's `default_standing_grants`, filters by `available_in_default_standing_grants` from the Action Class Registry (defensive), generates the customer-facing list |
| `apps/id/src/app/(app)/onboarding/page.tsx` (or wherever the signup-flow router lives) | Insert the new step at the right point in the flow (after the first connection or after Cartographer intake; before terminal redirect to /cortex) |
| `supabase/tests/authority_defaults_signup.sql` | **New** pgTAP. Asserts that grants created via the defaults path obey RLS and are scoped to the right account |
| `apps/id/__e2e__/authority-defaults-signup.spec.ts` | **New** Playwright E2E covering: accept all, accept some, accept none paths; verify the resulting `/cortex/authority` state matches |

## Manifest-change diff renderer (lightweight v1)

When the manifest's `default_standing_grants` changes after a customer has already onboarded, the customer should see a diff (added defaults, removed defaults, changed constraints) and be asked to opt in to the additions. v1 implementation is intentionally minimal: a periodic Authority Agent check compares the manifest's current defaults against the customer's accepted defaults and emits an `authority_grant_proposal` approval for any new default. The customer reviews via the existing Phase 4 approval surface.

Full diff UI on `/cortex/authority` is a follow-up; flag in QUESTIONS.md if it ships incomplete.

## Definition of Done

- New accounts see the authority-defaults step at signup.
- Each proposed default renders via `customer_template`. The literal phrase "Authority Grant" appears nowhere on the page.
- Opting in to a default creates a grant via the Phase 4 code path with `parent_grant_id: null` (root-scoped in v1).
- Opting out creates no grant; no Ledger entry; the default can be requested later if surfaced again.
- Accepted defaults are visible at `/cortex/authority` immediately after onboarding completes.
- Periodic Authority Agent re-check emits proposals for any new defaults declared in the manifest after onboarding.
- Playwright E2E covers all three paths (accept all, accept some, accept none) and the post-onboarding `/cortex/authority` state.
- The `bash scripts/check-authority-grant-phrase.sh` script (added in Phase 4) passes against the new onboarding code.

## Verification

1. Run signup as a new account in dev. Reach the authority-defaults step.
2. Confirm two proposed defaults render: Slack notify and email draft. Confirm both use plain-language `customer_template` strings.
3. Opt in to Slack notify; opt out of email draft. Submit.
4. Land in the rest of onboarding, eventually `/cortex/authority`. Confirm exactly one active grant (Slack notify) appears.
5. Run a second signup flow as a different account. Opt in to both. Land in `/cortex/authority` — confirm two active grants.
6. Update the manifest to add a new default (in code; redeploy). Run the Authority Agent check for an existing account. Confirm an `authority_grant_proposal` approval appears in the Approvals tab; the customer can accept or reject it.
7. Grep customer-rendered HTML for "Authority Grant" — zero matches.

## Out of scope

- Manifest-change diff UI as a standalone Cortex surface. Defer to follow-up; the v1 mechanism (re-proposal via Authority Agent) is sufficient.
- Multi-app default standing grants. The apps/id manifest is the only one with defaults right now. When suite apps land, each declares its own.
- Bulk opt-in / opt-out controls. v1 is per-default toggles only.
