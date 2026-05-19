/**
 * POST /api/internal/fixtures/cleanup
 *
 * Archives every Pattern row with source_app = 'kinetiks_fixtures'
 * for a given account (or, if account_id is omitted, for every
 * account). Patterns are NEVER deleted — they flip to status =
 * 'archived' so the Ledger history remains intact. When real suite
 * apps come online later, this endpoint is the one switch that
 * retires the fixture substrate.
 *
 * A single `fixture_cleanup` Ledger entry is written per call,
 * summarizing the archived count per account. Already-archived
 * fixture rows are counted but not touched.
 *
 * Auth: shared-secret bearer token (INTERNAL_SERVICE_SECRET).
 * Bypasses KINETIKS_FIXTURES_ENABLED so an operator can clean up
 * after the flag has been flipped to false.
 */

import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { serverEnv } from "@kinetiks/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { FIXTURE_SOURCE_APP } from "@/lib/fixtures";

const Body = z
  .object({
    account_id: z.string().uuid().optional(),
  })
  .default({});

interface ArchivedCountByAccount {
  [account_id: string]: number;
}

export async function POST(request: Request) {
  const env = serverEnv();
  const secret = env.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "missing_internal_secret" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    const raw = (await request.json().catch(() => ({}))) as unknown;
    parsed = Body.parse(raw ?? {});
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: err instanceof Error ? err.message : "invalid JSON",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Find every non-archived fixture pattern in scope.
  let query = admin
    .from("kinetiks_pattern_library")
    .select("id, account_id")
    .eq("source_app", FIXTURE_SOURCE_APP)
    .neq("status", "archived");
  if (parsed.account_id) {
    query = query.eq("account_id", parsed.account_id);
  }
  const { data: rows, error: selectError } = await query;
  if (selectError) {
    console.error(
      `[fixtures/cleanup] select failed account=${parsed.account_id ?? "all"}: ${selectError.message}`,
    );
    return NextResponse.json(
      { error: "select_failed" },
      { status: 500 },
    );
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({
      status: "ok",
      archived: 0,
      accounts: 0,
    });
  }

  const ids = rows.map((r) => r.id as string);
  const { error: updateError } = await admin
    .from("kinetiks_pattern_library")
    .update({ status: "archived" })
    .in("id", ids);
  if (updateError) {
    console.error(
      `[fixtures/cleanup] update failed (${ids.length} ids): ${updateError.message}`,
    );
    return NextResponse.json(
      { error: "update_failed" },
      { status: 500 },
    );
  }

  // Group by account for the per-account Ledger entries.
  const perAccount: ArchivedCountByAccount = {};
  for (const r of rows) {
    const aid = r.account_id as string;
    perAccount[aid] = (perAccount[aid] ?? 0) + 1;
  }

  let ledgerWriteFailures = 0;
  for (const [account_id, archived_count] of Object.entries(perAccount)) {
    const { error: ledgerError } = await admin.from("kinetiks_ledger").insert({
      account_id,
      event_type: "fixture_cleanup",
      source_app: FIXTURE_SOURCE_APP,
      source_operator: "fixture_emitter",
      target_layer: null,
      detail: {
        archived_count,
        is_fixture: true,
      },
    });
    if (ledgerError) {
      console.error(
        `[fixtures/cleanup] ledger insert failed account=${account_id}: ${ledgerError.message}`,
      );
      ledgerWriteFailures++;
    }
  }

  return NextResponse.json({
    status: ledgerWriteFailures > 0 ? "partial" : "ok",
    archived: rows.length,
    accounts: Object.keys(perAccount).length,
    ledger_write_failures: ledgerWriteFailures,
  });
}
