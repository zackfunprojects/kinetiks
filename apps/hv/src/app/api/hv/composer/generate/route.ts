import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { generateEmailDraft } from "@/lib/composer/generate";
import { pullHarvestContext } from "@/lib/synapse/client";
import type { EmailStyleConfig, ResearchBrief } from "@/types/composer";

/**
 * POST /api/hv/composer/generate
 * Generate an email draft for a contact.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: {
    contact_id: string;
    cc_contact_id?: string;
    research_brief: ResearchBrief;
    style: EmailStyleConfig;
  };
  try {
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object") {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as typeof body;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.contact_id) return apiError("contact_id is required", 400);
  if (!body.research_brief) return apiError("research_brief is required", 400);
  if (!body.style) return apiError("style is required", 400);

  const admin = createAdminClient();

  // Fetch contact + org
  const { data: contact, error: contactError } = await admin
    .from("hv_contacts")
    .select("*, organization:hv_organizations!org_id(*)")
    .eq("id", body.contact_id)
    .eq("kinetiks_id", auth.account_id)
    .single();

  if (contactError || !contact) {
    return apiError("Contact not found", 404);
  }

  // Fetch CC contact if specified
  let ccContact = null;
  if (body.cc_contact_id) {
    const { data } = await admin
      .from("hv_contacts")
      .select("*")
      .eq("id", body.cc_contact_id)
      .eq("kinetiks_id", auth.account_id)
      .single();
    ccContact = data;
  }

  // Fetch sender context from Kinetiks ID via Synapse
  let orgData: Record<string, string> = {};
  let productsData: Record<string, unknown> = {};
  let voiceData: Record<string, unknown> = {};
  let customersData: Record<string, unknown> = {};
  let competitiveData: Record<string, unknown> = {};

  const contextResult = await pullHarvestContext(auth.account_id, ["org", "products", "voice", "customers", "narrative", "competitive"]);
  if (contextResult) {
    // Assertions: Layer data shapes are defined by Context Structure JSON schemas (CLAUDE.md)
    orgData = (contextResult.layers.org?.data ?? {}) as Record<string, string>;
    productsData = (contextResult.layers.products?.data ?? {}) as Record<string, unknown>;
    voiceData = (contextResult.layers.voice?.data ?? {}) as Record<string, unknown>;
    customersData = (contextResult.layers.customers?.data ?? {}) as Record<string, unknown>;
    competitiveData = (contextResult.layers.competitive?.data ?? {}) as Record<string, unknown>;
  } else {
    // Fallback: direct DB reads if Synapse pull fails (degraded mode)
    console.warn("[HV Composer] Synapse pull failed, falling back to direct DB reads");
    const [orgResult, productsResult, voiceResult] = await Promise.all([
      admin.from("kinetiks_context_org").select("data").eq("account_id", auth.account_id).single(),
      admin.from("kinetiks_context_products").select("data").eq("account_id", auth.account_id).single(),
      admin.from("kinetiks_context_voice").select("data").eq("account_id", auth.account_id).single(),
    ]);
    // Assertions: DB returns JSONB data column with known schema per migration
    orgData = (orgResult.data?.data as Record<string, string>) ?? {};
    productsData = (productsResult.data?.data as Record<string, unknown>) ?? {};
    voiceData = (voiceResult.data?.data as Record<string, unknown>) ?? {};
  }
  const products = (productsData.products as Array<Record<string, string>>) ?? [];

  try {
    const result = await generateEmailDraft({
      contact,
      org: contact.organization ?? null,
      ccContact,
      brief: body.research_brief,
      style: body.style,
      senderName: orgData.company_name || "",
      senderTitle: "",
      senderCompany: orgData.company_name || "",
      senderProduct: products[0]?.description || products[0]?.name || "",
      voiceLayer: Object.keys(voiceData).length > 0 ? voiceData : undefined,
      productLayer: Object.keys(productsData).length > 0 ? productsData : undefined,
      customersLayer: Object.keys(customersData).length > 0 ? customersData : undefined,
      competitiveLayer: Object.keys(competitiveData).length > 0 ? competitiveData : undefined,
    });

    return apiSuccess(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email generation failed";
    return apiError(message, 500);
  }
}
