"use client";

import { useState } from "react";
import type { ContextLayer, Proposal } from "@kinetiks/types";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import {
  LAYER_DISPLAY_NAMES,
  LAYER_DESCRIPTIONS,
} from "@/lib/utils/layer-display";
import { FieldEditor } from "./FieldEditor";
import { ArrayFieldEditor } from "./ArrayFieldEditor";
import Link from "next/link";

interface LayerDetailProps {
  layer: ContextLayer;
  data: Record<string, unknown> | null;
  confidence: number;
  source: string | null;
  updatedAt: string | null;
  recentProposals: Proposal[];
}

// Schema definitions per layer for rendering the editor
const LAYER_SCHEMAS: Record<ContextLayer, Array<{
  name: string;
  type: "string" | "number" | "textarea" | "select" | "array" | "tone";
  options?: string[];
  itemFields?: Array<{ name: string; type?: "string" | "number" | "textarea" | "select"; options?: string[] }>;
}>> = {
  org: [
    { name: "company_name", type: "string" },
    { name: "legal_entity", type: "string" },
    { name: "industry", type: "string" },
    { name: "sub_industry", type: "string" },
    { name: "stage", type: "select", options: ["pre-revenue", "early", "growth", "scale"] },
    { name: "founded_year", type: "number" },
    { name: "geography", type: "string" },
    { name: "team_size", type: "string" },
    { name: "funding_status", type: "string" },
    { name: "website", type: "string" },
    { name: "description", type: "textarea" },
  ],
  products: [
    {
      name: "products",
      type: "array",
      itemFields: [
        { name: "name", type: "string" },
        { name: "description", type: "textarea" },
        { name: "value_prop", type: "textarea" },
        { name: "pricing_model", type: "select", options: ["free", "freemium", "paid", "enterprise"] },
        { name: "pricing_detail", type: "string" },
        { name: "target_persona", type: "string" },
      ],
    },
  ],
  voice: [
    { name: "tone", type: "tone" },
    {
      name: "messaging_patterns",
      type: "array",
      itemFields: [
        { name: "context", type: "string" },
        { name: "pattern", type: "textarea" },
        { name: "performance", type: "string" },
      ],
    },
    {
      name: "writing_samples",
      type: "array",
      itemFields: [
        { name: "source", type: "string" },
        { name: "text", type: "textarea" },
        { name: "type", type: "select", options: ["own", "aspirational"] },
      ],
    },
  ],
  customers: [
    {
      name: "personas",
      type: "array",
      itemFields: [
        { name: "name", type: "string" },
        { name: "role", type: "string" },
        { name: "company_type", type: "string" },
      ],
    },
  ],
  narrative: [
    { name: "origin_story", type: "textarea" },
    { name: "founder_thesis", type: "textarea" },
    { name: "why_now", type: "textarea" },
    { name: "brand_arc", type: "textarea" },
    { name: "media_positioning", type: "textarea" },
    {
      name: "validated_angles",
      type: "array",
      itemFields: [
        { name: "angle", type: "string" },
        { name: "validation_source", type: "string" },
        { name: "performance", type: "string" },
      ],
    },
  ],
  competitive: [
    {
      name: "competitors",
      type: "array",
      itemFields: [
        { name: "name", type: "string" },
        { name: "website", type: "string" },
        { name: "positioning", type: "textarea" },
        { name: "narrative_territory", type: "string" },
      ],
    },
  ],
  market: [
    {
      name: "trends",
      type: "array",
      itemFields: [
        { name: "topic", type: "string" },
        { name: "direction", type: "select", options: ["rising", "falling", "stable", "emerging"] },
        { name: "relevance", type: "select", options: ["direct", "adjacent", "background"] },
      ],
    },
  ],
  brand: [
    { name: "colors", type: "string" },
    { name: "typography", type: "string" },
    { name: "tokens", type: "string" },
  ],
};

function ToneEditor({
  tone,
  onChange,
}: {
  tone: Record<string, number>;
  onChange: (tone: Record<string, number>) => void;
}) {
  const dimensions = ["formality", "warmth", "humor", "authority"];

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
        Tone
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {dimensions.map((dim) => (
          <div key={dim}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "#6B7280", textTransform: "capitalize" }}>
                {dim}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#6C5CE7" }}>
                {tone[dim] ?? 50}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={tone[dim] ?? 50}
              onChange={(e) => onChange({ ...tone, [dim]: Number(e.target.value) })}
              style={{ width: "100%", accentColor: "#6C5CE7" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LayerDetail({
  layer,
  data: initialData,
  confidence,
  source,
  updatedAt,
  recentProposals,
}: LayerDetailProps) {
  const [data, setData] = useState<Record<string, unknown>>(initialData ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges = JSON.stringify(data) !== JSON.stringify(initialData ?? {});
  const schema = LAYER_SCHEMAS[layer];

  function updateField(name: string, value: unknown) {
    setData((prev) => ({ ...prev, [name]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/context/${layer}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to save");
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/context"
          style={{ fontSize: 13, color: "#6C5CE7", textDecoration: "none" }}
        >
          &larr; Back to Context
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <ConfidenceRing score={confidence} size={64} strokeWidth={5} />
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1a1a2e" }}>
            {LAYER_DISPLAY_NAMES[layer]}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
            {LAYER_DESCRIPTIONS[layer]}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {source && (
              <Badge
                label={source.replace("_", " ")}
                variant={source.startsWith("user") ? "purple" : "default"}
              />
            )}
            {updatedAt && (
              <span style={{ fontSize: 11, color: "#999" }}>
                Last updated: {new Date(updatedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Editor */}
      <Card style={{ marginBottom: 24 }}>
        {schema.map((field) => {
          if (field.type === "array" && field.itemFields) {
            const items = (data[field.name] as Record<string, unknown>[]) ?? [];
            return (
              <ArrayFieldEditor
                key={field.name}
                fieldName={field.name}
                items={items}
                itemFields={field.itemFields}
                onChange={(items) => updateField(field.name, items)}
              />
            );
          }

          if (field.type === "tone") {
            const tone = (data[field.name] as Record<string, number>) ?? {};
            return (
              <ToneEditor
                key={field.name}
                tone={tone}
                onChange={(t) => updateField(field.name, t)}
              />
            );
          }

          return (
            <FieldEditor
              key={field.name}
              fieldName={field.name}
              value={data[field.name]}
              onChange={(v) => updateField(field.name, v)}
              type={field.type as "string" | "number" | "textarea" | "select"}
              options={field.options}
            />
          );
        })}

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            style={{
              padding: "8px 20px",
              background: hasChanges ? "#6C5CE7" : "#E5E7EB",
              color: hasChanges ? "#fff" : "#999",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: hasChanges && !saving ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {saved && (
            <span style={{ fontSize: 13, color: "#10B981" }}>
              Saved successfully
            </span>
          )}
          {error && (
            <span style={{ fontSize: 13, color: "#EF4444" }}>{error}</span>
          )}
        </div>
      </Card>

      {/* Recent proposals */}
      {recentProposals.length > 0 && (
        <div>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#1a1a2e" }}>
            Recent Changes
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentProposals.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background: "#FAFAFA",
                  borderRadius: 8,
                  fontSize: 13,
                }}
              >
                <Badge
                  label={p.status}
                  variant={
                    p.status === "accepted" ? "success" :
                    p.status === "declined" ? "error" :
                    p.status === "escalated" ? "warning" : "default"
                  }
                />
                <span style={{ color: "#374151" }}>
                  {p.action} from {p.source_app?.replace("_", " ") || "system"}
                </span>
                <span style={{ color: "#999", marginLeft: "auto", fontSize: 11 }}>
                  {new Date(p.submitted_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
