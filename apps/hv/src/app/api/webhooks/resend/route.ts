import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/webhooks/resend
 * Receives Resend webhook events (delivered, opened, clicked, bounced, complained).
 * Updates hv_emails status and creates hv_tracking_events.
 */
export async function POST(request: Request) {
  // Verify webhook signature
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing webhook signature headers" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = payload.type as string | undefined;
  const eventData = payload.data as Record<string, unknown> | undefined;

  if (!eventType || !eventData) {
    return NextResponse.json({ error: "Missing event type or data" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Extract email_id from tags or headers
  const tags = (eventData.tags as Array<{ name: string; value: string }>) ?? [];
  const emailIdTag = tags.find((t) => t.name === "email_id");
  const emailId = emailIdTag?.value as string | undefined;

  if (!emailId) {
    // Can't correlate - log and acknowledge
    console.warn("[Resend Webhook] No email_id in tags for event:", eventType);
    return NextResponse.json({ received: true });
  }

  const now = new Date().toISOString();

  switch (eventType) {
    case "email.delivered": {
      // Mark as delivered (no separate status - still "sent")
      admin.from("hv_tracking_events").insert({
        email_id: emailId,
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
      }).eq("id", emailId).is("opened_at", null); // Only update first open

      admin.from("hv_tracking_events").insert({
        email_id: emailId,
        event_type: "open",
        occurred_at: now,
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
      }).eq("id", emailId).is("clicked_at", null); // Only update first click

      admin.from("hv_tracking_events").insert({
        email_id: emailId,
        event_type: "click",
        occurred_at: now,
        ip_address: (eventData.ip as string) ?? null,
        user_agent: (eventData.user_agent as string) ?? null,
        url: (eventData.click as Record<string, unknown>)?.link as string ?? null,
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

      // Add to suppression list
      const recipientEmail = eventData.to as string | undefined;
      if (recipientEmail) {
        // Look up account via email record
        const { data: emailRecord } = await admin
          .from("hv_emails")
          .select("kinetiks_id, contact_id")
          .eq("id", emailId)
          .single();

        if (emailRecord) {
          // Type assertion: emailRecord shape matches select columns
          const record = emailRecord as { kinetiks_id: string; contact_id: string };
          // May already exist - that's fine (immutable suppression list)
          void admin.from("hv_suppressions").insert({
            kinetiks_id: record.kinetiks_id,
            email: recipientEmail,
            type: "bounce",
            reason: `Bounced: ${(eventData.bounce as Record<string, unknown>)?.type ?? "unknown"}`,
          });

          // Stop any active enrollment for this contact
          admin
            .from("hv_enrollments")
            .update({ status: "bounced", completed_at: now })
            .eq("contact_id", record.contact_id)
            .eq("status", "active")
            .then(({ error: updateErr }) => {
              if (updateErr) console.error("[Resend Webhook] Failed to stop enrollment:", updateErr.message);
            });
        }
      }

      admin.from("hv_tracking_events").insert({
        email_id: emailId,
        event_type: "bounce",
        occurred_at: now,
        metadata: eventData,
      }).then(({ error: insertErr }) => {
        if (insertErr) console.error("[Resend Webhook] Failed to log bounce:", insertErr.message);
      });
      break;
    }

    case "email.complained": {
      // Complaint = spam report. Suppress immediately.
      await admin.from("hv_emails").update({
        status: "bounced", // Treat complaints as bounces
        bounced_at: now,
      }).eq("id", emailId);

      const complaintRecipient = eventData.to as string | undefined;
      if (complaintRecipient) {
        const { data: emailRec } = await admin
          .from("hv_emails")
          .select("kinetiks_id")
          .eq("id", emailId)
          .single();

        if (emailRec) {
          // Type assertion: emailRec shape matches select column
          const rec = emailRec as { kinetiks_id: string };
          void admin.from("hv_suppressions").insert({
            kinetiks_id: rec.kinetiks_id,
            email: complaintRecipient,
            type: "complaint",
            reason: "Recipient marked email as spam",
          });
        }
      }
      break;
    }

    default:
      console.log("[Resend Webhook] Unhandled event type:", eventType);
  }

  return NextResponse.json({ received: true });
}
