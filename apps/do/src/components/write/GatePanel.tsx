"use client";
import { useEffect, useState } from "react";

/**
 * GatePanel — renders a `GateResult` from Lens inside ReplyEditor.
 *
 * Layout:
 *   - Status pill (clear / advisory / blocked)
 *   - One row per check, with severity icon, message, and recommendation
 *   - Override button on warning rows (advisories) — never on blocking rows
 *
 * Mobile (`md:hidden` variant) is a compact strip above the keyboard
 * that collapses everything to the status pill + count and reveals on tap.
 *
 * Skipped LLM rows ("Skipped — automated check unavailable.") render
 * muted and are intentionally never blocking. The Post button does
 * not consult skipped rows for its disabled state.
 */
import type { GateCheck, GateCheckType, GateResult } from "@kinetiks/deskof";

interface Props {
  result: GateResult | null;
  overrides: Set<GateCheckType>;
  onOverride: (type: GateCheckType) => void;
  variant?: "desktop" | "mobile";
}

export function GatePanel({
  result,
  overrides,
  onOverride,
  variant = "desktop",
}: Props) {
  if (!result) return null;

  const pillStyle = pillStyleFor(result.status);

  if (variant === "mobile") {
    return (
      <MobilePanel
        result={result}
        pillStyle={pillStyle}
        overrides={overrides}
        onOverride={onOverride}
      />
    );
  }

  return (
    <section
      className="flex shrink-0 flex-col gap-2 px-5 py-3"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--border-subtle)",
      }}
      aria-label="Quality gate results"
    >
      <header className="flex items-center justify-between">
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
          style={pillStyle}
        >
          {label(result)}
        </span>
        {result.advisory_only && (
          <span
            className="text-[11px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            Advisory mode (first 30 days)
          </span>
        )}
      </header>
      <ul className="flex flex-col gap-1.5">
        {result.checks.map((check) => (
          <CheckRow
            key={check.type}
            check={check}
            overridden={overrides.has(check.type)}
            onOverride={() => onOverride(check.type)}
          />
        ))}
      </ul>
    </section>
  );
}

function CheckRow({
  check,
  overridden,
  onOverride,
}: {
  check: GateCheck;
  overridden: boolean;
  onOverride: () => void;
}) {
  const isSkipped = check.skipped === true;
  const muted = isSkipped || check.passed;
  return (
    <li
      className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs leading-snug"
      style={{
        background: muted ? "transparent" : "var(--surface-emphasized)",
        color: muted ? "var(--text-tertiary)" : "var(--text-primary)",
      }}
    >
      <span aria-hidden className="mt-0.5">
        {iconFor(check)}
      </span>
      <div className="flex-1">
        <div>{check.message}</div>
        {check.recommendation && !check.passed && (
          <div
            className="mt-0.5"
            style={{ color: "var(--text-tertiary)" }}
          >
            {check.recommendation}
          </div>
        )}
      </div>
      {!check.passed && check.severity === "warning" && (
        <button
          type="button"
          onClick={onOverride}
          disabled={overridden}
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold disabled:opacity-50"
          style={{
            background: overridden ? "var(--surface)" : "var(--accent-subtle)",
            color: "var(--accent)",
          }}
        >
          {overridden ? "Overridden" : "Override"}
        </button>
      )}
    </li>
  );
}

/**
 * Mobile gate panel: tappable disclosure that opens an inline sheet
 * showing every failing row, recommendation, and override action.
 *
 * Hard-blocked posts MUST be actionable on phones — the spec
 * (Quality Addendum #3) requires that the user can see the failing
 * checks and tap an override on advisories from the mobile UI, not
 * just see a status pill. CodeRabbit's review correctly flagged the
 * earlier summary-only strip as breaking that contract.
 */
function MobilePanel({
  result,
  pillStyle,
  overrides,
  onOverride,
}: {
  result: GateResult;
  pillStyle: React.CSSProperties;
  overrides: Set<GateCheckType>;
  onOverride: (type: GateCheckType) => void;
}) {
  // Auto-open on advisory or blocked so the user is never one tap
  // away from seeing the reason for a hard block. The useState
  // initializer only runs once, so we ALSO sync via useEffect on
  // every result.status change — otherwise a clear-then-blocked
  // transition mid-edit would leave the panel collapsed.
  const [open, setOpen] = useState(result.status !== "clear");
  useEffect(() => {
    if (result.status !== "clear") setOpen(true);
  }, [result.status]);
  return (
    <div
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-5 py-2 text-left text-xs"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={pillStyle}
          >
            {label(result)}
          </span>
          <span style={{ color: "var(--text-tertiary)" }}>
            {result.checks.length} checks
          </span>
        </span>
        <span aria-hidden style={{ color: "var(--text-tertiary)" }}>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <ul className="flex max-h-60 flex-col gap-1.5 overflow-y-auto px-5 pb-3">
          {result.checks.map((check) => (
            <CheckRow
              key={check.type}
              check={check}
              overridden={overrides.has(check.type)}
              onOverride={() => onOverride(check.type)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function pillStyleFor(status: GateResult["status"]): React.CSSProperties {
  switch (status) {
    case "clear":
      return { background: "var(--success-subtle)", color: "var(--success)" };
    case "advisory":
      return { background: "var(--warning-subtle)", color: "var(--warning)" };
    case "blocked":
      return { background: "var(--danger-subtle)", color: "var(--danger)" };
  }
}

function label(result: GateResult): string {
  if (result.status === "blocked" && result.advisory_only) return "Advisory";
  return result.status;
}

function iconFor(check: GateCheck): string {
  if (check.skipped) return "·";
  if (check.passed) return "✓";
  if (check.severity === "blocking") return "✕";
  return "!";
}
