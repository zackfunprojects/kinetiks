/**
 * Server-side state-machine registration for the entities the platform
 * cares about. Three-layer enforcement per CLAUDE.md:
 *
 *   1. Server action calls `assertTransition({entity, from, to, actor})`
 *      BEFORE the DB write. (This file declares the rules.)
 *   2. Postgres trigger enforces the same rules at the DB layer
 *      (00033_approval_state_machines_and_insights.sql).
 *   3. RLS denies writes that would bypass the trigger.
 *
 * Adding a new status-bearing entity:
 *   - Add the `registerStateMachine` call below
 *   - Add a matching Postgres trigger in a new migration
 *   - Call `assertTransition` from the server action that writes the
 *     status column
 */

import { registerStateMachine } from "@kinetiks/lib/state-machines";

let _registered = false;

export function registerKinetiksStateMachines(): void {
  if (_registered) return;
  _registered = true;

  // ── kinetiks_approvals ─────────────────────────────────────
  registerStateMachine({
    entity: "kinetiks_approvals",
    states: [
      "pending",
      "approved",
      "rejected",
      "auto_approved",
      "flagged",
      "expired",
    ] as const,
    initial: "pending",
    terminal: ["approved", "rejected", "expired"] as const,
    transitions: [
      // User decisions on a pending approval
      {
        from: "pending",
        to: "approved",
        allow: (actor) => actor.kind === "user",
        reason: "Only the user can approve a pending approval",
      },
      {
        from: "pending",
        to: "rejected",
        allow: (actor) => actor.kind === "user",
        reason: "Only the user can reject a pending approval",
      },
      // System decides at submission time (per-action confidence flow)
      {
        from: "pending",
        to: "auto_approved",
        allow: (actor) => actor.kind === "system" || actor.kind === "agent",
        reason: "Only the pipeline / agent can auto-approve",
      },
      // Flagged at any layer
      {
        from: "pending",
        to: "flagged",
        reason: "Any actor may flag a pending approval for re-review",
      },
      // CRON expiry
      {
        from: "pending",
        to: "expired",
        allow: (actor) => actor.kind === "system",
        reason: "Only the expiry CRON marks an approval expired",
      },
      // Challenge an auto-approve
      {
        from: "auto_approved",
        to: "flagged",
        allow: (actor) => actor.kind === "user",
        reason: "Only the user can challenge an auto-approved action",
      },
      // Resolve a flagged approval
      {
        from: "flagged",
        to: "approved",
        allow: (actor) => actor.kind === "user",
      },
      {
        from: "flagged",
        to: "rejected",
        allow: (actor) => actor.kind === "user",
      },
    ],
  });

  // ── kinetiks_pattern_library ───────────────────────────────
  // Kinetiks Contract Addendum §1.7. The Archivist is the sole writer.
  // Customer mutations (star/suppress/annotate/archive) route through
  // Server Actions that act under actor.kind === "agent" with the
  // Archivist's operator key, NOT actor.kind === "user" — the actor
  // model treats the Archivist as the canonical mutator, since the
  // customer's intent is mediated by the Archivist before the row
  // changes.
  registerStateMachine({
    entity: "kinetiks_pattern_library",
    states: ["emerging", "validated", "declining", "archived"] as const,
    initial: "emerging",
    terminal: ["archived"] as const,
    transitions: [
      // Confidence threshold crossing
      {
        from: "emerging",
        to: "validated",
        allow: (actor) => actor.kind === "agent" || actor.kind === "system",
        reason: "Only the Archivist promotes emerging → validated",
      },
      // Re-validation after decline
      {
        from: "declining",
        to: "validated",
        allow: (actor) => actor.kind === "agent" || actor.kind === "system",
        reason: "Only the Archivist re-validates declining → validated",
      },
      // Confidence falling below decline_at
      {
        from: "validated",
        to: "declining",
        allow: (actor) => actor.kind === "agent" || actor.kind === "system",
        reason: "Only the Archivist demotes validated → declining",
      },
      // Customer or Archivist archive (decay sweep or ICP removed)
      {
        from: "emerging",
        to: "archived",
        allow: (actor) => actor.kind === "agent" || actor.kind === "system",
        reason: "Archive routes through the Archivist (decay or customer action)",
      },
      {
        from: "validated",
        to: "archived",
        allow: (actor) => actor.kind === "agent" || actor.kind === "system",
        reason: "Archive routes through the Archivist (decay or customer action)",
      },
      {
        from: "declining",
        to: "archived",
        allow: (actor) => actor.kind === "agent" || actor.kind === "system",
        reason: "Archive routes through the Archivist (decay or customer action)",
      },
    ],
  });

  // ── kinetiks_proposals ─────────────────────────────────────
  registerStateMachine({
    entity: "kinetiks_proposals",
    states: [
      "submitted",
      "accepted",
      "declined",
      "escalated",
      "expired",
      "superseded",
    ] as const,
    initial: "submitted",
    terminal: ["declined", "expired", "superseded"] as const,
    transitions: [
      // Archivist evaluation outcomes
      {
        from: "submitted",
        to: "accepted",
        allow: (actor) => actor.kind === "agent" || actor.kind === "user",
        reason: "Archivist (or a direct user-explicit edit) accepts",
      },
      {
        from: "submitted",
        to: "declined",
        allow: (actor) => actor.kind === "agent",
        reason: "Archivist declines on conflict / schema failure",
      },
      {
        from: "submitted",
        to: "escalated",
        allow: (actor) => actor.kind === "agent",
        reason: "Archivist escalates to user via the approval system",
      },
      {
        from: "submitted",
        to: "expired",
        allow: (actor) => actor.kind === "system",
        reason: "Only the expiry CRON marks a proposal expired",
      },
      // Escalated → resolved via user approval action
      {
        from: "escalated",
        to: "accepted",
        allow: (actor) => actor.kind === "user" || actor.kind === "agent",
      },
      {
        from: "escalated",
        to: "declined",
        allow: (actor) => actor.kind === "user" || actor.kind === "agent",
      },
      {
        from: "escalated",
        to: "expired",
        allow: (actor) => actor.kind === "system",
      },
      // Superseded — newer accepted proposal for the same layer
      {
        from: "accepted",
        to: "superseded",
        allow: (actor) => actor.kind === "agent" || actor.kind === "system",
        reason: "Only the Cortex superseding job marks accepted → superseded",
      },
    ],
  });

  // ── kinetiks_authority_grants ──────────────────────────────
  // Kinetiks Contract Addendum §2.3 — Phase 4. The Authority Agent is
  // the canonical writer for `proposed`; customer-action server routes
  // are the canonical writers for `active`, `paused`, and `revoked`;
  // the expiry CRON is the canonical writer for `expired`.
  //
  // Narrowing is NOT a state transition — it produces a new `proposed`
  // grant; on its acceptance, the predecessor is `revoked` with
  // reason `customer_narrowed`. Re-validation in-flight under the new
  // shape happens at resolver time, not as part of the state change.
  registerStateMachine({
    entity: "kinetiks_authority_grants",
    states: ["proposed", "active", "paused", "revoked", "expired"] as const,
    initial: "proposed",
    terminal: ["revoked", "expired"] as const,
    transitions: [
      // Customer approves a proposed grant via the Approval System
      {
        from: "proposed",
        to: "active",
        allow: (actor) => actor.kind === "user",
        reason: "Only the customer can approve a proposed grant",
      },
      // Customer rejects a proposed grant (revoke before active)
      {
        from: "proposed",
        to: "revoked",
        allow: (actor) =>
          actor.kind === "user" || actor.kind === "system",
        reason:
          "Customer rejects a proposed grant, or system revokes during fixture cleanup",
      },
      // Customer pauses an active grant from the Cortex Authority tab
      {
        from: "active",
        to: "paused",
        allow: (actor) => actor.kind === "user",
        reason: "Only the customer can pause an active grant",
      },
      // Customer revokes an active grant from the Cortex Authority tab
      {
        from: "active",
        to: "revoked",
        allow: (actor) =>
          actor.kind === "user" || actor.kind === "system",
        reason:
          "Customer revokes an active grant; system revokes for fixture cleanup",
      },
      // Expiry CRON moves an active grant to terminal expired
      {
        from: "active",
        to: "expired",
        allow: (actor) => actor.kind === "system",
        reason: "Only the expiry CRON marks an active grant expired",
      },
      // Customer resumes a paused grant
      {
        from: "paused",
        to: "active",
        allow: (actor) => actor.kind === "user",
        reason: "Only the customer can resume a paused grant",
      },
      // Customer revokes a paused grant
      {
        from: "paused",
        to: "revoked",
        allow: (actor) =>
          actor.kind === "user" || actor.kind === "system",
        reason:
          "Customer revokes a paused grant; system revokes for fixture cleanup",
      },
      // Expiry CRON moves a paused grant to terminal expired
      {
        from: "paused",
        to: "expired",
        allow: (actor) => actor.kind === "system",
        reason: "Only the expiry CRON marks a paused grant expired",
      },
    ],
  });

  // ── kinetiks_goals ─────────────────────────────────────────
  // Goal lifecycle (status). progress_status is a derived health
  // indicator and is intentionally not modeled here. Goals are
  // user-owned, so transitions are not actor-restricted; the trigger
  // (00073) enforces legality at the DB layer.
  registerStateMachine({
    entity: "kinetiks_goals",
    states: ["active", "paused", "completed", "archived"] as const,
    initial: "active",
    terminal: ["archived"] as const,
    transitions: [
      { from: "active", to: "paused" },
      { from: "active", to: "completed" },
      { from: "active", to: "archived" },
      { from: "paused", to: "active" },
      { from: "paused", to: "completed" },
      { from: "paused", to: "archived" },
      { from: "completed", to: "active" }, // re-open if the metric regresses
      { from: "completed", to: "archived" },
    ],
  });

  // ── kinetiks_budgets ───────────────────────────────────────
  // Budget approval lifecycle (approval_status). Approval (proposed →
  // approved) is the highest bar in the spec and is restricted to the
  // customer; the rest are open to any actor (an Oracle proposer may
  // draft/propose). The trigger (00073) enforces legality at the DB layer.
  registerStateMachine({
    entity: "kinetiks_budgets",
    states: ["draft", "proposed", "approved", "active", "closed"] as const,
    initial: "draft",
    terminal: ["closed"] as const,
    transitions: [
      { from: "draft", to: "proposed" },
      { from: "draft", to: "closed" },
      {
        from: "proposed",
        to: "approved",
        allow: (actor) => actor.kind === "user",
        reason: "Only the customer can approve a proposed budget",
      },
      { from: "proposed", to: "draft" }, // send back for revision
      { from: "proposed", to: "closed" },
      { from: "approved", to: "active" },
      { from: "approved", to: "closed" },
      { from: "active", to: "closed" },
    ],
  });
}

/** Test-only escape hatch. */
export function _resetStateMachinesForTests(): void {
  _registered = false;
}
