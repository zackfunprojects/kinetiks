import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createAdminClient } from "@/lib/supabase/admin";

const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET ?? "";

/**
 * POST /api/webhooks/resend
 * Receives Resend webhook events (delivered, opened, clicked, bounced, complained).
 * Updates hv_emails status and creates hv_tracking_events.
 */
export async function POST(request: Request) {
  // 1. Read raw body for signature verification
  const rawBody = await request.text();

  // 2. Verify webhook signature via Svix
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing webhook signature headers" }, { status: 401 });
  }

  if (!RESEND_WEBHOOK_SECRET) {
    console.error("[Resend Webhook] RESEND_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let payload: Record<string, unknown>;
  try {
    const wh = new Webhook(RESEND_WEBHOOK_SECRET);
    payload = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as Record<string, unknown>;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("[Resend Webhook] Signature verification failed:", message);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const eventType = payload.type as string | undefined;
  const eventData = payload.data as Record<string, unknown> | undefined;

  if (!eventType || !eventData) {
    return NextResponse.json({ error: "Missing event type or data" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Extract email_id from tags
  // Assertion: tags array structure is set by our sendViaResend() call
  const tags = (eventData.tags as Array<{ name: string; value: string }>) ?? [];
  const emailIdTag = tags.find((t) => t.name === "email_id");
  const emailId = emailIdTag?.value as string | undefined;

  if (!emailId) {
    console.warn("[Resend Webhook] No email_id in tags for event:", eventType);
    return NextResponse.json({ received: true });
  }

  // Look up kinetiks_id from the email record (needed for all tracking inserts)
  const { data: emailRecord } = await admin
    .from("hv_emails")
    .select("kinetiks_id, contact_id")
    .eq("id", emailId)
    .single();

  if (!emailRecord) {
    console.warn("[Resend Webhook] Email not found:", emailId);
    return NextResponse.json({ received: true });
  }

  // Assertion: select columns match this shape from hv_emails migration
  const { kinetiks_id: accountId, contact_id: contactId } = emailRecord as {
    kinetiks_id: string;
    contact_id: string;
  };

  const now = new Date().toISOString();

  switch (eventType) {
    case "email.delivered": {
      admin.from("hv_tracking_events").insert({
        kinetiks_id: accountId,
        email_id: emailId,
        contact_id: contactId,
        event_type: "delivered",
        occurred_at: now,
        metadata: eventData,
      }).then(({ error: insertErr }) => {
        if (insertErr) console.error("[Resend Webhook] Failed to log delivered:", insertErr.message);
      });
      break;
    }

    case "email.opened": {
      await admin.from("hv_emails").update({
        status: "opened",
        opened_at: now,
      }).eq("id", emailId).is("opened_at", null);

      admin.from("hv_tracking_events").insert({
        kinetiks_id: accountId,
        email_id: emailId,
        contact_id: contactId,
        event_type: "open",
        occurred_at: now,
        // Assertion: Resend event data includes ip and user_agent for open events
        ip_address: (eventData.ip as string) ?? null,
        user_agent: (eventData.user_agent as string) ?? null,
        metadata: eventData,
      }).then(({ error: insertErr }) => {
        if (insertErr) console.error("[Resend Webhook] Failed to log open:", insertErr.message);
      });
      break;
    }

    case "email.clicked": {
      await admin.from("hv_emails").update({
        status: "clicked",
        clicked_at: now,
      }).eq("id", emailId).is("clicked_at", null);

      admin.from("hv_tracking_events").insert({
        kinetiks_id: accountId,
        email_id: emailId,
        contact_id: contactId,
        event_type: "click",
        occurred_at: now,
        // Assertion: Resend click event includes ip, user_agent, and click.link
        ip_address: (eventData.ip as string) ?? null,
        user_agent: (eventData.user_agent as string) ?? null,
        url: (eventData.click as Record<string, unknown>)?.link as string ?? null,
        click_url: (eventData.click as Record<string, unknown>)?.link as string ?? null,
        metadata: eventData,
      }).then(({ error: insertErr }) => {
        if (insertErr) console.error("[Resend Webhook] Failed to log click:", insertErr.message);
      });
      break;
    }

    case "email.bounced": {
      await admin.from("hv_emails").update({
        status: "bounced",
        bounced_at: now,
      }).eq("id", emailId);

      // Suppress bounced recipient
      const recipientEmail = eventData.to as string | undefined;
      if (recipientEmail) {
        void admin.from("hv_suppressions").insert({
          kinetiks_id: accountId,
          email: recipientEmail,
          type: "bounce",
          // Assertion: Resend bounce event includes bounce.type
          reason: `Bounced: ${(eventData.bounce as Record<string, unknown>)?.type ?? "unknown"}`,
        });

        // Stop active enrollment
        admin
          .from("hv_enrollments")
          .update({ status: "bounced", completed_at: now })
          .eq("contact_id", contactId)
          .eq("status", "active")
          .then(({ error: updateErr }) => {
            if (updateErr) console.error("[Resend Webhook] Failed to stop enrollment:", updateErr.message);
          });
      }

      admin.from("hv_tracking_events").insert({
        kinetiks_id: accountId,
        email_id: emailId,
        contact_id: contactId,
        event_type: "bounce",
        occurred_at: now,
        metadata: eventData,
      }).then(({ error: insertErr }) => {
        if (insertErr) console.error("[Resend Webhook] Failed to log bounce:", insertErr.message);
      });
      break;
    }

    case "email.complained": {
      await admin.from("hv_emails").update({
        status: "bounced",
        bounced_at: now,
      }).eq("id", emailId);

      const complaintRecipient = eventData.to as string | undefined;
      if (complaintRecipient) {
        void admin.from("hv_suppressions").insert({
          kinetiks_id: accountId,
          email: complaintRecipient,
          type: "complaint",
          reason: "Recipient marked email as spam",
        });
      }
      break;
    }

    default:
      console.log("[Resend Webhook] Unhandled event type:", eventType);
  }

  return NextResponse.json({ received: true });
}
