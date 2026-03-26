/**
 * AI-powered contact pairing using Claude.
 * Transplanted from Bloomify utils/claude.js selectPairWithClaude,
 * converted to TypeScript. Uses @kinetiks/ai instead of proxy.
 */

import { askClaude } from "@kinetiks/ai";
import type { ContactCandidate, PairResult, PairedContact, PairingConfig } from "./types";

const SYSTEM_PROMPT = `You are a B2B sales outreach expert. Your job is to select the best TWO contacts at a target company for a cold email pair.

You will receive:
- WHO is sending the email (the sender's name, title, company, and product)
- Their IDEAL CUSTOMER PROFILE (target industry, company size, geography)
- Their PAIRING PREFERENCES (preferred titles and seniority for To vs CC)
- The TARGET COMPANY details
- ALL CANDIDATE CONTACTS found at that company

ALWAYS select exactly TWO different contacts:
1. PRIMARY (To): The person most likely to engage with this outreach. Consider title relevance to the product, seniority level, and whether they would be a decision-maker or champion for this type of product.
2. SECONDARY (CC): The next-best person to CC. Their presence adds urgency, social proof, or a second angle into the account. Pick the person who complements the primary - ideally more senior, in a related function, or an adjacent decision-maker.

Rules:
- CRITICAL: You MUST always select both a primary AND a secondary contact. Never omit the secondary. Even if no candidate is a perfect ICP match, pick the two CLOSEST fits from whoever is available.
- Primary should match the sender's preferred primary title keywords and seniority when possible, but use judgment - a slightly off-title person who is clearly more relevant is better than an exact keyword match who is not.
- CC should typically be more senior than primary (e.g., if primary is a Director, CC might be a VP or C-suite), but any second contact is better than no second contact.
- Consider the product being sold: if someone sells marketing automation, a VP of Marketing is better than a VP of Engineering.
- CRITICAL: Always select from the provided candidates. Never invent contacts. Use the exact index numbers from the candidate list.
- The two selected contacts MUST have different indices.

Respond with ONLY valid JSON:
{
  "primary_index": <number>,
  "primary_reason": "<string>",
  "secondary_index": <number>,
  "secondary_reason": "<string>",
  "reasoning": "<string>"
}`;

interface SenderProfile {
  name: string;
  title: string;
  company: string;
  product: string;
}

interface IcpConfig {
  icp_industry?: string;
  icp_company_size_min?: number;
  icp_company_size_max?: number;
  icp_geography?: string;
}

interface TargetCompany {
  name: string;
  website?: string;
  industry?: string;
  size?: number | null;
  location?: string;
  description?: string;
}

interface AiPairingParams {
  sender: SenderProfile;
  icp: IcpConfig;
  pairingConfig: PairingConfig;
  targetCompany: TargetCompany;
  candidates: ContactCandidate[];
  excludeNames?: string[];
}

function buildUserMessage(params: AiPairingParams): string {
  const { sender, icp, pairingConfig: pc, targetCompany: co, candidates } = params;

  const lines: string[] = [];

  lines.push("## About the Sender");
  lines.push(`Name: ${sender.name || "Unknown"}`);
  lines.push(`Title: ${sender.title || "Unknown"}`);
  lines.push(`Company: ${sender.company || "Unknown"}`);
  lines.push(`Product: ${sender.product || "Not specified"}`);
  lines.push("");

  lines.push("## Ideal Customer Profile");
  lines.push(`Target Industry: ${icp.icp_industry || "Any"}`);
  if (icp.icp_company_size_min || icp.icp_company_size_max) {
    lines.push(`Company Size: ${icp.icp_company_size_min || "?"}-${icp.icp_company_size_max || "?"} employees`);
  }
  lines.push(`Geography: ${icp.icp_geography || "Any"}`);
  lines.push("");

  lines.push("## Pairing Preferences");
  lines.push(`Primary (To) Title Keywords: ${(pc.primary_title_keywords || []).join(", ") || "None specified"}`);
  lines.push(`Primary Seniority Preference: ${pc.primary_seniority || "director"}`);
  lines.push(`Secondary (CC) Title Keywords: ${(pc.secondary_title_keywords || []).join(", ") || "None specified"}`);
  lines.push(`Secondary Seniority Preference: ${pc.secondary_seniority || "c-suite"}`);
  lines.push("");

  lines.push("## Target Company");
  lines.push(`Name: ${co.name}`);
  if (co.website) lines.push(`Website: ${co.website}`);
  if (co.industry) lines.push(`Industry: ${co.industry}`);
  if (co.size) lines.push(`Size: ~${co.size} employees`);
  if (co.location) lines.push(`Location: ${co.location}`);
  if (co.description) lines.push(`Description: ${co.description}`);
  lines.push("");

  lines.push("## Candidate Contacts");
  lines.push("Select from these candidates by their index number:");
  lines.push("");

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const parts = [`[${i}] ${c.name || "Unknown"}`];
    if (c.title) parts.push(`Title: ${c.title}`);
    if (c.seniority) parts.push(`Seniority: ${c.seniority}`);
    if (c.hasWorkEmail) parts.push("Has work email: yes");
    if (c.linkedinUrl) parts.push("Has LinkedIn: yes");
    lines.push(parts.join(" | "));
  }

  return lines.join("\n");
}

function enrichContact(contact: ContactCandidate, reason: string): PairedContact {
  return {
    name: contact.name || "",
    firstName: contact.firstName || "",
    lastName: contact.lastName || "",
    title: contact.title || "",
    email: contact.email || "",
    linkedinUrl: contact.linkedinUrl || "",
    reason,
  };
}

/**
 * AI-powered contact pairing using Claude Haiku.
 * Falls back gracefully - caller should catch errors and use deterministic pairing.
 */
export async function selectPairWithClaude(params: AiPairingParams): Promise<PairResult> {
  let { candidates } = params;

  // Filter excluded names
  if (params.excludeNames && params.excludeNames.length > 0) {
    const excludeSet = new Set(params.excludeNames.map((n) => n.toLowerCase().trim()));
    candidates = candidates.filter((c) => !excludeSet.has((c.name || "").toLowerCase().trim()));
  }

  if (!candidates || candidates.length === 0) {
    return { primary: null, secondary: null, status: "none_found", reasoning: "", allCandidates: [] };
  }

  // Single candidate - can't make a pair
  if (candidates.length === 1) {
    return {
      primary: enrichContact(candidates[0], "Only contact found at this company."),
      secondary: null,
      status: "primary_only",
      reasoning: "Only one contact was found at this company.",
      allCandidates: candidates,
    };
  }

  const userMessage = buildUserMessage({ ...params, candidates });

  const response = await askClaude(userMessage, {
    system: SYSTEM_PROMPT,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 1024,
  });

  const result = JSON.parse(response) as {
    primary_index: number;
    primary_reason: string;
    secondary_index: number;
    secondary_reason: string;
    reasoning: string;
  };

  // Validate indices
  const primaryIdx = result.primary_index;
  if (typeof primaryIdx !== "number" || primaryIdx < 0 || primaryIdx >= candidates.length) {
    throw new Error(`Claude returned invalid primary index: ${primaryIdx}`);
  }

  const primaryContact = candidates[primaryIdx];

  // Validate secondary index - throw on invalid so deterministic fallback runs
  if (result.secondary_index == null) {
    throw new Error("Claude did not return a secondary_index");
  }
  if (
    typeof result.secondary_index !== "number" ||
    result.secondary_index < 0 ||
    result.secondary_index >= candidates.length
  ) {
    throw new Error(`Claude returned invalid secondary index: ${result.secondary_index}`);
  }
  if (result.secondary_index === primaryIdx) {
    throw new Error(`Claude returned secondary index equal to primary: ${primaryIdx}`);
  }

  const secondaryContact = candidates[result.secondary_index];

  const status: PairResult["status"] =
    primaryContact && secondaryContact ? "pair_found" : primaryContact ? "primary_only" : "none_found";

  return {
    primary: primaryContact ? enrichContact(primaryContact, result.primary_reason) : null,
    secondary: secondaryContact ? enrichContact(secondaryContact, result.secondary_reason) : null,
    status,
    reasoning: result.reasoning || "",
    allCandidates: candidates,
  };
}
