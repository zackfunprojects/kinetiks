import * as Sentry from "@sentry/electron/main";

let initialized = false;

/**
 * Crash reporting for the desktop main process (CLAUDE.md DoD: Sentry on
 * desktop). No-op without a DSN — mirrors apps/id's `@/lib/observability/sentry`
 * so dev/local runs stay quiet.
 *
 * `@sentry/electron`'s default integrations capture `uncaughtException`,
 * `unhandledRejection`, and native (renderer/GPU/main) crashes via the Electron
 * crash reporter. The renderer's JS errors are reported separately by apps/id's
 * `@sentry/nextjs`. Init must run before app setup so startup faults are caught.
 */
export function initObservability(): void {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || initialized) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "production",
    sendDefaultPii: false,
    // Canonical: tag every event with the originating app.
    initialScope: { tags: { app: "desktop" } },
  });
  initialized = true;
}

/** Manually capture a main-process exception (ids/primitives only — no PII). */
export function captureDesktopException(
  err: unknown,
  extra?: Record<string, string | number | boolean>
): void {
  if (!initialized) return;
  Sentry.captureException(err, extra ? { extra } : undefined);
}
