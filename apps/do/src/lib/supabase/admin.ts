import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client with the service role key. Bypasses RLS.
 *
 * USE WITH CARE. Only intended for:
 *   - Edge Functions / scheduled jobs (Pulse, Mirror, Scout background)
 *   - Webhook handlers
 *   - The privacy/deletion cascade
 *
 * Mirrors apps/id/src/lib/supabase/admin.ts. Inlined here rather than
 * imported from @kinetiks/supabase to sidestep latent type errors in
 * that package — to be cleaned up in a follow-up PR.
 */
export function createDeskOfAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
