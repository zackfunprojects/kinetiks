"use client";

import { useState, useRef } from "react";
import type { CrawlResult } from "@/lib/cartographer/types";
import { StepWrapper } from "./StepWrapper";

interface CrawlStepProps {
  onComplete: (result: CrawlResult) => void;
  onSkip: () => void;
  onBack: () => void;
  stepNumber: number;
  totalSteps: number;
}

const PROGRESS_MESSAGES = [
  "Crawling website...",
  "Extracting brand identity...",
  "Analyzing your voice...",
  "Identifying products...",
  "Analyzing competitive positioning...",
  "Building your profile...",
];

const EXTRACTION_LABELS: Record<string, string> = {
  org: "Organization",
  products: "Products",
  voice: "Voice & Tone",
  brand: "Brand Identity",
  narrative: "Narrative",
  social_links: "Social Links",
  competitive: "Competitive",
  market: "Market",
};

export function CrawlStep({ onComplete, onSkip, onBack, stepNumber, totalSteps }: CrawlStepProps) {
  const [url, setUrl] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);
  const [result, setResult] = useState<CrawlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleCrawl = async () => {
    if (!url.trim()) return;
    setError(null);
    setCrawling(true);
    setProgressIdx(0);

    intervalRef.current = setInterval(() => {
      setProgressIdx((prev) =>
        prev < PROGRESS_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 3000);

    try {
      const res = await fetch("/api/cartographer/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Crawl failed");
      }

      setResult(json.data ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCrawling(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  };

  if (result) {
    const extractions = Object.entries(result.extractions);
    const successCount = extractions.filter(([, v]) => v.success).length;

    return (
      <StepWrapper
        stepNumber={stepNumber}
        totalSteps={totalSteps}
        title={`Found ${successCount} data ${successCount === 1 ? "category" : "categories"}`}
        subtitle="Here's what we extracted from your website."
        onBack={onBack}
        onContinue={() => onComplete(result)}
        continueLabel="Continue"
      >
        <div className="space-y-2">
          {extractions.map(([key, val]) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg px-4 py-2.5"
              style={{ border: "1px solid var(--border-muted)" }}
            >
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {EXTRACTION_LABELS[key] ?? key}
              </span>
              {val.success ? (
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--success)", fontFamily: "var(--font-mono), monospace" }}
                >
                  captured
                </span>
              ) : (
                <span
                  className="text-xs"
                  style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono), monospace" }}
                >
                  not found
                </span>
              )}
            </div>
          ))}
        </div>
      </StepWrapper>
    );
  }

  return (
    <StepWrapper
      stepNumber={stepNumber}
      totalSteps={totalSteps}
      title="What's your website?"
      subtitle="We'll extract your brand, voice, products, and competitive positioning from your site."
      isOptional
      onBack={onBack}
      onSkip={onSkip}
      onContinue={handleCrawl}
      continueLabel={crawling ? "Analyzing..." : "Analyze"}
      continueDisabled={crawling || !url.trim()}
      loading={crawling}
    >
      <div>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !crawling) handleCrawl();
          }}
          placeholder="https://yourcompany.com"
          disabled={crawling}
          className="w-full rounded-lg px-4 py-3 text-sm disabled:opacity-50"
          style={{
            border: "1px solid var(--border-default)",
            background: "var(--bg-inset)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {crawling && (
        <div className="mt-5 flex items-center gap-3">
          <div
            className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace" }}>
            {PROGRESS_MESSAGES[progressIdx]}
          </span>
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm" style={{ color: "var(--error)" }}>{error}</p>
      )}
    </StepWrapper>
  );
}
