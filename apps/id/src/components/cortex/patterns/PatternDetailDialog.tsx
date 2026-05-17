"use client";

import { useState, useTransition } from "react";
import type { Pattern } from "@kinetiks/types";
import {
  annotatePattern,
  archivePattern,
  starPattern,
  suppressPattern,
} from "@/app/(app)/cortex/patterns/actions";

export interface PatternDetailDialogProps {
  pattern: Pattern;
  onClose: () => void;
}

export function PatternDetailDialog({ pattern, onClose }: PatternDetailDialogProps) {
  const [annotation, setAnnotation] = useState<string>(pattern.user_annotation ?? "");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    startTransition(async () => {
      setStatus(null);
      const r = await fn();
      setStatus(r.ok ? "Saved." : (r.error ?? "Failed."));
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pattern-detail-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--kt-s-5)",
        zIndex: 100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          maxWidth: 720,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          background: "var(--kt-bg-elevated)",
          border: "1px solid var(--kt-border-1)",
          borderRadius: "var(--kt-radius-2, 10px)",
          padding: "var(--kt-s-5)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--kt-s-4)",
          color: "var(--kt-fg-1)",
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2
            id="pattern-detail-title"
            style={{
              margin: 0,
              fontSize: "var(--kt-fs-20, 20px)",
              fontWeight: "var(--kt-fw-semi)",
              fontFamily: "var(--font-serif)",
            }}
          >
            {pattern.pattern_type
              .split(".")
              .map((p) => p.replace(/_/g, " "))
              .join(" / ")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: 0,
              color: "var(--kt-fg-2)",
              cursor: "pointer",
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        <section aria-labelledby="dims-h">
          <h3 id="dims-h" style={sectionHeading}>
            Dimensions
          </h3>
          <pre style={preStyle}>{JSON.stringify(pattern.dimensions, null, 2)}</pre>
        </section>

        <section aria-labelledby="metrics-h">
          <h3 id="metrics-h" style={sectionHeading}>
            Outcome metrics
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--kt-fg-2)" }}>
            {pattern.outcome_metrics.map((m) => (
              <li key={m.metric_name}>
                <strong style={{ color: "var(--kt-fg-1)" }}>{m.metric_name}</strong>:{" "}
                {m.unit === "ratio_0_1"
                  ? `${(m.value * 100).toFixed(1)}%`
                  : `${m.value.toLocaleString()} ${m.unit}`}
                <span style={{ color: "var(--kt-fg-3)" }}>
                  {" "}
                  (n={m.sample_count.toLocaleString()}, conf={(m.confidence * 100).toFixed(0)}%)
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="evidence-h">
          <h3 id="evidence-h" style={sectionHeading}>
            Evidence
          </h3>
          <p style={{ margin: 0, color: "var(--kt-fg-2)", fontSize: "var(--kt-fs-13, 13px)" }}>
            {pattern.observation_count.toLocaleString()} observations recorded; rolling cap is{" "}
            {pattern.evidence_summary.last_n_ledger_ids?.length ?? 0} Ledger entries. First
            observed{" "}
            <span style={mono}>{new Date(pattern.first_observed_at).toISOString().split("T")[0]}</span>
            , last observed{" "}
            <span style={mono}>{new Date(pattern.last_observed_at).toISOString().split("T")[0]}</span>.
          </p>
        </section>

        <section aria-labelledby="override-h" style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-3)" }}>
          <h3 id="override-h" style={sectionHeading}>
            Your overrides
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--kt-s-2)" }}>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => starPattern(pattern.id, !pattern.user_starred))}
              style={pattern.user_starred ? primaryBtn : secondaryBtn}
            >
              {pattern.user_starred ? "Unstar" : "Star"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => suppressPattern(pattern.id, !pattern.user_suppressed))}
              style={pattern.user_suppressed ? primaryBtn : secondaryBtn}
            >
              {pattern.user_suppressed ? "Unsuppress" : "Suppress"}
            </button>
            <button
              type="button"
              disabled={pending || pattern.status === "archived"}
              onClick={() => run(() => archivePattern(pattern.id))}
              style={dangerBtn}
            >
              Archive
            </button>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-1)" }}>
            <span style={sectionHeading}>Annotation</span>
            <textarea
              rows={3}
              maxLength={2000}
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value)}
              style={{
                padding: 8,
                border: "1px solid var(--kt-border-2)",
                borderRadius: "var(--kt-radius-1, 6px)",
                background: "var(--kt-bg-base)",
                color: "var(--kt-fg-1)",
                fontSize: "var(--kt-fs-13, 13px)",
                resize: "vertical",
              }}
              placeholder="Notes for your own record. Not surfaced in prompts."
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => annotatePattern(pattern.id, annotation))}
              style={secondaryBtn}
            >
              Save annotation
            </button>
          </label>
          {status && (
            <p
              role="status"
              aria-live="polite"
              style={{
                margin: 0,
                fontSize: "var(--kt-fs-12, 12px)",
                color: status === "Saved." ? "var(--kt-success)" : "var(--kt-danger)",
              }}
            >
              {status}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

const sectionHeading: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--kt-fs-12, 12px)",
  textTransform: "uppercase",
  letterSpacing: "var(--kt-tr-eyebrow, 0.1em)",
  color: "var(--kt-fg-3)",
};

const preStyle: React.CSSProperties = {
  margin: "var(--kt-s-2) 0 0",
  padding: 10,
  background: "var(--kt-bg-subtle)",
  border: "1px solid var(--kt-border-1)",
  borderRadius: "var(--kt-radius-1, 6px)",
  fontFamily: "var(--font-mono), monospace",
  fontSize: "var(--kt-fs-12, 12px)",
  color: "var(--kt-fg-1)",
  overflow: "auto",
};

const mono: React.CSSProperties = { fontFamily: "var(--font-mono), monospace" };

const primaryBtn: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: "var(--kt-fs-13, 13px)",
  background: "var(--kt-accent)",
  color: "var(--kt-accent-ink)",
  border: "none",
  borderRadius: "var(--kt-radius-1, 6px)",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: "var(--kt-fs-13, 13px)",
  background: "var(--kt-bg-base)",
  color: "var(--kt-fg-1)",
  border: "1px solid var(--kt-border-2)",
  borderRadius: "var(--kt-radius-1, 6px)",
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  ...secondaryBtn,
  color: "var(--kt-danger)",
  borderColor: "var(--kt-danger)",
};
