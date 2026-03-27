import { createAdminClient } from "@/lib/supabase/admin";
import { sendViaResend } from "./resend-client";
import { sendViaSes } from "./ses-client";

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: "resend" | "ses";
}

interface EmailRecord {
  id: string;
  kinetiks_id: string;
  contact_id: string;
  mailbox_id: string | null;
  subject: string;
  body: string;
  body_plain: string | null;
  status: string;
  sentinel_verdict: string | null;
  sequence_id: string | null;
  campaign_id: string | null;
  step_number: number | null;
  cc_contact_id: string | null;
}

interface MailboxRecord {
  id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  daily_limit: number;
  daily_sent_today: number;
  warmup_status: string;
}

interface ContactRecord {
  email: string | null;
  first_name: string | null;
}

/**
 * Send a Harvest email by ID.
 *
 * This is the main orchestrator - it handles:
 * 1. Loading the email + mailbox + contact
 * 2. Suppression checking
 * 3. Daily limit enforcement
 * 4. Sentinel verdict check
 * 5. Provider routing (Resend for transactional, SES for sequences)
 * 6. Status updates + activity logging
 */
export async function sendHarvestEmail(
  emailId: string,
  accountId: string,
): Promise<SendResult> {
  const admin = createAdminClient();

  // 1. Load email
  const { data: email, error: emailError } = await admin
    .from("hv_emails")
    .select("id, kinetiks_id, contact_id, mailbox_id, subject, body, body_plain, status, sentinel_verdict, sequence_id, campaign_id, step_number, cc_contact_id")
    .eq("id", emailId)
    .eq("kinetiks_id", accountId)
    .single();

  if (emailError || !email) {
    return { success: false, error: "Email not found" };
  }

  const typedEmail = email as EmailRecord;

  // Verify not already sent
  if (typedEmail.status === "sent") {
    return { success: false, error: "Email already sent" };
  }

  // 2. Check Sentinel verdict - block if held
  if (typedEmail.sentinel_verdict === "held") {
    return { success: false, error: "Email held by Sentinel review - fix flagged issues before sending" };
  }

  // 3. Load contact email
  const { data: contact } = await admin
    .from("hv_contacts")
    .select("email, first_name")
    .eq("id", typedEmail.contact_id)
    .single();

  const typedContact = contact as ContactRecord | null;
  if (!typedContact?.email) {
    return { success: false, error: "Contact has no email address" };
  }

  // 4. Check suppression
  const { data: suppressed } = await admin.rpc("hv_check_suppression", {
    p_kinetiks_id: accountId,
    p_email: typedContact.email,
  });

  if (suppressed) {
    return { success: false, error: `Recipient ${typedContact.email} is suppressed` };
  }

  // 5. Load mailbox (or use default)
  let fromAddress = process.env.DEFAULT_FROM_EMAIL ?? "noreply@kinetiks.ai";
  let mailboxId = typedEmail.mailbox_id;

  if (mailboxId) {
    const { data: mailbox } = await admin
      .from("hv_mailboxes")
      .select("id, email, display_name, is_active, daily_limit, daily_sent_today, warmup_status")
      .eq("id", mailboxId)
      .single();

    const typedMailbox = mailbox as MailboxRecord | null;

    if (!typedMailbox) {
      return { success: false, error: "Mailbox not found" };
    }
    if (!typedMailbox.is_active) {
      return { success: false, error: "Mailbox is paused" };
    }
    if (typedMailbox.daily_sent_today >= typedMailbox.daily_limit) {
      return { success: false, error: "Mailbox daily send limit reached" };
    }

    fromAddress = typedMailbox.display_name
      ? `${typedMailbox.display_name} <${typedMailbox.email}>`
      : typedMailbox.email;
  } else {
    // If no mailbox assigned, pick the first active one
    const { data: defaultMailbox } = await admin
      .from("hv_mailboxes")
      .select("id, email, display_name, is_active, daily_limit, daily_sent_today, warmup_status")
      .eq("kinetiks_id", accountId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const typedDefault = defaultMailbox as MailboxRecord | null;
    if (typedDefault) {
      mailboxId = typedDefault.id;
      fromAddress = typedDefault.display_name
        ? `${typedDefault.display_name} <${typedDefault.email}>`
        : typedDefault.email;
    }
  }

  // 6. Load CC contact if present
  let ccEmail: string | undefined;
  if (typedEmail.cc_contact_id) {
    const { data: ccContact } = await admin
      .from("hv_contacts")
      .select("email")
      .eq("id", typedEmail.cc_contact_id)
      .single();
    // Assertion: email is string | null from hv_contacts schema
    ccEmail = (ccContact as { email: string | null } | null)?.email ?? undefined;
  }

  // 7. Route to provider
  // Transactional (composer-generated, no sequence): use Resend
  // Sequence/campaign: use SES for cost efficiency
  const isSequenceEmail = Boolean(typedEmail.sequence_id);
  const trackingHeaders: Record<string, string> = {
    "X-Harvest-Email-Id": typedEmail.id,
    "X-Harvest-Account-Id": accountId,
  };
  if (typedEmail.campaign_id) {
    trackingHeaders["X-Harvest-Campaign-Id"] = typedEmail.campaign_id;
  }

  let result: SendResult;

  if (isSequenceEmail && process.env.AWS_SES_REGION) {
    // SES for bulk/sequence
    const sesResult = await sendViaSes({
      from: fromAddress,
      to: typedContact.email,
      cc: ccEmail,
      subject: typedEmail.subject,
      html: typedEmail.body,
      replyTo: fromAddress,
      headers: trackingHeaders,
    });
    result = { ...sesResult, provider: "ses" };
  } else {
    // Resend for transactional (or fallback when SES not configured)
    const resendResult = await sendViaResend({
      from: fromAddress,
      to: typedContact.email,
      cc: ccEmail,
      subject: typedEmail.subject,
      html: typedEmail.body,
      replyTo: fromAddress,
      headers: trackingHeaders,
      tags: [
        { name: "email_id", value: typedEmail.id },
        { name: "account_id", value: accountId },
      ],
    });
    result = { ...resendResult, provider: "resend" };
  }

  // 8. Update email status
  if (result.success) {
    await admin
      .from("hv_emails")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        message_id: result.messageId,
        mailbox_id: mailboxId,
      })
      .eq("id", emailId);

    // Increment mailbox daily counter
    if (mailboxId) {
      const { data: currentMailbox } = await admin
        .from("hv_mailboxes")
        .select("daily_sent_today")
        .eq("id", mailboxId)
        .single();

      if (currentMailbox) {
        const current = (currentMailbox as { daily_sent_today: number }).daily_sent_today ?? 0;
        await admin
          .from("hv_mailboxes")
          .update({ daily_sent_today: current + 1 })
          .eq("id", mailboxId);
      }
    }

    // 9. Log activity
    admin.from("hv_activities").insert({
      kinetiks_id: accountId,
      contact_id: typedEmail.contact_id,
      type: "email_sent",
      detail: {
        email_id: emailId,
        subject: typedEmail.subject,
        to: typedContact.email,
        provider: result.provider,
        message_id: result.messageId,
      },
    }).then(({ error: activityErr }) => {
      if (activityErr) console.error("[Send] Failed to log activity:", activityErr.message);
    });
  }

  return result;
}
