"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { MarcusMessage } from "@kinetiks/types";
import { MessageBubble } from "./MessageBubble";

interface ChatAreaProps {
  currentThreadId?: string;
  messages: MarcusMessage[];
  onMessagesChange: (messages: MarcusMessage[]) => void;
  onThreadCreated: (threadId: string) => void;
  onRefreshThreads: () => void;
  systemName: string | null;
}

export function ChatArea({
  currentThreadId,
  messages,
  onMessagesChange,
  onThreadCreated,
  onRefreshThreads,
  systemName,
}: ChatAreaProps) {
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages, streamingText]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSend = useCallback(async () => {
    const message = input.trim();
    if (!message || isStreaming) return;

    setInput("");
    setIsStreaming(true);
    setStreamingText("");

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const userMsg: MarcusMessage = {
      id: `temp-${Date.now()}`,
      thread_id: currentThreadId ?? "",
      role: "user",
      content: message,
      channel: "web",
      extracted_actions: null,
      context_used: null,
      created_at: new Date().toISOString(),
    };
    onMessagesChange([...messages, userMsg]);

    try {
      const res = await fetch("/api/marcus/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          thread_id: currentThreadId,
          channel: "web",
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error("Chat request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let threadId: string = currentThreadId ?? "";
      let lineBuffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "thread_id") {
                threadId = event.thread_id;
                if (!currentThreadId) {
                  onThreadCreated(threadId);
                }
              } else if (event.type === "text") {
                fullText += event.text;
                setStreamingText(fullText);
              } else if (event.type === "extraction") {
                if (event.disclosure) {
                  fullText += `\n\n---\n${event.disclosure}`;
                  setStreamingText(fullText);
                }
              } else if (event.type === "error") {
                fullText += `\n\n[Error: ${event.error}]`;
                setStreamingText(fullText);
              }
            } catch {
              // Skip malformed SSE events
            }
          }
        }

        if (lineBuffer.startsWith("data: ")) {
          const jsonStr = lineBuffer.slice(6).trim();
          if (jsonStr) {
            try {
              const event = JSON.parse(jsonStr);
              if (event.type === "text") {
                fullText += event.text;
              }
            } catch {
              // Skip
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const marcusMsg: MarcusMessage = {
        id: `temp-marcus-${Date.now()}`,
        thread_id: threadId ?? "",
        role: "marcus",
        content: fullText,
        channel: "web",
        extracted_actions: null,
        context_used: null,
        created_at: new Date().toISOString(),
      };
      onMessagesChange([...messages, userMsg, marcusMsg]);
      setStreamingText("");
      onRefreshThreads();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      onMessagesChange([
        ...messages,
        userMsg,
        {
          id: `temp-error-${Date.now()}`,
          thread_id: currentThreadId ?? "",
          role: "marcus",
          content: "I encountered an error processing your message. Please try again.",
          channel: "web",
          extracted_actions: null,
          context_used: null,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsStreaming(false);
      setStreamingText("");
    }
  }, [input, isStreaming, currentThreadId, messages, onMessagesChange, onThreadCreated, onRefreshThreads]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const displayName = systemName || "your system";

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg-base)",
        height: "100%",
      }}
    >
      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 24px 0",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {messages.length === 0 && !streamingText && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "calc(100vh - 200px)",
                color: "var(--text-tertiary)",
                fontSize: 14,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: 8,
                  }}
                >
                  {systemName || "Kinetiks"}
                </div>
                <div style={{ color: "var(--text-tertiary)" }}>
                  Ask {displayName} anything about your GTM.
                </div>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              extractedActions={msg.extracted_actions}
              timestamp={msg.created_at}
            />
          ))}

          {streamingText && (
            <MessageBubble role="marcus" content={streamingText} isStreaming />
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-muted)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${displayName}...`}
            aria-label={`Message ${displayName}`}
            rows={1}
            style={{
              flex: 1,
              padding: "10px 14px",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              fontSize: 14,
              outline: "none",
              resize: "none",
              fontFamily: "inherit",
              lineHeight: 1.5,
              maxHeight: 120,
              overflow: "auto",
              backgroundColor: "var(--bg-inset)",
              color: "var(--text-primary)",
            }}
            disabled={isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            style={{
              padding: "10px 20px",
              backgroundColor:
                isStreaming || !input.trim() ? "var(--border-default)" : "var(--accent-emphasis)",
              color: isStreaming || !input.trim() ? "var(--text-tertiary)" : "var(--text-on-accent)",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              cursor: isStreaming || !input.trim() ? "not-allowed" : "pointer",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {isStreaming ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
