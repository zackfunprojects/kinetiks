import { apiSuccess } from "@/lib/utils/api-response";
import { requireAuth } from "@/lib/auth/require-auth";

/**
 * GET /api/health
 * Diagnostic endpoint to check which env vars are set on the server.
 * Requires auth to prevent information leakage.
 */
export async function GET(request: Request) {
  const { error } = await requireAuth(request);
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

  return apiSuccess({ env: envCheck, timestamp: new Date().toISOString() });
}
