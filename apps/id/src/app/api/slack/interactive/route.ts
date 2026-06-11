/**
 * POST /api/slack/interactive — Slack interactivity receiver (D3).
 *
 * Handles the inline-approval surface (comms spec §3.6):
 *   - block_actions: Approve / Reject buttons on approval cards
 *   - view_submission: the reject-reason modal
 *
 * Same receiver discipline as /api/slack/events: signature over the
 * RAW body, 5-minute replay window, fast ack. The one exception to
 * ack-then-work is opening the reject modal — Slack trigger_ids
 * expire in 3 seconds, so views.open runs inside the request (a
 * single fast API call); decisions and card updates run after the
 * response.
 *
 * Payload shape: form-encoded `payload=<json>` per Slack's
 * interactivity contract.
 */

import { NextResponse } from "next/server";

import { serverEnv } from "@kinetiks/lib/env";

import { verifySlackSignature } from "@/lib/slack/verify";
import {
  openRejectReasonModal,
  processApprovalApprove,
  processRejectSubmission,
} from "@/lib/slack/interactive";
import { runAfterResponse } from "@/lib/utils/wait-until";
import { captureException } from "@/lib/observability/sentry";

interface BlockActionsPayload {
  type: "block_actions";
  team?: { id?: string };
  trigger_id?: string;
  response_url?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
}

interface ViewSubmissionPayload {
  type: "view_submission";
  team?: { id?: string };
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: {
      values?: Record<string, Record<string, { value?: string | null }>>;
    };
  };
}

export async function POST(request: Request): Promise<Response> {
  const env = serverEnv();
  if (!env.SLACK_SIGNING_SECRET) {
    return NextResponse.json({ error: "slack_not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const verdict = verifySlackSignature({
    signingSecret: env.SLACK_SIGNING_SECRET,
    timestampHeader: request.headers.get("x-slack-request-timestamp"),
    signatureHeader: request.headers.get("x-slack-signature"),
    rawBody,
  });
  if (!verdict.ok) {
    await captureException(
      new Error(`slack interactive signature rejected: ${verdict.reason}`),
      {
        tags: {
          route: "/api/slack/interactive",
          action: "slack.approval",
          stage: "verify",
          app: "id",
        },
        extra: { reason: verdict.reason },
      },
    );
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // Interactivity bodies are form-encoded with a `payload` JSON field.
  let payload: BlockActionsPayload | ViewSubmissionPayload;
  try {
    const params = new URLSearchParams(rawBody);
    const raw = params.get("payload");
    if (!raw) throw new Error("no payload field");
    payload = JSON.parse(raw) as BlockActionsPayload | ViewSubmissionPayload;
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const teamId = payload.team?.id;
  if (!teamId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (payload.type === "block_actions") {
    const action = payload.actions?.[0];
    const approvalId = action?.value;
    const responseUrl = payload.response_url;
    if (!action?.action_id || !approvalId || !responseUrl) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (action.action_id === "approval_approve") {
      runAfterResponse(
        processApprovalApprove({ teamId, approvalId, responseUrl }),
        {
          tags: {
            route: "/api/slack/interactive",
            action: "slack.approval",
            stage: "after_response",
            app: "id",
          },
          extra: { approval_id: approvalId, team_id: teamId },
        },
      );
      return NextResponse.json({ ok: true });
    }

    if (action.action_id === "approval_reject") {
      // trigger_id expires in 3s — the modal opens inside the request.
      if (!payload.trigger_id) {
        return NextResponse.json({ ok: true, ignored: true });
      }
      await openRejectReasonModal({
        teamId,
        approvalId,
        triggerId: payload.trigger_id,
        responseUrl,
      });
      return NextResponse.json({ ok: true });
    }

    // approval_open is a URL button (no handler); anything else is
    // an unknown action — ack and ignore.
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (
    payload.type === "view_submission" &&
    payload.view?.callback_id === "approval_reject_reason"
  ) {
    let meta: { approval_id?: string; response_url?: string };
    try {
      meta = JSON.parse(payload.view.private_metadata ?? "{}") as {
        approval_id?: string;
        response_url?: string;
      };
    } catch {
      meta = {};
    }
    const reason =
      payload.view.state?.values?.reason_block?.reason?.value?.trim() ?? "";
    if (!meta.approval_id || !meta.response_url) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    if (!reason) {
      // Keep the modal open with a validation error — the reason is
      // the calibration signal; an empty one defeats the point.
      return NextResponse.json({
        response_action: "errors",
        errors: { reason_block: "Add a sentence on why - it calibrates future decisions." },
      });
    }

    runAfterResponse(
      processRejectSubmission({
        teamId,
        approvalId: meta.approval_id,
        responseUrl: meta.response_url,
        reason,
      }),
      {
        tags: {
          route: "/api/slack/interactive",
          action: "slack.approval",
          stage: "after_response",
          app: "id",
        },
        extra: { approval_id: meta.approval_id, team_id: teamId },
      },
    );
    // Empty 200 closes the modal.
    return new NextResponse(null, { status: 200 });
  }

  return NextResponse.json({ ok: true, ignored: true });
}
