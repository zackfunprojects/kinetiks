/**
 * Post-response background work for serverless route handlers — D3.
 *
 * Slack requires an ack within 3 seconds; a Marcus turn takes longer.
 * On Vercel, work scheduled after the response must be registered via
 * `waitUntil` or the runtime may freeze the invocation mid-flight.
 * This wrapper uses `@vercel/functions` when a request context exists
 * and falls back to a detached promise locally (next dev, vitest),
 * always with a terminal catch into the canonical Sentry shape so a
 * background failure is never an unhandled rejection.
 */

import "server-only";

import { waitUntil as vercelWaitUntil } from "@vercel/functions";

import { captureException, type CaptureOptions } from "@/lib/observability/sentry";

export function runAfterResponse(work: Promise<unknown>, capture: CaptureOptions): void {
  const guarded = work.catch(async (err: unknown) => {
    await captureException(err, capture);
  });
  try {
    vercelWaitUntil(guarded);
  } catch {
    // No Vercel request context (local dev / tests): let it run
    // detached. The catch above already owns the failure path.
    void guarded;
  }
}
