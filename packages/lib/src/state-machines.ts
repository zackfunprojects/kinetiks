/**
 * Shared state-machine enforcement.
 *
 * Per CLAUDE.md: every status-bearing entity routes through `canTransition`
 * BEFORE writes happen. Three-layer enforcement (server action + Postgres
 * trigger + RLS) is the goal; this module covers the server-side layer.
 *
 * Register a machine per entity. Each transition is keyed by (from, to)
 * and may declare an actor predicate that gates who can perform it.
 *
 * One-way transitions (approved → anything, ledger mutation, revoked grant
 * → active) are simply NOT declared, so the registry rejects them.
 */

export type Actor =
  | { kind: "user"; userId: string; accountId: string }
  | { kind: "agent"; operatorKey: string; accountId: string }
  | { kind: "system"; reason: string };

export interface TransitionRule<S extends string> {
  from: S;
  to: S;
  /** Optional predicate; if returns false, transition is denied. */
  allow?: (actor: Actor) => boolean;
  /** Human-readable explanation; surfaced in error messages. */
  reason?: string;
}

export interface StateMachine<S extends string> {
  entity: string;
  states: readonly S[];
  initial: S;
  terminal?: readonly S[];
  transitions: readonly TransitionRule<S>[];
}

export interface CanTransitionInput<S extends string> {
  entity: string;
  from: S;
  to: S;
  actor: Actor;
}

export interface CanTransitionResult {
  ok: boolean;
  reason?: string;
}

const registry = new Map<string, StateMachine<string>>();

export function registerStateMachine<S extends string>(machine: StateMachine<S>): void {
  if (registry.has(machine.entity)) {
    throw new Error(`[state-machines] Entity already registered: ${machine.entity}`);
  }
  registry.set(machine.entity, machine as StateMachine<string>);
}

export function getStateMachine(entity: string): StateMachine<string> | undefined {
  return registry.get(entity);
}

export function canTransition<S extends string>(input: CanTransitionInput<S>): CanTransitionResult {
  const machine = registry.get(input.entity);
  if (!machine) {
    return { ok: false, reason: `unknown entity: ${input.entity}` };
  }
  if (input.from === input.to) {
    return { ok: false, reason: `no-op transition (${String(input.from)} → ${String(input.to)})` };
  }
  if (machine.terminal?.includes(input.from)) {
    return { ok: false, reason: `cannot leave terminal state: ${String(input.from)}` };
  }
  const rule = machine.transitions.find(
    (r) => r.from === input.from && r.to === input.to,
  );
  if (!rule) {
    return {
      ok: false,
      reason: `transition not allowed: ${String(input.from)} → ${String(input.to)} for ${machine.entity}`,
    };
  }
  if (rule.allow && !rule.allow(input.actor)) {
    return { ok: false, reason: rule.reason ?? "actor not permitted" };
  }
  return { ok: true };
}

/** Throws if the transition is denied; convenience for server actions. */
export function assertTransition<S extends string>(input: CanTransitionInput<S>): void {
  const r = canTransition(input);
  if (!r.ok) {
    const err = new Error(`[state-machines] denied: ${r.reason ?? "no reason"}`);
    err.name = "StateTransitionDenied";
    throw err;
  }
}

/** Test-only escape hatch for resetting state during unit tests. */
export function _resetRegistryForTests(): void {
  registry.clear();
}
