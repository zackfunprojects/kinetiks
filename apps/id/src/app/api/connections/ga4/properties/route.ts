/**
 * GET /api/connections/ga4/properties
 *
 * Lists the GA4 properties the authenticated user can access via their
 * connected Google account. Used by the property picker rendered after
 * GA4 OAuth completes.
 *
 * Uses the Google Analytics Admin API (analyticsadmin v1beta) via
 * googleapis + google-auth-library. Reads OAuth credentials from
 * kinetiks_connections.credentials with the standard decrypt path; the
 * Admin API requires no separate scope beyond analytics.readonly.
 */

import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getConnectionByProvider,
  getDecryptedCredentials,
} from "@/lib/connections";

export interface Ga4Property {
  property_id: string;
  display_name: string;
  account_display_name: string;
  parent: string;                                           // 'accounts/<id>'
  currency_code: string | null;
  time_zone: string | null;
}

export async function GET() {
  const serverClient = createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Resolve the user's account
  const { data: account } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "no_account" }, { status: 403 });
  }

  // Pull the GA4 connection
  const connection = await getConnectionByProvider(admin, account.id, "ga4");
  if (!connection) {
    return NextResponse.json({ error: "ga4_not_connected" }, { status: 404 });
  }

  const creds = getDecryptedCredentials(connection);
  if (creds.type !== "oauth") {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 500 });
  }

  try {
    const properties = await listGa4Properties({
      access_token: creds.access_token,
      refresh_token: creds.refresh_token,
    });

    return NextResponse.json({ properties });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("Failed to list GA4 properties:", message);

    // Map common Google error shapes to actionable statuses.
    if (/UNAUTHENTICATED|401|invalid_grant/i.test(message)) {
      return NextResponse.json(
        { error: "reauthorize_required", message },
        { status: 401 }
      );
    }
    if (/PERMISSION_DENIED|forbidden|403/i.test(message)) {
      return NextResponse.json(
        { error: "no_admin_access", message },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "list_properties_failed", message },
      { status: 500 }
    );
  }
}

/**
 * Use the Admin API to enumerate accounts, then list properties for each.
 *
 * The Admin API requires no extra scope beyond analytics.readonly for
 * reads. We fetch accounts first because property listing is scoped to
 * an account via filter='parent:accounts/<id>'.
 */
async function listGa4Properties(creds: {
  access_token: string;
  refresh_token: string | null;
}): Promise<Ga4Property[]> {
  const { OAuth2Client } = await import("google-auth-library");
  const { google } = await import("googleapis");

  const auth = new OAuth2Client();
  auth.setCredentials({
    access_token: creds.access_token,
    refresh_token: creds.refresh_token ?? undefined,
  });

  const adminApi = google.analyticsadmin({ version: "v1beta", auth });

  // 1. List accounts the user can access
  const accountsResp = await adminApi.accounts.list({ pageSize: 200 });
  const accounts = accountsResp.data.accounts ?? [];

  if (accounts.length === 0) return [];

  // 2. For each account, list its properties (pagination one level deep is
  //    enough for v1; Google caps at 200 per page).
  const properties: Ga4Property[] = [];

  for (const acc of accounts) {
    if (!acc.name) continue;
    const propResp = await adminApi.properties.list({
      filter: `parent:${acc.name}`,
      pageSize: 200,
    });
    for (const p of propResp.data.properties ?? []) {
      if (!p.name) continue;
      // p.name is 'properties/<id>'
      const propertyId = p.name.replace(/^properties\//, "");
      properties.push({
        property_id: propertyId,
        display_name: p.displayName ?? `Property ${propertyId}`,
        account_display_name: acc.displayName ?? acc.name,
        parent: acc.name,
        currency_code: p.currencyCode ?? null,
        time_zone: p.timeZone ?? null,
      });
    }
  }

  return properties;
}
