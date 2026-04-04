"use client";

import type { MarcusThread } from "@kinetiks/types";
import { useState } from "react";

interface ThreadListProps {
  threads: MarcusThread[];
  currentThreadId?: string;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onSearch: (query: string) => void;
}

export function ThreadList({
  threads,
  currentThreadId,
  onSelectThread,
  onNewThread,
  onSearch,
}: ThreadListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    onSearch(value);
  };

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
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "12px 12px 8px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <button
            onClick={onNewThread}
            style={{
              width: "100%",
              background: "var(--accent-subtle)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-muted)",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: 500,
              textAlign: "left",
            }}
          >
            + New chat
          </button>
        </div>

        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "7px 10px",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            fontSize: 12,
            outline: "none",
            boxSizing: "border-box",
            backgroundColor: "var(--bg-inset)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* Thread list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
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
          <p
            style={{
              textAlign: "center",
              color: "var(--text-tertiary)",
              fontSize: 13,
              padding: 16,
            }}
          >
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
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          padding: "4px 8px",
          fontFamily: "var(--font-mono), monospace",
        }}
      >
        {label}
      </div>
      {threads.map((thread) => {
        const active = thread.id === currentThreadId;
        return (
          <button
            key={thread.id}
            onClick={() => onSelect(thread.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              backgroundColor: active ? "var(--accent-muted)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: active ? 500 : 400,
              marginBottom: 1,
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
            <div
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                marginTop: 2,
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              {formatRelativeTime(thread.updated_at)}
            </div>
          </button>
        );
      })}
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
