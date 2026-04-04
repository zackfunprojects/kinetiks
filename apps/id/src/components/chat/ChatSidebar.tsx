"use client";

import { useState } from "react";
import type { MarcusThread } from "@kinetiks/types";
import { SidebarToggle, type SidebarPanel } from "./SidebarToggle";
import { ThreadList } from "./ThreadList";
import { ApprovalPanel } from "@/components/approvals/ApprovalPanel";

interface ChatSidebarProps {
  threads: MarcusThread[];
  currentThreadId?: string;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onSearch: (query: string) => void;
  systemName?: string | null;
}

export function ChatSidebar({
  threads,
  currentThreadId,
  onSelectThread,
  onNewThread,
  onSearch,
  systemName,
}: ChatSidebarProps) {
  const [activePanel, setActivePanel] = useState<SidebarPanel>("chats");

  return (
    <div
      style={{
        width: 280,
        borderRight: "1px solid var(--border-muted)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-surface)",
      }}
    >
      <div style={{ padding: "12px 12px 0" }}>
        <SidebarToggle active={activePanel} onToggle={setActivePanel} />
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        {activePanel === "chats" ? (
          <ThreadList
            threads={threads}
            currentThreadId={currentThreadId}
            onSelectThread={onSelectThread}
            onNewThread={onNewThread}
            onSearch={onSearch}
          />
        ) : (
          <ApprovalPanel systemName={systemName ?? null} />
        )}
      </div>
    </div>
  );
}
