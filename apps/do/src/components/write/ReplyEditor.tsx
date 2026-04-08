"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Opportunity } from "@kinetiks/deskof";
import { track } from "@/lib/analytics";
import {
  loadLocalDraft,
  saveLocalDraft,
  deleteLocalDraft,
} from "@/lib/drafts/local-store";

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
 *   - Auto-saving draft every 1.5s of inactivity, with monotonic
 *     revision IDs so out-of-order responses can't mark stale content
 *     as "Saved" or overwrite newer text in the UI.
 *   - Mobile-optimized layout: thread context collapses on focus, the
 *     character counter and Post button anchor above the keyboard
 *   - Quora browser handoff on Post: the popup window is opened
 *     SYNCHRONOUSLY in the click handler (before any await) so it
 *     inherits transient user activation; the URL is set after the
 *     server confirms the post and the user is redirected to the
 *     handoff confirmation page.
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

  // Monotonic draft revision counter. Bumped on every keystroke and
  // sent with each draft save. The draft save UI only marks "Saved"
  // when the response's revision matches the current ref — older
  // responses arriving after newer text will be ignored.
  const draftRevisionRef = useRef(0);

  const platform = opportunity.thread.platform;
  const redditDisabled = platform === "reddit";

  // Recover any local draft from a previous session before the user
  // starts typing. The IndexedDB store is the offline-safe rescue
  // layer; the canonical store is `deskof_replies`. If the local copy
  // is newer than what we'd otherwise show, prefer it.
  useEffect(() => {
    let cancelled = false;
    void loadLocalDraft(opportunity.id).then((draft) => {
      if (cancelled || !draft || !draft.content) return;
      setContent(draft.content);
      draftRevisionRef.current = draft.revision;
    });
    return () => {
      cancelled = true;
    };
  }, [opportunity.id]);

  // Debounced draft autosave
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (content.trim().length === 0) return;

    const revisionAtSchedule = draftRevisionRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/reply/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            opportunity_id: opportunity.id,
            content,
            revision: revisionAtSchedule,
          }),
        });
        if (
          res.ok &&
          revisionAtSchedule === draftRevisionRef.current
        ) {
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

  function handleEditorChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    draftRevisionRef.current += 1;
    setDraftSaved(false);
    const next = e.target.value;
    setContent(next);
    // Local rescue store — fire and forget. Synchronously visible to
    // the next mount even if the network save in the debounced effect
    // fails or hasn't run yet.
    void saveLocalDraft({
      opportunity_id: opportunity.id,
      content: next,
      revision: draftRevisionRef.current,
      updated_at: new Date().toISOString(),
    });
  }

  async function handlePost() {
    if (content.trim().length < MIN_REPLY_LENGTH) {
      setError(`Reply must be at least ${MIN_REPLY_LENGTH} characters.`);
      return;
    }

    // For Quora handoff we MUST open the popup synchronously here,
    // while we still hold transient user activation. After any await
    // the activation expires and window.open is blocked. We open
    // about:blank now and set the location once the server confirms.
    let popup: Window | null = null;
    if (platform === "quora") {
      popup = window.open("about:blank", "_blank", "noopener,noreferrer");
      // If the popup was blocked by the browser, fall back to the
      // confirmation page which renders a manual "Open Quora" link.
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
        try {
          await navigator.clipboard.writeText(content);
        } catch {
          // Clipboard may be denied; the handoff confirmation screen
          // offers a manual copy fallback.
        }

        if (popup && !popup.closed) {
          popup.location.href = postJson.handoff_url;
        }

        // Local rescue store can be cleared once the row is in the
        // post-confirm state on the server.
        void deleteLocalDraft(opportunity.id);

        // Either way the user lands on the handoff confirmation page —
        // it offers a manual link if the popup was blocked.
        router.push(`/write/${opportunity.id}/handoff`);
        return;
      }

      // Reddit success path lands later. For now anything else routes
      // back to the Write tab.
      if (popup && !popup.closed) popup.close();
      void deleteLocalDraft(opportunity.id);
      router.push("/write");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      // Close the placeholder popup if we opened one but failed
      if (popup && !popup.closed) popup.close();
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
        onChange={handleEditorChange}
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
