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
      <div className="w-full max-w-lg rounded-2xl bg-white p-10 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Share a writing sample
          </h2>
          <span className="text-xs text-gray-400">Optional</span>
        </div>

        <p className="text-sm text-gray-500">
          Paste an email, blog post, social media post, or any content that
          represents your voice. This helps us match your tone perfectly.
        </p>

        {feedback && (
          <div className="mt-4 rounded-lg bg-[#f0eeff] px-4 py-3">
            <span className="text-sm text-[#6C5CE7]">{feedback}</span>
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-500">{error}</p>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Paste your writing sample here..."
          disabled={analyzing}
          className="mt-4 w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#6C5CE7] focus:outline-none disabled:opacity-50"
        />

        <div className="mt-2 flex items-center justify-between">
          <span
            className={`text-xs ${text.trim().length < 100 ? "text-gray-400" : "text-green-500"}`}
          >
            {text.trim().length} / 100 min characters
          </span>
          {samplesSubmitted > 0 && (
            <span className="text-xs text-gray-400">
              {samplesSubmitted} sample{samplesSubmitted > 1 ? "s" : ""}{" "}
              analyzed
            </span>
          )}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={handleAnalyze}
            disabled={analyzing || text.trim().length < 100 || samplesSubmitted >= 3}
            className="rounded-lg bg-[#6C5CE7] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#5b4bd6] disabled:opacity-50"
          >
            {analyzing
              ? "Analyzing..."
              : samplesSubmitted >= 3
                ? "Max samples reached"
                : "Analyze"}
          </button>
          <button
            onClick={onComplete}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {samplesSubmitted > 0 ? "Continue" : "Skip"}
          </button>
        </div>
      </div>
    </div>
  );
}
