import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";

let sesInstance: SESv2Client | null = null;

/**
 * Get or create an SES v2 client.
 * Configured via standard AWS env vars (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION).
 */
function getSesClient(): SESv2Client {
  if (sesInstance) return sesInstance;

  const region = process.env.AWS_SES_REGION ?? process.env.AWS_REGION ?? "us-east-1";
  sesInstance = new SESv2Client({ region });
  return sesInstance;
}

export interface SesEmailParams {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** Custom headers for tracking (X-Harvest-Email-Id, List-Unsubscribe, etc.) */
  headers?: Record<string, string>;
  /** SES configuration set name for tracking events */
  configurationSetName?: string;
}

export interface SesResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a single email via AWS SES v2.
 * Best for bulk/sequence emails where cost matters at scale.
 */
export async function sendViaSes(params: SesEmailParams): Promise<SesResult> {
  try {
    const client = getSesClient();

    const input: SendEmailCommandInput = {
      FromEmailAddress: params.from,
      Destination: {
        ToAddresses: [params.to],
        CcAddresses: params.cc ? [params.cc] : undefined,
      },
      Content: {
        Simple: {
          Subject: { Data: params.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: params.html, Charset: "UTF-8" },
          },
          Headers: params.headers
            ? Object.entries(params.headers).map(([name, value]) => ({
                Name: name,
                Value: value,
              }))
            : undefined,
        },
      },
      ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
      ConfigurationSetName:
        params.configurationSetName ?? process.env.AWS_SES_CONFIG_SET ?? undefined,
    };

    const command = new SendEmailCommand(input);
    const response = await client.send(command);

    return {
      success: true,
      messageId: response.MessageId,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown SES error";
    console.error("[SES] Send failed:", message);
    return { success: false, error: message };
  }
}

/**
 * Send a batch of emails via SES.
 * SES doesn't have a native batch API - sends sequentially with rate limiting.
 */
export async function sendBatchViaSes(
  emails: SesEmailParams[],
  ratePerSecond: number = 10,
): Promise<SesResult[]> {
  const results: SesResult[] = [];
  const delayMs = Math.ceil(1000 / ratePerSecond);

  for (const email of emails) {
    const result = await sendViaSes(email);
    results.push(result);

    // Rate limit to avoid SES throttling
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
