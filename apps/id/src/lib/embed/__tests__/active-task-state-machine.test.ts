/**
 * State-machine tests for kinetiks_active_tasks (the task drawer, §8). The
 * server-action layer (the embed routes) calls assertTransition; this verifies
 * the registry's rules independently of the route. The 00090 trigger + RLS are
 * the other two enforcement layers.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetStateMachinesForTests,
  registerKinetiksStateMachines,
} from "@/lib/state-machines-init";
import {
  _resetRegistryForTests,
  canTransition,
  type Actor,
} from "@kinetiks/lib/state-machines";

const ENTITY = "kinetiks_active_tasks";
const user: Actor = { kind: "user", userId: "u1", accountId: "a1" };
const agent: Actor = { kind: "agent", operatorKey: "marcus", accountId: "a1" };
const system: Actor = { kind: "system", reason: "fixture cleanup" };

beforeEach(() => {
  _resetRegistryForTests();
  _resetStateMachinesForTests();
  registerKinetiksStateMachines();
});

afterEach(() => {
  _resetRegistryForTests();
  _resetStateMachinesForTests();
});

describe("kinetiks_active_tasks lifecycle", () => {
  it("the user can pause and resume", () => {
    expect(canTransition({ entity: ENTITY, from: "active", to: "paused", actor: user }).ok).toBe(true);
    expect(canTransition({ entity: ENTITY, from: "paused", to: "active", actor: user }).ok).toBe(true);
  });

  it("the user (or system) can kill from active or paused", () => {
    expect(canTransition({ entity: ENTITY, from: "active", to: "killed", actor: user }).ok).toBe(true);
    expect(canTransition({ entity: ENTITY, from: "paused", to: "killed", actor: system }).ok).toBe(true);
  });

  it("only the agent/system marks a task completed — never the user", () => {
    expect(canTransition({ entity: ENTITY, from: "active", to: "completed", actor: agent }).ok).toBe(true);
    expect(canTransition({ entity: ENTITY, from: "active", to: "completed", actor: user }).ok).toBe(false);
  });

  it("killed and completed are terminal", () => {
    expect(canTransition({ entity: ENTITY, from: "killed", to: "active", actor: user }).ok).toBe(false);
    expect(canTransition({ entity: ENTITY, from: "completed", to: "active", actor: agent }).ok).toBe(false);
    expect(canTransition({ entity: ENTITY, from: "killed", to: "completed", actor: system }).ok).toBe(false);
  });

  it("rejects undeclared transitions and no-ops", () => {
    expect(canTransition({ entity: ENTITY, from: "active", to: "active", actor: user }).ok).toBe(false);
  });
});
