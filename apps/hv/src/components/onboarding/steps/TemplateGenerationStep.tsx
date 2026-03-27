"use client";

import { useState } from "react";

interface GeneratedTemplate {
  id: string;
  name: string;
  subject_template: string;
  category: string;
}

interface TemplateGenerationStepProps {
  submitting: boolean;
  onComplete: (count: number) => void;
}

export default function TemplateGenerationStep({ submitting, onComplete }: TemplateGenerationStepProps) {
  const [templates, setTemplates] = useState<GeneratedTemplate[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/hv/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "cold_outreach", count: 3 }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to generate templates");
        return;
      }
      const json = await res.json();
      if (json.data?.templates) {
        setTemplates(json.data.templates as GeneratedTemplate[]);
        setGenerated(true);
      }
    } catch (err) {
      console.error("Template generation failed:", err);
      setError("Failed to generate templates. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: "var(--space-5)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          Starter Templates
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
          AI will generate cold outreach templates using your product, ICP, and voice profile. You can edit them anytime.
        </p>
      </div>

      {error && (
        <div style={{
          padding: "var(--space-3)",
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--error-subtle, #fef2f2)",
          color: "var(--error, #dc2626)",
          fontSize: 13,
          marginBottom: "var(--space-4)",
        }}>
          {error}
        </div>
      )}

      {!generated ? (
        <div style={{
          padding: "var(--space-8) var(--space-4)",
          textAlign: "center",
          border: "1px dashed var(--border-default)",
          borderRadius: "var(--radius-md)",
          marginBottom: "var(--space-4)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>&#9993;</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4 }}>
            Ready to generate your first templates
          </div>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" }}>
            We will create 3 cold outreach templates tailored to your product, ICP, and outreach goal.
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: "10px 24px",
              borderRadius: "var(--radius-md)",
              border: "none",
              backgroundColor: "var(--harvest-green)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: generating ? "not-allowed" : "pointer",
              opacity: generating ? 0.7 : 1,
              transition: "all 0.2s",
            }}
          >
            {generating ? "Generating..." : "Generate Templates"}
          </button>
          {generating && (
            <div style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              marginTop: 12,
            }}>
              This may take 10-15 seconds...
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: "var(--space-3)",
            fontSize: 13,
            color: "var(--harvest-green)",
            fontWeight: 500,
          }}>
            <span>&#10003;</span>
            {templates.length} template{templates.length !== 1 ? "s" : ""} generated
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {templates.map((t) => (
              <div
                key={t.id}
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-default)",
                  backgroundColor: "var(--surface-base)",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  Subject: {t.subject_template}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
            You can edit and customize these templates later in Settings.
          </div>
        </div>
      )}

      {/* Continue button */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {!generated && (
          <button
            onClick={() => onComplete(0)}
            disabled={submitting || generating}
            style={{
              padding: "10px 24px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              backgroundColor: "transparent",
              color: "var(--text-tertiary)",
              fontSize: 14,
              fontWeight: 500,
              cursor: submitting || generating ? "not-allowed" : "pointer",
            }}
          >
            Skip
          </button>
        )}
        {generated && (
          <button
            onClick={() => onComplete(templates.length)}
            disabled={submitting}
            style={{
              padding: "10px 24px",
              borderRadius: "var(--radius-md)",
              border: "none",
              backgroundColor: "var(--harvest-green)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Saving..." : "Use These"}
          </button>
        )}
      </div>
    </div>
  );
}
