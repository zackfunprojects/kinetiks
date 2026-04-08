"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Onboarding step 1 (connect half) — Reddit + Quora connection.
 *
 * Phase 2 ships a placeholder. The Reddit OAuth button is disabled
 * with an explanation until the Reddit Data API access request is
 * approved and the Reddit OAuth client follow-up PR lands. Quora has
 * no OAuth — the user just provides their profile URL, which Mirror
 * uses to scrape their answer history later.
 *
 * For now, the user can skip both connections and continue to the
 * content step. Once the Reddit OAuth client lands, this page becomes
 * the actual connection surface.
 */
export default function ConnectStepPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSkip() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/connect/skip", {
        method: "POST",
      });

      if (res.status === 401) {
        // Auth expired — kick to Kinetiks ID and preserve return path
        window.location.href =
          "https://id.kinetiks.ai/login?return_to=/onboarding";
        return;
      }

      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        current_step?: string;
        error?: string;
      };

      if (res.status === 409 && json.current_step) {
        // Server-side state machine says we're not on this step.
        // Redirect to wherever the user actually is.
        router.push(`/onboarding/${json.current_step}`);
        return;
      }

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Skip failed (${res.status})`);
      }

      router.push("/onboarding/content");
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
        Connect your accounts
      </h1>
      <p
        className="mb-8 text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        DeskOf needs read access to find conversations where your
        expertise matters and posting access to share your reply when
        you confirm it.
      </p>

      <div
        className="mb-3 flex items-center justify-between rounded-2xl border p-4"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface-raised)",
        }}
      >
        <div>
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Reddit
          </p>
          <p
            className="text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            Required — pending API approval
          </p>
        </div>
        <button
          type="button"
          disabled
          className="rounded-full border px-4 py-2 text-xs font-medium opacity-50"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-tertiary)",
          }}
          title="Awaiting Reddit Data API access approval"
        >
          Connect
        </button>
      </div>

      <div
        className="mb-8 flex items-center justify-between rounded-2xl border p-4"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface-raised)",
        }}
      >
        <div>
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Quora
          </p>
          <p
            className="text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            Optional · profile URL
          </p>
        </div>
        <button
          type="button"
          className="rounded-full border px-4 py-2 text-xs font-medium"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
          }}
          onClick={() => router.push("/onboarding/connect/quora")}
        >
          Add later
        </button>
      </div>

      {error && (
        <p
          className="mb-3 text-center text-xs"
          style={{ color: "var(--danger)" }}
          role="alert"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSkip}
        disabled={submitting}
        className="rounded-full px-5 py-3 text-sm font-medium disabled:opacity-50"
        style={{
          background: "var(--accent)",
          color: "#ffffff",
        }}
      >
        {submitting ? "Saving..." : "Continue"}
      </button>
      <p
        className="mt-3 text-center text-xs"
        style={{ color: "var(--text-tertiary)" }}
      >
        You can come back to this from settings any time.
      </p>
    </main>
  );
}
