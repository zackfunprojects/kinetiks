import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { captureException } from "@/lib/observability/sentry";

/**
 * B3 — first-run greeting context. Reads the org layer's company name
 * (Cartographer-confirmed onboarding data; `kinetiks_context_org`
 * follows the canonical `data` jsonb shape) so the empty chat state can
 * greet around the customer's actual business instead of a generic
 * line. Returns null when the layer is empty or unreadable; the
 * greeting then falls back to the generic copy, and the failure is
 * captured for operational visibility (side-panel query rule).
 */
export async function loadGreetingCompanyName(
  admin: SupabaseClient,
  accountId: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("kinetiks_context_org")
      .select("data")
      .eq("account_id", accountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const layer = (data as { data?: Record<string, unknown> } | null)?.data;
    const name = layer?.company_name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch (err) {
    void captureException(err, {
      tags: { route: "marcus_greeting", action: "greeting.company_name", stage: "select", app: "id" },
      user: { id: accountId },
      extra: {},
    });
    return null;
  }
}
