import "server-only";

import {
  assertRegistriesValid,
  configureToolCallLogger,
  registerTool,
} from "@kinetiks/tools";
import { supabaseToolCallLogger } from "./logger";
import { noopTestTool } from "./noop-test";
import { listCapabilitiesTool } from "./list-capabilities";
import { queryPatternsTool } from "./query-patterns";
import { queryActionsAuthorityTool } from "./query-actions-authority";
import { ga4QueryTool } from "./ga4-query";

let _booted = false;

/**
 * One-time boot for the platform tool registry.
 *
 *  - Configures the Supabase tool_calls logger
 *  - Registers platform tools (canary + meta tools + F2 stubs)
 *  - Runs cross-registry validation. Throws if the registries are
 *    inconsistent (consequential tool referencing an unregistered
 *    action class, operator pointing at a missing tool, etc.).
 *
 * Called from `apps/id/src/instrumentation.ts` at server startup.
 * Idempotent for hot reload.
 */
export function bootToolRegistry(): void {
  if (_booted) return;
  configureToolCallLogger(supabaseToolCallLogger);
  // Canary + meta
  registerTool(noopTestTool);
  registerTool(listCapabilitiesTool);
  // F2 stubs — replaced by L1a / L2a implementations
  registerTool(queryPatternsTool);
  registerTool(queryActionsAuthorityTool);
  // D1 — first real data tool. Reads GA4 traffic through the cache layer.
  registerTool(ga4QueryTool);
  // Cross-registry validation — fails the boot if anything is inconsistent.
  // At F1/F2 we register no consequential tools and no operators, so this
  // is a no-op safety pass; L2a will add real entries here.
  assertRegistriesValid();
  _booted = true;
}

/** Test-only escape hatch; resets the booted flag so test runs can rerun boot. */
export function _resetBootForTests(): void {
  _booted = false;
}
