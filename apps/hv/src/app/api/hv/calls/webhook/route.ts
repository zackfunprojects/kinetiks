import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processCallComplete } from "@/lib/calls/orchestrator";

/**
 * POST /api/hv/calls/webhook
 * Twilio status callback webhook. Updates call status as events arrive.
 *
 * This endpoint is called by Twilio, not by authenticated users,
 * so it validates via the Twilio signature header.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const callSid = formData.get("CallSid") as string;
    const callStatus = formData.get("CallStatus") as string;
    const duration = parseInt(formData.get("CallDuration") as string ?? "0", 10);

    if (!callSid) {
      return NextResponse.json({ error: "Missing CallSid" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Find the call record by Twilio SID
    const { data: callRecord } = await admin
      .from("hv_calls")
      .select("id, kinetiks_id, status")
      .eq("twilio_call_sid", callSid)
      .maybeSingle();

    if (!callRecord) {
      // Not our call or already processed
      return NextResponse.json({ ok: true });
    }

    // Map Twilio statuses to our statuses
    const statusMap: Record<string, string> = {
      initiated: "in_progress",
      ringing: "in_progress",
      "in-progress": "in_progress",
      completed: "completed",
      busy: "failed",
      "no-answer": "failed",
      canceled: "cancelled",
      failed: "failed",
    };

    const newStatus = statusMap[callStatus] ?? callRecord.status;

    // Update status
    await admin
      .from("hv_calls")
      .update({
        status: newStatus,
        duration_seconds: duration > 0 ? duration : undefined,
        ended_at: newStatus === "completed" || newStatus === "failed" || newStatus === "cancelled"
          ? new Date().toISOString()
          : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", callRecord.id);

    // If call completed, process transcript and classify
    if (callStatus === "completed" && duration > 0) {
      // Fire-and-forget: don't block the webhook response
      processCallComplete({
        callId: callRecord.id,
        accountId: callRecord.kinetiks_id,
        twilioCallSid: callSid,
        duration,
      }).catch((err) => {
        console.error("[HV Calls Webhook] Failed to process completed call:", err);
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[HV Calls Webhook] Error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
