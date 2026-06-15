import { requireAuth } from "@/lib/auth/require-auth";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { presenceChannel } from "@kinetiks/supabase";
import { presenceRequestSchema } from "@/lib/embed/contract";

/**
 * POST /api/id/embed/presence
 *
 * Ingests a presence beat from the embed surface and targets the
 * account-scoped channel `presence:{account}:{thread}`. Phase 8.0 scaffold:
 * auth + thread scope + shape validation are real; broadcast delivery
 * (publishAccountScoped, with its account-ownership guard) is wired in
 * Phase 8.3 when the presence layer ships.
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = presenceRequestSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid presence event", 400);

  const channel = presenceChannel(auth.account_id, parsed.data.thread_id);
  return apiSuccess({ accepted: true, channel });
}
