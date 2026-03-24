import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { EscalationStatus } from "@kinetiks/types";
import { NextResponse } from "next/server";

/**
 * GET /api/sentinel/escalations
 *
 * List pending escalations for the authenticated user's account.
 * Supports ?status= filter and ?limit= pagination.
 */
export async function GET(request: Request) {
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
    return NextResponse.json(
      { error: "Account not found" },
      { status: 404 }
    );
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "pending";
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10),
    100
  );

  const query = admin
    .from("kinetiks_escalations")
    .select("*")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") {
    query.eq("status", status);
  }

  const { data: escalations, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch escalations" },
      { status: 500 }
    );
  }

  return NextResponse.json({ escalations: escalations ?? [] });
}

/**
 * PATCH /api/sentinel/escalations
 *
 * Acknowledge or resolve an escalation.
 * Body: { escalation_id: string, status: 'acknowledged' | 'resolved' }
 */
export async function PATCH(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { escalation_id: string; status: EscalationStatus };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { escalation_id, status } = body;

  if (!escalation_id || typeof escalation_id !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid escalation_id" },
      { status: 400 }
    );
  }

  if (!["acknowledged", "resolved"].includes(status)) {
    return NextResponse.json(
      { error: "status must be 'acknowledged' or 'resolved'" },
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
    return NextResponse.json(
      { error: "Account not found" },
      { status: 404 }
    );
  }

  const updateData: Record<string, unknown> = { status };
  if (status === "acknowledged") {
    updateData.acknowledged_at = new Date().toISOString();
  } else if (status === "resolved") {
    updateData.resolved_at = new Date().toISOString();
  }

  const { data: updated, error: updateError } = await admin
    .from("kinetiks_escalations")
    .update(updateData)
    .eq("id", escalation_id)
    .eq("account_id", account.id)
    .select("id");

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update escalation" },
      { status: 500 }
    );
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "Escalation not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, status });
}
