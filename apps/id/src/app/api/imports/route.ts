import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ImportRecord } from "@kinetiks/types";

const VALID_TYPES = ["content_library", "contacts", "brand_assets", "media_list"];
const VALID_TARGET_APPS = ["dark_madder", "harvest", "hypothesis", "litmus"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_EXTENSIONS = [".csv", ".json", ".pdf", ".docx"];
const ALLOWED_MIME_TYPES = [
  "text/csv",
  "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const EXTENSION_MIME_MAP: Record<string, string[]> = {
  ".csv": ["text/csv", "application/octet-stream"],
  ".json": ["application/json", "application/octet-stream"],
  ".pdf": ["application/pdf", "application/octet-stream"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
  ],
};

/**
 * GET /api/imports
 * List imports for the authenticated user
 */
export async function GET() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const { data: imports } = await admin
    .from("kinetiks_imports")
    .select("*")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ imports: (imports ?? []) as ImportRecord[] });
}

/**
 * POST /api/imports
 * Upload a file and create an import record
 * Body: FormData with file, import_type, and optional target_app
 */
export async function POST(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const importType = formData.get("import_type") as string;
  const targetApp = formData.get("target_app") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!importType || !VALID_TYPES.includes(importType)) {
    return NextResponse.json({ error: "Invalid import_type" }, { status: 400 });
  }

  // Validate target_app against allowlist
  if (targetApp && !VALID_TARGET_APPS.includes(targetApp)) {
    return NextResponse.json({ error: "Invalid target_app" }, { status: 400 });
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB` },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  // Validate file type by extension and MIME type
  const dotIndex = file.name.lastIndexOf(".");
  if (dotIndex === -1) {
    return NextResponse.json(
      { error: `File must have an extension. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const fileExtension = file.name.toLowerCase().slice(dotIndex);
  if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 }
    );
  }

  if (file.type) {
    const allowedForExt = EXTENSION_MIME_MAP[fileExtension] || ALLOWED_MIME_TYPES;
    if (!allowedForExt.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file MIME type" },
        { status: 400 }
      );
    }
  }

  // Upload to Supabase Storage
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${account.id}/${Date.now()}-${sanitizedName}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await admin.storage
    .from("imports")
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("Storage upload failed:", uploadError.message);
    return NextResponse.json(
      { error: `File upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // Create import record
  const { data: importRecord, error: insertError } = await admin
    .from("kinetiks_imports")
    .insert({
      account_id: account.id,
      import_type: importType,
      file_path: fileName,
      status: "pending",
      stats: {},
      target_app: targetApp || null,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: "Failed to create import" }, { status: 500 });
  }

  // Trigger the archivist import pipeline asynchronously
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/archivist/import`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.INTERNAL_SERVICE_SECRET || ""}`,
        },
        body: JSON.stringify({ import_id: importRecord.id }),
      }
    );
  } catch {
    // Non-blocking - import will be picked up by CRON if API call fails
  }

  // Log to ledger (non-blocking)
  admin.from("kinetiks_ledger").insert({
    account_id: account.id,
    event_type: "import",
    detail: {
      import_id: importRecord.id,
      import_type: importType,
      file_name: file.name,
      file_size: file.size,
      target_app: targetApp,
    },
  }).then(({ error: ledgerError }) => {
    if (ledgerError) {
      console.error(
        `Ledger insert failed for import ${importRecord.id} (account ${account.id}):`,
        ledgerError.message
      );
    }
  });

  return NextResponse.json({ success: true, import: importRecord });
}
