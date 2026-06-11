"use client";

import type { ExtractedAction } from "@kinetiks/types";
import { useEffect, useRef, useState } from "react";
import { Button } from "@kinetiks/ui";
import {
  parseContextUsed,
  provenanceChipLabel,
  stripInsightCitations,
} from "@/lib/marcus/provenance";

interface MessageBubbleProps {
  role: "user" | "marcus";
  content: string;
  extractedActions?: ExtractedAction[] | null;
  /** B4 — tool provenance persisted on the message (context_used). */
  contextUsed?: Record<string, unknown> | null;
  timestamp?: string;
  isStreaming?: boolean;
  /**
   * C3a — the customer's named system, shown as the serif header on
   * system messages per design spec §6.4. Falls back to "Kinetiks"
   * before naming.
   */
  systemName?: string | null;
}

/**
 * Design spec §6.4 — the prose-vs-bubble asymmetry: the system writes
 * on the page (no bubble, serif name header, 17px relaxed body); the
 * user types in a box (right-aligned bubble, 15px). The asymmetry is
 * the relationship: an advisor writes prose, a peer chats in bubbles.
 */
export function MessageBubble({
  role,
  content,
  extractedActions,
  contextUsed,
  timestamp,
  isStreaming,
  systemName,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUser = role === "user";

  // B4 — the customer never sees raw insight_id UUIDs; the citation
  // mechanism stays server-side (the engine stamps delivery against
  // the SAVED text, which keeps the ids).
  const displayContent = isUser ? content : stripInsightCitations(content);
  const provenance = isUser ? [] : parseContextUsed(contextUsed);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayContent);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; no-op.
    }
  };

  const timeLabel = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  if (isUser) {
    // §6.4 user message: right-aligned column, max 580px, bg-muted
    // bubble, 14px h / 10px v padding, radius-2, 15px sans body.
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          marginBottom: "var(--kt-s-5)",
        }}
      >
        <div
          style={{
            maxWidth: 580,
            padding: "10px 14px",
            borderRadius: "var(--kt-radius-2)",
            backgroundColor: "var(--kt-bg-muted)",
            color: "var(--kt-fg-1)",
            fontSize: "var(--kt-fs-15)",
            lineHeight: "var(--kt-lh-body)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {displayContent}
        </div>
        {timeLabel && (
          <span
            className="kt-data-inline"
            style={{ color: "var(--kt-fg-3)", fontSize: "var(--kt-fs-11)", marginTop: "var(--kt-s-1)" }}
          >
            {timeLabel}
          </span>
        )}
      </div>
    );
  }

  // §6.4 system message: full-width prose, no bubble. Serif name
  // header with a mono timestamp inline-right; the timestamp appears
  // when generation completes (the cursor holds its place meanwhile).
  return (
    <div style={{ marginBottom: "var(--kt-s-6)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--kt-s-3)",
          marginBottom: "var(--kt-s-2)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--kt-font-serif)",
            fontSize: "var(--kt-fs-17)",
            color: "var(--kt-fg-1)",
          }}
        >
          {systemName || "Kinetiks"}
        </span>
        {!isStreaming && timeLabel && (
          <span
            className="kt-data-inline"
            style={{ color: "var(--kt-fg-3)", fontSize: "var(--kt-fs-11)" }}
          >
            {timeLabel}
          </span>
        )}
      </div>

      <div
        style={{
          fontSize: "var(--kt-fs-17)",
          lineHeight: "var(--kt-lh-relaxed)",
          color: "var(--kt-fg-1)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {displayContent}
        {isStreaming && <span className="kt-cursor" aria-hidden="true" />}
      </div>

      {/* B4 — provenance chips: which sources fed this response. */}
      {provenance.length > 0 && !isStreaming && (
        <div
          aria-label="Sources consulted"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--kt-s-1)",
            marginTop: "var(--kt-s-2)",
          }}
        >
          {provenance.map((entry, i) => (
            <span
              key={`${entry.tool_name}-${i}`}
              className="kt-data-inline"
              style={{
                padding: "0 var(--kt-s-2)",
                border: "1px solid var(--kt-border-2)",
                borderRadius: "var(--kt-radius-full)",
                color: "var(--kt-fg-3)",
                fontSize: "var(--kt-fs-11)",
                lineHeight: 1.8,
              }}
            >
              {provenanceChipLabel(entry)}
            </span>
          ))}
        </div>
      )}

      {extractedActions && extractedActions.length > 0 && (
        <div
          style={{
            marginTop: "var(--kt-s-2)",
            borderTop: "1px solid var(--kt-border-2)",
            paddingTop: "var(--kt-s-2)",
          }}
        >
          <button
            onClick={() => setShowActions(!showActions)}
            aria-expanded={showActions}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "var(--kt-fs-12)",
              fontFamily: "var(--kt-font-mono)",
              color: "var(--kt-accent)",
              padding: 0,
            }}
          >
            {showActions ? "Hide" : "Show"} extracted actions ({extractedActions.length})
          </button>
          {showActions && (
            <ul
              style={{
                margin: "var(--kt-s-2) 0 0",
                paddingLeft: "var(--kt-s-4)",
                fontSize: "var(--kt-fs-12)",
                opacity: 0.85,
                fontFamily: "var(--kt-font-mono)",
              }}
            >
              {extractedActions.map((action, i) => (
                <li key={i} style={{ marginBottom: "var(--kt-s-1)" }}>
                  {action.type === "proposal" && (
                    <span>
                      Proposal: {action.action} {action.target_layer} ({action.confidence})
                    </span>
                  )}
                  {action.type === "brief" && (
                    <span>
                      Brief to {action.target_app}: {(action.content ?? "").slice(0, 60)}
                    </span>
                  )}
                  {action.type === "follow_up" && (
                    <span>
                      Follow-up in {action.delay_hours}h: {(action.message ?? "").slice(0, 60)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!isStreaming && content ? (
        <div style={{ marginTop: "var(--kt-s-1)" }}>
          <Button variant="ghost" size="sm" onClick={handleCopy} aria-label="Copy message">
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
