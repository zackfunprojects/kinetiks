/**
 * 30-day rolling self-promo ratio tracker (build-plan §3.1).
 *
 * Computes the user's promotional / total reply ratio over the last
 * 30 days from `deskof_replies`, upserts a snapshot row in
 * `deskof_platform_health` (created in migration 00025), and returns
 * the snapshot in the shape Lens consumes.
 *
 * "Promotional" today is defined as: any posted reply whose draft
 * content matched at least one product hostname in the operator's
 * product_associations list. We do NOT re-vectorize old replies — the
 * gate stores `gate_overrides` and we infer promotional status from
 * the presence of a link_presence advisory in the historical
 * gate_result, falling back to a runtime URL scan when the row pre-
 * dates the gate.
 *
 * The snapshot is read by Lens on every draft autosave; recompute
 * cost matters. The query is bounded to 30 days and indexed on
 * (user_id, posted_at) so it stays cheap.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Platform, PlatformHealthSnapshot } from "@kinetiks/deskof";

const URL_REGEX = /\bhttps?:\/\/[^\s<>()"']+/gi;

interface PostedReplyRow {
  content: string | null;
  posted_at: string | null;
  gate_result: { checks?: Array<{ type: string; passed: boolean }> } | null;
}

export async function refreshPlatformHealthSnapshot(
  supabase: SupabaseClient,
  userId: string,
  platform: Platform,
  productNames: string[]
): Promise<PlatformHealthSnapshot> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("deskof_replies")
    .select("content, posted_at, gate_result")
    .eq("user_id", userId)
    .eq("platform", platform)
    .gte("posted_at", since);

  if (error) {
    throw new Error(`refreshPlatformHealthSnapshot read failed: ${error.message}`);
  }

  const rows = (data ?? []) as PostedReplyRow[];
  const total = rows.length;
  const productHosts = productNames
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);

  let promotional = 0;
  for (const row of rows) {
    if (rowIsPromotional(row, productHosts)) promotional += 1;
  }

  const ratio = total === 0 ? 0 : promotional / total;
  const snapshot: PlatformHealthSnapshot = {
    platform,
    posts_total: total,
    posts_promotional: promotional,
    self_promo_ratio: ratio,
    snapshot_date: new Date().toISOString().slice(0, 10),
  };

  // Best-effort write — a snapshot failure must NEVER block the gate.
  // The Lens engine consumes the in-memory snapshot regardless.
  try {
    await supabase
      .from("deskof_platform_health")
      .upsert(
        {
          user_id: userId,
          platform,
          snapshot_date: snapshot.snapshot_date,
          posts_total: snapshot.posts_total,
          posts_promotional: snapshot.posts_promotional,
          self_promo_ratio: snapshot.self_promo_ratio,
        },
        { onConflict: "user_id,platform,snapshot_date" }
      );
  } catch {
    // swallow — the in-memory snapshot is what Lens needs
  }

  return snapshot;
}

function rowIsPromotional(row: PostedReplyRow, productHosts: string[]): boolean {
  // Prefer the historical gate_result signal so we honor whatever the
  // link_presence check decided at the time.
  const linkCheck = row.gate_result?.checks?.find((c) => c.type === "link_presence");
  if (linkCheck && linkCheck.passed === false) return true;

  // Fallback: scan the content. Pre-Phase-3 rows have empty checks.
  const content = row.content ?? "";
  const matches = content.match(URL_REGEX) ?? [];
  if (matches.length === 0) return false;
  if (productHosts.length === 0) return false;

  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?)\]]+$/, "");
    let host: string;
    try {
      host = new URL(cleaned).hostname.toLowerCase();
    } catch {
      continue;
    }
    for (const product of productHosts) {
      if (
        host === product ||
        host.endsWith(`.${product}`) ||
        host.includes(product)
      ) {
        return true;
      }
    }
  }
  return false;
}
