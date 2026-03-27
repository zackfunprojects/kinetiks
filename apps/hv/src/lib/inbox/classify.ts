import { askClaude } from "@kinetiks/ai";

export interface ClassifyResult {
  classification:
    | "interested"
    | "not_interested"
    | "ooo"
    | "referral"
    | "bounce"
    | "unclassified";
  sentiment: "positive" | "neutral" | "negative";
  summary: string;
}

const VALID_CLASSIFICATIONS = new Set([
  "interested",
  "not_interested",
  "ooo",
  "referral",
  "bounce",
  "unclassified",
]);

const VALID_SENTIMENTS = new Set(["positive", "neutral", "negative"]);

const SYSTEM_PROMPT = `You are an email reply classifier for a sales outreach platform.
Classify the reply to a cold outreach email. Return ONLY valid JSON with these fields:

- classification: one of "interested", "not_interested", "ooo", "referral", "bounce", "unclassified"
  - interested: prospect wants to learn more, schedule a call, or asks questions about the product
  - not_interested: explicit decline, unsubscribe request, or hostile response
  - ooo: out of office / auto-reply indicating temporary absence
  - referral: prospect redirects to someone else (e.g. "talk to Sarah instead")
  - bounce: delivery failure, invalid address, mailbox full
  - unclassified: cannot determine intent from the reply
- sentiment: one of "positive", "neutral", "negative"
- summary: one-sentence summary of the reply (max 120 chars)

Return ONLY the JSON object. No markdown, no explanation.`;

/**
 * Classify an email reply using Claude Haiku.
 *
 * Takes the original outreach email context and the reply body,
 * returns a structured classification with sentiment and summary.
 */
export async function classifyReply(
  originalSubject: string,
  originalBody: string,
  replyBody: string
): Promise<ClassifyResult> {
  const truncatedOriginal = originalBody.slice(0, 500);

  const prompt = `Original email subject: ${originalSubject}

Original email body (truncated):
${truncatedOriginal}

Reply from prospect:
${replyBody}

Classify this reply.`;

  try {
    const response = await askClaude(prompt, {
      system: SYSTEM_PROMPT,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 256,
    });

    const parsed = parseClassifyResponse(response);
    return parsed;
  } catch (err) {
    console.error("[classify] Failed to classify reply:", err);
    return {
      classification: "unclassified",
      sentiment: "neutral",
      summary: "Classification failed - manual review needed",
    };
  }
}

function parseClassifyResponse(raw: string): ClassifyResult {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const classification =
      typeof parsed.classification === "string" &&
      VALID_CLASSIFICATIONS.has(parsed.classification)
        ? (parsed.classification as ClassifyResult["classification"])
        : "unclassified";

    const sentiment =
      typeof parsed.sentiment === "string" &&
      VALID_SENTIMENTS.has(parsed.sentiment)
        ? (parsed.sentiment as ClassifyResult["sentiment"])
        : "neutral";

    const summary =
      typeof parsed.summary === "string" && parsed.summary.length > 0
        ? parsed.summary.slice(0, 200)
        : "No summary available";

    return { classification, sentiment, summary };
  } catch {
    console.error("[classify] Failed to parse JSON response:", raw);
    return {
      classification: "unclassified",
      sentiment: "neutral",
      summary: "Parse error - manual review needed",
    };
  }
}
