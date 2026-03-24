"use client";

import type { MarcusThread } from "@kinetiks/types";
import { useState } from "react";

interface ThreadSidebarProps {
  threads: MarcusThread[];
  currentThreadId?: string;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onSearch: (query: string) => void;
}

export function ThreadSidebar({
  threads,
  currentThreadId,
  onSelectThread,
  onNewThread,
  onSearch,
}: ThreadSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    onSearch(value);
  };

  // Group threads by time
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const pinned = threads.filter((t) => t.pinned);
  const today = threads.filter(
    (t) => !t.pinned && new Date(t.updated_at) >= todayStart
  );
  const thisWeek = threads.filter(
    (t) =>
      !t.pinned &&
      new Date(t.updated_at) >= weekStart &&
      new Date(t.updated_at) < todayStart
  );
  const earlier = threads.filter(
    (t) => !t.pinned && new Date(t.updated_at) < weekStart
  );

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
      {/* Header */}
      <div style={{ padding: "16px 16px 8px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono), monospace" }}>
            threads
          </h3>
          <button
            onClick={onNewThread}
            style={{
              background: "var(--accent-emphasis)",
              color: "var(--text-on-accent)",
              border: "none",
              borderRadius: 4,
              padding: "6px 12px",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 500,
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            + new
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search threads..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            fontSize: 13,
            outline: "none",
            boxSizing: "border-box",
            backgroundColor: "var(--bg-inset)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* Thread list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
        {pinned.length > 0 && (
          <ThreadGroup label="Pinned" threads={pinned} currentThreadId={currentThreadId} onSelect={onSelectThread} />
        )}
        {today.length > 0 && (
          <ThreadGroup label="Today" threads={today} currentThreadId={currentThreadId} onSelect={onSelectThread} />
        )}
        {thisWeek.length > 0 && (
          <ThreadGroup label="This Week" threads={thisWeek} currentThreadId={currentThreadId} onSelect={onSelectThread} />
        )}
        {earlier.length > 0 && (
          <ThreadGroup label="Earlier" threads={earlier} currentThreadId={currentThreadId} onSelect={onSelectThread} />
        )}
        {threads.length === 0 && (
          <p style={{ textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, padding: 16, fontFamily: "var(--font-mono), monospace" }}>
            No conversations yet
          </p>
        )}
      </div>
    </div>
  );
}

function ThreadGroup({
  label,
  threads,
  currentThreadId,
  onSelect,
}: {
  label: string;
  threads: MarcusThread[];
  currentThreadId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          fontFamily: "var(--font-mono), monospace",
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          padding: "4px 8px",
        }}
      >
        {label}
      </div>
      {threads.map((thread) => (
        <button
          key={thread.id}
          onClick={() => onSelect(thread.id)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "10px 12px",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
            backgroundColor:
              thread.id === currentThreadId ? "var(--accent-muted)" : "transparent",
            color: thread.id === currentThreadId ? "var(--accent)" : "var(--text-secondary)",
            fontWeight: thread.id === currentThreadId ? 500 : 400,
            marginBottom: 2,
            borderLeft: thread.id === currentThreadId ? "2px solid var(--accent)" : "2px solid transparent",
          }}
        >
          <div
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {thread.pinned && "# "}
            {thread.title || "New conversation"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2, fontFamily: "var(--font-mono), monospace" }}>
            {formatRelativeTime(thread.updated_at)}
          </div>
        </button>
      ))}
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
