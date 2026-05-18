/**
 * Insight delivery stamping.
 *
 * After Sonnet returns its response, scan the response text for any
 * `insight_id=<UUID>` strings against an allowlist of ids we loaded for
 * the current Marcus turn. Anything matched gets delivered=true.
 *
 * The allowlist guards against regex false positives — we only stamp
 * ids we actually surfaced to Sonnet, not arbitrary uuid-shaped strings
 * the model might emit.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { markInsightsDelivered } from "./reader";

const UUID_PATTERN = /insight_id=([0-9a-f-]{36})/gi;

export function extractCitedInsightIds(text: string, allowlist: Set<string>): string[] {
  const cited = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = UUID_PATTERN.exec(text)) !== null) {
    const id = match[1]!.toLowerCase();
    if (allowlist.has(id)) {
      cited.add(id);
    }
  }
  return Array.from(cited);
}

export async function stampDeliveredFromResponse(
  admin: SupabaseClient,
  responseText: string,
  briefInsightIds: string[]
): Promise<{ matched: number; stamped: number }> {
  if (briefInsightIds.length === 0 || responseText.length === 0) {
    return { matched: 0, stamped: 0 };
  }
  const allowlist = new Set(briefInsightIds.map((id) => id.toLowerCase()));
  const cited = extractCitedInsightIds(responseText, allowlist);
  if (cited.length === 0) {
    return { matched: 0, stamped: 0 };
  }
  const result = await markInsightsDelivered(admin, cited);
  return { matched: cited.length, stamped: result.updated };
}
