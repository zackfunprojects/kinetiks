"use client";

import { useState, useEffect } from "react";
import type { CalibrationExercise } from "@/lib/cartographer/calibrate";
import type { CrawlResult } from "@/lib/cartographer/types";
import { StepWrapper } from "./StepWrapper";
import { AiFillBanner } from "./AiFillBanner";

interface CalibrationStepProps {
  onComplete: () => void;
  onBack: () => void;
  businessContext: string;
  crawlData: CrawlResult | null;
  stepNumber: number;
  totalSteps: number;
}

export function CalibrationStep({
  onComplete,
  onBack,
  businessContext,
  crawlData,
  stepNumber,
  totalSteps,
}: CalibrationStepProps) {
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

        const json = await res.json();
        const data = json.data ?? json;
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
        const json = await res.json().catch(() => ({}));
        setSubmitError(json.error ?? "Failed to save choice. Try again.");
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

  const handleAiFill = () => {
    if (!exercises[currentIndex]) return;
    const exercise = exercises[currentIndex];

    // Use voice data from crawl to pick the best direction
    const voiceData = crawlData?.extractions?.voice?.data as Record<string, unknown> | null;
    const tone = (voiceData?.tone ?? {}) as Record<string, number>;
    const currentValue = tone[exercise.dimension] ?? 50;

    // If the tone leans high (>= 50), pick the "high" direction option
    if (currentValue >= 50) {
      setSelected(exercise.aDirection === "high" ? "A" : "B");
    } else {
      setSelected(exercise.aDirection === "low" ? "A" : "B");
    }
  };

  if (generating) {
    return (
      <StepWrapper
        stepNumber={stepNumber}
        totalSteps={totalSteps}
        title="Which sounds more like you?"
        subtitle="Crafting writing samples based on your business..."
        isOptional
        onBack={onBack}
        onSkip={onComplete}
        hideContinue
      >
        <div className="flex items-center gap-3 py-8">
          <div
            className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace" }}>
            Crafting writing samples based on your business...
          </span>
        </div>
      </StepWrapper>
    );
  }

  if (error || exercises.length === 0) {
    return (
      <StepWrapper
        stepNumber={stepNumber}
        totalSteps={totalSteps}
        title="Voice calibration"
        subtitle={error ?? "No exercises available."}
        isOptional
        onBack={onBack}
        onContinue={onComplete}
        continueLabel="Continue"
      >
        <div />
      </StepWrapper>
    );
  }

  const exercise = exercises[currentIndex];

  return (
    <StepWrapper
      stepNumber={stepNumber}
      totalSteps={totalSteps}
      title="Which sounds more like you?"
      subtitle={exercise.scenario}
      isOptional
      onBack={onBack}
      onSkip={onComplete}
      onContinue={handleConfirm}
      continueLabel={submitting ? "Saving..." : "Confirm"}
      continueDisabled={!selected || submitting}
      loading={submitting}
    >
      {/* Exercise counter */}
      <div className="mb-4">
        <span
          className="text-xs font-medium"
          style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}
        >
          Exercise {currentIndex + 1} of {exercises.length}
        </span>
      </div>

      {/* AI Fill Banner */}
      <AiFillBanner
        onFillAll={handleAiFill}
        disabled={!businessContext}
        disabledReason="Crawl your website first to enable AI selection"
        label="Let AI choose based on your voice profile"
        sublabel="Uses tone data extracted from your website"
      />

      {submitError && (
        <p className="mb-4 text-sm" style={{ color: "var(--error)" }}>{submitError}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
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
    </StepWrapper>
  );
}
