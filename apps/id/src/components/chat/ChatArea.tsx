"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MarcusMessage } from "@kinetiks/types";
import { MessageBubble } from "./MessageBubble";
import { useAppPanel } from "./app-panel/AppPanelContext";
import { filterSlashCommands, type AppCommand } from "@/lib/commands/registry";
import { buildFirstRunGreeting } from "@/lib/marcus/greeting-copy";

interface ChatAreaProps {
  currentThreadId?: string;
  messages: MarcusMessage[];
  onMessagesChange: (messages: MarcusMessage[]) => void;
  onThreadCreated: (threadId: string) => void;
  onRefreshThreads: () => void;
  systemName: string | null;
  /** B3 — org-layer company name; personalizes the first-run greeting. */
  greetingCompanyName?: string | null;
}

const STARTERS = [
  "Give me my daily brief.",
  "How are my goals pacing?",
  "What should I focus on this week?",
  "What's working in my outreach?",
];

export function ChatArea({
  currentThreadId,
  messages,
  onMessagesChange,
  onThreadCreated,
  onRefreshThreads,
  systemName,
  greetingCompanyName = null,
}: ChatAreaProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const appPanel = useAppPanel();
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  // B2 — live pipeline status ("Checking GA4...") streamed by the engine
  // before the first token. Cleared as soon as text starts arriving.
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  // Once the customer engages (types or sends), starter chips stay dismissed
  // even if the composer is later cleared.
  const [hasTyped, setHasTyped] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastAppliedDraft = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages, streamingText, statusLabel]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Pre-fill the composer from ?draft= (command palette / insight "act on this").
  // The customer reviews before sending; we never auto-send. Re-applies whenever
  // the draft value changes (e.g. acting on a second insight while mounted), and
  // strips only the `draft` param so other query params survive.
  useEffect(() => {
    const draft = searchParams.get("draft");
    if (!draft || draft === lastAppliedDraft.current) return;
    lastAppliedDraft.current = draft;
    setInput(draft);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("draft");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [pathname, router, searchParams]);

  const handleSend = useCallback(
    async (override?: string) => {
      const message = (override ?? input).trim();
      if (!message || isStreaming) return;

      setHasTyped(true);
      setInput("");
      setIsStreaming(true);
      setStreamingText("");
      setStatusLabel(null);

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
          body: JSON.stringify({ message, thread_id: currentThreadId, channel: "web" }),
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
        // B4 — tools the engine reported via tool_exec status events;
        // attached to the optimistic message so provenance chips show
        // immediately (the persisted row carries the full context_used).
        const liveTools: string[] = [];

        // Shared so the trailing (newline-less) buffer runs the same logic and
        // doesn't drop a final thread_id / extraction / error event.
        const applyEvent = (jsonStr: string) => {
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "thread_id") {
              threadId = event.thread_id;
              if (!currentThreadId) onThreadCreated(threadId);
            } else if (event.type === "status") {
              // Live pipeline progress; superseded by the next status or
              // by the first text delta.
              if (typeof event.label === "string") setStatusLabel(event.label);
              if (event.stage === "tool_exec" && typeof event.tool_name === "string") {
                liveTools.push(event.tool_name);
              }
            } else if (event.type === "text") {
              fullText += event.text;
              setStreamingText(fullText);
              setStatusLabel(null);
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
        };

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
              if (jsonStr) applyEvent(jsonStr);
            }
          }

          if (lineBuffer.startsWith("data: ")) {
            const jsonStr = lineBuffer.slice(6).trim();
            if (jsonStr) applyEvent(jsonStr);
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
          context_used:
            liveTools.length > 0
              ? { tools: liveTools.map((tool_name) => ({ tool_name })) }
              : null,
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
        setStatusLabel(null);
      }
    },
    [input, isStreaming, currentThreadId, messages, onMessagesChange, onThreadCreated, onRefreshThreads],
  );

  // Slash menu: active when the composer begins with "/" and matches commands.
  const slashMatches = useMemo<AppCommand[]>(() => {
    if (!input.startsWith("/")) return [];
    const token = input.split(/\s/)[0];
    return filterSlashCommands(token);
  }, [input]);
  const slashOpen = slashMatches.length > 0;

  function runSlash(cmd: AppCommand) {
    if (cmd.kind === "navigate" && cmd.href) {
      router.push(cmd.href);
      setInput("");
    } else if (cmd.kind === "chat" && cmd.prompt) {
      setInput(cmd.prompt);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runSlash(slashMatches[0]);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const displayName = systemName || "your system";
  const showChips = !hasTyped && !input.trim() && !isStreaming;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "var(--kt-bg-base)", height: "100%" }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--kt-s-5) var(--kt-s-5) 0" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {messages.length === 0 && !streamingText ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 240px)" }}>
              <div style={{ textAlign: "center", maxWidth: 460 }}>
                <div className="kt-voice-display" style={{ marginBottom: "var(--kt-s-2)" }}>{systemName || "Kinetiks"}</div>
                <p className="kt-body" style={{ margin: 0 }}>
                  {buildFirstRunGreeting(greetingCompanyName)}
                </p>
              </div>
            </div>
          ) : null}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content}
              extractedActions={msg.extracted_actions}
              contextUsed={msg.context_used}
              timestamp={msg.created_at}
              systemName={systemName}
              onOpenPanel={appPanel ? appPanel.openFromSignal : undefined}
            />
          ))}

          {streamingText ? <MessageBubble role="marcus" content={streamingText} isStreaming systemName={systemName} /> : null}

          {/* B2 — live agent status before the first token. */}
          {isStreaming && !streamingText && statusLabel ? (
            <div
              role="status"
              aria-live="polite"
              aria-busy="true"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--kt-s-2)",
                marginBottom: "var(--kt-s-4)",
                color: "var(--kt-fg-3)",
                fontSize: "var(--kt-fs-13)",
              }}
            >
              <span>{statusLabel}...</span>
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: "var(--kt-s-4) var(--kt-s-5)", borderTop: "1px solid var(--kt-border-2)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
          {/* Slash command menu */}
          {slashOpen ? (
            <div
              role="listbox"
              aria-label="Slash commands"
              style={{
                position: "absolute",
                bottom: "calc(100% + var(--kt-s-2))",
                left: 0,
                right: 0,
                background: "var(--kt-bg-elevated)",
                border: "1px solid var(--kt-border-1)",
                borderRadius: "var(--kt-radius-2)",
                boxShadow: "var(--kt-shadow-md)",
                padding: "var(--kt-s-1)",
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {slashMatches.map((cmd, i) => (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => runSlash(cmd)}
                  style={{
                    display: "flex",
                    width: "100%",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "var(--kt-s-3)",
                    padding: "var(--kt-s-2) var(--kt-s-3)",
                    border: "none",
                    borderRadius: "var(--kt-radius-1)",
                    background: i === 0 ? "var(--kt-accent-soft)" : "transparent",
                    color: "var(--kt-fg-1)",
                    fontSize: "var(--kt-fs-14)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span>{cmd.label}</span>
                  <span className="kt-data-inline" style={{ color: "var(--kt-fg-3)" }}>{cmd.slash}</span>
                </button>
              ))}
            </div>
          ) : null}

          {/* Suggestion chips */}
          {showChips ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--kt-s-2)", marginBottom: "var(--kt-s-3)" }}>
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSend(s)}
                  style={{
                    padding: "var(--kt-s-1) var(--kt-s-3)",
                    border: "1px solid var(--kt-border-2)",
                    borderRadius: "var(--kt-radius-full)",
                    background: "var(--kt-bg-elevated)",
                    color: "var(--kt-fg-2)",
                    fontSize: "var(--kt-fs-13)",
                    cursor: "pointer",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "var(--kt-s-2)", alignItems: "flex-end" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setHasTyped(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${displayName}, or type /`}
              aria-label={`Message ${displayName}`}
              rows={1}
              className="kt-field kt-textarea"
              style={{ flex: 1, maxHeight: 120, minHeight: 0, resize: "none", lineHeight: "var(--kt-lh-body)" }}
              disabled={isStreaming}
            />
            <button
              onClick={() => handleSend()}
              disabled={isStreaming || !input.trim()}
              className="kt-btn kt-btn--accent kt-btn--md"
              style={{ whiteSpace: "nowrap" }}
            >
              {isStreaming ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
