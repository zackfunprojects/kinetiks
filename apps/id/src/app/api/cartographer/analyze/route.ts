import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ContextLayer, Proposal } from "@kinetiks/types";
import { evaluateProposal } from "@/lib/cortex/evaluate";
import type { EvaluationResult } from "@/lib/cortex/evaluate";
import { extractBrand } from "@/lib/cartographer/extract-brand";
import { extractOrg } from "@/lib/cartographer/extract-org";
import { extractVoice } from "@/lib/cartographer/extract-voice";
import { extractSocial } from "@/lib/cartographer/extract-social";
import type { ProposalInsert } from "@/lib/cartographer/types";
import { NextResponse } from "next/server";

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
  // Auth - user only
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
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
    return NextResponse.json(
      { error: "Missing or empty 'content' field" },
      { status: 400 }
    );
  }

  if (content_type !== "markdown" && content_type !== "html") {
    return NextResponse.json(
      { error: "content_type must be 'markdown' or 'html'" },
      { status: 400 }
    );
  }

  // Validate extract_layers if provided
  const layers: ContextLayer[] | null = extract_layers
    ? extract_layers.filter((l): l is ContextLayer =>
        VALID_LAYERS.includes(l as ContextLayer)
      )
    : null;

  const admin = createAdminClient();

  // Resolve account
  const { data: account, error: accountError } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (accountError || !account) {
    return NextResponse.json(
      { error: "Kinetiks account not found" },
      { status: 404 }
    );
  }

  const accountId = account.id as string;
  const url = source_url ?? "direct-upload";

  // Determine what to extract based on content type and requested layers
  const shouldExtract = (layer: ContextLayer): boolean => {
    if (!layers) return true; // Extract all if not specified
    return layers.includes(layer);
  };

  const markdown = content_type === "markdown" ? content : "";
  const html = content_type === "html" ? content : "";

  const results: Record<string, unknown> = {};
  const proposals: ProposalInsert[] = [];

  // Run applicable extractors
  if ((shouldExtract("org") || shouldExtract("products")) && markdown) {
    const orgResult = await extractOrg(markdown, url);
    results.org = orgResult;
    if (orgResult.success && orgResult.data) {
      if (orgResult.data.org && Object.keys(orgResult.data.org).length > 1) {
        proposals.push({
          account_id: accountId,
          source_app: "cartographer",
          source_operator: "cartographer_analyze",
          target_layer: "org",
          action: "add",
          confidence: "inferred",
          payload: orgResult.data.org as Record<string, unknown>,
          evidence: [{ type: "url", value: url, context: "Extracted from provided content", date: new Date().toISOString() }],
          expires_at: null,
        });
      }
      if (orgResult.data.products?.products && orgResult.data.products.products.length > 0) {
        proposals.push({
          account_id: accountId,
          source_app: "cartographer",
          source_operator: "cartographer_analyze",
          target_layer: "products",
          action: "add",
          confidence: "inferred",
          payload: orgResult.data.products as unknown as Record<string, unknown>,
          evidence: [{ type: "url", value: url, context: "Extracted from provided content", date: new Date().toISOString() }],
          expires_at: null,
        });
      }
    }
  }

  if (shouldExtract("voice") && markdown) {
    const voiceResult = await extractVoice(markdown, url);
    results.voice = voiceResult;
    if (voiceResult.success && voiceResult.data) {
      proposals.push({
        account_id: accountId,
        source_app: "cartographer",
        source_operator: "cartographer_analyze",
        target_layer: "voice",
        action: "add",
        confidence: "inferred",
        payload: voiceResult.data as Record<string, unknown>,
        evidence: [{ type: "url", value: url, context: "Extracted from provided content", date: new Date().toISOString() }],
        expires_at: null,
      });
    }
  }

  if (shouldExtract("brand") && html) {
    const brandResult = await extractBrand(html, url);
    results.brand = brandResult;
    if (brandResult.success && brandResult.data) {
      proposals.push({
        account_id: accountId,
        source_app: "cartographer",
        source_operator: "cartographer_analyze",
        target_layer: "brand",
        action: "add",
        confidence: "inferred",
        payload: brandResult.data as Record<string, unknown>,
        evidence: [{ type: "url", value: url, context: "Extracted from provided HTML", date: new Date().toISOString() }],
        expires_at: null,
      });
    }
  }

  if (shouldExtract("narrative") && (markdown || html)) {
    const socialResult = await extractSocial(html, markdown, url);
    results.narrative = socialResult;
    if (socialResult.success && socialResult.data?.narrative_hints && Object.keys(socialResult.data.narrative_hints).length > 0) {
      proposals.push({
        account_id: accountId,
        source_app: "cartographer",
        source_operator: "cartographer_analyze",
        target_layer: "narrative",
        action: "add",
        confidence: "inferred",
        payload: socialResult.data.narrative_hints as Record<string, unknown>,
        evidence: [{ type: "url", value: url, context: "Extracted from provided content", date: new Date().toISOString() }],
        expires_at: null,
      });
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

      if (error || !data) continue;

      const fullProposal = data as unknown as Proposal;
      const result = await evaluateProposal(admin, fullProposal);
      submittedIds.push(fullProposal.id);
      evalResults.push(result);
    } catch (err) {
      console.error("Proposal submission failed:", err);
    }
  }

  // Log to ledger
  await admin.from("kinetiks_ledger").insert({
    account_id: accountId,
    event_type: "cartographer_analyze",
    source_app: "cartographer",
    source_operator: "cartographer_analyze",
    detail: {
      source_url: url,
      content_type,
      layers_extracted: Object.keys(results),
      proposals_submitted: submittedIds.length,
    },
  });

  return NextResponse.json({
    extractions: results,
    proposals_submitted: submittedIds,
    evaluation_results: evalResults,
  });
}
