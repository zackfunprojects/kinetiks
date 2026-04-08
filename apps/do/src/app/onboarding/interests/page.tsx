"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { track } from "@/lib/analytics";

/**
 * Onboarding step 4 — personal interests.
 *
 * Free-text input. The user types their non-professional interests,
 * one per line or comma-separated. Mirror persists them as Interest
 * entries on the Operator Profile and Scout's personal pipeline
 * (Phase 7) starts surfacing matching threads.
 *
 * Phase 7 will add automatic pre-population from imported posting
 * history. Phase 2 ships the manual entry path only.
 */
export default function InterestsStepPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const topics = text
      .split(/[\n,]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/interests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topics }),
      });
      if (!res.ok) throw new Error("Submit failed");

      track({
        name: "interests_submitted",
        props: {
          interest_count: topics.length,
          prepopulated: false,
        },
      });
      router.push("/onboarding/track");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1
        className="mb-2 text-2xl font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        What else are you into?
      </h1>
      <p
        className="mb-6 text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        DeskOf works best when you show up as a whole person. Add a few
        non-work interests — hobbies, communities, things you can&apos;t
        stop talking about.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="ramen, travel, anime, gardening..."
        rows={4}
        className="mb-4 rounded-2xl border px-4 py-3 text-sm leading-relaxed"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          color: "var(--text-primary)",
        }}
      />

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
    </main>
  );
}
