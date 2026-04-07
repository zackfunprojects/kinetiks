"use client";

import type { ContextLayer } from "@kinetiks/types";
import type { ConfidenceScores } from "@/lib/cortex";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { LayerCard } from "./LayerCard";

const LAYERS: ContextLayer[] = [
  "org",
  "products",
  "voice",
  "customers",
  "narrative",
  "competitive",
  "market",
  "brand",
];

interface LayerData {
  data: Record<string, unknown> | null;
  source: string | null;
  updated_at: string | null;
}

interface ContextOverviewProps {
  layers: Record<ContextLayer, LayerData>;
  confidence: ConfidenceScores;
}

export function ContextOverview({ layers, confidence }: ContextOverviewProps) {
  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--text-primary)" }}>
          Context Structure
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>
          Your 8-layer business identity. Click any layer to view and edit.
        </p>
      </div>

      {/* Aggregate score */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          marginBottom: 32,
          padding: 24,
          background: "var(--bg-base)",
          borderRadius: 12,
        }}
      >
        <ConfidenceRing score={confidence.aggregate} size={100} strokeWidth={8} />
        <div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
            Overall Confidence: {Math.round(confidence.aggregate)}%
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            Weighted average across all 8 layers
          </p>
        </div>
      </div>

      {/* Layer grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {LAYERS.map((layer) => {
          const layerData = layers[layer];
          return (
            <LayerCard
              key={layer}
              layer={layer}
              data={layerData.data}
              confidence={confidence[layer]}
              source={layerData.source}
              updatedAt={layerData.updated_at}
            />
          );
        })}
      </div>
    </div>
  );
}
