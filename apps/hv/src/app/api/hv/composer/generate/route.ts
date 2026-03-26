import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { generateEmailDraft } from "@/lib/composer/generate";
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

  // Fetch sender context from Kinetiks ID
  const [orgResult, productsResult, voiceResult] = await Promise.all([
    admin.from("kinetiks_context_org").select("data").eq("account_id", auth.account_id).single(),
    admin.from("kinetiks_context_products").select("data").eq("account_id", auth.account_id).single(),
    admin.from("kinetiks_context_voice").select("data").eq("account_id", auth.account_id).single(),
  ]);

  const orgData = (orgResult.data?.data as Record<string, string>) ?? {};
  const productsData = (productsResult.data?.data as Record<string, unknown>) ?? {};
  const voiceData = (voiceResult.data?.data as Record<string, unknown>) ?? {};
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
    });

    return apiSuccess(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email generation failed";
    return apiError(message, 500);
  }
}
