/**
 * POST /api/slack/events — the Slack Events API receiver (Phase D3).
 *
 * The contract, in order:
 *   1. verify the signing-secret signature over the RAW body and
 *      reject replays older than 5 minutes (lib/slack/verify.ts);
 *   2. answer url_verification handshakes;
 *   3. ack event_callbacks with 200 within 3 seconds;
 *   4. process AFTER the ack via runAfterResponse — a Marcus turn
 *      takes longer than Slack's timeout, and a slow ack causes
 *      retry storms.
 *
 * Exactly-once: Slack retries deliveries (x-slack-retry-num); the
 * worker claims each event_id in kinetiks_inbound_events, so retries
 * are acked here and skipped there. Slack is never critical-path —
 * processing failures are captured, never surfaced to Slack as 5xx
 * (which would only trigger more retries).
 */

import { NextResponse } from "next/server";

import { serverEnv } from "@kinetiks/lib/env";

import { verifySlackSignature } from "@/lib/slack/verify";
import { processSlackEvent, type SlackInboundEvent } from "@/lib/slack/inbound";
import { runAfterResponse } from "@/lib/utils/wait-until";
import { captureException } from "@/lib/observability/sentry";

export async function POST(request: Request): Promise<Response> {
  const env = serverEnv();
  if (!env.SLACK_SIGNING_SECRET) {
    // A deployment receiving Slack traffic without the signing secret
    // is misconfigured: 500 + Sentry per CLAUDE.md ("configuration
    // errors map to 500 and go to Sentry").
    await captureException(new Error("SLACK_SIGNING_SECRET is not configured"), {
      tags: {
        route: "/api/slack/events",
        action: "slack.inbound",
        stage: "configuration",
        app: "id",
      },
      extra: {},
    });
    return NextResponse.json({ error: "slack_not_configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const verdict = verifySlackSignature({
    signingSecret: env.SLACK_SIGNING_SECRET,
    timestampHeader: request.headers.get("x-slack-request-timestamp"),
    signatureHeader: request.headers.get("x-slack-signature"),
    rawBody,
  });
  if (!verdict.ok) {
    await captureException(new Error(`slack events signature rejected: ${verdict.reason}`), {
      tags: { route: "/api/slack/events", action: "slack.inbound", stage: "verify", app: "id" },
      extra: { reason: verdict.reason },
    });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Slack app-config handshake.
  if (payload.type === "url_verification" && typeof payload.challenge === "string") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type !== "event_callback") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const teamId = typeof payload.team_id === "string" ? payload.team_id : null;
  const eventId = typeof payload.event_id === "string" ? payload.event_id : null;
  const event =
    payload.event && typeof payload.event === "object"
      ? (payload.event as SlackInboundEvent)
      : null;
  if (!teamId || !eventId || !event) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Ack now, work after. processSlackEvent owns its failures; the
  // capture here is the belt for a crash before its try/catch engages.
  runAfterResponse(processSlackEvent({ teamId, eventId, event }), {
    tags: {
      route: "/api/slack/events",
      action: "slack.inbound",
      stage: "after_response",
      app: "id",
    },
    extra: { team_id: teamId, event_id: eventId, event_type: event.type },
  });

  return NextResponse.json({ ok: true });
}
