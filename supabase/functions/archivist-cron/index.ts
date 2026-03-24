// Archivist CRON Edge Function
//
// Runs every 6 hours. Performs a lightweight data quality pass across
// all accounts' Context Structures: checks for empty layers (gap detection),
// identifies stale data, and logs quality metrics.
//
// The full Archivist operator (dedup, normalize, deep cleaning) is built
// in Phase 5. This CRON provides the scheduling infrastructure and basic
// gap detection so the system is ready when the full operator lands.
//
// CRON schedule: every 6 hours ("0 */6 * * *")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CONTEXT_LAYERS = [
  "org",
  "products",
  "voice",
  "customers",
  "narrative",
  "competitive",
  "market",
  "brand",
] as const;

/** Data older than 90 days without updates is flagged as stale. */
const STALE_DATA_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

interface AccountQuality {
  account_id: string;
  empty_layers: string[];
  stale_layers: string[];
  total_layers: number;
  populated_layers: number;
}

Deno.serve(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[archivist-cron] Missing required environment variables");
    return new Response(JSON.stringify({ error: "Missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Get all active accounts
  const { data: accounts, error: accountsErr } = await admin
    .from("kinetiks_accounts")
    .select("id")
    .eq("onboarding_complete", true)
    .limit(200);

  if (accountsErr) {
    console.error("[archivist-cron] Failed to query accounts:", accountsErr);
    return new Response(JSON.stringify({ error: accountsErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!accounts?.length) {
    return new Response(
      JSON.stringify({ processed: 0, message: "No accounts to audit" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const now = Date.now();
  const staleThreshold = new Date(now - STALE_DATA_THRESHOLD_MS).toISOString();
  let accountsProcessed = 0;
  let totalGaps = 0;
  let totalStale = 0;

  for (const account of accounts) {
    const accountId = account.id as string;
    const quality: AccountQuality = {
      account_id: accountId,
      empty_layers: [],
      stale_layers: [],
      total_layers: CONTEXT_LAYERS.length,
      populated_layers: 0,
    };

    try {
      // Query all context layers in parallel to avoid N+1
      const layerResults = await Promise.all(
        CONTEXT_LAYERS.map(async (layer) => {
          const tableName = `kinetiks_context_${layer}`;
          const { data: rows, error: layerErr } = await admin
            .from(tableName)
            .select("id, data, updated_at")
            .eq("account_id", accountId)
            .limit(1);
          return { layer, rows, error: layerErr };
        })
      );

      for (const { layer, rows, error: layerErr } of layerResults) {
        if (layerErr) {
          console.error(
            `[archivist-cron] Failed to query kinetiks_context_${layer} for account ${accountId}:`,
            layerErr
          );
          continue;
        }

        if (!rows || rows.length === 0) {
          quality.empty_layers.push(layer);
        } else {
          quality.populated_layers++;

          const row = rows[0];
          if (row.updated_at && row.updated_at < staleThreshold) {
            quality.stale_layers.push(layer);
          }

          const data = row.data as Record<string, unknown> | null;
          if (!data || Object.keys(data).length === 0) {
            quality.empty_layers.push(layer);
            quality.populated_layers--;
          }
        }
      }

      totalGaps += quality.empty_layers.length;
      totalStale += quality.stale_layers.length;

      // Log quality findings for this account if there are issues
      if (quality.empty_layers.length > 0 || quality.stale_layers.length > 0) {
        const { error: ledgerErr } = await admin
          .from("kinetiks_ledger")
          .insert({
            account_id: accountId,
            event_type: "archivist_quality_check",
            source_operator: "archivist",
            detail: {
              empty_layers: quality.empty_layers,
              stale_layers: quality.stale_layers,
              populated_layers: quality.populated_layers,
              total_layers: quality.total_layers,
              quality_score: Math.round(
                (quality.populated_layers / quality.total_layers) * 100
              ),
            },
          });

        if (ledgerErr) {
          console.error(
            `[archivist-cron] Ledger insert failed for account ${accountId}:`,
            ledgerErr
          );
        }
      }

      accountsProcessed++;
    } catch (err) {
      console.error(
        `[archivist-cron] Failed to process account ${accountId}:`,
        err
      );
    }
  }

  // Log summary to ledger
  const { error: summaryErr } = await admin.from("kinetiks_ledger").insert({
    account_id: null,
    event_type: "archivist_cron_run",
    source_operator: "archivist",
    detail: {
      accounts_processed: accountsProcessed,
      total_gaps: totalGaps,
      total_stale: totalStale,
      timestamp: new Date().toISOString(),
    },
  });
  if (summaryErr) {
    console.error("[archivist-cron] Summary ledger insert failed:", summaryErr);
  }

  const summary = {
    accounts_processed: accountsProcessed,
    total_gaps: totalGaps,
    total_stale: totalStale,
  };

  console.log("[archivist-cron] Run complete:", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
