/**
 * Node-only side of Next.js instrumentation. Imported dynamically by
 * `instrumentation.ts` ONLY when NEXT_RUNTIME === "nodejs", so none of
 * the modules reached from here are ever analyzed by webpack's Edge
 * bundler (which cannot resolve node:crypto, node:fs, native gRPC, etc).
 *
 * Wires:
 *  - `@kinetiks/ai` router → Supabase ai_calls logger + prompt-task
 *    registry
 *  - `@kinetiks/tools` registry → Supabase tool_calls logger + platform
 *    tools (noop_test, list_capabilities, query_patterns,
 *    query_actions_authority, ga4_query)
 *  - `@kinetiks/cortex` state machines
 *  - Nango sync handlers (per-source registerNangoHandler side-effects)
 *
 * Fail-loud: a malformed descriptor or an unregistered task surfaces
 * here at startup, not at runtime.
 */

import { configureAICallLogger } from "@kinetiks/ai";
import { supabaseAICallLogger } from "./lib/ai/logger";
import { registerKinetiksPromptTasks } from "./lib/ai/task-registry";
import { registerKinetiksStateMachines } from "./lib/state-machines-init";
import { bootPatternTypeRegistry } from "./lib/patterns/registry-boot";
import { bootActionClassRegistry } from "./lib/action-classes/registry-boot";
import { bootManifestRegistry } from "./lib/manifest/boot";
import { bootOperatorRegistry } from "./lib/operators/registry-boot";
import { bootToolRegistry } from "./lib/tools/registry-boot";
import { bootRuntimeAdapters } from "./lib/runtime/runtime-boot";
import { assertProviderConfigValid } from "./lib/integrations/nango/provider-config";
import { assertSystemProviderConfigValid } from "./lib/connections/system-providers";
import "./lib/integrations/nango/handlers/boot";

export function bootNodeInstrumentation(): void {
  configureAICallLogger(supabaseAICallLogger);
  registerKinetiksPromptTasks();
  registerKinetiksStateMachines();
  // Boot order is non-negotiable per the cross-registry validator at
  // packages/tools/src/validate.ts (assertRegistriesValid, called at
  // the end of bootToolRegistry):
  //
  //   patterns → action classes → manifests → operators → tools
  //
  // - Pattern Type Registry: operator `required_patterns` must resolve
  // - Action Class Registry (Phase 4): operator `action_classes` and
  //   tool `actionClass` must resolve
  // - Manifest Registry (Phase 5): default_standing_grants reference
  //   registered action classes, so manifests boot AFTER action classes.
  //   Failing here at startup avoids broken Permissions step at signup.
  // - Operator Registry (Phase 3): operator descriptors referenced by
  //   any future Workflow must exist
  // - Tool Registry: final boot pass runs cross-registry validation
  bootPatternTypeRegistry();
  bootActionClassRegistry();
  bootManifestRegistry();
  bootOperatorRegistry();
  bootToolRegistry();
  // Phase 4: wire authority resolution adapters. Must run AFTER the
  // tool registry boot (the resolver references action class
  // descriptors which need their tool callers cross-validated first).
  // Replaces the F2 stub resolver with defaultAuthorityResolver.
  bootRuntimeAdapters();
  // Phase 7: assert the Kinetiks ConnectionProvider list maps 1:1 to
  // Nango integration ids declared in provider-config.ts. Unmapped
  // providers would fail at the first connect attempt; failing here
  // at startup is loud and obvious.
  assertProviderConfigValid();
  // D1: same guarantee for the system connection registry (the direct
  // OAuth side): every system provider declares scopes, and the
  // system set is disjoint from the Nango data-provider set.
  assertSystemProviderConfigValid();
}
