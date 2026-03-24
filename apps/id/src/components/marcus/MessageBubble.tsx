"use client";

import type { ExtractedAction } from "@kinetiks/types";
import { useState } from "react";

interface MessageBubbleProps {
  role: "user" | "marcus";
  content: string;
  extractedActions?: ExtractedAction[] | null;
  timestamp?: string;
  isStreaming?: boolean;
}

export function MessageBubble({
  role,
  content,
  extractedActions,
  timestamp,
  isStreaming,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const isUser = role === "user";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          maxWidth: "75%",
          padding: "12px 16px",
          borderRadius: 8,
          backgroundColor: isUser ? "var(--user-bubble)" : "var(--marcus-bubble)",
          color: isUser ? "var(--text-on-accent)" : "var(--text-primary)",
          border: isUser ? "none" : "1px solid var(--border-muted)",
          fontSize: 14,
          lineHeight: 1.6,
          position: "relative",
        }}
      >
        {/* Message content */}
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {content}
          {isStreaming && (
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 16,
                backgroundColor: "var(--accent)",
                marginLeft: 2,
                animation: "blink 1s infinite",
                verticalAlign: "text-bottom",
              }}
            />
          )}
        </div>

        {/* Extracted actions */}
        {extractedActions && extractedActions.length > 0 && (
          <div style={{ marginTop: 8, borderTop: "1px solid var(--border-muted)", paddingTop: 8 }}>
            <button
              onClick={() => setShowActions(!showActions)}
              aria-expanded={showActions}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "var(--font-mono), monospace",
                color: isUser ? "rgba(255,255,255,0.8)" : "var(--accent)",
                padding: 0,
              }}
            >
              {showActions ? "Hide" : "Show"} extracted actions ({extractedActions.length})
            </button>
            {showActions && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 16, fontSize: 12, opacity: 0.85, fontFamily: "var(--font-mono), monospace" }}>
                {extractedActions.map((action, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
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

        {/* Timestamp */}
        {timestamp && (
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono), monospace",
              color: isUser ? "rgba(255,255,255,0.5)" : "var(--text-tertiary)",
              marginTop: 4,
              textAlign: isUser ? "right" : "left",
            }}
          >
            {new Date(timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>
    </div>
  );
}
