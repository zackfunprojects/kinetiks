import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { pullHarvestContext } from "@/lib/synapse/client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/hv/icp
 * Returns ICP persona data from the Kinetiks ID customers layer.
 * Falls back to direct DB read if Synapse pull fails.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  try {
    // Try Synapse pull first (preferred)
    const ctx = await pullHarvestContext(auth.account_id, ["customers"]);

    if (ctx?.layers?.customers?.data) {
      // Supabase JSONB data - cast with explanation
      // Safe cast: customers layer data follows CustomersData schema from Context Structure spec
      const customersData = ctx.layers.customers.data as Record<string, unknown>;
      const personas = Array.isArray(customersData.personas) ? customersData.personas : [];
      const demographics = customersData.demographics ?? {};

      return apiSuccess({
        personas,
        demographics,
        source: "synapse",
      });
    }

    // Fallback: direct DB read
    const admin = createAdminClient();
    const { data: customersRow } = await admin
      .from("kinetiks_context_customers")
      .select("data")
      .eq("account_id", auth.account_id)
      .single();

    if (customersRow?.data) {
      // Safe cast: DB JSONB follows same schema
      const customersData = customersRow.data as Record<string, unknown>;
      const personas = Array.isArray(customersData.personas) ? customersData.personas : [];
      const demographics = customersData.demographics ?? {};

      return apiSuccess({
        personas,
        demographics,
        source: "direct",
      });
    }

    return apiSuccess({ personas: [], demographics: {}, source: "empty" });
  } catch (err) {
    console.error("[HV ICP] Failed to load ICP data:", err);
    return apiError(
      err instanceof Error ? err.message : "Failed to load ICP data",
      500
    );
  }
}
