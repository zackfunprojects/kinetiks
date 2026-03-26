import { createSynapse, createHarvestConfig } from "@kinetiks/synapse";
import type { SynapseInstance, PullContextResult } from "@kinetiks/synapse";
import type { ContextLayer } from "@kinetiks/types";

/**
 * Singleton Harvest Synapse instance.
 *
 * Reads context from the Kinetiks ID via the Synapse pull endpoint,
 * and submits proposals (deal outcomes, ICP refinements, competitive intel)
 * back to the Cortex for evaluation.
 *
 * Server-only - used by API routes, not client components.
 */
function initSynapse(): SynapseInstance {
  const baseUrl = process.env.KINETIKS_ID_API_URL ?? "https://id.kinetiks.ai";
  const serviceSecret = process.env.INTERNAL_SERVICE_SECRET;

  if (!serviceSecret) {
    console.warn("[HV Synapse] INTERNAL_SERVICE_SECRET not set. Synapse auth will be limited.");
  }

  const config = createHarvestConfig(baseUrl, serviceSecret);
  return createSynapse(config);
}

/**
 * Lazy-initialized singleton. Created on first access so env vars
 * are available (Next.js loads them at runtime, not import time).
 */
let _instance: SynapseInstance | null = null;

export function getHarvestSynapse(): SynapseInstance {
  if (!_instance) {
    _instance = initSynapse();
  }
  return _instance;
}

/**
 * Pull context layers from the Kinetiks ID via the Synapse.
 *
 * @param accountId - The Kinetiks account ID
 * @param layers - Which layers to fetch (defaults to all readable layers)
 * @returns The pulled context data, or null if the pull fails
 */
export async function pullHarvestContext(
  accountId: string,
  layers?: ContextLayer[]
): Promise<PullContextResult | null> {
  try {
    const synapse = getHarvestSynapse();
    return await synapse.pullContext(accountId, layers);
  } catch (err) {
    console.error(
      "[HV Synapse] Failed to pull context:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}
