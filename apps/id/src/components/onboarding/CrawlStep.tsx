"use client";

import { useState, useRef } from "react";

interface CrawlResult {
  url: string;
  crawl_success: boolean;
  extractions: Record<
    string,
    { success: boolean; data: unknown; error: string | null }
  >;
  proposals_submitted: string[];
}

interface CrawlStepProps {
  onComplete: (result: CrawlResult) => void;
  onSkip: () => void;
}

const PROGRESS_MESSAGES = [
  "Crawling website...",
  "Extracting brand identity...",
  "Analyzing your voice...",
  "Identifying products...",
  "Building your profile...",
];

const EXTRACTION_LABELS: Record<string, string> = {
  org: "Organization",
  products: "Products",
  voice: "Voice & Tone",
  brand: "Brand Identity",
  narrative: "Narrative",
  social_links: "Social Links",
};

export function CrawlStep({ onComplete, onSkip }: CrawlStepProps) {
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

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Crawl failed");
      }

      const data = await res.json();
      setResult(data);
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-lg rounded-2xl bg-white p-10 shadow-sm">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-4 w-4 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Found {successCount} data{" "}
              {successCount === 1 ? "category" : "categories"}
            </h2>
          </div>

          <div className="space-y-2">
            {extractions.map(([key, val]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-2.5"
              >
                <span className="text-sm text-gray-700">
                  {EXTRACTION_LABELS[key] ?? key}
                </span>
                {val.success ? (
                  <span className="text-xs font-medium text-green-600">
                    Captured
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Not found</span>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => onComplete(result)}
            className="mt-8 w-full rounded-lg bg-[#6C5CE7] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#5b4bd6]"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl bg-white p-10 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">
          What's your website?
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          We'll extract your brand, voice, products, and more from your site.
        </p>

        <div className="mt-6">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !crawling) handleCrawl();
            }}
            placeholder="https://yourcompany.com"
            disabled={crawling}
            className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#6C5CE7] focus:outline-none disabled:opacity-50"
          />
        </div>

        {crawling && (
          <div className="mt-6 flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#6C5CE7] border-t-transparent" />
            <span className="text-sm text-gray-600">
              {PROGRESS_MESSAGES[progressIdx]}
            </span>
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-500">{error}</p>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleCrawl}
            disabled={crawling || !url.trim()}
            className="rounded-lg bg-[#6C5CE7] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#5b4bd6] disabled:opacity-50"
          >
            {crawling ? "Analyzing..." : "Analyze"}
          </button>
          <button
            onClick={onSkip}
            disabled={crawling}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Skip - I don't have a website
          </button>
        </div>
      </div>
    </div>
  );
}
