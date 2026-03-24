import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { TouchpointSentiment } from "@kinetiks/types";
import { NextResponse } from "next/server";

/**
 * GET /api/sentinel/fatigue
 *
 * List fatigue rules for the authenticated user's account.
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

  const { data: rules, error } = await admin
    .from("kinetiks_fatigue_rules")
    .select("*")
    .eq("account_id", account.id)
    .order("rule_name");

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch fatigue rules" },
      { status: 500 }
    );
  }

  return NextResponse.json({ rules: rules ?? [] });
}

/**
 * PUT /api/sentinel/fatigue
 *
 * Update fatigue rules for the authenticated user's account.
 * Body: { rules: Array<{ rule_name: string, limit_value: number, period: string, scope: 'contact' | 'org', is_active?: boolean }> }
 */
export async function PUT(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    rules: Array<{
      rule_name: string;
      limit_value: number;
      period: string;
      scope: "contact" | "org";
      is_active?: boolean;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.rules) || body.rules.length === 0) {
    return NextResponse.json(
      { error: "rules must be a non-empty array" },
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

  const accountId = account.id as string;

  // Upsert each rule
  const upsertRows = body.rules.map((rule) => ({
    account_id: accountId,
    rule_name: rule.rule_name,
    limit_value: rule.limit_value,
    period: rule.period,
    scope: rule.scope,
    is_active: rule.is_active ?? true,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await admin
    .from("kinetiks_fatigue_rules")
    .upsert(upsertRows, { onConflict: "account_id,rule_name" });

  if (upsertError) {
    return NextResponse.json(
      { error: "Failed to update fatigue rules" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, updated: upsertRows.length });
}

/**
 * POST /api/sentinel/fatigue
 *
 * Record a touchpoint in the unified touchpoint ledger.
 * Called by apps after actually sending/executing an external action.
 *
 * Auth: user session OR Authorization: Bearer {INTERNAL_SERVICE_SECRET}
 */
export async function POST(request: Request) {
  const serverClient = createClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();

  const authHeader = request.headers.get("authorization");
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  const isServiceCall =
    !!internalSecret && authHeader === `Bearer ${internalSecret}`;

  if ((authError || !user) && !isServiceCall) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    account_id: string;
    contact_email?: string;
    contact_linkedin?: string;
    org_domain?: string;
    app: string;
    channel: string;
    action_type: string;
    sentiment?: TouchpointSentiment;
    sentinel_review_id?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.account_id || !body.app || !body.channel || !body.action_type) {
    return NextResponse.json(
      { error: "Missing required fields: account_id, app, channel, action_type" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify account ownership if user-authenticated
  if (!isServiceCall && user) {
    const { data: account } = await admin
      .from("kinetiks_accounts")
      .select("id")
      .eq("id", body.account_id)
      .eq("user_id", user.id)
      .single();

    if (!account) {
      return NextResponse.json(
        { error: "Forbidden: account does not belong to you" },
        { status: 403 }
      );
    }
  }

  const { error: insertError } = await admin
    .from("kinetiks_touchpoint_ledger")
    .insert({
      account_id: body.account_id,
      contact_email: body.contact_email ?? null,
      contact_linkedin: body.contact_linkedin ?? null,
      org_domain: body.org_domain ?? null,
      app: body.app,
      channel: body.channel,
      action_type: body.action_type,
      sentiment: body.sentiment ?? "neutral",
      sentinel_review_id: body.sentinel_review_id ?? null,
    });

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to record touchpoint" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
