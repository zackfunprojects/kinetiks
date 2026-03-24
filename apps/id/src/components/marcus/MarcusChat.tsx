"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { MarcusThread, MarcusMessage } from "@kinetiks/types";
import { MessageBubble } from "./MessageBubble";
import { ThreadSidebar } from "./ThreadSidebar";

interface MarcusChatProps {
  initialThreads: MarcusThread[];
}

export function MarcusChat({ initialThreads }: MarcusChatProps) {
  const [threads, setThreads] = useState<MarcusThread[]>(initialThreads);
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>();
  const [messages, setMessages] = useState<MarcusMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchSeqRef = useRef<number>(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages, streamingText]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      searchAbortRef.current?.abort();
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // Load messages when thread changes
  const loadMessages = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/marcus/threads/${threadId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch {
      // Fall through - messages will be empty
    }
  }, []);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      // Abort any in-flight stream when switching threads
      abortControllerRef.current?.abort();
      setCurrentThreadId(threadId);
      setStreamingText("");
      setIsStreaming(false);
      loadMessages(threadId);
    },
    [loadMessages]
  );

  const handleNewThread = useCallback(() => {
    abortControllerRef.current?.abort();
    setCurrentThreadId(undefined);
    setMessages([]);
    setStreamingText("");
    setIsStreaming(false);
  }, []);

  // Debounced search with stale-request protection
  const handleSearch = useCallback(async (query: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchAbortRef.current?.abort();

    const seq = ++searchSeqRef.current;

    searchTimeoutRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;

      const url = query.trim()
        ? `/api/marcus/threads?search=${encodeURIComponent(query)}`
        : "/api/marcus/threads";
      try {
        const res = await fetch(url, { signal: controller.signal });
        // Only apply result if this is still the latest search
        if (res.ok && searchSeqRef.current === seq) {
          const data = await res.json();
          setThreads(data.threads ?? []);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Keep current threads on other errors
      }
    }, 300);
  }, []);

  const handleSend = async () => {
    const message = input.trim();
    if (!message || isStreaming) return;

    setInput("");
    setIsStreaming(true);
    setStreamingText("");

    // Abort any previous stream
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Optimistically add user message
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
    setMessages((prev) => [...prev, userMsg]);

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
      let threadId = currentThreadId;
      let lineBuffer = ""; // Buffer for incomplete SSE lines across chunks

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Append new chunk to buffer, then split into lines
          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split("\n");
          // Keep the last (potentially incomplete) line in the buffer
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
                  setCurrentThreadId(threadId);
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

        // Process any remaining data in the buffer
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

      // Add the complete Marcus message
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
      setMessages((prev) => [...prev, marcusMsg]);
      setStreamingText("");

      // Refresh thread list (separate try/catch so failures don't show error to user)
      try {
        const threadRes = await fetch("/api/marcus/threads");
        if (threadRes.ok) {
          const threadData = await threadRes.json();
          setThreads(threadData.threads ?? []);
        }
      } catch {
        // Non-critical - thread list will refresh on next action
      }
    } catch (err) {
      // Don't show error if we intentionally aborted (thread switch / unmount)
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setMessages((prev) => [
        ...prev,
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
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100vh - 64px)",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--border-default)",
      }}
    >
      {/* Thread sidebar */}
      <ThreadSidebar
        threads={threads}
        currentThreadId={currentThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        onSearch={handleSearch}
      />

      {/* Chat area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--bg-base)",
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
          {messages.length === 0 && !streamingText && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--text-tertiary)",
                fontSize: 14,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: 14,
                    fontFamily: "var(--font-mono), monospace",
                    color: "var(--accent)",
                    marginBottom: 8,
                  }}
                >
                  {">"} marcus
                </div>
                <div style={{ color: "var(--text-tertiary)" }}>
                  Your strategic advisor. Ask anything.
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
            <MessageBubble
              role="marcus"
              content={streamingText}
              isStreaming={true}
            />
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border-muted)",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Marcus anything..."
              aria-label="Message Marcus"
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
                cursor:
                  isStreaming || !input.trim() ? "not-allowed" : "pointer",
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {isStreaming ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
