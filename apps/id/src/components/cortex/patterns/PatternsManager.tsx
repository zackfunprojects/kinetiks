"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { Pattern, PatternLifecycleStatus } from "@kinetiks/types";
import { PatternDetailDialog } from "./PatternDetailDialog";

interface AvailableType {
  pattern_type: string;
  description: string;
}

export interface PatternsManagerFilters {
  type: string;
  status: string;
  app: string;
  confidence_min: string;
  starred: boolean;
  suppressed: boolean;
  archived: boolean;
}

export interface PatternsManagerProps {
  patterns: Pattern[];
  total: number;
  page: number;
  pageSize: number;
  availableTypes: AvailableType[];
  filters: PatternsManagerFilters;
}

const STATUS_TONE: Record<PatternLifecycleStatus, { label: string; bg: string; fg: string }> = {
  emerging: { label: "Emerging", bg: "var(--kt-accent-soft)", fg: "var(--kt-accent-ink)" },
  validated: { label: "Validated", bg: "var(--kt-success-soft)", fg: "var(--kt-success)" },
  declining: { label: "Declining", bg: "var(--kt-warning-soft)", fg: "var(--kt-warning)" },
  archived: { label: "Archived", bg: "var(--kt-bg-muted)", fg: "var(--kt-fg-3)" },
};

function humanizeType(t: string): string {
  return t
    .split(".")
    .map((p) => p.replace(/_/g, " "))
    .join(" / ");
}

function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function PatternsManager({
  patterns,
  total,
  page,
  pageSize,
  availableTypes,
  filters,
}: PatternsManagerProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<PatternsManagerFilters>(filters);
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);

  const apply = useCallback(
    (next: PatternsManagerFilters) => {
      const params = new URLSearchParams();
      if (next.type) params.set("type", next.type);
      if (next.status) params.set("status", next.status);
      if (next.app) params.set("app", next.app);
      if (next.confidence_min) params.set("confidence_min", next.confidence_min);
      if (next.starred) params.set("starred", "true");
      if (next.suppressed) params.set("suppressed", "true");
      if (next.archived) params.set("archived", "true");
      const qs = params.toString();
      router.push(qs ? `/cortex/patterns?${qs}` : "/cortex/patterns");
    },
    [router],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const goToPage = useCallback(
    (n: number) => {
      const params = new URLSearchParams();
      if (filters.type) params.set("type", filters.type);
      if (filters.status) params.set("status", filters.status);
      if (filters.app) params.set("app", filters.app);
      if (filters.confidence_min) params.set("confidence_min", filters.confidence_min);
      if (filters.starred) params.set("starred", "true");
      if (filters.suppressed) params.set("suppressed", "true");
      if (filters.archived) params.set("archived", "true");
      if (n > 1) params.set("page", String(n));
      const qs = params.toString();
      router.push(qs ? `/cortex/patterns?${qs}` : "/cortex/patterns");
    },
    [filters, router],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-5)" }}>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--kt-s-4)",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "var(--kt-fs-26)",
              fontWeight: "var(--kt-fw-semi)",
              color: "var(--kt-fg-1)",
              fontFamily: "var(--font-serif)",
            }}
          >
            Patterns
          </h1>
          <p
            style={{
              margin: "var(--kt-s-2) 0 0",
              fontSize: "var(--kt-fs-14)",
              color: "var(--kt-fg-2)",
              maxWidth: 640,
            }}
          >
            What your suite apps have learned, with outcome data and confidence. Star
            the ones you want kept around, suppress noisy ones, annotate the ones that
            matter.
          </p>
        </div>
        <div style={{ fontSize: "var(--kt-fs-13)", color: "var(--kt-fg-3)" }}>
          {total === 0 ? "No patterns yet" : `${total.toLocaleString()} total`}
        </div>
      </header>

      <section
        aria-label="Filters"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "var(--kt-s-3)",
          padding: "var(--kt-s-4)",
          border: "1px solid var(--kt-border-1)",
          borderRadius: "var(--kt-radius-2, 10px)",
          background: "var(--kt-bg-subtle)",
        }}
      >
        <label style={labelStyle}>
          Pattern type
          <select
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value })}
            style={selectStyle}
            aria-label="Filter by pattern type"
          >
            <option value="">All</option>
            {availableTypes.map((t) => (
              <option key={t.pattern_type} value={t.pattern_type}>
                {humanizeType(t.pattern_type)}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Status
          <select
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            style={selectStyle}
          >
            <option value="">All</option>
            <option value="emerging">Emerging</option>
            <option value="validated">Validated</option>
            <option value="declining">Declining</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label style={labelStyle}>
          Emitting app
          <input
            type="text"
            placeholder="e.g. harvest"
            value={draft.app}
            onChange={(e) => setDraft({ ...draft, app: e.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Min confidence
          <input
            type="number"
            step="0.05"
            min={0}
            max={1}
            placeholder="0.00"
            value={draft.confidence_min}
            onChange={(e) => setDraft({ ...draft, confidence_min: e.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={draft.starred}
            onChange={(e) => setDraft({ ...draft, starred: e.target.checked })}
          />
          Starred only
        </label>
        <label style={{ ...labelStyle, flexDirection: "row", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={draft.suppressed}
            onChange={(e) => setDraft({ ...draft, suppressed: e.target.checked })}
          />
          Show suppressed
        </label>
        <div style={{ display: "flex", gap: "var(--kt-s-2)", alignItems: "end" }}>
          <button
            type="button"
            onClick={() => apply(draft)}
            style={primaryButtonStyle}
            aria-label="Apply filters"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => {
              const empty: PatternsManagerFilters = {
                type: "",
                status: "",
                app: "",
                confidence_min: "",
                starred: false,
                suppressed: false,
                archived: false,
              };
              setDraft(empty);
              apply(empty);
            }}
            style={secondaryButtonStyle}
            aria-label="Reset filters"
          >
            Reset
          </button>
        </div>
      </section>

      {patterns.length === 0 ? (
        <div
          style={{
            padding: "var(--kt-s-7)",
            textAlign: "center",
            color: "var(--kt-fg-2)",
            border: "1px dashed var(--kt-border-1)",
            borderRadius: "var(--kt-radius-2, 10px)",
          }}
          role="status"
          aria-live="polite"
        >
          <p style={{ margin: 0, fontWeight: "var(--kt-fw-med)", color: "var(--kt-fg-1)" }}>
            No patterns match those filters.
          </p>
          <p style={{ margin: "var(--kt-s-2) 0 0", fontSize: "var(--kt-fs-14)" }}>
            Patterns are emitted by your suite apps as evidence accumulates. Once Harvest
            (and later Dark Madder, Implosion) ship a few weeks of data, validated
            patterns will start to appear here.
          </p>
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--kt-s-3)",
          }}
        >
          {patterns.map((p) => {
            const tone = STATUS_TONE[p.status];
            // Canonical L1b: single primary outcome on the row.
            const primaryMetric = {
              metric_name: p.outcome_metric,
              value: p.outcome_value,
              unit: "ratio_0_1", // descriptor declares the unit; row stores value+metric only
            };
            return (
              <li
                key={p.id}
                style={{
                  padding: "var(--kt-s-4) var(--kt-s-5)",
                  border: "1px solid var(--kt-border-1)",
                  borderRadius: "var(--kt-radius-2, 10px)",
                  background: "var(--kt-bg-elevated)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--kt-s-2)",
                  cursor: "pointer",
                }}
                onClick={() => setSelectedPattern(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedPattern(p);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`View details for pattern ${p.pattern_type}`}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--kt-s-3)",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: tone.bg,
                      color: tone.fg,
                      fontSize: "var(--kt-fs-11, 11px)",
                      fontWeight: "var(--kt-fw-med)",
                    }}
                  >
                    {tone.label}
                  </span>
                  <strong style={{ color: "var(--kt-fg-1)", fontSize: "var(--kt-fs-15, 15px)" }}>
                    {humanizeType(p.pattern_type)}
                  </strong>
                  <span style={{ color: "var(--kt-fg-3)", fontSize: "var(--kt-fs-12, 12px)" }}>
                    via {p.source_app}
                  </span>
                  {p.source_app === "kinetiks_fixtures" && (
                    <span
                      title="Generated by the fixture emitter (KINETIKS_FIXTURES_ENABLED=true). Not real customer signal."
                      style={{
                        fontSize: "var(--kt-fs-10, 10px)",
                        fontWeight: "var(--kt-fw-med)",
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                        color: "var(--kt-fg-3)",
                        border: "1px solid var(--kt-border-2)",
                        borderRadius: 4,
                        padding: "1px 6px",
                        fontFamily: "var(--font-mono), monospace",
                      }}
                    >
                      Fixture
                    </span>
                  )}
                  {p.user_starred && (
                    <span
                      title="Starred"
                      aria-label="Starred"
                      style={{ color: "var(--kt-warm)", fontSize: "var(--kt-fs-13, 13px)" }}
                    >
                      ★
                    </span>
                  )}
                  {p.user_suppressed && (
                    <span
                      title="Suppressed"
                      aria-label="Suppressed"
                      style={{ color: "var(--kt-fg-3)", fontSize: "var(--kt-fs-12, 12px)" }}
                    >
                      (suppressed)
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: "var(--kt-s-3)",
                    color: "var(--kt-fg-2)",
                    fontSize: "var(--kt-fs-13, 13px)",
                  }}
                >
                  <div>
                    <span style={statLabel}>Confidence</span>
                    <span style={statValue}>{formatPercent(p.confidence_score)}</span>
                  </div>
                  <div>
                    <span style={statLabel}>Observations</span>
                    <span style={statValue}>{p.observation_count.toLocaleString()}</span>
                  </div>
                  {primaryMetric && (
                    <div>
                      <span style={statLabel}>{primaryMetric.metric_name}</span>
                      <span style={statValue}>
                        {primaryMetric.unit === "ratio_0_1"
                          ? formatPercent(primaryMetric.value)
                          : primaryMetric.value.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {p.applies_to_icp && (
                    <div>
                      <span style={statLabel}>ICP</span>
                      <span style={statValue}>{p.applies_to_icp}</span>
                    </div>
                  )}
                  <div>
                    <span style={statLabel}>Last observed</span>
                    <span style={{ ...statValue, fontFamily: "var(--font-mono), monospace" }}>
                      {new Date(p.last_observed_at).toISOString().split("T")[0]}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selectedPattern && (
        <PatternDetailDialog
          pattern={selectedPattern}
          onClose={() => setSelectedPattern(null)}
        />
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "var(--kt-s-2)",
            paddingTop: "var(--kt-s-3)",
          }}
        >
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            style={secondaryButtonStyle}
          >
            Previous
          </button>
          <span style={{ alignSelf: "center", color: "var(--kt-fg-2)", fontSize: "var(--kt-fs-13, 13px)" }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            style={secondaryButtonStyle}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--kt-s-1)",
  fontSize: "var(--kt-fs-12, 12px)",
  color: "var(--kt-fg-2)",
  textTransform: "uppercase",
  letterSpacing: "var(--kt-tr-eyebrow, 0.1em)",
};

const selectStyle: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: "var(--kt-fs-13, 13px)",
  border: "1px solid var(--kt-border-2)",
  borderRadius: "var(--kt-radius-1, 6px)",
  background: "var(--kt-bg-base)",
  color: "var(--kt-fg-1)",
  textTransform: "none",
  letterSpacing: 0,
};

const inputStyle: React.CSSProperties = {
  ...selectStyle,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: "var(--kt-fs-13, 13px)",
  fontWeight: "var(--kt-fw-med)",
  background: "var(--kt-accent)",
  color: "var(--kt-accent-ink)",
  border: "none",
  borderRadius: "var(--kt-radius-1, 6px)",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: "var(--kt-fs-13, 13px)",
  background: "var(--kt-bg-base)",
  color: "var(--kt-fg-1)",
  border: "1px solid var(--kt-border-2)",
  borderRadius: "var(--kt-radius-1, 6px)",
  cursor: "pointer",
};

const statLabel: React.CSSProperties = {
  display: "block",
  fontSize: "var(--kt-fs-11, 11px)",
  color: "var(--kt-fg-3)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const statValue: React.CSSProperties = {
  display: "block",
  color: "var(--kt-fg-1)",
  fontWeight: "var(--kt-fw-med)",
};
