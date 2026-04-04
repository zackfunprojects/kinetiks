"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { MarcusThread, MarcusMessage } from "@kinetiks/types";
import { ChatSidebar } from "./ChatSidebar";
import { ChatArea } from "./ChatArea";

interface ChatLayoutProps {
  initialThreads: MarcusThread[];
  initialThreadId?: string;
  initialMessages?: MarcusMessage[];
  systemName: string | null;
}

export function ChatLayout({
  initialThreads,
  initialThreadId,
  initialMessages = [],
  systemName,
}: ChatLayoutProps) {
  const [threads, setThreads] = useState<MarcusThread[]>(initialThreads);
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(initialThreadId);
  const [messages, setMessages] = useState<MarcusMessage[]>(initialMessages);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchSeqRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const loadMessages = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/marcus/threads/${threadId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch {
      // Fall through
    }
  }, []);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      setCurrentThreadId(threadId);
      setMessages([]);
      loadMessages(threadId);
      // Update URL without full navigation
      window.history.pushState(null, "", `/chat/${threadId}`);
    },
    [loadMessages]
  );

  const handleNewThread = useCallback(() => {
    setCurrentThreadId(undefined);
    setMessages([]);
    window.history.pushState(null, "", "/chat");
  }, []);

  const handleThreadCreated = useCallback((threadId: string) => {
    setCurrentThreadId(threadId);
    window.history.pushState(null, "", `/chat/${threadId}`);
  }, []);

  const handleRefreshThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/marcus/threads");
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
      }
    } catch {
      // Non-critical
    }
  }, []);

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
        if (res.ok && searchSeqRef.current === seq) {
          const data = await res.json();
          setThreads(data.threads ?? []);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }, 300);
  }, []);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <ChatSidebar
        threads={threads}
        currentThreadId={currentThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        onSearch={handleSearch}
      />
      <ChatArea
        currentThreadId={currentThreadId}
        messages={messages}
        onMessagesChange={setMessages}
        onThreadCreated={handleThreadCreated}
        onRefreshThreads={handleRefreshThreads}
        systemName={systemName}
      />
    </div>
  );
}
