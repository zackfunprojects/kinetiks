import { apiSuccess } from "@/lib/utils/api-response";
import { requireAuth } from "@/lib/auth/require-auth";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/health
 * Diagnostic endpoint to check which env vars are set on the server and,
 * for session requests, whether the custom_access_token hook has injected
 * the account_id claim that the JWT-claim RLS cutover (F1) depends on.
 * Requires auth to prevent information leakage.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const envCheck = {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    FIRECRAWL_API_KEY: !!process.env.FIRECRAWL_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    INTERNAL_SERVICE_SECRET: !!process.env.INTERNAL_SERVICE_SECRET,
  };

  // JWT account_id claim check. Only session auth carries a Supabase JWT
  // (api_key / internal auth do not), so the claim assertion applies there.
  // Booleans only — never echo the account id (no PII, but no id either).
  const jwt = await checkAccountClaim(auth.auth_method, auth.account_id);

  return apiSuccess({ env: envCheck, jwt, timestamp: new Date().toISOString() });
}

interface ClaimCheck {
  /** Whether this auth method carries a JWT we can inspect (session only). */
  applicable: boolean;
  /** The account_id claim is present and non-empty in the live token. */
  claim_present: boolean;
  /** The claim equals the DB-resolved account id (the cutover invariant). */
  claim_matches_db: boolean;
}

async function checkAccountClaim(
  authMethod: string,
  dbAccountId: string
): Promise<ClaimCheck> {
  if (authMethod !== "session") {
    return { applicable: false, claim_present: false, claim_matches_db: false };
  }

  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getClaims();
    const rawClaims = data?.claims as Record<string, unknown> | undefined;
    const claimAccountId = rawClaims?.account_id;
    const claim_present =
      typeof claimAccountId === "string" && claimAccountId.length > 0;
    return {
      applicable: true,
      claim_present,
      claim_matches_db: claim_present && claimAccountId === dbAccountId,
    };
  } catch {
    // Diagnostic endpoint: a claim-read failure is reported as "not present",
    // never thrown — the env block must always return.
    return { applicable: true, claim_present: false, claim_matches_db: false };
  }
}
