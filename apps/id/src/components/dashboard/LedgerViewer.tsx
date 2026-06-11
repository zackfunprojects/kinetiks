"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { LedgerEntry, ContextLayer, LedgerEventType } from "@kinetiks/types";
import { Pill, Button } from "@kinetiks/ui";
import { Badge, Pagination } from "@kinetiks/ui";
import { LAYER_DISPLAY_NAMES } from "@/lib/utils/layer-display";

const EVENT_TYPES: Array<{ value: LedgerEventType; label: string }> = [
  { value: "proposal_accepted", label: "Proposal Accepted" },
  { value: "proposal_declined", label: "Proposal Declined" },
  { value: "routing_sent", label: "Routing Sent" },
  { value: "user_edit", label: "User Edit" },
  { value: "archivist_clean", label: "Archivist Clean" },
  { value: "expiration", label: "Expiration" },
  { value: "import", label: "Import" },
  { value: "archivist_gap_detect", label: "Gap Detected" },
];

const SOURCE_APPS = [
  "dark_madder",
  "harvest",
  "hypothesis",
  "litmus",
  "cartographer",
  "archivist",
  "marcus",
];

const LAYERS: ContextLayer[] = [
  "org", "products", "voice", "customers",
  "narrative", "competitive", "market", "brand",
];

const EVENT_VARIANTS: Record<string, "success" | "error" | "accent" | "warning" | "default"> = {
  proposal_accepted: "success",
  proposal_declined: "error",
  routing_sent: "accent",
  user_edit: "default",
  archivist_clean: "default",
  expiration: "warning",
  import: "accent",
  archivist_gap_detect: "warning",
};

const DOT_COLOR: Record<string, string> = {
  success: "var(--kt-success)",
  error: "var(--kt-danger)",
  accent: "var(--kt-accent)",
  warning: "var(--kt-warning)",
  default: "var(--kt-fg-3)",
};

function getEventDescription(entry: LedgerEntry): string {
  const detail = entry.detail;
  switch (entry.event_type) {
    case "proposal_accepted":
      return `Proposal for ${entry.target_layer || "unknown"} layer accepted${entry.source_app ? ` from ${entry.source_app.replace("_", " ")}` : ""}`;
    case "proposal_declined":
      return `Proposal for ${entry.target_layer || "unknown"} layer declined${detail.decline_reason ? ` - ${detail.decline_reason}` : ""}`;
    case "routing_sent":
      return `Learning routed to ${detail.target_app || "app"}`;
    case "user_edit":
      return `${entry.target_layer || "Context"} layer edited manually`;
    case "archivist_clean":
      return `Archivist cleaning pass completed`;
    case "expiration":
      return `Data entry expired in ${entry.target_layer || "unknown"} layer`;
    case "import":
      return `Import processed${detail.stats ? ` - ${(detail.stats as Record<string, number>).imported || 0} items` : ""}`;
    case "archivist_gap_detect":
      return `Gap detected in ${entry.target_layer || "unknown"} layer`;
    default:
      return entry.event_type;
  }
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, now)) return "Today";
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (sameDay(d, yest)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function groupByDay(entries: LedgerEntry[]): Array<{ label: string; items: LedgerEntry[] }> {
  const groups: Array<{ label: string; items: LedgerEntry[] }> = [];
  for (const e of entries) {
    const label = dayLabel(e.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }
  return groups;
}

function isFixture(entry: LedgerEntry): boolean {
  return entry.source_app === "kinetiks_fixtures" || (entry.detail as Record<string, unknown>)?.is_fixture === true;
}

function hasDetail(entry: LedgerEntry): boolean {
  return entry.detail != null && Object.keys(entry.detail as Record<string, unknown>).length > 0;
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: LedgerEntry[]): string {
  const header = ["created_at", "event_type", "source_app", "target_layer", "description", "detail"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const e of rows) {
    lines.push(
      [e.created_at, e.event_type, e.source_app ?? "", e.target_layer ?? "", getEventDescription(e), JSON.stringify(e.detail ?? {})]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

interface LedgerViewerProps {
  entries: LedgerEntry[];
  page: number;
  totalPages: number;
  filters: {
    type: string | null;
    app: string | null;
    layer: string | null;
  };
}

export function LedgerViewer({ entries, page, totalPages, filters }: LedgerViewerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handlePageChange(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`${pathname}?${params.toString()}`);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const groups = groupByDay(entries);

  const selectStyle: React.CSSProperties = {
    padding: "var(--kt-s-2) var(--kt-s-3)",
    border: "1px solid var(--kt-border-2)",
    borderRadius: "var(--kt-radius-1)",
    fontSize: "var(--kt-fs-13)",
    color: "var(--kt-fg-2)",
    background: "var(--kt-bg-elevated)",
  };

  return (
    <div>
      {/* Filters + export */}
      <div style={{ display: "flex", gap: "var(--kt-s-3)", marginBottom: "var(--kt-s-5)", alignItems: "center", flexWrap: "wrap" }}>
        <select value={filters.type || ""} onChange={(e) => updateFilter("type", e.target.value || null)} style={selectStyle} aria-label="Filter by event">
          <option value="">All events</option>
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <select value={filters.app || ""} onChange={(e) => updateFilter("app", e.target.value || null)} style={selectStyle} aria-label="Filter by source">
          <option value="">All sources</option>
          {SOURCE_APPS.map((app) => (
            <option key={app} value={app}>{app.replace("_", " ")}</option>
          ))}
        </select>

        <select value={filters.layer || ""} onChange={(e) => updateFilter("layer", e.target.value || null)} style={selectStyle} aria-label="Filter by layer">
          <option value="">All layers</option>
          {LAYERS.map((l) => (
            <option key={l} value={l}>{LAYER_DISPLAY_NAMES[l]}</option>
          ))}
        </select>

        <div style={{ marginLeft: "auto", display: "flex", gap: "var(--kt-s-2)" }}>
          <Button variant="ghost" size="sm" disabled={entries.length === 0} onClick={() => download(`ledger-${stamp}.csv`, toCsv(entries), "text/csv")}>
            Export CSV
          </Button>
          <Button variant="ghost" size="sm" disabled={entries.length === 0} onClick={() => download(`ledger-${stamp}.json`, JSON.stringify(entries, null, 2), "application/json")}>
            Export JSON
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "var(--kt-s-7) 0", color: "var(--kt-fg-3)" }}>
          <p className="kt-body">No ledger entries found.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-5)" }}>
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="kt-eyebrow" style={{ margin: "0 0 var(--kt-s-2)" }}>{group.label}</h3>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {group.items.map((entry) => {
                  const variant = EVENT_VARIANTS[entry.event_type] || "default";
                  return (
                    <div
                      key={entry.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "var(--kt-s-3)",
                        padding: "var(--kt-s-3) 0",
                        borderBottom: "1px solid var(--kt-border-1)",
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "var(--kt-radius-full)",
                          background: DOT_COLOR[variant],
                          marginTop: 6,
                          flexShrink: 0,
                        }}
                        aria-hidden
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--kt-s-1)", marginBottom: "var(--kt-s-1)", flexWrap: "wrap" }}>
                          <Badge label={entry.event_type.replace(/_/g, " ")} variant={variant} />
                          {entry.target_layer ? (
                            <Badge label={LAYER_DISPLAY_NAMES[entry.target_layer as ContextLayer] || entry.target_layer} variant="default" />
                          ) : null}
                          {entry.source_app ? (
                            <span className="kt-small">via {entry.source_app.replace("_", " ")}</span>
                          ) : null}
                          {isFixture(entry) ? (
                            <Pill tone="neutral" title="Fixture-emitter substrate (KINETIKS_FIXTURES_ENABLED=true). Not real customer signal.">
                              Fixture
                            </Pill>
                          ) : null}
                        </div>
                        <p className="kt-body" style={{ margin: 0 }}>{getEventDescription(entry)}</p>
                        {hasDetail(entry) ? (
                          <details style={{ marginTop: "var(--kt-s-1)" }}>
                            <summary className="kt-small" style={{ cursor: "pointer" }}>Detail</summary>
                            <pre
                              className="kt-code"
                              style={{ marginTop: "var(--kt-s-1)", padding: "var(--kt-s-2)", overflowX: "auto", whiteSpace: "pre-wrap", display: "block" }}
                            >
                              {JSON.stringify(entry.detail, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                      <span className="kt-data-inline" style={{ color: "var(--kt-fg-3)", flexShrink: 0, whiteSpace: "nowrap" }}>
                        {new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
    </div>
  );
}
