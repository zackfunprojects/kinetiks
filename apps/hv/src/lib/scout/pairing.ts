/**
 * Contact pairing engine.
 * Transplanted from Bloomify utils/pairing.js, converted to TypeScript.
 * Scores people against primary/secondary target configs and selects To/CC pair.
 * This is the deterministic fallback - used when AI pairing fails.
 */

import type { ContactCandidate, ScoredCandidate, PairResult, PairingConfig, PairedContact } from "./types";

const SENIORITY_HIERARCHY = ["cxo", "vp", "director", "manager", "senior", "entry", "training"];

const SENIORITY_MAP: Record<string, string> = {
  "c-suite": "cxo",
  cxo: "cxo",
  vp: "vp",
  director: "director",
  manager: "manager",
  senior: "senior",
  ic: "entry",
  entry: "entry",
  training: "training",
};

function seniorityIndex(level: string): number {
  const mapped = SENIORITY_MAP[(level || "").toLowerCase()] || (level || "").toLowerCase();
  const idx = SENIORITY_HIERARCHY.indexOf(mapped);
  return idx >= 0 ? idx : SENIORITY_HIERARCHY.length;
}

export function guessSeniority(title: string): string {
  const t = (title || "").toLowerCase();
  if (/\b(ceo|cto|cfo|coo|cmo|cro|chief|founder|co-founder)\b/.test(t)) return "cxo";
  if (/\b(vp|vice president)\b/.test(t)) return "vp";
  if (/\b(director|head of)\b/.test(t)) return "director";
  if (/\b(manager|lead)\b/.test(t)) return "manager";
  if (/\b(senior|sr\.?|staff|principal)\b/.test(t)) return "senior";
  if (/\b(intern|trainee|junior|jr\.?)\b/.test(t)) return "training";
  return "entry";
}

interface ScoringConfig {
  title_keywords: string[];
  seniority: string;
}

function scorePerson(person: ContactCandidate, config: ScoringConfig): number {
  let score = 0;
  const title = (person.title || "").toLowerCase();
  const keywords = (config.title_keywords || []).map((k) => k.toLowerCase());

  // Title keyword matching
  for (const kw of keywords) {
    if (title.includes(kw)) {
      score += title === kw ? 10 : 5;
    }
  }

  // Seniority matching
  const targetIdx = seniorityIndex(config.seniority);
  const personSeniority = guessSeniority(title);
  const personIdx = seniorityIndex(personSeniority);
  const diff = Math.abs(targetIdx - personIdx);
  if (diff === 0) score += 5;
  else if (diff === 1) score += 3;
  else if (diff === 2) score += 1;

  // Email bonus
  if (person.email || person.hasWorkEmail) score += 2;

  return score;
}

function cleanContact(c: ContactCandidate): PairedContact {
  return {
    name: c.name,
    firstName: c.firstName || "",
    lastName: c.lastName || "",
    title: c.title,
    email: c.email,
    linkedinUrl: c.linkedinUrl,
  };
}

/**
 * Deterministic contact pairing.
 * Scores all candidates against primary/secondary configs and selects the best pair.
 */
export function selectPair(people: ContactCandidate[], pairingConfig: PairingConfig): PairResult {
  if (!people || people.length === 0) {
    return { primary: null, secondary: null, status: "none_found", allCandidates: [] };
  }

  const primaryConfig: ScoringConfig = {
    title_keywords: pairingConfig.primary_title_keywords || [],
    seniority: pairingConfig.primary_seniority || "director",
  };
  const secondaryConfig: ScoringConfig = {
    title_keywords: pairingConfig.secondary_title_keywords || [],
    seniority: pairingConfig.secondary_seniority || "c-suite",
  };

  // Score everyone against both configs
  const scored: ScoredCandidate[] = people.map((p) => ({
    ...p,
    primaryScore: scorePerson(p, primaryConfig),
    secondaryScore: scorePerson(p, secondaryConfig),
  }));

  const byPrimary = [...scored].sort((a, b) => b.primaryScore - a.primaryScore);
  const bySecondary = [...scored].sort((a, b) => b.secondaryScore - a.secondaryScore);

  let primary: ScoredCandidate | null =
    byPrimary[0] && byPrimary[0].primaryScore > 0 ? byPrimary[0] : null;
  let secondary: ScoredCandidate | null = null;

  // Find best secondary that is a different person
  for (const candidate of bySecondary) {
    if (candidate.secondaryScore > 0 && (!primary || candidate.email !== primary.email)) {
      secondary = candidate;
      break;
    }
  }

  // Fallback: if no primary found and fallback says use next best
  if (!primary && pairingConfig.fallback_primary === "next_best" && scored.length > 0) {
    primary = byPrimary[0];
  }

  let status: PairResult["status"];
  if (primary && secondary) status = "pair_found";
  else if (primary && !secondary) status = "primary_only";
  else if (!primary && secondary) status = "secondary_only";
  else status = "none_found";

  return {
    primary: primary ? cleanContact(primary) : null,
    secondary: secondary ? cleanContact(secondary) : null,
    status,
    allCandidates: scored,
  };
}
