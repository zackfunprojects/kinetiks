import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AvailabilityResolvers } from "@kinetiks/tools";

/**
 * Platform availability resolvers for the apps/id Tool Registry.
 *
 *  - connection_required(provider): checks kinetiks_connections for an
 *    active row for the given provider on the account.
 *  - plan_required(min_plan): checks the account's plan against the
 *    declared minimum. Billing is incomplete (B1); for now everyone is
 *    treated as "free" unless an explicit plan column is set.
 */
export const platformAvailabilityResolvers: AvailabilityResolvers = {
  async connection_required(ctx, provider) {
    const supabase = createAdminClient();
    // Latest non-revoked row. A disconnect→reconnect cycle leaves a
    // revoked row beside the live one, so a bare maybeSingle() on
    // (account_id, provider) errors with "multiple rows" and the tool
    // silently vanishes from the manifest. Filter + order + limit
    // keeps the read single-row by construction. (D1)
    const { data, error } = await supabase
      .from("kinetiks_connections")
      .select("status")
      .eq("account_id", ctx.accountId)
      .eq("provider", provider)
      .neq("status", "revoked")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[availability] connection lookup failed", {
        provider,
        code: error.code,
      });
      return false;
    }
    return data?.status === "active";
  },

  async plan_required(_ctx, min_plan) {
    // TODO(B1): wire to kinetiks_accounts plan tier. For now allow only
    // the "free" tier check — everything above is unavailable until
    // billing lands. Tools that require standard or hero are gated.
    return min_plan === "free";
  },
};
