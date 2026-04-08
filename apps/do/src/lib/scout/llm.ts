/**
 * Scout v2 LLM helpers — answer-gap detection (build-plan §4.3) and
 * suggested-angle generation (build-plan §4.6).
 *
 * Reuses the Phase 3 Lens LLM client (`getLensLLM()`), which is a
 * feature-detected Anthropic Haiku wrapper. If `ANTHROPIC_API_KEY` is
 * unset OR any call fails, both helpers return null and Scout falls
 * back to computational scoring only — same "LLM failures degrade
 * silently" contract as Lens.
 *
 * The hard constraint: `generateSuggestedAngle` MUST return a one-line
 * angle, NOT a draft reply. The Operator Profile + thread context go
 * in, a single sentence comes out. Anything that looks like a draft
 * is rejected at parse time. CLAUDE.md §"Human-Only Publishing" — no
 * code path may produce reply text on the user's behalf.
 */
import "server-only";
import { getLensLLM } from "@/lib/lens/llm";
import type { ThreadSnapshot } from "@kinetiks/deskof";

interface ExpertiseHit {
  topic: string;
  tier: "core_authority" | "credible_adjacency" | "genuine_curiosity";
}

export interface AnswerGapResult {
  /** 0-1 — bigger means more room to add value */
  score: number;
  /** Short phrase describing the gap (used by suggested-angle and UI) */
  gap_description: string;
}

/**
 * Estimate how much room there is for the operator to add a
 * substantively new perspective. The LLM is given the thread title,
 * body, and a coarse sense of the operator's expertise; it returns a
 * 0-1 score and a short gap phrase.
 *
 * Returns null if the LLM client is unavailable or the call fails —
 * Scout treats null as "no signal" (answer_gap_score=0) rather than
 * filtering or surfacing.
 */
export async function analyzeAnswerGap(
  thread: ThreadSnapshot,
  expertise: ExpertiseHit
): Promise<AnswerGapResult | null> {
  const llm = getLensLLM();
  if (!llm) return null;

  try {
    const raw = await llm.complete({
      system: `You evaluate whether a community thread has an unfilled answer gap that a specific operator could uniquely address.
Return ONLY a JSON object: {"score": number 0-1, "gap_description": "short phrase under 12 words"}.
0 = the discussion is complete and adds no value. 1 = there's a clear missing perspective only this operator can fill.`,
      user: buildAnswerGapPayload(thread, expertise),
      maxTokens: 200,
    });
    return parseAnswerGap(raw);
  } catch {
    return null;
  }
}

function buildAnswerGapPayload(thread: ThreadSnapshot, expertise: ExpertiseHit): string {
  return `OPERATOR EXPERTISE: ${expertise.topic} (${expertise.tier})

THREAD COMMUNITY: ${thread.community}
THREAD TITLE: ${thread.title}
THREAD BODY: ${(thread.body ?? "").slice(0, 1500)}
EXISTING REPLIES: ${thread.existing_reply_count ?? thread.comment_count}`;
}

function parseAnswerGap(raw: string): AnswerGapResult | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  let obj: { score?: unknown; gap_description?: unknown };
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof obj.score !== "number" || Number.isNaN(obj.score)) return null;
  if (typeof obj.gap_description !== "string") return null;
  return {
    score: Math.max(0, Math.min(1, obj.score)),
    gap_description: obj.gap_description.slice(0, 200),
  };
}

/**
 * Generate a one-line suggested angle from the thread + operator
 * expertise + (optional) answer gap. Hard constraints:
 *
 *   - One sentence. < 30 words. Returned as a plain string.
 *   - NEVER a draft reply. The Operator Profile goes in, an angle
 *     comes out — not paragraphs of text.
 *   - Returns null if the LLM is unavailable, the call fails, or
 *     the parsed output looks like a draft (>30 words OR newlines).
 *
 * The angle is what shows up under the OpportunityCard's
 * "Suggested angle" header (Standard+; free tier sees a locked
 * teaser).
 */
export async function generateSuggestedAngle(
  thread: ThreadSnapshot,
  expertise: ExpertiseHit,
  gap?: AnswerGapResult | null
): Promise<string | null> {
  const llm = getLensLLM();
  if (!llm) return null;

  try {
    const raw = await llm.complete({
      system: `You suggest a one-line angle for a community reply. NEVER write the reply itself.
Return ONLY a JSON object: {"angle": "single sentence under 30 words"}.
The angle should be specific to this thread and lean on the operator's expertise. It is NOT the reply — it's a hint for the human writer.`,
      user: buildAnglePayload(thread, expertise, gap),
      maxTokens: 150,
    });
    return parseAngle(raw);
  } catch {
    return null;
  }
}

function buildAnglePayload(
  thread: ThreadSnapshot,
  expertise: ExpertiseHit,
  gap?: AnswerGapResult | null
): string {
  const gapLine = gap?.gap_description
    ? `\nIDENTIFIED GAP: ${gap.gap_description}`
    : "";
  return `OPERATOR EXPERTISE: ${expertise.topic} (${expertise.tier})

THREAD COMMUNITY: ${thread.community}
THREAD TITLE: ${thread.title}
THREAD BODY: ${(thread.body ?? "").slice(0, 800)}${gapLine}`;
}

function parseAngle(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  let obj: { angle?: unknown };
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof obj.angle !== "string") return null;
  const angle = obj.angle.trim();
  if (!angle) return null;
  // Hard guard: an angle is a single line, < 30 words. Anything
  // longer is rejected — the LLM tried to draft a reply.
  if (angle.includes("\n")) return null;
  if (angle.split(/\s+/).length > 30) return null;
  return angle;
}
