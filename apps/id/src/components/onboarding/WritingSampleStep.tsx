"use client";

import { useState } from "react";

interface WritingSampleStepProps {
  onComplete: () => void;
}

export function WritingSampleStep({ onComplete }: WritingSampleStepProps) {
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

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Analysis failed");
      }

      const data = await res.json();
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

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div
        className="w-full max-w-lg rounded-xl p-10"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Share a writing sample
          </h2>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Optional</span>
        </div>

        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Paste an email, blog post, social media post, or any content that
          represents your voice. This helps us match your tone perfectly.
        </p>

        {feedback && (
          <div
            className="mt-4 rounded-lg px-4 py-3"
            style={{ background: "var(--accent-muted)" }}
          >
            <span className="text-sm" style={{ color: "var(--accent)", fontFamily: "var(--font-mono), monospace" }}>
              {feedback}
            </span>
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm" style={{ color: "var(--error)" }}>{error}</p>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Paste your writing sample here..."
          disabled={analyzing}
          className="mt-4 w-full resize-none rounded-lg px-4 py-3 text-sm disabled:opacity-50"
          style={{
            border: "1px solid var(--border-default)",
            background: "var(--bg-inset)",
            color: "var(--text-primary)",
          }}
        />

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
              {samplesSubmitted} sample{samplesSubmitted > 1 ? "s" : ""}{" "}
              analyzed
            </span>
          )}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={handleAnalyze}
            disabled={analyzing || text.trim().length < 100 || samplesSubmitted >= 3}
            className="rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: "var(--accent-emphasis)", color: "var(--text-on-accent)" }}
          >
            {analyzing
              ? "Analyzing..."
              : samplesSubmitted >= 3
                ? "Max samples reached"
                : "Analyze"}
          </button>
          <button
            onClick={onComplete}
            disabled={analyzing}
            className="text-sm disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: "var(--text-secondary)" }}
          >
            {samplesSubmitted > 0 ? "Continue" : "Skip"}
          </button>
        </div>
      </div>
    </div>
  );
}
