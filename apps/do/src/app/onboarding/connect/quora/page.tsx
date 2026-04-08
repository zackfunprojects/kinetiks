"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { track } from "@/lib/analytics";

/**
 * Onboarding step 1.5 — connect Quora (optional).
 *
 * Quora has no OAuth flow. We just need the user's profile URL so
 * Mirror's eventual answer-history scrape (Phase 7) and Pulse's
 * 3-layer match flow (Phase 5) know which author to look for.
 *
 * Phase 2.5 ships the URL submission step. The actual scrape is
 * deferred to Phase 7 alongside the rest of the Mirror history
 * import work.
 */
export default function QuoraConnectPage() {
  const router = useRouter();
  const [profileUrl, setProfileUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function isLikelyQuoraProfile(value: string): boolean {
    try {
      const u = new URL(value);
      if (u.hostname !== "quora.com" && u.hostname !== "www.quora.com") {
        return false;
      }
      // Profiles look like /profile/Some-Name
      return u.pathname.startsWith("/profile/") && u.pathname.length > 10;
    } catch {
      return false;
    }
  }

  async function handleSubmit() {
    const trimmed = profileUrl.trim();
    if (!isLikelyQuoraProfile(trimmed)) {
      setError(
        "Enter a Quora profile URL — e.g., https://www.quora.com/profile/Your-Name"
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/connect/quora", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile_url: trimmed }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        current_step?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Submit failed (${res.status})`);
      }
      track({
        name: "platform_connected",
        props: { platform: "quora" },
      });
      router.push("/onboarding/content");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    router.push("/onboarding/content");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1
        className="mb-2 text-2xl font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        Add your Quora profile
      </h1>
      <p
        className="mb-6 text-sm leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        Optional. Quora has no OAuth — DeskOf just needs your profile
        URL so it knows which author to track when you answer a question.
      </p>

      <input
        type="url"
        value={profileUrl}
        onChange={(e) => setProfileUrl(e.target.value)}
        placeholder="https://www.quora.com/profile/Your-Name"
        className="mb-2 w-full rounded-2xl border px-4 py-3 text-sm"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          color: "var(--text-primary)",
        }}
        autoComplete="off"
        spellCheck={false}
      />
      <p
        className="mb-6 text-xs"
        style={{ color: "var(--text-tertiary)" }}
      >
        Find this on Quora by tapping your avatar → Profile → copy the URL
        from the browser bar.
      </p>

      {error && (
        <p
          className="mb-3 text-xs"
          style={{ color: "var(--danger)" }}
          role="alert"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="rounded-full px-5 py-3 text-sm font-semibold disabled:opacity-50"
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
        Skip — you can add this later from settings
      </button>
    </main>
  );
}
