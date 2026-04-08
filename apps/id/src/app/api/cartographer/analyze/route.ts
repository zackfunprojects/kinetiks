import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import type { ContextLayer, Proposal } from "@kinetiks/types";
import { evaluateProposal } from "@/lib/cortex";
import type { EvaluationResult } from "@/lib/cortex";
import { extractBrand } from "@/lib/cartographer/extract-brand";
import { extractOrg } from "@/lib/cartographer/extract-org";
import { extractVoice } from "@/lib/cartographer/extract-voice";
import { extractSocial } from "@/lib/cartographer/extract-social";
import { buildProposal } from "@/lib/cartographer/crawl";
import type { ProposalInsert } from "@/lib/cartographer/types";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

const VALID_LAYERS: ContextLayer[] = [
  "org",
  "products",
  "voice",
  "customers",
  "narrative",
  "competitive",
  "market",
  "brand",
];

/** Layers that require markdown content. */
const MARKDOWN_LAYERS: ContextLayer[] = ["org", "products", "voice"];
/** Layers that require HTML content. */
const HTML_LAYERS: ContextLayer[] = ["brand"];
/** Layers that work with either content type. */
const EITHER_LAYERS: ContextLayer[] = ["narrative"];

const OPERATOR = "cartographer_analyze";

/**
 * POST /api/cartographer/analyze
 *
 * Analyze provided content (markdown or HTML) and extract data.
 * Unlike /crawl, this does not use Firecrawl - it runs extractors directly
 * on the provided content.
 *
 * Body: {
 *   content: string,
 *   content_type: "markdown" | "html",
 *   source_url?: string,
 *   extract_layers?: ContextLayer[]
 * }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const {
    content,
    content_type,
    source_url,
    extract_layers,
  } = body as {
    content?: string;
    content_type?: string;
    source_url?: string;
    extract_layers?: string[];
  };

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return apiError("Missing or empty 'content' field", 400);
  }

  if (content_type !== "markdown" && content_type !== "html") {
    return apiError("content_type must be 'markdown' or 'html'", 400);
  }

  // Validate extract_layers if provided
  const layers: ContextLayer[] | null = extract_layers
    ? extract_layers.filter((l): l is ContextLayer =>
        VALID_LAYERS.includes(l as ContextLayer)
      )
    : null;

  const admin = createAdminClient();
  const accountId = auth.account_id;
  const url = source_url ?? "direct-upload";

  // Determine what to extract based on content type and requested layers
  const shouldExtract = (layer: ContextLayer): boolean => {
    if (!layers) return true;
    return layers.includes(layer);
  };

  const markdown = content_type === "markdown" ? content : "";
  const html = content_type === "html" ? content : "";

  // Compute compatibility warnings for requested layers vs content type
  const warnings: string[] = [];
  const requestedLayers = layers ?? VALID_LAYERS;
  for (const layer of requestedLayers) {
    if (MARKDOWN_LAYERS.includes(layer) && !markdown) {
      warnings.push(
        `Layer "${layer}" requires markdown content but content_type is "html" - skipped`
      );
    }
    if (HTML_LAYERS.includes(layer) && !html) {
      warnings.push(
        `Layer "${layer}" requires HTML content but content_type is "markdown" - skipped`
      );
    }
  }

  const results: Record<string, unknown> = {};
  const proposals: ProposalInsert[] = [];

  // Run applicable extractors
  if ((shouldExtract("org") || shouldExtract("products")) && markdown) {
    const orgResult = await extractOrg(markdown, url);
    results.org = orgResult;
    if (orgResult.success && orgResult.data) {
      if (orgResult.data.org && Object.keys(orgResult.data.org).length > 1) {
        proposals.push(
          buildProposal(accountId, "org", orgResult.data.org as Record<string, unknown>, url, OPERATOR)
        );
      }
      if (orgResult.data.products?.products && orgResult.data.products.products.length > 0) {
        proposals.push(
          buildProposal(accountId, "products", orgResult.data.products as unknown as Record<string, unknown>, url, OPERATOR)
        );
      }
    }
  }

  if (shouldExtract("voice") && markdown) {
    const voiceResult = await extractVoice(markdown, url);
    results.voice = voiceResult;
    if (voiceResult.success && voiceResult.data) {
      proposals.push(
        buildProposal(accountId, "voice", voiceResult.data as Record<string, unknown>, url, OPERATOR)
      );
    }
  }

  if (shouldExtract("brand") && html) {
    const brandResult = await extractBrand(html, url);
    results.brand = brandResult;
    if (brandResult.success && brandResult.data) {
      proposals.push(
        buildProposal(accountId, "brand", brandResult.data as Record<string, unknown>, url, OPERATOR)
      );
    }
  }

  if (shouldExtract("narrative") && (markdown || html)) {
    const socialResult = await extractSocial(html, markdown, url);
    results.narrative = socialResult;
    if (socialResult.success && socialResult.data?.narrative_hints && Object.keys(socialResult.data.narrative_hints).length > 0) {
      proposals.push(
        buildProposal(accountId, "narrative", socialResult.data.narrative_hints as Record<string, unknown>, url, OPERATOR)
      );
    }
  }

  // Submit proposals
  const submittedIds: string[] = [];
  const evalResults: EvaluationResult[] = [];

  for (const proposal of proposals) {
    try {
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
        console.error(
          `Failed to insert proposal for layer "${proposal.target_layer}" (account=${accountId}):`,
          error?.message ?? "no data returned"
        );
        continue;
      }

      const fullProposal = data as unknown as Proposal;
      const result = await evaluateProposal(admin, fullProposal);
      submittedIds.push(fullProposal.id);
      evalResults.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `Proposal submission failed for layer "${proposal.target_layer}" (account=${accountId}):`,
        message
      );
    }
  }

  // Log to ledger
  const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: "cartographer_analyze",
    source_app: "cartographer",
    source_operator: OPERATOR,
    detail: {
      source_url: url,
      content_type,
      layers_extracted: Object.keys(results),
      proposals_submitted: submittedIds.length,
    },
  });

  if (ledgerError) {
    console.error(
      `Failed to log analyze event to ledger (account=${accountId}, url=${url}, content_type=${content_type}):`,
      ledgerError.message
    );
  }

  return apiSuccess({
    extractions: results,
    proposals_submitted: submittedIds,
    evaluation_results: evalResults,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}
