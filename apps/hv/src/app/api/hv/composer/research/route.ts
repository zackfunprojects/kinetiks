import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { generateResearchBrief } from "@/lib/composer/research";
import type { ResearchTier } from "@/types/composer";

/**
 * POST /api/hv/composer/research
 * Generate a research brief for a contact.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: { contact_id: string; tier?: ResearchTier };
  try {
    const parsed = await request.json();
    if (parsed === null || typeof parsed !== "object") {
      return apiError("Invalid JSON body", 400);
    }
    body = parsed as typeof body;
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  if (!body.contact_id) {
    return apiError("contact_id is required", 400);
  }

  const tier = body.tier || "brief";
  if (!["none", "brief", "deep"].includes(tier)) {
    return apiError("tier must be none, brief, or deep", 400);
  }

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

  // Fetch sender info from account's Context Structure
  const { data: orgLayer } = await admin
    .from("kinetiks_context_org")
    .select("data")
    .eq("account_id", auth.account_id)
    .single();

  const { data: productsLayer } = await admin
    .from("kinetiks_context_products")
    .select("data")
    .eq("account_id", auth.account_id)
    .single();

  const orgData = (orgLayer?.data as Record<string, string>) ?? {};
  const productsData = (productsLayer?.data as Record<string, unknown>) ?? {};
  const products = (productsData.products as Array<Record<string, string>>) ?? [];

  const brief = await generateResearchBrief({
    contact,
    org: contact.organization ?? null,
    tier,
    senderName: orgData.company_name || "",
    senderCompany: orgData.company_name || "",
    senderProduct: products[0]?.description || products[0]?.name || "",
  });

  if (!brief) {
    return apiError("Failed to generate research brief", 500);
  }

  return apiSuccess({ brief });
}
