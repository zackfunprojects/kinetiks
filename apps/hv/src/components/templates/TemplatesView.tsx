"use client";

import { useState, useEffect, useCallback } from "react";
import type { HvTemplate, TemplateCategory } from "@/types/templates";
import TemplateCard from "./TemplateCard";
import TemplateDetail from "./TemplateDetail";
import CreateTemplateModal from "./CreateTemplateModal";

type CategoryFilter = TemplateCategory | "";

const FILTER_TABS: { value: CategoryFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "cold_outreach", label: "Cold Outreach" },
  { value: "follow_up", label: "Follow-up" },
  { value: "breakup", label: "Breakup" },
  { value: "value_add", label: "Value Add" },
  { value: "meeting_request", label: "Meeting Request" },
  { value: "post_call", label: "Post Call" },
];

export default function TemplatesView() {
  const [templates, setTemplates] = useState<HvTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CategoryFilter>("");
  const [selected, setSelected] = useState<HvTemplate | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("category", filter);
      params.set("per_page", "100");
      const res = await fetch(`/api/hv/templates?${params}`);
      if (!res.ok) throw new Error(`Failed to fetch templates: ${res.status}`);
      const json = await res.json();
      setTemplates(json.data ?? []);
    } catch (err) {
      console.error("Error fetching templates:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  function refresh() {
    setSelected(null);
    setShowCreate(false);
    fetchTemplates();
  }

  async function handleAiGenerate() {
    setGenerating(true);
    setGenerateError("");
    try {
      const category = filter || "cold_outreach";
      const res = await fetch("/api/hv/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, count: 3 }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setGenerateError(json.error ?? "Generation failed");
        return;
      }

      const json = await res.json();
      const savedCount = json.data?.saved ?? 0;
      if (savedCount > 0) {
        fetchTemplates();
      } else {
        setGenerateError("No templates were generated. Try again.");
      }
    } catch (err) {
      console.error("Error generating templates:", err);
      setGenerateError("Failed to generate templates");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            Templates
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Reusable email templates with merge fields and AI blocks
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleAiGenerate}
            disabled={generating}
            style={{
              padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
              border: "1px solid rgba(108,92,231,0.3)",
              backgroundColor: "rgba(108,92,231,0.08)",
              color: "#6C5CE7",
              opacity: generating ? 0.6 : 1,
            }}
          >
            {generating ? "Generating..." : "AI Generate"}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              backgroundColor: "var(--harvest-green)", color: "#fff", fontSize: 13, fontWeight: 600,
            }}
          >
            + New Template
          </button>
        </div>
      </div>

      {/* Generation error */}
      {generateError && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 16,
          backgroundColor: "rgba(212,64,64,0.08)", color: "var(--error, #d44040)", fontSize: 13,
          border: "1px solid rgba(212,64,64,0.2)",
        }}>
          {generateError}
          <button
            onClick={() => setGenerateError("")}
            style={{
              marginLeft: 8, border: "none", background: "none", color: "var(--error, #d44040)",
              cursor: "pointer", fontSize: 13, textDecoration: "underline",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            style={{
              padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border-subtle)",
              backgroundColor: filter === tab.value ? "var(--surface-raised)" : "transparent",
              color: filter === tab.value ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading templates...</p>
      ) : templates.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 60, color: "var(--text-secondary)",
          border: "1px dashed var(--border-subtle)", borderRadius: 12,
        }}>
          <p style={{ fontSize: 15, margin: "0 0 8px" }}>No templates yet</p>
          <p style={{ fontSize: 13, margin: "0 0 16px" }}>
            Create a template manually or let AI generate some based on your Kinetiks ID.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={handleAiGenerate}
              disabled={generating}
              style={{
                padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                border: "1px solid rgba(108,92,231,0.3)",
                backgroundColor: "rgba(108,92,231,0.08)",
                color: "#6C5CE7",
                opacity: generating ? 0.6 : 1,
              }}
            >
              {generating ? "Generating..." : "AI Generate"}
            </button>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                backgroundColor: "var(--harvest-green)", color: "#fff", fontSize: 13, fontWeight: 600,
              }}
            >
              + New Template
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}>
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onClick={() => setSelected(t)}
            />
          ))}
        </div>
      )}

      {/* Detail slide-over */}
      {selected && (
        <TemplateDetail
          template={selected}
          onClose={() => setSelected(null)}
          onUpdated={refresh}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateTemplateModal
          onClose={() => setShowCreate(false)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}
