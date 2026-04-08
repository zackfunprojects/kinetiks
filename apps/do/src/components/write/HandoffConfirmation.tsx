"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { track } from "@/lib/analytics";

interface Props {
  opportunityId: string;
  threadUrl: string;
  threadTitle: string;
}

/**
 * The Quora handoff confirmation surface.
 *
 * Shown after the editor's Post button completes the prepare-token →
 * post → browser-handoff dance. The user pastes manually on Quora,
 * comes back here, and taps "I posted this" to kick off Pulse's
 * 3-layer answer match flow.
 *
 * If the popup was blocked, this page also offers a manual link.
 */
export function HandoffConfirmation({
  opportunityId,
  threadUrl,
  threadTitle,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reply/quora-confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunity_id: opportunityId }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `Failed (${res.status})`);
      }
      track({
        name: "reply_posted",
        props: {
          opportunity_id: opportunityId,
          platform: "quora",
          character_count: 0,
          time_to_post_seconds: 0,
        },
      });
      router.push("/write");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p
        className="mb-2 text-xs uppercase tracking-wider"
        style={{ color: "var(--text-tertiary)" }}
      >
        Quora handoff
      </p>
      <h1
        className="mb-4 text-2xl font-semibold leading-snug"
        style={{ color: "var(--text-primary)" }}
      >
        Almost there.
      </h1>
      <ol
        className="mb-6 space-y-3 text-sm leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        <li>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            1.
          </span>{" "}
          Your reply is on your clipboard. We&apos;ve also opened the question
          in a new tab.
        </li>
        <li>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            2.
          </span>{" "}
          Paste it on Quora and submit your answer.
        </li>
        <li>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            3.
          </span>{" "}
          Come back here and tap{" "}
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            I posted this
          </span>{" "}
          so DeskOf can start tracking it.
        </li>
      </ol>

      <div
        className="mb-6 rounded-2xl border p-4"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface-raised)",
        }}
      >
        <p
          className="mb-1 text-xs uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)" }}
        >
          Question
        </p>
        <p
          className="mb-3 line-clamp-2 text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {threadTitle}
        </p>
        <Link
          href={threadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium"
          style={{ color: "var(--accent)" }}
        >
          Open Quora again →
        </Link>
      </div>

      {error && (
        <p
          className="mb-3 text-xs"
          style={{ color: "var(--danger)" }}
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.push("/write")}
          className="flex-1 rounded-full border px-5 py-3 text-sm font-medium"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
          }}
        >
          Not yet
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className="flex-1 rounded-full px-5 py-3 text-sm font-semibold disabled:opacity-50"
          style={{
            background: "var(--accent)",
            color: "#ffffff",
          }}
        >
          {submitting ? "Saving..." : "I posted this"}
        </button>
      </div>
    </div>
  );
}
