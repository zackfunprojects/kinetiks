/**
 * Production adapter implementing the PatternWriteDb seam used by
 * pattern-write.ts. Wraps the service-role Supabase admin client.
 *
 * Per addendum §1.2, RLS denies user-token writes; this adapter must
 * be used only from server-side code that already has the service-role
 * client. Never expose it to client code or to a request whose
 * principal is not server-authoritative.
 */

import type {
  Pattern,
  PatternEvidenceSummary,
  PatternLifecycleStatus,
  PatternOutcomeMetric,
} from "@kinetiks/types";
import type { PatternWriteDb } from "./pattern-write";

/**
 * The admin client returned by `createAdminClient()` in
 * apps/id/src/lib/supabase/admin.ts is the un-generic Supabase client.
 * We type the seam loosely here to avoid forcing the entire app to
 * thread a Database generic; the runtime contract is what matters.
 */
type AdminLike = {
  from: (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (...args: any[]) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insert: (...args: any[]) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (...args: any[]) => any;
  };
};

export function createPatternWriteDb(admin: AdminLike): PatternWriteDb {
  return {
    async findByFingerprint({ account_id, pattern_type, fingerprint }) {
      const { data, error } = await admin
        .from("kinetiks_pattern_library")
        .select("*")
        .eq("account_id", account_id)
        .eq("pattern_type", pattern_type)
        .eq("fingerprint", fingerprint)
        .maybeSingle();
      if (error) {
        throw new Error(
          `pattern-write find: ${error.message} (${error.code ?? "no_code"})`,
        );
      }
      return data ? (data as unknown as Pattern) : null;
    },

    async insertPattern(row) {
      const { data, error } = await admin
        .from("kinetiks_pattern_library")
        .insert({
          ...row,
          // jsonb columns require explicit assignment; Supabase generates the
          // shape from the row type, but the runtime values are passed through.
        })
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(
          `pattern-write insert: ${error?.message ?? "no row"} (${error?.code ?? "no_code"})`,
        );
      }
      return data as unknown as Pattern;
    },

    async updatePatternEvidence({
      id,
      confidence_score,
      observation_count,
      last_observed_at,
      decay_at,
      outcome_metrics,
      evidence_summary,
    }) {
      const { data, error } = await admin
        .from("kinetiks_pattern_library")
        .update({
          confidence_score,
          observation_count,
          last_observed_at,
          decay_at,
          outcome_metrics: outcome_metrics as unknown as PatternOutcomeMetric[],
          evidence_summary: evidence_summary as unknown as PatternEvidenceSummary,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(
          `pattern-write evidence-update: ${error?.message ?? "no row"} (${error?.code ?? "no_code"})`,
        );
      }
      return data as unknown as Pattern;
    },

    async updatePatternStatus({ id, status }) {
      const { data, error } = await admin
        .from("kinetiks_pattern_library")
        .update({ status: status as PatternLifecycleStatus })
        .eq("id", id)
        .select("*")
        .single();
      if (error || !data) {
        throw new Error(
          `pattern-write status-update: ${error?.message ?? "no row"} (${error?.code ?? "no_code"})`,
        );
      }
      return data as unknown as Pattern;
    },

    async insertLedgerEntry({
      account_id,
      event_type,
      source_app,
      source_operator,
      detail,
    }) {
      const { error } = await admin.from("kinetiks_ledger").insert({
        account_id,
        event_type,
        source_app,
        source_operator,
        target_layer: null,
        detail,
      });
      if (error) {
        throw new Error(
          `pattern-write ledger-insert: ${error.message} (${error.code ?? "no_code"})`,
        );
      }
    },
  };
}
