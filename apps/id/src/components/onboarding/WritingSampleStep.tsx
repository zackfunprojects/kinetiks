"use client";

import { useState } from "react";
import type { CrawlResult } from "@/lib/cartographer/types";
import { StepWrapper } from "./StepWrapper";
import { AiFillBanner } from "./AiFillBanner";
import { SparkleButton } from "./SparkleButton";

interface WritingSampleStepProps {
  onComplete: () => void;
  onBack: () => void;
  businessContext: string;
  crawlData: CrawlResult | null;
  stepNumber: number;
  totalSteps: number;
}

export function WritingSampleStep({
  onComplete,
  onBack,
  businessContext,
  crawlData,
  stepNumber,
  totalSteps,
}: WritingSampleStepProps) {
  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [samplesSubmitted, setSamplesSubmitted] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (text.trim().length < 100 || analyzing) return;
    setAnalyzing(true);
    setError(null);
    setFeedback(null);

    try {
      const res = await fetch("/api/cartographer/writing-sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          source: "onboarding_paste",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Analysis failed");
      }

      const data = json.data ?? json;
      const refinements = data.result?.voiceRefinements;
      const tone = refinements?.tone as Record<string, number> | undefined;

      if (tone) {
        const dimensions = Object.entries(tone)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        setFeedback(`Voice refined - ${dimensions}`);
      } else {
        setFeedback("Voice profile updated with your writing sample.");
      }

      setSamplesSubmitted((c) => c + 1);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAiFill = () => {
    // Pull voice messaging patterns or page content from crawl data
    const voiceData = crawlData?.extractions?.voice?.data as Record<string, unknown> | null;
    const patterns = voiceData?.messaging_patterns as Array<Record<string, unknown>> | undefined;

    if (patterns && patterns.length > 0) {
      // Combine messaging patterns into a sample
      const sample = patterns
        .filter((p) => p.pattern && typeof p.pattern === "string")
        .map((p) => p.pattern as string)
        .join("\n\n");
      if (sample.length >= 100) {
        setText(sample);
        return;
      }
    }

    // Fallback: use business context as a writing sample
    if (businessContext.length >= 100) {
      setText(businessContext);
    }
  };

  const hasCrawlData = !!businessContext;

  return (
    <StepWrapper
      stepNumber={stepNumber}
      totalSteps={totalSteps}
      title="Share a writing sample"
      subtitle="Paste an email, blog post, or any content that represents your voice. This helps us match your tone perfectly."
      isOptional
      onBack={onBack}
      onSkip={onComplete}
      onContinue={samplesSubmitted > 0 ? onComplete : handleAnalyze}
      continueLabel={
        analyzing
          ? "Analyzing..."
          : samplesSubmitted > 0
            ? "Continue"
            : samplesSubmitted >= 3
              ? "Continue"
              : "Analyze"
      }
      continueDisabled={analyzing || (samplesSubmitted === 0 && text.trim().length < 100)}
      loading={analyzing}
    >
      {/* AI Fill Banner */}
      <AiFillBanner
        onFillAll={handleAiFill}
        disabled={!hasCrawlData}
        disabledReason="Crawl your website first to pull samples"
        label="Pull a sample from your website"
        sublabel="Uses content extracted from your site"
      />

      {feedback && (
        <div
          className="mb-4 rounded-lg px-4 py-3"
          style={{ background: "var(--accent-muted)" }}
        >
          <span className="text-sm" style={{ color: "var(--accent)", fontFamily: "var(--font-mono), monospace" }}>
            {feedback}
          </span>
        </div>
      )}

      {error && (
        <p className="mb-4 text-sm" style={{ color: "var(--error)" }}>{error}</p>
      )}

      {/* Textarea with sparkle */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Writing sample
          </span>
          <SparkleButton
            onFill={handleAiFill}
            disabled={!hasCrawlData}
            label="Pull from site"
          />
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Paste your writing sample here..."
          disabled={analyzing}
          className="w-full resize-none rounded-lg px-4 py-3 text-sm disabled:opacity-50"
          style={{
            border: "1px solid var(--border-default)",
            background: "var(--bg-inset)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span
          className="text-xs"
          style={{
            color: text.trim().length < 100 ? "var(--text-tertiary)" : "var(--success)",
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          {text.trim().length} / 100 min characters
        </span>
        {samplesSubmitted > 0 && (
          <span className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}>
            {samplesSubmitted} sample{samplesSubmitted > 1 ? "s" : ""} analyzed
          </span>
        )}
      </div>
    </StepWrapper>
  );
}
