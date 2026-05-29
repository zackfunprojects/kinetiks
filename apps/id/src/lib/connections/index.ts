/**
 * Phase 7 — public barrel for the connections framework.
 *
 * The pre-Phase-7 OAuth / extraction / token-refresh exports are
 * removed; Nango owns all of those concerns now. What remains:
 *
 *   - `encryption.ts` — used by the Google Workspace token helper
 *     (`apps/id/src/lib/connections/google-workspace-token.ts`) for
 *     the Phase 4 outbound action tools (Slack / draft email /
 *     calendar). That path is internal to apps/id; it does not
 *     overlap with the public Nango-managed Connect flow.
 *
 *   - `providers.ts` — ProviderDefinition list for the connections UI.
 *
 *   - `manager.ts` — read helpers (SELECT-only).
 *
 *   - `metric-cache.ts` — read/write helpers for `kinetiks_metric_cache`,
 *     used by Marcus tools and Nango sync handlers.
 */

export { encryptCredentials, decryptCredentials } from "./encryption";
export {
  getProvider,
  listProviders,
  isValidProvider,
  listProvidersByCategory,
} from "./providers";
export {
  getConnections,
  getConnectionByProvider,
  getConnectionById,
} from "./manager";
export type {
  StoredCredentials,
  StoredOAuthCredentials,
  StoredApiKeyCredentials,
} from "./types";
