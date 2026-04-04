import { createAdminClient } from "@/lib/supabase/admin";
import type { SystemIdentity } from "@/lib/goals/types";

/**
 * Send an email via the connected email provider using system identity.
 */
export async function sendEmail(
  accountId: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();

  // Load system identity
  const { data: identity } = await admin
    .from("kinetiks_system_identity")
    .select("*")
    .eq("account_id", accountId)
    .single();

  if (!identity?.email_credentials || !identity.email_provider) {
    return { success: false, error: "Email not connected" };
  }

  const systemIdentity = identity as SystemIdentity & { email_credentials: { access_token: string } };

  // Get system name for sender
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("system_name")
    .eq("id", accountId)
    .single();

  const senderName = account?.system_name ?? "Kinetiks";

  try {
    if (systemIdentity.email_provider === "google") {
      return await sendViaGmail(
        systemIdentity.email_credentials.access_token,
        systemIdentity.email_address!,
        senderName,
        to,
        subject,
        htmlBody
      );
    } else {
      return await sendViaMicrosoft(
        systemIdentity.email_credentials.access_token,
        senderName,
        to,
        subject,
        htmlBody
      );
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

async function sendViaGmail(
  accessToken: string,
  from: string,
  fromName: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; error?: string }> {
  const raw = createMimeMessage(from, fromName, to, subject, htmlBody);
  const encoded = Buffer.from(raw).toString("base64url");

  const res = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!res.ok) {
    const err = await res.json();
    return { success: false, error: err.error?.message ?? "Gmail send failed" };
  }

  return { success: true };
}

async function sendViaMicrosoft(
  accessToken: string,
  fromName: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: htmlBody },
        toRecipients: [{ emailAddress: { address: to } }],
        from: { emailAddress: { name: fromName } },
      },
    }),
  });

  if (!res.ok) {
    return { success: false, error: "Microsoft send failed" };
  }

  return { success: true };
}

function createMimeMessage(
  from: string,
  fromName: string,
  to: string,
  subject: string,
  htmlBody: string
): string {
  return [
    `From: ${fromName} <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    htmlBody,
  ].join("\r\n");
}
