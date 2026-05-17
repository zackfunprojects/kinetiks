/**
 * POST /api/connections/ga4/select-property
 *
 * Stores the user's chosen GA4 property_id into
 * kinetiks_connections.metadata.property_id. Idempotent — subsequent
 * calls overwrite the previous selection.
 *
 * The ga4_query tool and metric-cache-cron read this metadata field
 * to know which property to query. Without it the tool returns the
 * 'no_property' branch and Marcus prompts the user to pick one.
 */

import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConnectionByProvider } from "@/lib/connections";

const SelectPropertyBody = z.object({
  property_id: z.string().regex(/^\d+$/, "property_id must be a numeric string"),
});

export async function POST(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let parsed;
  try {
    const body = await request.json();
    parsed = SelectPropertyBody.parse(body);
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: err instanceof Error ? err.message : "invalid JSON",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "no_account" }, { status: 403 });
  }

  const connection = await getConnectionByProvider(admin, account.id, "ga4");
  if (!connection) {
    return NextResponse.json({ error: "ga4_not_connected" }, { status: 404 });
  }

  const existingMetadata = (connection.metadata ?? {}) as Record<string, unknown>;
  const nextMetadata = {
    ...existingMetadata,
    property_id: parsed.property_id,
  };

  const { error } = await admin
    .from("kinetiks_connections")
    .update({ metadata: nextMetadata })
    .eq("id", connection.id);

  if (error) {
    return NextResponse.json(
      { error: "update_failed", message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, property_id: parsed.property_id });
}
