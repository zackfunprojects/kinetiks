/**
 * Canonical Sentry capture shape for Kinetiks.
 *
 * Per CLAUDE.md the capture shape is fixed:
 *   Sentry.captureException(err, {
 *     tags: { route, action, stage, app: 'id' | 'hv' | ... },
 *     user: { id: kinetiksAccountId },
 *     extra: { proposalId, threadId, toolName, patternId, grantId, ... }   // ids only, no raw payloads
 *   })
 *
 * This wrapper enforces that shape so feature code can't accidentally
 * leak PII or raw upstream messages. Sentry itself is dynamically
 * imported so the helper is a no-op until `@sentry/nextjs` is installed
 * and `SENTRY_DSN` is configured. In dev, captures fall through to a
 * structured console.error so the shape is testable without Sentry.
 */

export type KinetiksAppCode = "id" | "hv" | "dm" | "ht" | "im" | "lt" | "av";

export interface CaptureTags {
  /** Route or page path, e.g. "/api/marcus/chat" or "/cortex/identity". */
  route: string;
  /** Logical action, e.g. "approval.submit", "marcus.send", "ga4.extract". */
  action: string;
  /** Where in the flow the error happened: "validate" | "execute" | "persist" | "render" | etc. */
  stage: string;
  /** Which app the error originated in. */
  app: KinetiksAppCode;
}

export interface CaptureUser {
  /** kinetiks_accounts.id — never auth.users.id. */
  id?: string;
}

/** Strictly ids and primitives. No raw payloads, no PII, no prompt text. */
export type CaptureExtra = Record<string, string | number | boolean | null | undefined | string[]>;

export interface CaptureOptions {
  tags: CaptureTags;
  user?: CaptureUser;
  extra?: CaptureExtra;
}

let _sentryClient: typeof import("@sentry/nextjs") | null | undefined;

async function getSentry(): Promise<typeof import("@sentry/nextjs") | null> {
  if (_sentryClient !== undefined) return _sentryClient;
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
    _sentryClient = null;
    return null;
  }
  try {
    _sentryClient = await import("@sentry/nextjs");
    return _sentryClient;
  } catch {
    _sentryClient = null;
    return null;
  }
}

export async function captureException(err: unknown, options: CaptureOptions): Promise<void> {
  const sentry = await getSentry();
  if (sentry) {
    sentry.captureException(err, {
      tags: { ...options.tags } as Record<string, string>,
      user: options.user ? { id: options.user.id ?? undefined } : undefined,
      extra: options.extra,
    });
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(
      `[sentry-dev] ${options.tags.app}:${options.tags.action}:${options.tags.stage} (${options.tags.route})`,
      { error: msg, user: options.user, extra: options.extra },
    );
  }
}

export async function captureMessage(message: string, options: CaptureOptions): Promise<void> {
  const sentry = await getSentry();
  if (sentry) {
    sentry.captureMessage(message, {
      tags: { ...options.tags } as Record<string, string>,
      user: options.user ? { id: options.user.id ?? undefined } : undefined,
      extra: options.extra,
    });
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(
      `[sentry-dev] ${options.tags.app}:${options.tags.action}:${options.tags.stage} (${options.tags.route}) — ${message}`,
      { user: options.user, extra: options.extra },
    );
  }
}

/**
 * Generic user-safe message constants. Per CLAUDE.md, every failure branch
 * pairs with one of these — never interpolate raw upstream content into a
 * user response. Add new constants here, not inline strings, so reviewers
 * can audit copy in one place.
 */
export const USER_SAFE = {
  GENERIC_ERROR: "Something went wrong. Try again in a moment.",
  GENERIC_RATE_LIMITED: "We're being rate-limited right now. Try again shortly.",
  GENERIC_PROPOSAL_REJECT: "We couldn't record that decision. Try again.",
  GENERIC_APPROVAL_SUBMIT: "We couldn't submit that for approval. Try again.",
  GENERIC_MARCUS_FAILURE: "I hit a snag answering that. Try again in a moment.",
  GENERIC_CONNECTION_FAILURE: "We couldn't reach that integration. Try again.",
  GENERIC_FORBIDDEN: "You don't have permission to do that.",
  GENERIC_NOT_FOUND: "We couldn't find what you were looking for.",
} as const;
