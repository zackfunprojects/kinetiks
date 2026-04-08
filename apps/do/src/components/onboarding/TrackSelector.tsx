"use client";

import { useState } from "react";
import { canSelectTrack, type TrackLevel, type BillingTier } from "@kinetiks/deskof";
import { track } from "@/lib/analytics";

interface TrackOption {
  level: TrackLevel;
  label: string;
  price: string;
  cadence: string;
  pitch: string;
  trial: boolean;
}

const TRACK_OPTIONS: TrackOption[] = [
  {
    level: "minimal",
    label: "Minimal",
    price: "Free",
    cadence: "2-3 replies a week",
    pitch: "Just the best opportunities.",
    trial: false,
  },
  {
    level: "standard",
    label: "Standard",
    price: "$40/mo",
    cadence: "5-7 replies a week",
    pitch: "Full intelligence.",
    trial: true,
  },
  {
    level: "hero",
    label: "Hero",
    price: "$80/mo",
    cadence: "10-15 replies a week",
    pitch: "Maximum edge.",
    trial: true,
  },
];

interface Props {
  tier: BillingTier;
  defaultLevel?: TrackLevel;
  onSelect: (level: TrackLevel) => Promise<void>;
}

/**
 * Onboarding step 5 + Settings track picker.
 *
 * Defaults to Standard with a 7-day free trial per Final Supplement #4
 * step 5 — putting users on the full intelligence layer from day one
 * makes the trial-to-paid conversion about KEEPING what they have.
 *
 * Locked tracks are still rendered (so the user sees what's behind
 * the paywall) but disabled with the upgrade rationale.
 */
export function TrackSelector({ tier, defaultLevel = "standard", onSelect }: Props) {
  const [selected, setSelected] = useState<TrackLevel>(defaultLevel);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const opt = TRACK_OPTIONS.find((o) => o.level === selected)!;
      track({
        name: "track_selected",
        props: { track: selected, is_trial: opt.trial },
      });
      await onSelect(selected);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h2
        className="mb-2 text-xl font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        How active do you want to be?
      </h2>
      <p
        className="mb-6 text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        You can change this any time from settings.
      </p>

      <div className="flex flex-col gap-3">
        {TRACK_OPTIONS.map((opt) => {
          const allowed = canSelectTrack(tier, opt.level);
          const isSelected = selected === opt.level;
          return (
            <button
              key={opt.level}
              type="button"
              disabled={!allowed}
              onClick={() => allowed && setSelected(opt.level)}
              className="rounded-2xl border p-4 text-left transition disabled:opacity-50"
              style={{
                borderColor: isSelected
                  ? "var(--accent)"
                  : "var(--border)",
                background: isSelected
                  ? "var(--accent-subtle)"
                  : "var(--surface-raised)",
                cursor: allowed ? "pointer" : "not-allowed",
              }}
              aria-pressed={isSelected}
            >
              <div className="mb-1 flex items-baseline justify-between">
                <span
                  className="text-base font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {opt.label}
                </span>
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {opt.price}
                </span>
              </div>
              <p
                className="text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                {opt.cadence} · {opt.pitch}
              </p>
              {opt.trial && allowed && (
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--accent)" }}
                >
                  7-day free trial
                </p>
              )}
              {!allowed && (
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Upgrade required
                </p>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={submitting}
        className="mt-6 w-full rounded-full px-5 py-3 text-sm font-medium disabled:opacity-50"
        style={{
          background: "var(--accent)",
          color: "#ffffff",
        }}
      >
        {submitting ? "Saving..." : "Continue"}
      </button>
    </div>
  );
}
