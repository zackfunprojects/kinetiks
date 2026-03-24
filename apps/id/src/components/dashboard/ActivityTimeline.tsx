import type { LedgerEntry } from "@kinetiks/types";
import { Badge } from "@/components/ui/Badge";

const EVENT_LABELS: Record<string, { label: string; variant: "success" | "error" | "purple" | "default" | "warning" }> = {
  proposal_accepted: { label: "Accepted", variant: "success" },
  proposal_declined: { label: "Declined", variant: "error" },
  routing_sent: { label: "Routed", variant: "purple" },
  user_edit: { label: "Edited", variant: "default" },
  archivist_clean: { label: "Cleaned", variant: "default" },
  expiration: { label: "Expired", variant: "warning" },
  import: { label: "Imported", variant: "purple" },
  archivist_gap_detect: { label: "Gap found", variant: "warning" },
};

function getEventDescription(entry: LedgerEntry): string {
  const detail = entry.detail;
  switch (entry.event_type) {
    case "proposal_accepted":
      return `Proposal for ${entry.target_layer || "unknown"} layer accepted${entry.source_app ? ` from ${entry.source_app}` : ""}`;
    case "proposal_declined":
      return `Proposal for ${entry.target_layer || "unknown"} layer declined${detail.decline_reason ? ` - ${detail.decline_reason}` : ""}`;
    case "routing_sent":
      return `Learning routed to ${detail.target_app || "app"}${detail.relevance_note ? ` - ${detail.relevance_note}` : ""}`;
    case "user_edit":
      return `${entry.target_layer || "Context"} layer updated manually`;
    case "archivist_clean":
      return `Data cleaning pass completed`;
    case "expiration":
      return `${entry.target_layer || "Data"} entry expired`;
    case "import":
      return `Import processed${detail.stats ? ` - ${(detail.stats as Record<string, number>).imported || 0} items` : ""}`;
    default:
      return entry.event_type;
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface ActivityTimelineProps {
  entries: LedgerEntry[];
}

export function ActivityTimeline({ entries }: ActivityTimelineProps) {
  if (entries.length === 0) {
    return (
      <p style={{ color: "#999", fontSize: 13, padding: "12px 0" }}>
        No recent activity
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {entries.map((entry, i) => {
        const eventInfo = EVENT_LABELS[entry.event_type] || {
          label: entry.event_type,
          variant: "default" as const,
        };
        return (
          <div
            key={entry.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "10px 0",
              borderBottom: i < entries.length - 1 ? "1px solid #F3F4F6" : undefined,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: eventInfo.variant === "success" ? "#10B981" :
                  eventInfo.variant === "error" ? "#EF4444" :
                  eventInfo.variant === "purple" ? "#6C5CE7" :
                  eventInfo.variant === "warning" ? "#F59E0B" : "#9CA3AF",
                marginTop: 5,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <Badge label={eventInfo.label} variant={eventInfo.variant} />
                {entry.target_layer && (
                  <span style={{ fontSize: 11, color: "#999" }}>
                    {entry.target_layer}
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.4 }}>
                {getEventDescription(entry)}
              </p>
            </div>
            <span style={{ fontSize: 11, color: "#999", flexShrink: 0, marginTop: 2 }}>
              {timeAgo(entry.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
