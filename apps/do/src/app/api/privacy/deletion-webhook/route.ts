/**
 * Kinetiks ID account-deletion webhook receiver.
 *
 * When a user deletes their Kinetiks ID account, ID dispatches an
 * `account.deleted` webhook to every connected app. The eventual
 * design records the request in `deskof_data_deletion_requests` and
 * a scheduled processor runs the actual cascade across the
 * 1h / 24h / 7d windows.
 *
 * **Phase 2.5 hardening:** the cascade processor lands in Phase 8.
 * Until then, this endpoint records the request for audit and then
 * returns 503 with Retry-After. We do NOT silently 200 the request,
 * because doing so would leave the user thinking their data was
 * deleted when none of it was — a GDPR Article 17 breach in disguise.
 *
 * Security:
 *   - The HMAC signature is verified BEFORE the body is parsed
 *   - Verification fails closed if KINETIKS_WEBHOOK_SECRET is unset
 *   - Timestamp window prevents replay attacks
 *   - Verification logic mirrors apps/id/src/lib/webhooks/sign.ts
 */
import { NextResponse } from "next/server";
import { createDeskOfAdminClient } from "@/lib/supabase/admin";
import { requestAccountDeletion } from "@/lib/privacy/deletion";
import { verifyWebhook } from "@/lib/webhooks/verify";

export const dynamic = "force-dynamic";

interface WebhookPayload {
  event: string;
  kinetiks_id: string;
  data: {
    user_id?: string;
  };
}

export async function POST(request: Request) {
  // 1. Read the raw body string FIRST. Never call request.json() before
  //    signature verification — JSON.parse can canonicalize whitespace
  //    and break the HMAC comparison.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to read request body" },
      { status: 400 }
    );
  }

  // 2. Verify the webhook signature against the raw body. Fails closed
  //    if the shared secret is missing.
  const verification = verifyWebhook({
    rawBody,
    signatureHeader: request.headers.get("x-kinetiks-signature"),
    timestampHeader: request.headers.get("x-kinetiks-timestamp"),
    secret: process.env.KINETIKS_WEBHOOK_SECRET,
  });
  if (!verification.ok) {
    return NextResponse.json(
      { success: false, error: verification.error },
      { status: verification.status }
    );
  }

  // 3. Only now parse the body.
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (payload.event !== "account.deleted") {
    return NextResponse.json(
      { success: false, error: `Unsupported event: ${payload.event}` },
      { status: 400 }
    );
  }

  const userId = payload.data.user_id ?? payload.kinetiks_id;
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Missing user_id" },
      { status: 400 }
    );
  }

  // Record an audit row but do NOT pretend the deletion happened.
  // The cascade processor (token revoke / row purge / Cortex purge)
  // ships in Phase 8. Until then we return 503 with Retry-After so
  // the upstream webhook delivery system retries.
  const admin = createDeskOfAdminClient();
  let auditId: string | null = null;
  try {
    const requestRow = await requestAccountDeletion(admin, userId);
    auditId = requestRow.id;
  } catch (err) {
    console.error(
      "deletion-webhook: failed to record audit row:",
      err instanceof Error ? err.message : err
    );
  }

  // Don't write the raw user_id to logs — this endpoint is retry-driven
  // so the same identifier could land in long-lived logs over and over.
  // Correlate via the audit_request_id instead.
  console.warn(
    `deletion-webhook: received account.deleted (audit row ${auditId ?? "n/a"}). ` +
      "The deletion cascade processor lands in Phase 8 — returning 503 so the caller retries."
  );

  return NextResponse.json(
    {
      success: false,
      error:
        auditId === null
          ? "DeskOf deletion processor is not yet operational AND the audit row could not be recorded. Returning 503 so the caller retries — please re-deliver this webhook."
          : "DeskOf deletion processor is not yet operational. This webhook receiver recorded the request for audit but did not perform the deletion. Returning 503 so the caller retries once the Phase 8 processor lands.",
      audit_request_id: auditId,
    },
    {
      status: 503,
      headers: {
        // Hint to webhook delivery systems to retry in 1 hour
        "Retry-After": "3600",
      },
    }
  );
}
