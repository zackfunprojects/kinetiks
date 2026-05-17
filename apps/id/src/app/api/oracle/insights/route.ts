/**
 * GET    /api/oracle/insights — fetch insights for the Analytics tab.
 * PATCH  /api/oracle/insights — dismiss or mark-acted-on a single insight.
 *
 * D2 Slice 12: rewritten to read from `kinetiks_insights` (v3) instead
 * of the legacy `kinetiks_oracle_insights`. Output is a projection
 * matching the InsightProjection shape consumed by InsightsBoard.tsx.
 */

import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, apiError } from "@/lib/utils/api-response";
import { NextRequest } from "next/server";
import { z } from "zod";

import { projectInsight } from "@/lib/oracle/insights/projector";

const PatchBody = z.object({
  id: z.string().uuid(),
  dismissed: z.boolean().optional(),
  acted_on: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const { auth, error } = await requireAuth(request);
  if (error) return error;

  const limit = Math.max(
    1,
    Math.min(100, parseInt(request.nextUrl.searchParams.get("limit") ?? "25", 10) || 25)
  );

  const admin = createAdminClient();

  const { data: rows, error: queryError } = await admin
    .from("kinetiks_insights")
    .select(
      "id, type, severity, source_app, summary, evidence, suggested_action, created_at, delivered, dismissed, acted_on"
    )
    .eq("account_id", auth.account_id)
    .eq("dismissed", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (queryError) return apiError(`Failed to fetch insights: ${queryError.message}`, 500);

  const insights = (rows ?? []).map((r) => ({
    ...projectInsight(r as never),
    delivered: r.delivered as boolean,
    acted_on: r.acted_on as boolean,
  }));

  return apiSuccess({ insights });
}

export async function PATCH(request: Request) {
  const { auth, error } = await requireAuth(request, { permissions: "read-write" });
  if (error) return error;

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await request.json());
  } catch (err) {
    return apiError(
      `Invalid body: ${err instanceof Error ? err.message : "unknown"}`,
      400
    );
  }

  const updates: Record<string, unknown> = {};
  if (body.dismissed === true) updates.dismissed = true;
  if (body.acted_on === true) updates.acted_on = true;
  if (Object.keys(updates).length === 0) {
    return apiError(
      "Provide at least one of: dismissed=true, acted_on=true. (Both fields are one-way per migration 00033 trigger.)",
      400
    );
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("kinetiks_insights")
    .update(updates)
    .eq("id", body.id)
    .eq("account_id", auth.account_id);

  if (updateError) return apiError(`Failed to update insight: ${updateError.message}`, 500);

  return apiSuccess({ updated: true });
}
