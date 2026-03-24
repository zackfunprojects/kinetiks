"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { LedgerEntry, ContextLayer, LedgerEventType } from "@kinetiks/types";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
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

export function LedgerViewer({
  entries,
  page,
  totalPages,
  filters,
}: LedgerViewerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "1");
    router.push(`/ledger?${params.toString()}`);
  }

  function handlePageChange(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`/ledger?${params.toString()}`);
  }

  const selectStyle: React.CSSProperties = {
    padding: "6px 10px",
    border: "1px solid var(--border-default)",
    borderRadius: 6,
    fontSize: 13,
    color: "var(--text-secondary)",
    background: "var(--bg-surface)",
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <select
          value={filters.type || ""}
          onChange={(e) => updateFilter("type", e.target.value || null)}
          style={selectStyle}
        >
          <option value="">All events</option>
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <select
          value={filters.app || ""}
          onChange={(e) => updateFilter("app", e.target.value || null)}
          style={selectStyle}
        >
          <option value="">All sources</option>
          {SOURCE_APPS.map((app) => (
            <option key={app} value={app}>
              {app.replace("_", " ")}
            </option>
          ))}
        </select>

        <select
          value={filters.layer || ""}
          onChange={(e) => updateFilter("layer", e.target.value || null)}
          style={selectStyle}
        >
          <option value="">All layers</option>
          {LAYERS.map((l) => (
            <option key={l} value={l}>
              {LAYER_DISPLAY_NAMES[l]}
            </option>
          ))}
        </select>
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-tertiary)" }}>
          <p style={{ fontSize: 14 }}>No ledger entries found</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {entries.map((entry, i) => {
            const variant = EVENT_VARIANTS[entry.event_type] || "default";
            return (
              <div
                key={entry.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: i < entries.length - 1 ? "1px solid var(--bg-surface-raised)" : undefined,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background:
                      variant === "success" ? "var(--success)" :
                      variant === "error" ? "var(--error)" :
                      variant === "accent" ? "var(--accent)" :
                      variant === "warning" ? "var(--warning)" : "var(--text-tertiary)",
                    marginTop: 6,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                    <Badge
                      label={entry.event_type.replace(/_/g, " ")}
                      variant={variant}
                    />
                    {entry.target_layer && (
                      <Badge
                        label={LAYER_DISPLAY_NAMES[entry.target_layer as ContextLayer] || entry.target_layer}
                        variant="default"
                      />
                    )}
                    {entry.source_app && (
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        via {entry.source_app.replace("_", " ")}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {getEventDescription(entry)}
                  </p>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0, whiteSpace: "nowrap", fontFamily: "var(--font-mono), monospace" }}>
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
