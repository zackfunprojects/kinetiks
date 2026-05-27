import "server-only";

import { registerOperators } from "@kinetiks/tools";
import type { OperatorDescriptor } from "@kinetiks/types";
import type { OperatorExecutor } from "@kinetiks/runtime";

import {
  archivist,
  authorityAgent,
  cartographer,
  marcus,
  oracle,
} from "./descriptors";
import { archivistExecute } from "./executors/archivist";
import { cartographerExecute } from "./executors/cartographer";
import { marcusExecute } from "./executors/marcus";
import { oracleExecute } from "./executors/oracle";
import { authorityAgentExecute } from "./executors/authority-agent";

/**
 * Kinetiks Core's app key. Used as the first dimension of the
 * Operator Registry; matches the `source_app` convention used by the
 * Pattern Type Registry and Action Class Registry.
 */
export const KINETIKS_ID_APP_KEY = "kinetiks_id" as const;

const KINETIKS_ID_OPERATORS: readonly OperatorDescriptor[] = [
  cartographer,
  archivist,
  marcus,
  oracle,
  authorityAgent,
];

/**
 * Wired in-process executor for each registered Kinetiks Core
 * operator. Per the Kinetiks Contract Addendum §3.3, the Operator
 * Registry only stores descriptors; the executor wiring lives in the
 * host app. The Workflow dispatcher receives this resolver via
 * `DispatchDeps.resolveOperator` and looks up the right function at
 * dispatch time.
 *
 * Phase 3 wires only the Archivist for real; the other four throw
 * `not_implemented` so a mistakenly-dispatched Workflow surfaces a
 * clear error instead of silently no-opping.
 */
const EXECUTORS: Record<string, OperatorExecutor> = {
  [`${KINETIKS_ID_APP_KEY}.cartographer`]: cartographerExecute,
  [`${KINETIKS_ID_APP_KEY}.archivist`]: archivistExecute,
  [`${KINETIKS_ID_APP_KEY}.marcus`]: marcusExecute,
  [`${KINETIKS_ID_APP_KEY}.oracle`]: oracleExecute,
  [`${KINETIKS_ID_APP_KEY}.authority_agent`]: authorityAgentExecute,
};

let _booted = false;

/**
 * One-time boot for the Kinetiks Core Operator Registry.
 *
 * Must run BEFORE `bootToolRegistry()` — that boot ends with
 * `assertRegistriesValid()`, which checks every operator's
 * `required_tools` / `required_patterns` / `action_classes`
 * references resolve to registered entries. Registering operators
 * after that validation would silently skip the check; registering
 * them before exposes any mismatch at startup.
 *
 * Idempotent for hot reload.
 */
export function bootOperatorRegistry(): void {
  if (_booted) return;
  registerOperators(KINETIKS_ID_APP_KEY, KINETIKS_ID_OPERATORS);
  _booted = true;
}

/**
 * Resolver for the Workflow dispatcher. Returns the in-process
 * executor for the given (app, key) pair, or undefined if unknown.
 *
 * Phase 3 only knows about Kinetiks Core operators. Future apps will
 * expose their own resolvers; the Workflow dispatcher composes them
 * via the host's `DispatchDeps.resolveOperator` plumbing.
 */
export function resolveKinetiksOperator(
  app: string,
  operatorKey: string,
): OperatorExecutor | undefined {
  return EXECUTORS[`${app}.${operatorKey}`];
}

/** Test-only escape hatch; resets the booted flag so test runs can rerun boot. */
export function _resetOperatorBootForTests(): void {
  _booted = false;
}
