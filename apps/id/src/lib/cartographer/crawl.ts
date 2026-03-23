import Firecrawl from "@mendable/firecrawl-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContextLayer, Proposal } from "@kinetiks/types";
import { evaluateProposal } from "@/lib/cortex/evaluate";
import type { EvaluationResult } from "@/lib/cortex/evaluate";
import { extractBrand } from "./extract-brand";
import { extractOrg } from "./extract-org";
import { extractVoice } from "./extract-voice";
import { extractSocial } from "./extract-social";
import type { CrawlResult, ExtractionResult, ProposalInsert } from "./types";

/**
 * Normalize a URL to ensure it has a protocol.
 */
function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = `https://${normalized}`;
  }
  // Validate by constructing a URL object
  new URL(normalized);
  return normalized;
}

/**
 * Create the Firecrawl client.
 * Note: @mendable/firecrawl-js is listed in serverExternalPackages in next.config.js
 * to avoid webpack bundling issues with its `undici` dependency.
 */
function createFirecrawlClient(): Firecrawl {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("Missing FIRECRAWL_API_KEY environment variable");
  }
  return new Firecrawl({ apiKey });
}

/**
 * Build a Proposal insert record for a given layer extraction.
 */
export function buildProposal(
  accountId: string,
  targetLayer: ContextLayer,
  payload: Record<string, unknown>,
  url: string,
  operator: string = "cartographer_crawl"
): ProposalInsert {
  return {
    account_id: accountId,
    source_app: "cartographer",
    source_operator: operator,
    target_layer: targetLayer,
    action: "add",
    confidence: "inferred",
    payload,
    evidence: [
      {
        type: "url",
        value: url,
        context: `Extracted from ${url}`,
        date: new Date().toISOString(),
      },
    ],
    expires_at: null,
  };
}

/**
 * Insert a proposal into the database and evaluate it through the Cortex pipeline.
 */
async function submitProposal(
  admin: SupabaseClient,
  proposal: ProposalInsert
): Promise<{ proposalId: string; result: EvaluationResult }> {
  const { data, error } = await admin
    .from("kinetiks_proposals")
    .insert({
      ...proposal,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to insert proposal: ${error?.message ?? "no data returned"}`);
  }

  // Runtime validation of required fields before casting
  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.status !== "string") {
    throw new Error(
      `Invalid proposal row returned: missing id or status (got id=${typeof row.id}, status=${typeof row.status})`
    );
  }

  const fullProposal = row as unknown as Proposal;
  const result = await evaluateProposal(admin, fullProposal);
  return { proposalId: fullProposal.id, result };
}

/**
 * Log a crawl event to the Learning Ledger.
 */
async function logCrawlToLedger(
  admin: SupabaseClient,
  accountId: string,
  url: string,
  success: boolean,
  proposalCount: number
): Promise<void> {
  const { error } = await admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: "cartographer_crawl",
    source_app: "cartographer",
    source_operator: "cartographer_crawl",
    detail: {
      url,
      success,
      proposals_submitted: proposalCount,
      crawled_at: new Date().toISOString(),
    },
  });

  if (error) {
    console.error(
      `Failed to log crawl to ledger (account=${accountId}, url=${url}):`,
      error.message
    );
  }
}

/**
 * Extract a settled result value, preserving the source URL on rejection.
 */
function settledValue<T>(
  result: PromiseSettledResult<ExtractionResult<T>>,
  sourceUrl: string
): ExtractionResult<T> {
  if (result.status === "fulfilled") return result.value;
  return {
    success: false,
    data: null,
    error: result.reason instanceof Error ? result.reason.message : "Unknown error",
    source_url: sourceUrl,
  };
}

/**
 * Main orchestrator: crawl a URL and extract data into the Context Structure.
 */
export async function crawlAndExtract(
  admin: SupabaseClient,
  accountId: string,
  url: string
): Promise<CrawlResult> {
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeUrl(url);
  } catch {
    const fallbackUrl = url.trim() || "invalid-url";
    return {
      url: fallbackUrl,
      crawl_success: false,
      extractions: {
        org: { success: false, data: null, error: "invalid_url", source_url: fallbackUrl },
        products: { success: false, data: null, error: "invalid_url", source_url: fallbackUrl },
        voice: { success: false, data: null, error: "invalid_url", source_url: fallbackUrl },
        brand: { success: false, data: null, error: "invalid_url", source_url: fallbackUrl },
        narrative: { success: false, data: null, error: "invalid_url", source_url: fallbackUrl },
        social_links: { success: false, data: null, error: "invalid_url", source_url: fallbackUrl },
      },
      proposals_submitted: [],
      evaluation_results: [],
    };
  }

  const emptyResult = (error: string): CrawlResult => ({
    url: normalizedUrl,
    crawl_success: false,
    extractions: {
      org: { success: false, data: null, error, source_url: normalizedUrl },
      products: { success: false, data: null, error, source_url: normalizedUrl },
      voice: { success: false, data: null, error, source_url: normalizedUrl },
      brand: { success: false, data: null, error, source_url: normalizedUrl },
      narrative: { success: false, data: null, error, source_url: normalizedUrl },
      social_links: { success: false, data: null, error, source_url: normalizedUrl },
    },
    proposals_submitted: [],
    evaluation_results: [],
  });

  // ── Step 1: Crawl with Firecrawl ──
  let markdown: string;
  let html: string;

  try {
    const firecrawl = createFirecrawlClient();
    const scrapeResult = await firecrawl.scrape(normalizedUrl, {
      formats: ["markdown", "html"],
      waitFor: 3000,
    });

    markdown = scrapeResult.markdown ?? "";
    html = scrapeResult.html ?? "";

    if (!markdown && !html) {
      await logCrawlToLedger(admin, accountId, normalizedUrl, false, 0);
      return emptyResult("empty_crawl_result");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Firecrawl scrape failed:", message);
    await logCrawlToLedger(admin, accountId, normalizedUrl, false, 0);
    return emptyResult(`firecrawl_error: ${message}`);
  }

  // ── Step 2: Run extractors in parallel ──
  const [orgSettled, voiceSettled, brandSettled, socialSettled] =
    await Promise.allSettled([
      extractOrg(markdown, normalizedUrl),
      extractVoice(markdown, normalizedUrl),
      extractBrand(html, normalizedUrl),
      extractSocial(html, markdown, normalizedUrl),
    ]);

  const orgResult = settledValue(orgSettled, normalizedUrl);
  const voiceResult = settledValue(voiceSettled, normalizedUrl);
  const brandResult = settledValue(brandSettled, normalizedUrl);
  const socialResult = settledValue(socialSettled, normalizedUrl);

  // ── Step 3: Build and submit Proposals ──
  const proposals: ProposalInsert[] = [];

  // Org layer
  if (orgResult.success && orgResult.data?.org && Object.keys(orgResult.data.org).length > 1) {
    proposals.push(
      buildProposal(accountId, "org", orgResult.data.org as Record<string, unknown>, normalizedUrl)
    );
  }

  // Products layer
  if (
    orgResult.success &&
    orgResult.data?.products?.products &&
    orgResult.data.products.products.length > 0
  ) {
    proposals.push(
      buildProposal(
        accountId,
        "products",
        orgResult.data.products as unknown as Record<string, unknown>,
        normalizedUrl
      )
    );
  }

  // Voice layer
  if (voiceResult.success && voiceResult.data) {
    proposals.push(
      buildProposal(accountId, "voice", voiceResult.data as Record<string, unknown>, normalizedUrl)
    );
  }

  // Brand layer
  if (brandResult.success && brandResult.data) {
    proposals.push(
      buildProposal(accountId, "brand", brandResult.data as Record<string, unknown>, normalizedUrl)
    );
  }

  // Narrative layer (from social extractor)
  if (
    socialResult.success &&
    socialResult.data?.narrative_hints &&
    Object.keys(socialResult.data.narrative_hints).length > 0
  ) {
    proposals.push(
      buildProposal(
        accountId,
        "narrative",
        socialResult.data.narrative_hints as Record<string, unknown>,
        normalizedUrl
      )
    );
  }

  // Submit all proposals in parallel
  const submittedIds: string[] = [];
  const evalResults: EvaluationResult[] = [];

  const settled = await Promise.allSettled(
    proposals.map((p) => submitProposal(admin, p))
  );

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      submittedIds.push(outcome.value.proposalId);
      evalResults.push(outcome.value.result);
    } else {
      const message = outcome.reason instanceof Error ? outcome.reason.message : "Unknown error";
      console.error(`Failed to submit proposal for ${proposals[i].target_layer}:`, message);
    }
  }

  // ── Step 4: Log to Ledger ──
  await logCrawlToLedger(admin, accountId, normalizedUrl, true, submittedIds.length);

  return {
    url: normalizedUrl,
    crawl_success: true,
    extractions: {
      org: orgResult.success && orgResult.data?.org
        ? { success: true, data: orgResult.data.org, error: null, source_url: normalizedUrl }
        : { success: false, data: null, error: orgResult.error, source_url: normalizedUrl },
      products: orgResult.success && orgResult.data?.products
        ? { success: true, data: orgResult.data.products, error: null, source_url: normalizedUrl }
        : { success: false, data: null, error: orgResult.error, source_url: normalizedUrl },
      voice: voiceResult,
      brand: brandResult,
      narrative: socialResult.success && socialResult.data?.narrative_hints
        ? {
            success: Object.keys(socialResult.data.narrative_hints).length > 0,
            data: socialResult.data.narrative_hints,
            error: null,
            source_url: normalizedUrl,
          }
        : { success: false, data: null, error: socialResult.error, source_url: normalizedUrl },
      social_links: socialResult.success && socialResult.data?.social_links
        ? {
            success: Object.keys(socialResult.data.social_links).length > 0,
            data: socialResult.data.social_links,
            error: null,
            source_url: normalizedUrl,
          }
        : { success: false, data: null, error: socialResult.error, source_url: normalizedUrl },
    },
    proposals_submitted: submittedIds,
    evaluation_results: evalResults,
  };
}
