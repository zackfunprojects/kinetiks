import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { executeRoutes } from "@/lib/cortex/route";
import type { ContextLayer } from "@kinetiks/types";
import { NextResponse } from "next/server";

/**
 * POST /api/cortex/route
 *
 * Manually trigger routing for a specific layer change.
 * Normally routing happens automatically after proposal acceptance,
 * but this endpoint allows explicit re-routing (e.g., after user edits).
 *
 * Body: {
 *   account_id: string,
 *   source_app: string,
 *   target_layer: ContextLayer,
 *   proposal_id?: string,
 *   changes: Record<string, unknown>,
 *   confidence: string
 * }
 */
export async function POST(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  // Check for dedicated internal service secret (used by Edge Functions / CRON)
  const authHeader = request.headers.get("authorization");
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  const isServiceCall =
    !!internalSecret && authHeader === `Bearer ${internalSecret}`;

  if ((authError || !user) && !isServiceCall) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    account_id,
    source_app,
    target_layer,
    proposal_id,
    changes,
    confidence,
  } = body as {
    account_id: string;
    source_app: string;
    target_layer: ContextLayer;
    proposal_id?: string;
    changes: Record<string, unknown>;
    confidence: string;
  };

  if (!account_id || !source_app || !target_layer || !changes) {
    return NextResponse.json(
      { error: "Missing required fields: account_id, source_app, target_layer, changes" },
      { status: 400 }
    );
  }

  // Validate target_layer is a known ContextLayer
  const validLayers: ContextLayer[] = [
    "org", "products", "voice", "customers",
    "narrative", "competitive", "market", "brand",
  ];
  if (!validLayers.includes(target_layer)) {
    return NextResponse.json(
      { error: `Invalid target_layer: '${target_layer}'. Must be one of: ${validLayers.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate changes is a plain non-null object
  if (typeof changes !== "object" || Array.isArray(changes)) {
    return NextResponse.json(
      { error: "changes must be a plain object" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // If not internal service call, verify the user owns the target account
  if (!isServiceCall && user) {
    const { data: account } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("id", account_id)
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json(
        { error: "Forbidden: account does not belong to you" },
        { status: 403 }
      );
    }
  }

  const routedCount = await executeRoutes(
    admin,
    account_id,
    source_app,
    target_layer,
    proposal_id ?? "manual",
    changes,
    confidence ?? "inferred"
  );

  return NextResponse.json({
    routed: routedCount,
    target_layer,
    source_app,
  });
}
