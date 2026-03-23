"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { MarcusThread, MarcusMessage, ExtractedAction } from "@kinetiks/types";
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages, streamingText]);

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
      setCurrentThreadId(threadId);
      setStreamingText("");
      loadMessages(threadId);
    },
    [loadMessages]
  );

  const handleNewThread = useCallback(() => {
    setCurrentThreadId(undefined);
    setMessages([]);
    setStreamingText("");
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      // Reload all threads
      try {
        const res = await fetch("/api/marcus/threads");
        if (res.ok) {
          const data = await res.json();
          setThreads(data.threads ?? []);
        }
      } catch {
        // Use initial threads
      }
      return;
    }
    try {
      const res = await fetch(
        `/api/marcus/threads?search=${encodeURIComponent(query)}`
      );
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
      }
    } catch {
      // Keep current threads
    }
  }, []);

  const handleSend = async () => {
    const message = input.trim();
    if (!message || isStreaming) return;

    setInput("");
    setIsStreaming(true);
    setStreamingText("");

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
      });

      if (!res.ok || !res.body) {
        throw new Error("Chat request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let threadId = currentThreadId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

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
              // Add extraction disclosure as part of the message
              if (event.disclosure) {
                fullText += `\n\n---\n${event.disclosure}`;
                setStreamingText(fullText);
              }
            } else if (event.type === "done") {
              // Stream complete
            } else if (event.type === "error") {
              fullText += `\n\n[Error: ${event.error}]`;
              setStreamingText(fullText);
            }
          } catch {
            // Skip malformed SSE events
          }
        }
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

      // Refresh thread list
      const threadRes = await fetch("/api/marcus/threads");
      if (threadRes.ok) {
        const threadData = await threadRes.json();
        setThreads(threadData.threads ?? []);
      }
    } catch {
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
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #e5e5ea",
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
          backgroundColor: "#fff",
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
                color: "#999",
                fontSize: 14,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>Marcus</div>
                <div>Your strategic advisor. Ask anything.</div>
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
            borderTop: "1px solid #e5e5ea",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Marcus anything..."
              rows={1}
              style={{
                flex: 1,
                padding: "10px 14px",
                border: "1px solid #e5e5ea",
                borderRadius: 10,
                fontSize: 14,
                outline: "none",
                resize: "none",
                fontFamily: "inherit",
                lineHeight: 1.5,
                maxHeight: 120,
                overflow: "auto",
              }}
              disabled={isStreaming}
            />
            <button
              onClick={handleSend}
              disabled={isStreaming || !input.trim()}
              style={{
                padding: "10px 20px",
                backgroundColor:
                  isStreaming || !input.trim() ? "#ccc" : "#6C5CE7",
                color: "#fff",
                border: "none",
                borderRadius: 10,
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
