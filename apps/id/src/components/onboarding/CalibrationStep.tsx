"use client";

import { useState, useEffect } from "react";
import type { CalibrationExercise } from "@/lib/cartographer/calibrate";

interface CalibrationStepProps {
  onComplete: () => void;
}

export function CalibrationStep({ onComplete }: CalibrationStepProps) {
  const [exercises, setExercises] = useState<CalibrationExercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<"A" | "B" | null>(null);
  const [generating, setGenerating] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/cartographer/calibrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate" }),
        });

        if (!res.ok) throw new Error("Failed to generate exercises");

        const data = await res.json();
        setExercises(data.exercises ?? []);
      } catch {
        setError("Could not generate voice exercises. You can skip this step.");
      } finally {
        setGenerating(false);
      }
    }
    load();
  }, []);

  const handleConfirm = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const exercise = exercises[currentIndex];

    try {
      const res = await fetch("/api/cartographer/calibrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_choice",
          exercise,
          choice: selected,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error ?? "Failed to save choice. Try again.");
        setSubmitting(false);
        return;
      }
    } catch {
      setSubmitError("Network error. Try again.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setSelected(null);

    if (currentIndex + 1 < exercises.length) {
      setCurrentIndex((i) => i + 1);
    } else {
      onComplete();
    }
  };

  if (generating) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace" }}>
            Crafting writing samples based on your business...
          </span>
        </div>
      </div>
    );
  }

  if (error || exercises.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div
          className="w-full max-w-lg rounded-xl p-10 text-center"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {error ?? "No exercises available."}
          </p>
          <button
            onClick={onComplete}
            className="mt-6 rounded-lg px-8 py-2.5 text-sm font-semibold transition-colors"
            style={{ background: "var(--accent-emphasis)", color: "var(--text-on-accent)" }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  const exercise = exercises[currentIndex];

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div
        className="w-full max-w-2xl rounded-xl p-10"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div className="mb-6 flex items-center justify-between">
          <span
            className="text-xs font-medium"
            style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}
          >
            Exercise {currentIndex + 1} of {exercises.length}
          </span>
          <button
            onClick={onComplete}
            className="text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            Skip calibration
          </button>
        </div>

        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Which sounds more like you?
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {exercise.scenario}
        </p>

        {submitError && (
          <p className="mt-3 text-sm" style={{ color: "var(--error)" }}>{submitError}</p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => setSelected("A")}
            className="rounded-lg p-5 text-left text-sm leading-relaxed transition-all"
            style={{
              border: selected === "A" ? "2px solid var(--accent)" : "2px solid var(--border-default)",
              background: selected === "A" ? "var(--accent-muted)" : "var(--bg-surface-raised)",
            }}
          >
            <span
              className="mb-2 block text-xs font-semibold"
              style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}
            >
              Option A
            </span>
            <span style={{ color: "var(--text-secondary)" }}>{exercise.optionA}</span>
          </button>

          <button
            onClick={() => setSelected("B")}
            className="rounded-lg p-5 text-left text-sm leading-relaxed transition-all"
            style={{
              border: selected === "B" ? "2px solid var(--accent)" : "2px solid var(--border-default)",
              background: selected === "B" ? "var(--accent-muted)" : "var(--bg-surface-raised)",
            }}
          >
            <span
              className="mb-2 block text-xs font-semibold"
              style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}
            >
              Option B
            </span>
            <span style={{ color: "var(--text-secondary)" }}>{exercise.optionB}</span>
          </button>
        </div>

        {selected && (
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="mt-6 w-full rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: "var(--accent-emphasis)", color: "var(--text-on-accent)" }}
          >
            {submitting ? "Saving..." : "Confirm"}
          </button>
        )}
      </div>
    </div>
  );
}
