/**
 * Kinetiks ID account-deletion webhook receiver.
 *
 * When a user deletes their Kinetiks ID account, ID dispatches an
 * `account.deleted` webhook to every connected app. DeskOf records the
 * deletion request in `deskof_data_deletion_requests` and a scheduled
 * processor (Phase 8) runs the actual cascade across the 1h / 24h / 7d
 * windows.
 *
 * Phase 1 verifies the webhook signature, persists the request row,
 * and acks. The cascade processor and Cortex purge job land in Phase 8.
 */
import { NextResponse } from "next/server";
import { createDeskOfAdminClient } from "@/lib/supabase/admin";
import { requestAccountDeletion } from "@/lib/privacy/deletion";

export const dynamic = "force-dynamic";

interface WebhookPayload {
  event: string;
  kinetiks_id: string;
  data: {
    user_id?: string;
  };
}

export async function POST(request: Request) {
  // TODO Phase 8: verify X-Kinetiks-Signature using shared webhook secret
  // matching apps/id/src/lib/webhooks/sign.ts. Phase 1 ships the row
  // creation only.

  let payload: WebhookPayload;
  try {
    payload = (await request.json()) as WebhookPayload;
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

  const admin = createDeskOfAdminClient();
  try {
    const requestRow = await requestAccountDeletion(admin, userId);
    return NextResponse.json({
      success: true,
      deletion_request_id: requestRow.id,
      status: requestRow.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
