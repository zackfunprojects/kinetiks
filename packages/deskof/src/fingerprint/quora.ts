/**
 * Quora answer fingerprint matching (Quality Addendum #1, Layer 1).
 *
 * When a user posts a reply to Quora via browser handoff, DeskOf has the
 * text the user wrote in our editor but no programmatic way to know which
 * answer on the Quora question page is theirs. This module fingerprints
 * the user's text and computes similarity against scraped answers so
 * Pulse can find the user's answer reliably even if they made small
 * edits while pasting.
 *
 * Thresholds (per spec):
 *   ≥ 0.75 → auto-match
 *   0.50–0.75 → ambiguous, surface candidates to user
 *   < 0.50  → no match, fall to URL fallback (Layer 2)
 */

export interface FingerprintMatch {
  similarity: number;
  status: "matched" | "ambiguous" | "unmatched";
}

const AUTO_MATCH_THRESHOLD = 0.75;
const AMBIGUOUS_THRESHOLD = 0.5;

/**
 * Normalize text for comparison: strip whitespace variants, normalize
 * smart quotes and dashes, lowercase, remove Quora-specific formatting
 * artifacts. Used both at write time (to compute the stored fingerprint
 * hash) and at match time (to normalize scraped Quora answers).
 */
export function normalizeForFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Levenshtein-distance-based similarity normalized by length, returning
 * a 0-1 score. 1.0 = identical after normalization. Uses two-row dynamic
 * programming so memory is O(min(a, b)) instead of O(a * b).
 */
export function similarity(a: string, b: string): number {
  const A = normalizeForFingerprint(a);
  const B = normalizeForFingerprint(b);

  if (A === B) return 1;
  if (A.length === 0 || B.length === 0) return 0;

  // Always iterate over the shorter string to keep memory bounded
  const [shorter, longer] = A.length <= B.length ? [A, B] : [B, A];
  const distance = levenshtein(shorter, longer);
  return 1 - distance / longer.length;
}

/**
 * Find the best matching answer from a list of scraped Quora answer
 * texts. Returns the best similarity score, the index of the best
 * candidate, and a status classification.
 */
export function findBestMatch(
  ourText: string,
  candidates: string[]
): { index: number; match: FingerprintMatch } {
  if (candidates.length === 0) {
    return { index: -1, match: { similarity: 0, status: "unmatched" } };
  }

  let bestIdx = -1;
  let bestSim = 0;

  for (let i = 0; i < candidates.length; i++) {
    const sim = similarity(ourText, candidates[i]);
    if (sim > bestSim) {
      bestSim = sim;
      bestIdx = i;
    }
  }

  return {
    index: bestIdx,
    match: { similarity: bestSim, status: classifySimilarity(bestSim) },
  };
}

export function classifySimilarity(
  sim: number
): FingerprintMatch["status"] {
  if (sim >= AUTO_MATCH_THRESHOLD) return "matched";
  if (sim >= AMBIGUOUS_THRESHOLD) return "ambiguous";
  return "unmatched";
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);

  for (let i = 0; i <= m; i++) prev[i] = i;

  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    for (let i = 1; i <= m; i++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1, // insertion
        prev[i] + 1, // deletion
        prev[i - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[m];
}
