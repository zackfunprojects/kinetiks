"use client";

const RANGES = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

interface DateRangePickerProps {
  value: number;
  onChange: (days: number) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--kt-bg-base)", borderRadius: 6, padding: 2 }}>
      {RANGES.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          style={{
            padding: "4px 12px",
            borderRadius: 4,
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: value === range.value ? 500 : 400,
            color: value === range.value ? "var(--kt-fg-1)" : "var(--kt-fg-3)",
            background: value === range.value ? "var(--kt-bg-muted)" : "transparent",
          }}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}
