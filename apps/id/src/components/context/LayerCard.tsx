import Link from "next/link";
import type { ContextLayer } from "@kinetiks/types";
import { Card } from "@/components/ui/Card";
import {
  LAYER_DISPLAY_NAMES,
  LAYER_DESCRIPTIONS,
  LAYER_ICONS,
  getLayerPreview,
} from "@/lib/utils/layer-display";
import { Badge } from "@/components/ui/Badge";

interface LayerCardProps {
  layer: ContextLayer;
  data: Record<string, unknown> | null;
  confidence: number;
  source: string | null;
  updatedAt: string | null;
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

export function LayerCard({
  layer,
  data,
  confidence,
  source,
  updatedAt,
}: LayerCardProps) {
  const previews = getLayerPreview(layer, data);
  const isEmpty = !data || Object.keys(data).length === 0;

  return (
    <Link href={`/context/${layer}`} style={{ textDecoration: "none", color: "inherit" }}>
      <Card
        style={{
          height: "100%",
          transition: "box-shadow 0.15s, border-color 0.15s",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>{LAYER_ICONS[layer]}</span>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>
            {LAYER_DISPLAY_NAMES[layer]}
          </h3>
        </div>

        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#999", lineHeight: 1.4 }}>
          {LAYER_DESCRIPTIONS[layer]}
        </p>

        {/* Confidence bar */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#999" }}>Confidence</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6C5CE7" }}>
              {Math.round(confidence)}%
            </span>
          </div>
          <div
            style={{
              height: 4,
              borderRadius: 2,
              background: "#E5E7EB",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(confidence, 100)}%`,
                background: "#6C5CE7",
                borderRadius: 2,
                transition: "width 0.3s ease-out",
              }}
            />
          </div>
        </div>

        {/* Preview data or empty state */}
        {isEmpty ? (
          <p style={{ margin: 0, fontSize: 12, color: "#D1D5DB", fontStyle: "italic" }}>
            No data yet
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {previews.map((preview, i) => (
              <p key={i} style={{ margin: 0, fontSize: 12, color: "#4B5563" }}>
                {preview}
              </p>
            ))}
          </div>
        )}

        {/* Footer: source + last updated */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
            paddingTop: 8,
            borderTop: "1px solid #F3F4F6",
          }}
        >
          {source && (
            <Badge
              label={source.replace("_", " ")}
              variant={source.startsWith("user") ? "purple" : "default"}
            />
          )}
          {updatedAt && (
            <span style={{ fontSize: 11, color: "#999" }}>
              {timeAgo(updatedAt)}
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
