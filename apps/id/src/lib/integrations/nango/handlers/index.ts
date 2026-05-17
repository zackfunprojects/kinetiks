/**
 * Nango sync webhook handler registry.
 *
 * Each per-source handler module registers its (providerConfigKey,
 * syncName) → handler mapping at module load. Importing this barrel from
 * `instrumentation-node.ts` triggers all six registrations once at
 * server boot, deterministically.
 *
 * Dispatch: the webhook route calls `dispatchNangoSyncWebhook(ctx)`
 * which resolves the handler and runs it inside a try/catch that
 * returns a structured failure rather than throwing.
 *
 * Adding a new source: create handlers/<provider>.ts with one
 * registerNangoHandler() call per syncName declared in nango.yaml, then
 * add a side-effect `import './<provider>';` line below.
 */

import "server-only";

import type {
  NangoHandlerContext,
  NangoHandlerFn,
  NangoHandlerRegistration,
  NangoHandlerResult,
} from "../types";

// ─── Registry ────────────────────────────────────────────────

type RegistryKey = `${string}::${string}`;
const registry = new Map<RegistryKey, NangoHandlerFn>();

function key(providerConfigKey: string, syncName: string): RegistryKey {
  return `${providerConfigKey}::${syncName}` as RegistryKey;
}

export function registerNangoHandler(reg: NangoHandlerRegistration): void {
  // Idempotent on second invocation with the same key — Next.js hot
  // reload re-evaluates module bodies, which would otherwise crash boot.
  // Tests detecting double-registration use `listNangoHandlers()` length.
  registry.set(key(reg.providerConfigKey, reg.syncName), reg.handler);
}

export function getNangoHandler(
  providerConfigKey: string,
  syncName: string
): NangoHandlerFn | null {
  return registry.get(key(providerConfigKey, syncName)) ?? null;
}

export function listNangoHandlers(): NangoHandlerRegistration[] {
  return Array.from(registry.entries()).map(([k, handler]) => {
    const [providerConfigKey, syncName] = k.split("::");
    return { providerConfigKey: providerConfigKey!, syncName: syncName!, handler };
  });
}

/** Test escape hatch. */
export function _resetNangoHandlerRegistryForTests(): void {
  registry.clear();
}

// ─── Dispatch ────────────────────────────────────────────────

const UNHANDLED_RESULT: NangoHandlerResult = {
  status: "skipped",
  recordsAdded: 0,
  recordsUpdated: 0,
  recordsDeleted: 0,
  errorClass: "no_handler_registered",
  errorMessage: "No handler registered for this (providerConfigKey, syncName).",
};

export async function dispatchNangoSyncWebhook(
  ctx: NangoHandlerContext
): Promise<NangoHandlerResult> {
  const handler = getNangoHandler(ctx.webhook.providerConfigKey, ctx.webhook.syncName);
  if (!handler) {
    return UNHANDLED_RESULT;
  }
  try {
    return await handler(ctx);
  } catch (err) {
    return {
      status: "failed",
      recordsAdded: 0,
      recordsUpdated: 0,
      recordsDeleted: 0,
      errorClass: "handler_threw",
      errorMessage: err instanceof Error ? err.message : "unknown error",
    };
  }
}

// Side-effect registrations live in ./boot.ts to avoid a circular
// import (each handler module imports from `.` for registerNangoHandler).
// Production: instrumentation-node.ts imports ./boot for its side effects.
// Tests: handlers can be registered ad hoc via registerNangoHandler.
