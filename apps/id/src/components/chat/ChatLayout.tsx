"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { MarcusThread, MarcusMessage, AppPanelOpen } from "@kinetiks/types";
import { ChatSidebar } from "./ChatSidebar";
import { ChatArea } from "./ChatArea";
import { AppPanel } from "./app-panel/AppPanel";
import {
  AppPanelProvider,
  type AppPanelTarget,
  type AppPanelContextValue,
} from "./app-panel/AppPanelContext";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";

interface ChatLayoutProps {
  initialThreads: MarcusThread[];
  initialThreadId?: string;
  initialMessages?: MarcusMessage[];
  systemName: string | null;
  /** B3 — org-layer company name for the first-run greeting. */
  greetingCompanyName?: string | null;
  /** D4 — scopes the sidebar's Realtime subscriptions per account. */
  accountId: string;
}

export function ChatLayout({
  initialThreads,
  initialThreadId,
  initialMessages = [],
  systemName,
  greetingCompanyName = null,
  accountId,
}: ChatLayoutProps) {
  const [threads, setThreads] = useState<MarcusThread[]>(initialThreads);
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(initialThreadId);
  const [messages, setMessages] = useState<MarcusMessage[]>(initialMessages);
  const [appPanel, setAppPanel] = useState<AppPanelTarget | null>(null);
  // ≥1280px → split column; below → slide-over (spec §3.2).
  const isWide = useMediaQuery("(min-width: 1280px)");
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
        const json = await res.json();
        setMessages(json.data?.messages ?? []);
      }
    } catch {
      // Fall through
    }
  }, []);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      setCurrentThreadId(threadId);
      setMessages([]);
      setAppPanel(null); // panel is thread-scoped (spec §17.1)
      loadMessages(threadId);
      // Update URL without full navigation
      window.history.pushState(null, "", `/chat/${threadId}`);
    },
    [loadMessages]
  );

  const handleNewThread = useCallback(() => {
    setCurrentThreadId(undefined);
    setMessages([]);
    setAppPanel(null); // panel resets on a new thread (spec §17.1)
    window.history.pushState(null, "", "/chat");
  }, []);

  const closePanel = useCallback(() => setAppPanel(null), []);
  const openPanel = useCallback((target: AppPanelTarget) => setAppPanel(target), []);
  const openFromSignal = useCallback((signal: AppPanelOpen) => {
    setAppPanel({
      app: signal.app_name,
      entity: signal.entity_id,
      mode: "collaborative",
    });
  }, []);

  const panelCtx = useMemo<AppPanelContextValue>(
    () => ({ panel: appPanel, openPanel, openFromSignal, closePanel }),
    [appPanel, openPanel, openFromSignal, closePanel]
  );

  const handleThreadCreated = useCallback((threadId: string) => {
    setCurrentThreadId(threadId);
    window.history.pushState(null, "", `/chat/${threadId}`);
  }, []);

  const handleRefreshThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/marcus/threads");
      if (res.ok) {
        const json = await res.json();
        setThreads(json.data?.threads ?? []);
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
          const json = await res.json();
          setThreads(json.data?.threads ?? []);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }, 300);
  }, []);

  return (
    <AppPanelProvider value={panelCtx}>
      <div style={{ display: "flex", height: "100%", position: "relative" }}>
        <ChatSidebar
          threads={threads}
          currentThreadId={currentThreadId}
          onSelectThread={handleSelectThread}
          onNewThread={handleNewThread}
          onSearch={handleSearch}
          systemName={systemName}
          accountId={accountId}
        />
        <ChatArea
          currentThreadId={currentThreadId}
          messages={messages}
          onMessagesChange={setMessages}
          onThreadCreated={handleThreadCreated}
          onRefreshThreads={handleRefreshThreads}
          systemName={systemName}
          greetingCompanyName={greetingCompanyName}
        />

        {/* App panel — split column on wide viewports, slide-over below 1280px. */}
        {appPanel && isWide && (
          <div style={{ flexBasis: "45%", flexShrink: 0, minWidth: 0, height: "100%" }}>
            <AppPanel
              target={appPanel}
              threadId={currentThreadId}
              accountId={accountId}
              onClose={closePanel}
            />
          </div>
        )}
        {appPanel && !isWide && (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "100%",
              maxWidth: 600,
              zIndex: 50,
              boxShadow: "var(--kt-shadow-lg)",
            }}
          >
            <AppPanel
              target={appPanel}
              threadId={currentThreadId}
              accountId={accountId}
              onClose={closePanel}
            />
          </div>
        )}
      </div>
    </AppPanelProvider>
  );
}
