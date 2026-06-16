"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@kinetiks/ui";
import type { AppPanelTarget } from "./AppPanelContext";

interface AppPanelProps {
  target: AppPanelTarget;
  threadId?: string;
  accountId: string;
  onClose: () => void;
}

/**
 * The app panel (spec §4): mounts the reference collaborative surface as a
 * same-origin `/embed` iframe (the shared session cookie authenticates it).
 * Shows a skeleton until interactive (§14.2). The presence layer (agent cursor,
 * etc.) renders over this in 8.3.
 */
export function AppPanel({ target, threadId, accountId, onClose }: AppPanelProps) {
  const [loaded, setLoaded] = useState(false);

  const src = useMemo(() => {
    const params = new URLSearchParams({ mode: target.mode, account: accountId });
    if (target.app) params.set("app", target.app);
    if (target.entity) params.set("entity", target.entity);
    if (threadId) params.set("thread", threadId);
    return `/embed?${params.toString()}`;
  }, [target, threadId, accountId]);

  // Show the skeleton again when the panel switches to a different surface.
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  const label = target.entity ? `${target.app} · ${target.entity}` : target.app;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderLeft: "1px solid var(--kt-border-2)",
        backgroundColor: "var(--kt-bg-base)",
      }}
    >
      {/* Breadcrumb header (single app now; multi-app orchestration in 8.5) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--kt-s-2)",
          padding: "var(--kt-s-2) var(--kt-s-3)",
          borderBottom: "1px solid var(--kt-border-2)",
        }}
      >
        <span
          className="kt-data-inline"
          style={{
            fontSize: "var(--kt-fs-12)",
            color: "var(--kt-fg-2)",
            fontFamily: "var(--kt-font-mono)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close panel">
          Close
        </Button>
      </div>

      {/* Surface */}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {!loaded && (
          <div
            aria-busy="true"
            aria-live="polite"
            aria-label="Loading workspace"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--kt-fg-3)",
              fontSize: "var(--kt-fs-13)",
            }}
          >
            Loading workspace…
          </div>
        )}
        <iframe
          src={src}
          title="App panel"
          onLoad={() => setLoaded(true)}
          style={{
            border: "none",
            width: "100%",
            height: "100%",
            display: "block",
            opacity: loaded ? 1 : 0,
            transition: "opacity var(--kt-dur-2) ease",
          }}
        />
      </div>
    </div>
  );
}
