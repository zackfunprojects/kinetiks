import { Resend } from "resend";

let resendInstance: Resend | null = null;

/**
 * Get or create a Resend client instance.
 * Uses RESEND_API_KEY env var or a user-provided key from kinetiks_connections.
 */
function getResendClient(apiKey?: string): Resend {
  const key = apiKey ?? process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured");

  if (!apiKey && resendInstance) return resendInstance;

  const client = new Resend(key);
  if (!apiKey) resendInstance = client;
  return client;
}

export interface ResendEmailParams {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
}

export interface ResendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a single email via Resend.
 * Best for transactional/one-off emails from the composer.
 */
export async function sendViaResend(
  params: ResendEmailParams,
  apiKey?: string,
): Promise<ResendResult> {
  try {
    const client = getResendClient(apiKey);
    const result = await client.emails.send({
      from: params.from,
      to: [params.to],
      cc: params.cc ? [params.cc] : undefined,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
      headers: params.headers,
      tags: params.tags,
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true, messageId: result.data?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown Resend error";
    console.error("[Resend] Send failed:", message);
    return { success: false, error: message };
  }
}

/**
 * Send a batch of emails via Resend.
 * Best for sequence steps (up to 100 per batch).
 */
export async function sendBatchViaResend(
  emails: ResendEmailParams[],
  apiKey?: string,
): Promise<ResendResult[]> {
  if (emails.length === 0) return [];
  if (emails.length > 100) {
    throw new Error("Resend batch limit is 100 emails");
  }

  try {
    const client = getResendClient(apiKey);
    const result = await client.batch.send(
      emails.map((e) => ({
        from: e.from,
        to: [e.to],
        cc: e.cc ? [e.cc] : undefined,
        subject: e.subject,
        html: e.html,
        reply_to: e.replyTo,
        headers: e.headers,
        tags: e.tags,
      })),
    );

    if (result.error) {
      return emails.map(() => ({ success: false, error: result.error?.message }));
    }

    // Batch returns array of { id } for each email
    const data = result.data?.data ?? [];
    return data.map((d) => ({
      success: true,
      messageId: d.id,
    }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown Resend batch error";
    console.error("[Resend] Batch send failed:", message);
    return emails.map(() => ({ success: false, error: message }));
  }
}
