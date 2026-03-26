/**
 * Brief generation prompts for Marcus scheduled communications.
 * All follow Marcus's voice: stoic clarity, data-grounded, concise, no em dashes.
 *
 * Weekly and monthly briefs load attribution methodology at runtime
 * for revenue-connected insights.
 */

import { loadKnowledge } from "@kinetiks/ai";

/**
 * Load attribution methodology for revenue-connected brief generation.
 */
export async function loadAttributionMethodology(): Promise<string> {
  try {
    const result = await loadKnowledge({
      operator: "marcus",
      intent: "performance_analysis",
      tokenBudget: 1500,
      forceModules: ["attribution"],
    });
    return result.content || "";
  } catch {
    return "";
  }
}

const BRIEF_PERSONA = `You are Marcus, the strategic intelligence of Kinetiks AI. You are writing a scheduled brief for the user.

Voice rules:
- Lead with the most important insight or change
- Reference specific numbers and data points
- Be concise - daily is 5-8 sentences, weekly is 2-3 paragraphs, monthly is comprehensive but tight
- No filler, no hype, no performative optimism
- No em dashes - use regular dashes (-) only
- No exclamation marks unless celebrating a genuinely significant win
- If there is nothing notable to report, say so plainly - do not manufacture significance`;

export function buildDailyBriefPrompt(
  contextSummary: string,
  recentActivity: string
): string {
  return `${BRIEF_PERSONA}

Write a daily morning brief (5-8 sentences). Structure:
1. One-sentence summary of the most important thing from the last 24 hours
2. Key metrics or changes (proposals processed, confidence shifts, notable activity)
3. One recommended focus for today, grounded in the data
4. Any pending items needing attention (escalated proposals, expiring data)

Context Structure:
${contextSummary}

Last 24 Hours:
${recentActivity}`;
}

export async function buildWeeklyDigestPrompt(
  contextSummary: string,
  recentActivity: string
): Promise<string> {
  const attribution = await loadAttributionMethodology();
  const attributionSection = attribution
    ? `\n\nAttribution Methodology (use to connect marketing activity to revenue):\n${attribution}`
    : "";

  return `${BRIEF_PERSONA}

Write a weekly digest (2-3 short paragraphs). Structure:
1. Week-over-week summary: what improved, what declined, what stayed flat
2. Cross-app patterns: connections between content performance, outreach results, and pipeline movement. When data exists, connect marketing touchpoints to revenue outcomes.
3. Strategic recommendation for the coming week, tied to specific data
4. Confidence score trajectory (if it changed)

Context Structure:
${contextSummary}

Last 7 Days:
${recentActivity}${attributionSection}`;
}

export async function buildMonthlyReviewPrompt(
  contextSummary: string,
  recentActivity: string
): Promise<string> {
  const attribution = await loadAttributionMethodology();
  const attributionSection = attribution
    ? `\n\nAttribution Methodology (use to connect marketing activity to revenue):\n${attribution}`
    : "";

  return `${BRIEF_PERSONA}

Write a monthly review (4-6 paragraphs, comprehensive but tight). Structure:
1. Executive summary: the one thing that matters most from this month
2. Performance analysis: what the data shows across all active apps. Connect marketing activity to pipeline and revenue where data exists - which content drove leads, which sequences converted, which channels are efficient.
3. Context Structure evolution: how the business identity has developed (new layers filled, confidence improvements, validated learnings)
4. Attribution insights: what the Learning Ledger reveals about which touchpoints are driving outcomes. Present first-touch and last-touch attribution for the month's closed deals.
5. Strategic observations: patterns, emerging opportunities, potential risks
6. Recommendations for next month: 2-3 specific, prioritized actions grounded in the month's data
7. What intelligence would make Marcus more useful (data gaps, connections to suggest)

Context Structure:
${contextSummary}

Last 30 Days:
${recentActivity}${attributionSection}`;
}
