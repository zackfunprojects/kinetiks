/**
 * Format API responses as structured text for LLM consumption.
 * Returns human-readable summaries instead of raw JSON dumps.
 */

type LayerData = Record<string, unknown> | null;

interface ContextLayerRow {
  data: LayerData;
  source?: string;
  source_detail?: string;
  confidence_score?: number;
  updated_at?: string;
}

interface ConfidenceScores {
  aggregate: number;
  org: number;
  products: number;
  voice: number;
  customers: number;
  narrative: number;
  competitive: number;
  market: number;
  brand: number;
}

function summarizeObject(obj: Record<string, unknown>, maxKeys: number = 8): string {
  const entries = Object.entries(obj);
  const shown = entries.slice(0, maxKeys);
  const lines = shown.map(([key, value]) => {
    if (value === null || value === undefined) return `  ${key}: (empty)`;
    if (Array.isArray(value)) return `  ${key}: [${value.length} items]`;
    if (typeof value === "object") return `  ${key}: {${Object.keys(value).length} fields}`;
    if (typeof value === "string" && value.length > 100) return `  ${key}: "${value.slice(0, 100)}..."`;
    return `  ${key}: ${JSON.stringify(value)}`;
  });
  if (entries.length > maxKeys) {
    lines.push(`  ... and ${entries.length - maxKeys} more fields`);
  }
  return lines.join("\n");
}

export function formatContext(
  layers: Record<string, ContextLayerRow | null>,
  confidence: ConfidenceScores | null
): string {
  const parts: string[] = [];

  if (confidence) {
    parts.push(`Confidence: ${confidence.aggregate}%`);
    parts.push("");
  }

  for (const [layer, row] of Object.entries(layers)) {
    if (!row || !row.data || Object.keys(row.data).length === 0) {
      parts.push(`[${layer}] - empty`);
    } else {
      const score = row.confidence_score != null ? ` (${row.confidence_score}%)` : "";
      const updated = row.updated_at != null ? ` - updated ${row.updated_at.split("T")[0]}` : "";
      parts.push(`[${layer}]${score}${updated}`);
      parts.push(summarizeObject(row.data));
    }
    parts.push("");
  }

  return parts.join("\n").trim();
}

export function formatContextLayer(layer: string, row: ContextLayerRow | null): string {
  if (!row || !row.data) return `[${layer}] - no data`;

  const parts: string[] = [];
  const score = row.confidence_score != null ? ` (${row.confidence_score}%)` : "";
  const source = row.source ? ` - source: ${row.source}` : "";
  const updated = row.updated_at != null ? ` - updated ${row.updated_at.split("T")[0]}` : "";
  parts.push(`[${layer}]${score}${source}${updated}`);
  parts.push("");

  // For the detail view, show the full data structure
  parts.push(JSON.stringify(row.data, null, 2));

  return parts.join("\n");
}

export function formatConfidence(scores: ConfidenceScores): string {
  const bar = (score: number): string => {
    const filled = Math.max(0, Math.min(20, Math.round(score / 5)));
    return "\u2588".repeat(filled) + "\u2591".repeat(20 - filled);
  };

  return [
    `Aggregate: ${scores.aggregate}% ${bar(scores.aggregate)}`,
    "",
    `  org:         ${String(scores.org).padStart(5)}% ${bar(scores.org)}`,
    `  products:    ${String(scores.products).padStart(5)}% ${bar(scores.products)}`,
    `  voice:       ${String(scores.voice).padStart(5)}% ${bar(scores.voice)}`,
    `  customers:   ${String(scores.customers).padStart(5)}% ${bar(scores.customers)}`,
    `  narrative:   ${String(scores.narrative).padStart(5)}% ${bar(scores.narrative)}`,
    `  competitive: ${String(scores.competitive).padStart(5)}% ${bar(scores.competitive)}`,
    `  market:      ${String(scores.market).padStart(5)}% ${bar(scores.market)}`,
    `  brand:       ${String(scores.brand).padStart(5)}% ${bar(scores.brand)}`,
  ].join("\n");
}

export function formatApprovals(approvals: Array<Record<string, unknown>>, meta?: Record<string, unknown>): string {
  if (approvals.length === 0) return "No pending approvals.";

  const parts: string[] = [];
  if (meta) {
    parts.push(`Showing ${approvals.length} of ${meta.total ?? "?"} proposals`);
    parts.push("");
  }

  for (const p of approvals) {
    const status = p.status as string;
    const layer = p.target_layer as string;
    const app = p.source_app as string;
    const confidence = p.confidence as string;
    const action = p.action as string;
    parts.push(`[${p.id}] ${action} -> ${layer} (from ${app}, ${confidence})`);
    parts.push(`  Status: ${status} | Submitted: ${(p.submitted_at as string)?.split("T")[0] ?? "?"}`);

    if (p.payload && typeof p.payload === "object") {
      const keys = Object.keys(p.payload as Record<string, unknown>);
      parts.push(`  Fields: ${keys.join(", ")}`);
    }
    parts.push("");
  }

  return parts.join("\n").trim();
}

export function formatCrawlResult(result: Record<string, unknown>): string {
  const parts: string[] = [];
  parts.push("Crawl complete.");
  parts.push("");

  if (result.extractions && typeof result.extractions === "object") {
    const extractions = result.extractions as Record<string, unknown>;
    for (const [layer, data] of Object.entries(extractions)) {
      const d = data as Record<string, unknown>;
      parts.push(`  [${layer}] ${d.success ? "extracted" : "failed"}`);
    }
  }

  if (Array.isArray(result.proposals_submitted)) {
    parts.push(`\nProposals submitted: ${result.proposals_submitted.length}`);
  }

  if (Array.isArray(result.evaluation_results)) {
    const results = result.evaluation_results as Array<Record<string, unknown>>;
    const accepted = results.filter((r) => r.status === "accepted").length;
    const declined = results.filter((r) => r.status === "declined").length;
    const escalated = results.filter((r) => r.status === "escalated").length;
    parts.push(`Evaluations: ${accepted} accepted, ${declined} declined, ${escalated} escalated`);
  }

  if (Array.isArray(result.warnings) && result.warnings.length > 0) {
    parts.push(`\nWarnings:`);
    for (const w of result.warnings) {
      parts.push(`  - ${w}`);
    }
  }

  return parts.join("\n");
}

export function formatConnections(connections: Array<Record<string, unknown>>): string {
  if (connections.length === 0) return "No data connections configured.";

  const parts: string[] = [`${connections.length} connection(s):`, ""];
  for (const c of connections) {
    const status = c.status as string;
    const provider = c.provider as string;
    const lastSync = c.last_sync_at ? ` - last sync: ${(c.last_sync_at as string).split("T")[0]}` : "";
    const icon = status === "active" ? "\u2713" : "\u2717";
    parts.push(`  ${icon} ${provider} (${status})${lastSync}`);
  }
  return parts.join("\n");
}

export function formatMarcusResponse(
  text: string,
  threadId: string,
  actions: unknown[]
): string {
  const parts: string[] = [];
  if (threadId) parts.push(`[thread: ${threadId}]`);
  parts.push("");
  parts.push(text);

  if (actions.length > 0) {
    parts.push("");
    parts.push(`--- ${actions.length} action(s) extracted ---`);
    for (const action of actions) {
      const a = action as Record<string, unknown>;
      parts.push(`  - ${a.type ?? "action"}: ${a.summary ?? JSON.stringify(a)}`);
    }
  }

  return parts.join("\n").trim();
}

export function formatGeneric(data: unknown): string {
  if (data === null || data === undefined) return "OK (no data)";
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}
