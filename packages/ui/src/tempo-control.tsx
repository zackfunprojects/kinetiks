import { Button } from "./button";

// Local type keeps @kinetiks/ui decoupled from the domain types package;
// structurally identical to @kinetiks/types' TempoMode.
export type TempoModeValue = "system_leads" | "user_leads" | "pair";

export interface TempoControlProps {
  value: TempoModeValue;
  onChange: (value: TempoModeValue) => void;
}

const OPTIONS: ReadonlyArray<{ value: TempoModeValue; label: string }> = [
  { value: "system_leads", label: "System leads" },
  { value: "pair", label: "Pair" },
  { value: "user_leads", label: "You lead" },
];

/**
 * The collaboration tempo control (spec §7.1): System Leads / Pair / User Leads.
 * A segmented control built from @kinetiks/ui Buttons (active = accent).
 */
export function TempoControl({ value, onChange }: TempoControlProps) {
  return (
    <div
      role="group"
      aria-label="Collaboration tempo"
      style={{ display: "inline-flex", gap: "var(--kt-s-1)" }}
    >
      {OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          variant={value === opt.value ? "accent" : "ghost"}
          size="sm"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
