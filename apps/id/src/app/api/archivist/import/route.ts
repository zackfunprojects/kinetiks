import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { processImport } from "@/lib/archivist/import-pipeline";
import { NextResponse } from "next/server";

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
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }

  if (typeof body.import_id !== "string" || body.import_id.length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid import_id" },
      { status: 400 }
    );
  }

  const importId = body.import_id as string;
  const admin = createAdminClient();

  // Resolve user's account
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json(
      { error: "Account not found" },
      { status: 404 }
    );
  }

  const accountId = account.id as string;

  // Verify the import belongs to this account
  const { data: importRecord, error: fetchError } = await admin
    .from("kinetiks_imports")
    .select("id, account_id, status")
    .eq("id", importId)
    .single();

  if (fetchError || !importRecord) {
    return NextResponse.json(
      { error: "Import not found" },
      { status: 404 }
    );
  }

  if ((importRecord.account_id as string) !== accountId) {
    return NextResponse.json(
      { error: "Forbidden: import does not belong to your account" },
      { status: 403 }
    );
  }

  if (importRecord.status === "processing") {
    return NextResponse.json(
      { error: "Import is already being processed" },
      { status: 409 }
    );
  }

  // Process the import
  const result = await processImport(admin, importId, accountId);

  return NextResponse.json(result);
}
