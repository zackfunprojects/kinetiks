import { createAdminClient } from "@/lib/supabase/admin";
import { classifyReply } from "./classify";

interface SyncResult {
  synced: number;
  errors: number;
}

interface GmailCredentials {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expiry_date?: number;
}

interface GmailMessage {
  id: string;
  threadId: string;
}

interface GmailMessageDetail {
  id: string;
  threadId: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string };
    }>;
  };
  snippet: string;
}

interface SentEmailRow {
  id: string;
  kinetiks_id: string;
  contact_id: string;
  subject: string;
  body: string;
  message_id: string | null;
  sent_at: string;
  sequence_id: string | null;
}

/**
 * Sync Gmail replies for a Harvest account.
 *
 * Queries sent emails that have no reply recorded, searches Gmail for
 * matching replies via In-Reply-To headers, classifies each reply,
 * and updates hv_emails with reply data.
 */
export async function syncGmailReplies(accountId: string): Promise<SyncResult> {
  const admin = createAdminClient();
  let synced = 0;
  let errors = 0;

  // 1. Load Gmail credentials from kinetiks_connections
  const { data: connection } = await admin
    .from("kinetiks_connections")
    .select("credentials, status")
    .eq("account_id", accountId)
    .eq("provider", "gmail")
    .single();

  if (!connection || connection.status !== "active") {
    return { synced: 0, errors: 0 };
  }

  // Assertion: kinetiks_connections.credentials is jsonb; Gmail rows store GmailCredentials shape per connection setup
  const credentials = connection.credentials as GmailCredentials | null;
  if (!credentials?.access_token) {
    return { synced: 0, errors: 0 };
  }

  // 2. Query sent emails with no reply, sent within last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: sentEmails, error: queryError } = await admin
    .from("hv_emails")
    .select("id, kinetiks_id, contact_id, subject, body, message_id, sent_at, sequence_id")
    .eq("kinetiks_id", accountId)
    .eq("status", "sent")
    .is("replied_at", null)
    .not("message_id", "is", null)
    .gte("sent_at", thirtyDaysAgo)
    .limit(100);

  if (queryError) {
    console.error("[gmail-sync] Failed to query sent emails:", queryError.message);
    return { synced: 0, errors: 1 };
  }

  if (!sentEmails || sentEmails.length === 0) {
    return { synced: 0, errors: 0 };
  }

  // Assertion: Supabase .select() returns untyped rows; fields match SentEmailRow schema from hv_emails table
  const typedEmails = sentEmails as SentEmailRow[];

  // Proactive token refresh if expired or expiring within 5 minutes
  if (credentials.expiry_date && Date.now() > credentials.expiry_date - 300_000) {
    // Token expired or expiring soon - skip sync, credentials need refresh
    console.warn("[Gmail Sync] Token expired for account", accountId);
    return { synced: 0, errors: 0 };
  }

  // 3. Search Gmail for replies to each sent email
  for (const email of typedEmails) {
    if (!email.message_id) continue;

    try {
      const replyBody = await findGmailReply(credentials.access_token, email.message_id);

      if (!replyBody) continue;

      // 4. Classify the reply
      const classification = await classifyReply(
        email.subject,
        email.body.slice(0, 500),
        replyBody
      );

      // 5. Update the email record with reply data
      const { error: updateError } = await admin
        .from("hv_emails")
        .update({
          reply_body: replyBody,
          replied_at: new Date().toISOString(),
          reply_classification: classification.classification,
          reply_sentiment: classification.sentiment,
          updated_at: new Date().toISOString(),
        })
        .eq("id", email.id);

      if (updateError) {
        console.error(`[gmail-sync] Failed to update email ${email.id}:`, updateError.message);
        errors++;
        continue;
      }

      // 6. If contact has active enrollment, update enrollment status to 'replied'
      if (email.sequence_id) {
        await admin
          .from("hv_enrollments")
          .update({
            status: "replied",
            completed_at: new Date().toISOString(),
          })
          .eq("kinetiks_id", accountId)
          .eq("contact_id", email.contact_id)
          .eq("sequence_id", email.sequence_id)
          .eq("status", "active");
      }

      // 7. Log activity
      const { error: activityError } = await admin
        .from("hv_activities")
        .insert({
          kinetiks_id: accountId,
          contact_id: email.contact_id,
          type: "email_reply_received",
          content: {
            email_id: email.id,
            classification: classification.classification,
            sentiment: classification.sentiment,
            summary: classification.summary,
          },
        });

      if (activityError) {
        console.error("[gmail-sync] Failed to log activity:", activityError.message);
      }

      synced++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[gmail-sync] Error processing email ${email.id}:`, message);
      errors++;
    }
  }

  return { synced, errors };
}

/**
 * Search Gmail for a reply to a specific message using In-Reply-To header matching.
 * Returns the reply body text if found, null otherwise.
 */
async function findGmailReply(
  accessToken: string,
  messageId: string
): Promise<string | null> {
  // Search for messages with matching In-Reply-To or References header
  const query = encodeURIComponent(`rfc822msgid:${messageId} OR in_reply_to:${messageId}`);
  const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=5`;

  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchResponse.ok) {
    if (searchResponse.status === 401) {
      console.error("[gmail-sync] Gmail token expired or invalid");
    } else {
      console.error(`[gmail-sync] Gmail search failed: ${searchResponse.status}`);
    }
    return null;
  }

  // Assertion: Gmail API messages.list response shape per Google REST API docs
  const searchData = (await searchResponse.json()) as {
    messages?: GmailMessage[];
    resultSizeEstimate?: number;
  };

  if (!searchData.messages || searchData.messages.length === 0) {
    return null;
  }

  // Get the first reply message (most recent)
  const replyMessage = searchData.messages[0];
  const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${replyMessage.id}?format=full`;

  const detailResponse = await fetch(detailUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!detailResponse.ok) {
    console.error(`[gmail-sync] Gmail message detail failed: ${detailResponse.status}`);
    return null;
  }

  // Assertion: Gmail API messages.get response shape per Google REST API docs (format=full)
  const detail = (await detailResponse.json()) as GmailMessageDetail;

  // Extract body from the message
  return extractBodyFromGmailMessage(detail);
}

/**
 * Extract the text body from a Gmail message detail response.
 * Handles both simple and multipart MIME messages.
 */
function extractBodyFromGmailMessage(message: GmailMessageDetail): string | null {
  // Try to get text/plain from parts first
  if (message.payload.parts) {
    for (const part of message.payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fallback to text/html if no plain text
    for (const part of message.payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return stripHtml(decodeBase64Url(part.body.data));
      }
    }
  }

  // Simple message (no parts)
  if (message.payload.body?.data) {
    return decodeBase64Url(message.payload.body.data);
  }

  // Fallback to snippet
  if (message.snippet) {
    return message.snippet;
  }

  return null;
}

/**
 * Decode a base64url-encoded string (Gmail API format).
 */
function decodeBase64Url(encoded: string): string {
  // Replace URL-safe characters with standard base64
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Strip HTML tags to get plain text. Basic implementation
 * sufficient for extracting readable reply content.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
