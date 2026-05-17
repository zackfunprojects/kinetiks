/**
 * PostHog wrapper with a fixed event taxonomy.
 *
 * Per CLAUDE.md:
 *   - posthog.identify(kinetiksAccountId, { role, app }) on login
 *   - Product events fire per the spec
 *
 * Events live in `KineticsEventName` below. This is the single source of
 * truth: adding a new event requires adding it here so reviewers can audit
 * the surface in one place. Properties are typed and PII-free (ids and
 * primitives only).
 *
 * The actual posthog-js / posthog-node client is dynamically imported so
 * the helper is a no-op until PostHog is installed and a key is set.
 */

import type { KinetiksAppCode } from "./sentry";

/**
 * Canonical event names. See docs/observability/event-taxonomy.md for the
 * full property schema and funnel definitions.
 */
export type KineticsEventName =
  // Auth / accounts
  | "auth.signup"
  | "auth.login"
  | "auth.logout"
  // Onboarding
  | "onboarding.start"
  | "onboarding.step_complete"
  | "onboarding.finish"
  | "setup.system_named"
  | "setup.email_connected"
  | "setup.slack_connected"
  // Chat / Marcus
  | "chat.message_sent"
  | "chat.thread_created"
  | "marcus.action_proposed"
  | "marcus.command_dispatched"
  // Cortex
  | "cortex.identity_edited"
  | "cortex.pattern_starred"
  | "cortex.pattern_suppressed"
  | "cortex.authority_grant_approved"
  | "cortex.authority_grant_revoked"
  | "cortex.goal_created"
  | "cortex.goal_updated"
  | "cortex.budget_updated"
  // Approvals
  | "approval.surfaced"
  | "approval.approved"
  | "approval.rejected"
  | "approval.batch_approved"
  | "approval.edited"
  | "approval.expired"
  // Insights
  | "insight.surfaced"
  | "insight.acted_on"
  | "insight.dismissed"
  // Integrations
  | "connection.added"
  | "connection.removed"
  | "extractor.first_sync"
  | "extractor.sync_error"
  // Theme
  | "theme.toggled";

/** Strict property shape: ids and primitives only. No raw payloads, no PII. */
export type EventProperties = Record<string, string | number | boolean | string[] | undefined | null>;

let _posthog: { capture: Function; identify: Function; reset: Function } | null | undefined;

async function getPostHog(): Promise<typeof _posthog> {
  if (_posthog !== undefined) return _posthog;
  if (typeof window === "undefined") {
    _posthog = null;
    return null;
  }
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    _posthog = null;
    return null;
  }
  try {
    const mod = await import("posthog-js");
    const ph = mod.default;
    ph.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: true,
      autocapture: false,
      persistence: "localStorage+cookie",
    });
    _posthog = ph;
    return _posthog;
  } catch {
    _posthog = null;
    return null;
  }
}

export interface IdentifyOptions {
  accountId: string;
  app: KinetiksAppCode;
  role?: "owner" | "admin" | "member";
}

export async function identify(opts: IdentifyOptions): Promise<void> {
  const ph = await getPostHog();
  if (!ph) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.info("[posthog-dev] identify", opts);
    }
    return;
  }
  ph.identify(opts.accountId, { app: opts.app, role: opts.role });
}

export async function capture(
  event: KineticsEventName,
  properties: EventProperties = {},
): Promise<void> {
  const ph = await getPostHog();
  if (!ph) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.info(`[posthog-dev] ${event}`, properties);
    }
    return;
  }
  ph.capture(event, properties);
}

export async function reset(): Promise<void> {
  const ph = await getPostHog();
  if (!ph) return;
  ph.reset();
}
