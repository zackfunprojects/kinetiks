"use client";

import { useState } from "react";
import type { MarcusThread } from "@kinetiks/types";
import { SidebarToggle, type SidebarPanel } from "./SidebarToggle";
import { ThreadList } from "./ThreadList";
import { ApprovalPanel } from "@/components/approvals/ApprovalPanel";
import { ActivityPanel } from "./ActivityPanel";
import { usePendingApprovalCount } from "./usePendingApprovalCount";

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
  // D4: the badge the audit found "built but never fed".
  const approvalCount = usePendingApprovalCount();

  return (
    <div
      style={{
        width: 280,
        borderRight: "1px solid var(--kt-border-2)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--kt-bg-subtle)",
      }}
    >
      <div style={{ padding: "12px 12px 0" }}>
        <SidebarToggle
          active={activePanel}
          onToggle={setActivePanel}
          approvalCount={approvalCount}
        />
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
        ) : activePanel === "approvals" ? (
          <ApprovalPanel systemName={systemName ?? null} />
        ) : (
          <ActivityPanel systemName={systemName ?? null} />
        )}
      </div>
    </div>
  );
}
