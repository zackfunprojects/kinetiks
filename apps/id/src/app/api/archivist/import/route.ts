import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/require-auth";
import { processImport } from "@/lib/archivist/import-pipeline";
import { apiSuccess, apiError } from "@/lib/utils/api-response";

/**
 * POST /api/archivist/import
 *
 * Process a pending import. Called after a file has been uploaded to
 * Supabase Storage and a kinetiks_imports record has been created.
 *
 * Body: { import_id: string }
 *
 * Returns: ImportResult
 */
export async function POST(request: Request) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError("Malformed JSON", 400);
  }

  if (typeof body.import_id !== "string" || body.import_id.length === 0) {
    return apiError("Missing or invalid import_id", 400);
  }

  const importId = body.import_id as string;
  const admin = createAdminClient();
  const accountId = auth.account_id;

  // Verify the import belongs to this account
  const { data: importRecord, error: fetchError } = await admin
    .from("kinetiks_imports")
    .select("id, account_id, status")
    .eq("id", importId)
    .single();

  if (fetchError || !importRecord) {
    return apiError("Import not found", 404);
  }

  if ((importRecord.account_id as string) !== accountId) {
    return apiError("Forbidden: import does not belong to your account", 403);
  }

  if (importRecord.status === "processing") {
    return apiError("Import is already being processed", 409);
  }

  // Process the import
  const result = await processImport(admin, importId, accountId);

  return apiSuccess(result);
}
