import type { ContextLayer } from "@kinetiks/types";
import { SupabaseClient } from "@supabase/supabase-js";
import { dispatchCortexEvent } from "./dispatcher";

/**
 * Recency throttle: don't route the same layer to the same app more than once
 * within this window (in milliseconds). Prevents notification flooding.
 */
const RECENCY_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Layer relevance mapping - which apps typically care about which layers.
 * Used to determine if a routing event is worth sending.
 * High relevance layers for each app get priority routing.
 */
const APP_LAYER_RELEVANCE: Record<string, Record<ContextLayer, number>> = {
  dark_madder: {
    org: 0.6,
    products: 0.9,
    voice: 1.0,
    customers: 0.8,
    narrative: 0.9,
    competitive: 0.5,
    market: 0.7,
    brand: 0.4,
  },
  harvest: {
    org: 0.8,
    products: 0.9,
    voice: 0.7,
    customers: 1.0,
    narrative: 0.5,
    competitive: 0.7,
    market: 0.4,
    brand: 0.3,
  },
  hypothesis: {
    org: 0.7,
    products: 1.0,
    voice: 0.8,
    customers: 0.9,
    narrative: 0.6,
    competitive: 0.8,
    market: 0.5,
    brand: 1.0,
  },
  litmus: {
    org: 0.8,
    products: 0.7,
    voice: 0.6,
    customers: 0.5,
    narrative: 1.0,
    competitive: 0.9,
    market: 0.8,
    brand: 0.4,
  },
};

/**
 * Minimum relevance score for routing. Below this, the learning
 * is not relevant enough to bother the app's Synapse.
 */
const RELEVANCE_GATE = 0.4;

interface RouteDecision {
  target_app: string;
  relevance_score: number;
  relevance_note: string;
  throttled: boolean;
}

/**
 * Determine which Synapses should receive a routing event for a given
 * layer change. Applies relevance gating and recency throttle.
 */
export async function determineRoutes(
  admin: SupabaseClient,
  accountId: string,
  sourceApp: string,
  targetLayer: ContextLayer
): Promise<RouteDecision[]> {
  // Get all active Synapses for this account, excluding the source
  const { data: synapses, error: synapseError } = await admin
    .from("kinetiks_synapses")
    .select("app_name, read_layers")
    .eq("account_id", accountId)
    .eq("status", "active")
    .neq("app_name", sourceApp);

  if (synapseError) {
    throw new Error(
      `Failed to fetch synapses for account ${accountId}: ${synapseError.message}`
    );
  }

  if (!synapses || synapses.length === 0) return [];

  const decisions: RouteDecision[] = [];

  for (const synapse of synapses) {
    const appName = synapse.app_name as string;
    const readLayers = synapse.read_layers as string[];

    // Must have read access to this layer
    if (!readLayers.includes(targetLayer)) continue;

    // Calculate relevance score
    const appRelevance = APP_LAYER_RELEVANCE[appName];
    const relevanceScore = appRelevance
      ? appRelevance[targetLayer]
      : 0.5; // Default to medium relevance for unknown apps

    // Apply relevance gate
    if (relevanceScore < RELEVANCE_GATE) {
      decisions.push({
        target_app: appName,
        relevance_score: relevanceScore,
        relevance_note: `below_gate: ${relevanceScore.toFixed(2)} < ${RELEVANCE_GATE}`,
        throttled: false,
      });
      continue;
    }

    // Check recency throttle
    const isThrottled = await checkRecencyThrottle(
      admin,
      accountId,
      appName,
      targetLayer
    );

    decisions.push({
      target_app: appName,
      relevance_score: relevanceScore,
      relevance_note: isThrottled
        ? `throttled: recent routing to ${appName} for ${targetLayer}`
        : `relevant: ${targetLayer} score ${relevanceScore.toFixed(2)} for ${appName}`,
      throttled: isThrottled,
    });
  }

  return decisions;
}

/**
 * Execute routing for decisions that passed gating and throttle.
 */
export async function executeRoutes(
  admin: SupabaseClient,
  accountId: string,
  sourceApp: string,
  targetLayer: ContextLayer,
  proposalId: string,
  changes: Record<string, unknown>,
  confidence: string
): Promise<number> {
  const decisions = await determineRoutes(
    admin,
    accountId,
    sourceApp,
    targetLayer
  );

  const toRoute = decisions.filter(
    (d) => d.relevance_score >= RELEVANCE_GATE && !d.throttled
  );

  if (toRoute.length === 0) return 0;

  const routingEvents = toRoute.map((decision) => ({
    account_id: accountId,
    target_app: decision.target_app,
    source_proposal_id: proposalId,
    payload: {
      layer: targetLayer,
      changes,
      confidence,
      relevance_score: decision.relevance_score,
    },
    relevance_note: decision.relevance_note,
  }));

  const { error: routeError } = await admin
    .from("kinetiks_routing_events")
    .insert(routingEvents);

  if (routeError) {
    throw new Error(
      `Failed to insert routing events: ${routeError.message}`
    );
  }

  // Log routing events (batched insert)
  const ledgerEntries = routingEvents.map((event) => ({
    account_id: accountId,
    event_type: "routing_sent",
    source_app: sourceApp,
    target_layer: targetLayer,
    detail: {
      target_app: event.target_app,
      proposal_id: proposalId,
      relevance_note: event.relevance_note,
    },
  }));

  const { error: ledgerError } = await admin
    .from("kinetiks_ledger")
    .insert(ledgerEntries);

  if (ledgerError) {
    // Routing events were already inserted - log but don't fail
    console.error(
      `Failed to log routing events to ledger: ${ledgerError.message}`
    );
  }

  await Promise.all(
    routingEvents.map((event) =>
      dispatchCortexEvent(accountId, "routing.sent", {
        target_app: event.target_app,
        source_proposal_id: proposalId,
      })
    )
  );

  return toRoute.length;
}

/**
 * Check if we've already routed this layer to this app recently.
 * Fails closed (returns true = throttled) on DB errors to prevent flooding.
 */
async function checkRecencyThrottle(
  admin: SupabaseClient,
  accountId: string,
  targetApp: string,
  targetLayer: ContextLayer
): Promise<boolean> {
  const throttleWindow = new Date(
    Date.now() - RECENCY_THROTTLE_MS
  ).toISOString();

  try {
    const { count, error } = await admin
      .from("kinetiks_routing_events")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("target_app", targetApp)
      .gte("created_at", throttleWindow)
      .contains("payload", { layer: targetLayer });

    if (error) {
      console.error(
        `Recency throttle query failed for ${targetApp}/${targetLayer}: ${error.message}`
      );
      return true; // Fail closed - throttle on error
    }

    return (count ?? 0) > 0;
  } catch (err) {
    console.error(
      `Recency throttle check threw for ${targetApp}/${targetLayer}:`,
      err
    );
    return true; // Fail closed
  }
}
