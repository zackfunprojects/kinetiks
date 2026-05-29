/**
 * Side-effect imports for the ten Nango sync handlers + the auth
 * event handler.
 *
 * Importing this file once at boot triggers all per-source
 * registerNangoHandler() calls. Kept separate from `./index.ts` because
 * the handler modules import the registration helper from `.`, which
 * would create a circular dependency (handlers → index → handlers).
 *
 * The auth handler is registered alongside but dispatched directly
 * from the webhook route (handleNangoAuthEvent) rather than via
 * dispatchNangoSyncWebhook — auth events are not per-sync.
 *
 * Boot path: apps/id/src/instrumentation-node.ts imports this file.
 */

// Sync handlers (Phase D2)
import "./google-analytics";
import "./google-search-console";
import "./stripe";
import "./meta-ads";
import "./google-ads";
import "./hubspot";

// Sync handlers (Phase 7)
import "./twitter";
import "./linkedin";
import "./instagram";
import "./tiktok";
