"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { track } from "@/lib/analytics";

interface UrlEntry {
  url: string;
  source: "blog" | "newsletter" | "linkedin" | "twitter" | "other";
}

const SOURCES: UrlEntry["source"][] = [
  "blog",
  "newsletter",
  "linkedin",
  "twitter",
  "other",
];

/**
 * Onboarding step 2 — content URL ingestion.
 *
 * The user shares 1-5 links to their best writing. Mirror ingests
 * these in the background to bootstrap the Operator Profile's
 * expertise + voice.
 *
 * Free tier: skipped automatically because content URL ingestion is
 * Standard+ in the tier-config matrix. The page falls through to the
 * next step on free.
 */
export default function ContentStepPage() {
  const router = useRouter();
  const [urls, setUrls] = useState<UrlEntry[]>([{ url: "", source: "blog" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addRow() {
    if (urls.length >= 5) return;
    setUrls((prev) => [...prev, { url: "", source: "blog" }]);
  }

  function updateRow(idx: number, patch: Partial<UrlEntry>) {
    setUrls((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  }

  async function handleSubmit() {
    const cleaned = urls
      .map((u) => ({ ...u, url: u.url.trim() }))
      .filter((u) => u.url.length > 0);

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urls: cleaned }),
      });
      const json = (await res.json()) as {
        success: boolean;
        accepted?: number;
        error?: string;
      };
      if (!json.success) throw new Error(json.error ?? "submit failed");

      track({
        name: "content_urls_submitted",
        props: { url_count: json.accepted ?? cleaned.length },
      });
      router.push("/onboarding/interests");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    await fetch("/api/onboarding/content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ urls: [] }),
    });
    router.push("/onboarding/interests");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1
        className="mb-2 text-2xl font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        Share your best writing
      </h1>
      <p
        className="mb-6 text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        Drop 1-5 links to blog posts, newsletter issues, LinkedIn
        articles, or other public writing. DeskOf reads them to learn
        what you actually know.
      </p>

      <div className="mb-4 flex flex-col gap-2">
        {urls.map((row, idx) => (
          <div key={idx} className="flex gap-2">
            <input
              type="url"
              value={row.url}
              onChange={(e) => updateRow(idx, { url: e.target.value })}
              placeholder="https://..."
              className="flex-1 rounded-xl border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
                color: "var(--text-primary)",
              }}
            />
            <select
              value={row.source}
              onChange={(e) =>
                updateRow(idx, { source: e.target.value as UrlEntry["source"] })
              }
              className="rounded-xl border px-2 py-2 text-xs"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
                color: "var(--text-primary)",
              }}
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        disabled={urls.length >= 5}
        className="mb-6 self-start text-xs font-medium disabled:opacity-50"
        style={{ color: "var(--accent)" }}
      >
        + Add another
      </button>

      {error && (
        <p className="mb-3 text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="rounded-full px-5 py-3 text-sm font-medium disabled:opacity-50"
        style={{
          background: "var(--accent)",
          color: "#ffffff",
        }}
      >
        {submitting ? "Saving..." : "Continue"}
      </button>
      <button
        type="button"
        onClick={handleSkip}
        className="mt-3 text-xs"
        style={{ color: "var(--text-tertiary)" }}
      >
        Skip for now — DeskOf will learn from your activity
      </button>
    </main>
  );
}
