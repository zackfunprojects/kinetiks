"use client";

import type { ExtractedAction } from "@kinetiks/types";
import { useState, useEffect } from "react";

// Inject blink keyframes once
let blinkInjected = false;
function injectBlinkKeyframes() {
  if (blinkInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = `@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`;
  document.head.appendChild(style);
  blinkInjected = true;
}

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

  useEffect(() => {
    if (isStreaming) injectBlinkKeyframes();
  }, [isStreaming]);

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
          borderRadius: 12,
          backgroundColor: isUser ? "#6C5CE7" : "#F0F0F5",
          color: isUser ? "#fff" : "#1a1a2e",
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
                backgroundColor: isUser ? "#fff" : "#6C5CE7",
                marginLeft: 2,
                animation: "blink 1s infinite",
                verticalAlign: "text-bottom",
              }}
            />
          )}
        </div>

        {/* Extracted actions */}
        {extractedActions && extractedActions.length > 0 && (
          <div style={{ marginTop: 8, borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: 8 }}>
            <button
              onClick={() => setShowActions(!showActions)}
              aria-expanded={showActions}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                color: isUser ? "rgba(255,255,255,0.8)" : "#6C5CE7",
                padding: 0,
              }}
            >
              {showActions ? "Hide" : "Show"} extracted actions ({extractedActions.length})
            </button>
            {showActions && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 16, fontSize: 12, opacity: 0.85 }}>
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
              opacity: 0.6,
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
