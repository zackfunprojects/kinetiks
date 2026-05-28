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
import { queryActiveAuthorityTool } from "./query-active-authority";
import { ga4QueryTool } from "./ga4-query";
import { gscQueryTool } from "./gsc-query";
import { stripeQueryTool } from "./stripe-query";
import { metaAdsQueryTool } from "./meta-ads-query";
import { googleAdsQueryTool } from "./google-ads-query";
import { queryInsightsTool } from "./query-insights";
import { sendSlackNotificationTool } from "./send-slack-notification";
import { draftEmailTool } from "./draft-email";
import { addCalendarEventTool } from "./add-calendar-event";

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
  // Phase 4 — Chunk 10: queryActionsAuthority now hits the real
  // GrantReader; queryActiveAuthority is new for "what authority do
  // you have right now?" customer questions.
  registerTool(queryActionsAuthorityTool);
  registerTool(queryActiveAuthorityTool);
  // D1 — first real data tool. Reads GA4 traffic through the cache layer.
  registerTool(ga4QueryTool);
  // D2 Slice 6 — GSC + Stripe via Nango-fed cache.
  registerTool(gscQueryTool);
  registerTool(stripeQueryTool);
  // D2 Slice 7 — Meta Ads + Google Ads via Nango-fed cache.
  registerTool(metaAdsQueryTool);
  registerTool(googleAdsQueryTool);
  // D2 Slice 11 — Oracle insights read tool. Marcus's step 7.5 picks
  // this for "what changed" / "any alerts" turns.
  registerTool(queryInsightsTool);
  // Phase 4 — Chunk 6 — Marcus action-bearing tools. All three declare
  // an actionClass so the authority resolver gates them; each ends in
  // an external mutation (Slack post / Gmail draft / Calendar event).
  registerTool(sendSlackNotificationTool);
  registerTool(draftEmailTool);
  registerTool(addCalendarEventTool);
  // Cross-registry validation — fails the boot if anything is
  // inconsistent. Phase 4 — Chunk 6 introduced the first consequential
  // tools (send_slack_notification, draft_email, add_calendar_event);
  // every tool's actionClass must resolve in the Action Class
  // Registry, and every operator's required_tools / required_patterns
  // / action_classes must resolve too. assertRegistriesValid catches
  // any mismatch at boot rather than at runtime.
  assertRegistriesValid();
  _booted = true;
}

/** Test-only escape hatch; resets the booted flag so test runs can rerun boot. */
export function _resetBootForTests(): void {
  _booted = false;
}
