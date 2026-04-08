/**
 * Kinetiks ID session resolution for DeskOf.
 *
 * DeskOf does not own its own auth — every user signs in via
 * id.kinetiks.ai and we read the resulting `.kinetiks.ai` cookie.
 * The user's billing tier comes from `kinetiks_billing.plan`.
 *
 * Phase 1 ships session-based auth only. API key + MCP auth lands in
 * Phase 8 alongside the MCP tool surface.
 */
import "server-only";
import { createDeskOfServerClient } from "@/lib/supabase/server";
import type { BillingTier } from "@kinetiks/deskof";

export interface DeskOfSession {
  user_id: string;
  account_id: string;
  email: string | null;
  /** Billing tier read from kinetiks_billing.plan */
  tier: BillingTier;
}

const VALID_TIERS: ReadonlySet<BillingTier> = new Set<BillingTier>([
  "free",
  "standard",
  "hero",
]);

function normalizeTier(plan: string | null | undefined): BillingTier {
  if (!plan) return "free";
  const lowered = plan.toLowerCase();
  if (VALID_TIERS.has(lowered as BillingTier)) {
    return lowered as BillingTier;
  }
  return "free";
}

/**
 * Resolve the current Kinetiks ID session from the shared cookie.
 * Returns null if the user is not signed in or the session is invalid.
 *
 * Safe to call from server components, route handlers, and server
 * actions. Reads cookies via next/headers — never instantiates a
 * service-role client.
 */
export async function getDeskOfSession(): Promise<DeskOfSession | null> {
  const supabase = createDeskOfServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // The user's account_id matches their auth user id in Kinetiks
  const accountId = user.id;

  const { data: billing } = await supabase
    .from("kinetiks_billing")
    .select("plan")
    .eq("account_id", accountId)
    .maybeSingle();

  return {
    user_id: user.id,
    account_id: accountId,
    email: user.email ?? null,
    tier: normalizeTier(billing?.plan),
  };
}

/**
 * Require an authenticated session. Returns the session or a 401
 * response. Use in route handlers like:
 *
 *   const result = await requireDeskOfSession();
 *   if ("error" in result) return result.error;
 *   const session = result.session;
 */
export async function requireDeskOfSession(): Promise<
  { session: DeskOfSession } | { error: Response }
> {
  const session = await getDeskOfSession();
  if (!session) {
    return {
      error: new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { "content-type": "application/json" } }
      ),
    };
  }
  return { session };
}
