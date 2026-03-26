import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, apiPaginated } from "@/lib/utils/api-response";
import type { ReplyClassification } from "@/types/inbox";

const VALID_CLASSIFICATIONS: ReplyClassification[] = [
  "interested",
  "not_interested",
  "bounce",
  "ooo",
  "referral",
  "unclassified",
];

/**
 * GET /api/hv/inbox
 * List emails that have replies. Joins contact first_name + last_name as contact_name.
 * Filter by reply_classification. Paginate.
 */
export async function GET(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const admin = createAdminClient();
  const url = new URL(request.url);
  const classification = url.searchParams.get("classification");
  const rawPage = parseInt(url.searchParams.get("page") ?? "1", 10);
  const rawPerPage = parseInt(url.searchParams.get("per_page") ?? "25", 10);
  const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);
  const perPage = Number.isNaN(rawPerPage) ? 25 : Math.min(100, Math.max(1, rawPerPage));

  let query = admin
    .from("hv_emails")
    .select("*, hv_contacts(first_name, last_name)", { count: "exact" })
    .eq("kinetiks_id", auth.account_id)
    .not("replied_at", "is", null)
    .order("replied_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (classification && VALID_CLASSIFICATIONS.includes(classification as ReplyClassification)) {
    query = query.eq("reply_classification", classification);
  }

  const { data, error: queryError, count } = await query;
  if (queryError) return apiError(queryError.message, 500);

  // Flatten the joined contact name
  const emails = (data ?? []).map((row: Record<string, unknown>) => {
    const contact = row.hv_contacts as { first_name: string | null; last_name: string | null } | null;
    const firstName = contact?.first_name ?? "";
    const lastName = contact?.last_name ?? "";
    const contactName = [firstName, lastName].filter(Boolean).join(" ") || null;
    return {
      ...row,
      contact_name: contactName,
      hv_contacts: undefined,
    };
  });

  return apiPaginated(emails, page, perPage, count ?? 0);
}
