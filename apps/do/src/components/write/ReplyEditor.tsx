"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Opportunity } from "@kinetiks/deskof";
import { track } from "@/lib/analytics";

interface Props {
  opportunity: Opportunity;
}

const DRAFT_DEBOUNCE_MS = 1500;
const MIN_REPLY_LENGTH = 30;
const MAX_REPLY_LENGTH = 10_000;

/**
 * Reply editor — the writing surface inside DeskOf.
 *
 * The hard constraint: this is the ONLY surface where reply text is
 * created. There is no LLM-driven draft generation. The editor is a
 * plain textarea — the user writes every word.
 *
 * Phase 2 ships:
 *   - Auto-saving draft every 1.5s of inactivity (POST /api/reply/draft)
 *   - Mobile-optimized layout: thread context collapses on focus, the
 *     character counter and Post button anchor above the keyboard
 *   - Quora browser handoff on Post: clipboard copy + open URL + Pulse
 *     match flow stays pending until the user confirms
 *   - Reddit Post button is disabled with an explanation until the
 *     Reddit OAuth client follow-up lands
 *
 * Phase 3 wires the real Lens gate output below the textarea.
 */
export function ReplyEditor({ opportunity }: Props) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorOpenedAtRef = useRef<number>(Date.now());
  const draftStartedAtRef = useRef<number>(Date.now());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const platform = opportunity.thread.platform;
  const redditDisabled = platform === "reddit";

  // Debounced draft autosave
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (content.trim().length === 0) return;

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/reply/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            opportunity_id: opportunity.id,
            content,
          }),
        });
        if (res.ok) {
          setDraftSaved(true);
          track({
            name: "reply_draft_saved",
            props: {
              opportunity_id: opportunity.id,
              character_count: content.length,
              draft_duration_seconds: Math.round(
                (Date.now() - draftStartedAtRef.current) / 1000
              ),
            },
          });
        }
      } catch {
        // Draft autosave is best-effort; the local state still holds
        // the user's text and the next save attempt will retry.
      }
    }, DRAFT_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content, opportunity.id]);

  async function handlePost() {
    if (content.trim().length < MIN_REPLY_LENGTH) {
      setError(`Reply must be at least ${MIN_REPLY_LENGTH} characters.`);
      return;
    }

    setPosting(true);
    setError(null);

    try {
      // Step 1: get a single-use confirmation token
      const tokenRes = await fetch("/api/reply/prepare-confirmation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opportunity_id: opportunity.id,
          content,
        }),
      });
      const tokenJson = (await tokenRes.json()) as {
        success: boolean;
        confirmation_token?: string;
        error?: string;
      };
      if (!tokenJson.success || !tokenJson.confirmation_token) {
        throw new Error(tokenJson.error ?? "Could not prepare confirmation");
      }

      // Step 2: post with the token
      const postRes = await fetch("/api/reply/post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opportunity_id: opportunity.id,
          content,
          confirmation_token: tokenJson.confirmation_token,
        }),
      });
      const postJson = (await postRes.json()) as {
        success: boolean;
        error?: string;
        kind?: "browser_handoff" | "posted";
        handoff_url?: string;
        clipboard_text?: string;
      };

      if (!postJson.success) {
        throw new Error(postJson.error ?? "Post failed");
      }

      track({
        name: "reply_posted",
        props: {
          opportunity_id: opportunity.id,
          platform,
          character_count: content.length,
          time_to_post_seconds: Math.round(
            (Date.now() - editorOpenedAtRef.current) / 1000
          ),
        },
      });

      if (postJson.kind === "browser_handoff" && postJson.handoff_url) {
        // Copy to clipboard then open Quora in a new tab
        try {
          await navigator.clipboard.writeText(content);
        } catch {
          // Clipboard may be denied; the handoff confirmation screen
          // will offer a manual copy fallback.
        }
        window.open(postJson.handoff_url, "_blank", "noopener,noreferrer");
        router.push(`/write/${opportunity.id}/handoff`);
        return;
      }

      // Reddit success path lands later. For now anything else routes
      // back to the Write tab.
      router.push("/write");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      track({
        name: "reply_post_failed",
        props: {
          opportunity_id: opportunity.id,
          platform,
          error_type: message.slice(0, 80),
        },
      });
    } finally {
      setPosting(false);
    }
  }

  return (
    <main className="flex h-screen flex-col">
      <header
        className="flex shrink-0 items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <button
          type="button"
          onClick={() => router.push("/write")}
          className="text-sm"
          style={{ color: "var(--text-tertiary)" }}
        >
          ← Back
        </button>
        <span
          className="text-xs"
          style={{ color: "var(--text-tertiary)" }}
        >
          {draftSaved ? "Saved" : ""}
        </span>
      </header>

      <section
        className="shrink-0 px-5 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <p
          className="mb-1 text-xs uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)" }}
        >
          {opportunity.thread.platform} · {opportunity.thread.community}
        </p>
        <h2
          className="line-clamp-2 text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {opportunity.thread.title}
        </h2>
      </section>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your reply here. The AI will never write this for you — it's all you."
        maxLength={MAX_REPLY_LENGTH}
        className="flex-1 resize-none px-5 py-4 text-base leading-relaxed focus:outline-none"
        style={{
          background: "var(--background)",
          color: "var(--text-primary)",
        }}
        autoFocus
      />

      {error && (
        <div
          className="px-5 py-2 text-xs"
          style={{ color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      <footer
        className="flex shrink-0 items-center justify-between gap-3 px-5 py-3"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <span
          className="text-xs"
          style={{ color: "var(--text-tertiary)" }}
        >
          {content.length} / {MAX_REPLY_LENGTH}
        </span>
        <button
          type="button"
          onClick={handlePost}
          disabled={posting || redditDisabled || content.trim().length < MIN_REPLY_LENGTH}
          className="rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{
            background: "var(--accent)",
            color: "#ffffff",
          }}
          title={
            redditDisabled
              ? "Reddit posting lands once Reddit Data API access is approved"
              : undefined
          }
        >
          {posting
            ? "Posting..."
            : platform === "quora"
              ? "Copy & open Quora"
              : "Post"}
        </button>
      </footer>
    </main>
  );
}
