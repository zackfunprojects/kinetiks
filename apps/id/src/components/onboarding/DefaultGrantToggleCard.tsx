"use client";

import { useState } from "react";

export interface DefaultGrantCardCapability {
  action_class: string;
  description: string;
  rendered_sentence: string;
  rate_limit: { count: number; window: "minute" | "hour" | "day" | "week" } | null;
}

export interface DefaultGrantCardProps {
  /** Stable manifest key — passed as `accepted_keys` if toggled on. */
  permissionKey: string;
  /** Manifest's plain-language headline. */
  description: string;
  capabilities: readonly DefaultGrantCardCapability[];
  /** Controlled toggle state from the parent. */
  on: boolean;
  /** Toggle handler — parent owns the set of opted-in keys. */
  onToggle: (next: boolean) => void;
}

const WINDOW_LABEL: Record<"minute" | "hour" | "day" | "week", string> = {
  minute: "per minute",
  hour: "per hour",
  day: "per day",
  week: "per week",
};

/**
 * One row in the onboarding Permissions step per the Kinetiks
 * Contract Addendum §2.6.
 *
 * Renders the manifest's plain-language `description` as the headline,
 * each capability's `description` as a bullet, and an expandable
 * "Details" section that shows the server-rendered `customer_template`
 * sentence + the rate limit in plain English.
 *
 * The toggle is off by default (the addendum's opt-in contract).
 * Visual state pairs colour AND text label per the design spec — no
 * status conveyed by colour alone.
 *
 * The literal phrase "Authority Grant" does not appear in this file
 * or in any string this file renders; the server-rendered strings
 * come pre-validated from /api/onboarding/authority-defaults and the
 * inline copy below uses "permission".
 */
export function DefaultGrantToggleCard({
  permissionKey,
  description,
  capabilities,
  on,
  onToggle,
}: DefaultGrantCardProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = `default-grant-details-${permissionKey}`;

  return (
    <div
      className="rounded-xl"
      style={{
        background: on ? "var(--kt-bg-base)" : "var(--kt-bg-muted)",
        border: on
          ? "1px solid var(--kt-accent)"
          : "1px solid var(--kt-border-2)",
        transition: "background 120ms, border-color 120ms",
      }}
    >
      <div className="flex items-start gap-4 px-5 py-4">
        {/* Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`${detailsId}-title`}
          onClick={() => onToggle(!on)}
          className="mt-1 shrink-0 rounded-full"
          style={{
            position: "relative",
            width: 36,
            height: 20,
            background: on ? "var(--kt-accent)" : "var(--kt-border-1)",
            border: "none",
            cursor: "pointer",
            transition: "background 120ms",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 2,
              left: on ? 18 : 2,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "var(--kt-fg-on-inverse)",
              transition: "left 120ms",
            }}
          />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <p
              id={`${detailsId}-title`}
              className="text-sm font-semibold leading-snug"
              style={{ color: "var(--kt-fg-1)" }}
            >
              {description}
            </p>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shrink-0"
              style={{
                background: on
                  ? "var(--kt-accent-soft, var(--kt-bg-muted))"
                  : "var(--kt-bg-subtle)",
                color: on ? "var(--kt-accent)" : "var(--kt-fg-3)",
                border: "1px solid var(--kt-border-2)",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              {on ? "On" : "Off"}
            </span>
          </div>

          {/* Capability bullets */}
          <ul className="mt-2 space-y-1">
            {capabilities.map((cap) => (
              <li
                key={cap.action_class}
                className="text-[13px] leading-relaxed"
                style={{ color: "var(--kt-fg-2)" }}
              >
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 4,
                    height: 4,
                    marginRight: 8,
                    borderRadius: "50%",
                    background: "var(--kt-fg-3)",
                    verticalAlign: "middle",
                  }}
                />
                {cap.description}
              </li>
            ))}
          </ul>

          {/* Details disclosure */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--kt-fg-3)",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: expanded ? "rotate(90deg)" : "rotate(0)",
                transition: "transform 120ms",
              }}
              aria-hidden
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {expanded ? "Hide limits" : "Show limits"}
          </button>

          {expanded && (
            <div
              id={detailsId}
              className="mt-3 rounded-lg p-3"
              style={{
                background: "var(--kt-bg-subtle)",
                border: "1px solid var(--kt-border-2)",
              }}
            >
              {capabilities.map((cap) => (
                <div key={cap.action_class} className="text-[12px] leading-relaxed">
                  <p style={{ color: "var(--kt-fg-2)" }}>{cap.rendered_sentence}</p>
                  {cap.rate_limit && (
                    <p className="mt-1" style={{ color: "var(--kt-fg-3)" }}>
                      Limit: up to {cap.rate_limit.count} {WINDOW_LABEL[cap.rate_limit.window]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
