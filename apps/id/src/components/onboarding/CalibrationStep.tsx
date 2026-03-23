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
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#6C5CE7] border-t-transparent" />
          <span className="text-sm text-gray-500">
            Crafting writing samples based on your business...
          </span>
        </div>
      </div>
    );
  }

  if (error || exercises.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-lg rounded-2xl bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-gray-500">
            {error ?? "No exercises available."}
          </p>
          <button
            onClick={onComplete}
            className="mt-6 rounded-lg bg-[#6C5CE7] px-8 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#5b4bd6]"
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
      <div className="w-full max-w-2xl rounded-2xl bg-white p-10 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400">
            Exercise {currentIndex + 1} of {exercises.length}
          </span>
          <button
            onClick={onComplete}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Skip calibration
          </button>
        </div>

        <h2 className="text-lg font-semibold text-gray-900">
          Which sounds more like you?
        </h2>
        <p className="mt-1 text-sm text-gray-500">{exercise.scenario}</p>

        {submitError && (
          <p className="mt-3 text-sm text-red-500">{submitError}</p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => setSelected("A")}
            className={`rounded-xl border-2 p-5 text-left text-sm leading-relaxed transition-all ${
              selected === "A"
                ? "border-[#6C5CE7] bg-[#f9f8ff]"
                : "border-gray-100 hover:border-gray-200"
            }`}
          >
            <span className="mb-2 block text-xs font-semibold text-gray-400">
              Option A
            </span>
            <span className="text-gray-700">{exercise.optionA}</span>
          </button>

          <button
            onClick={() => setSelected("B")}
            className={`rounded-xl border-2 p-5 text-left text-sm leading-relaxed transition-all ${
              selected === "B"
                ? "border-[#6C5CE7] bg-[#f9f8ff]"
                : "border-gray-100 hover:border-gray-200"
            }`}
          >
            <span className="mb-2 block text-xs font-semibold text-gray-400">
              Option B
            </span>
            <span className="text-gray-700">{exercise.optionB}</span>
          </button>
        </div>

        {selected && (
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="mt-6 w-full rounded-lg bg-[#6C5CE7] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#5b4bd6] disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Confirm"}
          </button>
        )}
      </div>
    </div>
  );
}
