"use client";

export type SeverityFilter = "all" | "notable_plus" | "urgent_only";

interface Props {
  severity: SeverityFilter;
  onSeverityChange: (next: SeverityFilter) => void;
  sourceApp: string | "all";
  availableSources: string[];
  onSourceChange: (next: string | "all") => void;
}

const SEVERITY_LABELS: Record<SeverityFilter, string> = {
  all: "All",
  notable_plus: "Notable + Urgent",
  urgent_only: "Urgent only",
};

export function InsightFilters({
  severity,
  onSeverityChange,
  sourceApp,
  availableSources,
  onSourceChange,
}: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Insight filters"
      style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
    >
      <FilterGroup label="Severity">
        {(["all", "notable_plus", "urgent_only"] as const).map((s) => (
          <Chip
            key={s}
            active={severity === s}
            onClick={() => onSeverityChange(s)}
            ariaPressed={severity === s}
          >
            {SEVERITY_LABELS[s]}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup label="Source">
        <Chip
          active={sourceApp === "all"}
          onClick={() => onSourceChange("all")}
          ariaPressed={sourceApp === "all"}
        >
          All
        </Chip>
        {availableSources.map((s) => (
          <Chip
            key={s}
            active={sourceApp === s}
            onClick={() => onSourceChange(s)}
            ariaPressed={sourceApp === s}
          >
            {s}
          </Chip>
        ))}
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "var(--kt-fg-3)" }}>{label}:</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  ariaPressed,
  children,
}: {
  active: boolean;
  onClick: () => void;
  ariaPressed: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ariaPressed}
      style={{
        padding: "4px 10px",
        borderRadius: "var(--kt-radius-pill, 999px)",
        border: `1px solid ${active ? "var(--kt-accent, var(--kt-border-2))" : "var(--kt-border-1)"}`,
        background: active ? "var(--kt-accent-soft, var(--kt-bg-2))" : "transparent",
        color: active ? "var(--kt-accent, var(--kt-fg-1))" : "var(--kt-fg-2)",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
