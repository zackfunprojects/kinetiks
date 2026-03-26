import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrichDomain } from "@/lib/scout/enrichment";
import { pullHarvestContext } from "@/lib/synapse/client";

/**
 * POST /api/hv/scout/enrich
 *
 * Enrich a domain: company data + contacts via PDL/Hunter waterfall.
 * Saves results to hv_organizations and hv_contacts.
 *
 * Body: { domain: string, title_keywords?: string[] }
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, {
    permissions: "read-write",
  });
  if (error) return error;

  let body: { domain: string; title_keywords?: string[] };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const { domain, title_keywords } = body;

  if (!domain || typeof domain !== "string") {
    return apiError("Missing or invalid domain", 400);
  }

  // Clean domain
  const cleanDomain = domain
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];

  // Merge title preferences from Kinetiks ID customers layer
  let mergedTitleKeywords = title_keywords || [];
  try {
    const ctx = await pullHarvestContext(auth.account_id, ["customers"]);
    const customersData = ctx?.layers.customers?.data as Record<string, unknown> | undefined;
    if (customersData && Array.isArray(customersData.personas)) {
      const personaTitles: string[] = [];
      for (const p of customersData.personas as Array<Record<string, unknown>>) {
        if (typeof p.role === "string" && p.role) personaTitles.push(p.role);
      }
      if (personaTitles.length > 0 && mergedTitleKeywords.length === 0) {
        // Only use persona titles as defaults if no explicit keywords provided
        mergedTitleKeywords = personaTitles;
      }
    }
  } catch {
    // Non-fatal - enrichment works without persona context
  }

  try {
    const result = await enrichDomain(cleanDomain, mergedTitleKeywords);
    const admin = createAdminClient();

    // Save organization
    let orgId: string | null = null;
    if (result.company) {
      const { data: org, error: orgError } = await admin
        .from("hv_organizations")
        .upsert(
          {
            kinetiks_id: auth.account_id,
            name: result.company.name,
            domain: cleanDomain,
            industry: result.company.industry || null,
            employee_count_range: result.company.size ? String(result.company.size) : null,
            enrichment_data: result.company,
            enrichment_sources: result.sources,
            last_enriched_at: new Date().toISOString(),
          },
          { onConflict: "kinetiks_id,domain", ignoreDuplicates: false }
        )
        .select("id")
        .single();

      if (orgError) {
        // May fail on upsert if no unique constraint on (kinetiks_id, domain) yet
        // Fall back to insert
        const { data: inserted } = await admin
          .from("hv_organizations")
          .insert({
            kinetiks_id: auth.account_id,
            name: result.company.name,
            domain: cleanDomain,
            industry: result.company.industry || null,
            employee_count_range: result.company.size ? String(result.company.size) : null,
            enrichment_data: result.company,
            enrichment_sources: result.sources,
            last_enriched_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        orgId = inserted?.id as string ?? null;
      } else {
        orgId = org?.id as string ?? null;
      }
    }

    // Save contacts
    const savedContacts: Array<{ id: string; name: string; email: string }> = [];
    for (const contact of result.contacts) {
      const { data: saved } = await admin
        .from("hv_contacts")
        .insert({
          kinetiks_id: auth.account_id,
          org_id: orgId,
          first_name: contact.firstName || null,
          last_name: contact.lastName || null,
          email: contact.email || null,
          linkedin_url: contact.linkedinUrl || null,
          title: contact.title || null,
          seniority: contact.seniority || null,
          source: contact.source,
          verification_grade: contact.email ? "unverified" : null,
          enrichment_data: contact,
          enrichment_sources: [contact.source],
          last_enriched_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (saved) {
        savedContacts.push({
          id: saved.id as string,
          name: contact.name,
          email: contact.email,
        });
      }
    }

    return apiSuccess({
      company: result.company,
      contacts_found: result.contacts.length,
      contacts_saved: savedContacts.length,
      contacts: savedContacts,
      sources: result.sources,
      org_id: orgId,
    });
  } catch (err) {
    console.error("Enrichment failed:", err);
    return apiError(
      `Enrichment failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      500
    );
  }
}
