/**
 * Side-effect imports for the six Nango sync handlers.
 *
 * Importing this file once at boot triggers all per-source
 * registerNangoHandler() calls. Kept separate from `./index.ts` because
 * the handler modules import the registration helper from `.`, which
 * would create a circular dependency (handlers → index → handlers).
 *
 * Boot path: apps/id/src/instrumentation-node.ts imports this file.
 */

import "./google-analytics";
import "./google-search-console";
import "./stripe";
import "./meta-ads";
import "./google-ads";
import "./hubspot";
