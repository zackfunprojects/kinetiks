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
}

/** Test-only escape hatch. */
export function _resetStateMachinesForTests(): void {
  _registered = false;
}
