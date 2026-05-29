"use client";

import { useState } from "react";
import { Card, Button, Skeleton } from "@kinetiks/ui";

type State = "idle" | "loading" | "done" | "error";

/**
 * Customer-facing daily brief. Calls POST /api/marcus/brief on demand (Sonnet),
 * so it never auto-spends on page load. Rendered in the system's voice.
 */
export function DailyBriefCard() {
  const [state, setState] = useState<State>("idle");
  const [content, setContent] = useState("");

  async function generate() {
    setState("loading");
    try {
      const res = await fetch("/api/marcus/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "daily_brief" }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      const text = (data.data?.content ?? "").trim();
      if (!text) {
        // Empty payload is a failure, not a "done" brief with blank body.
        setState("error");
        return;
      }
      setContent(text);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <Card style={{ marginBottom: "var(--kt-s-6)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: state === "idle" ? 0 : "var(--kt-s-3)" }}>
        <div>
          <div className="kt-eyebrow">Daily brief</div>
          {state === "idle" ? (
            <p className="kt-small" style={{ margin: "var(--kt-s-1) 0 0" }}>A read on where your GTM stands today.</p>
          ) : null}
        </div>
        <Button variant={state === "done" ? "ghost" : "accent"} size="sm" onClick={generate} loading={state === "loading"}>
          {state === "done" ? "Refresh" : "Generate"}
        </Button>
      </div>

      {state === "loading" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--kt-s-2)" }}>
          <Skeleton height={16} width="90%" />
          <Skeleton height={16} width="80%" />
          <Skeleton height={16} width="85%" />
        </div>
      ) : state === "done" ? (
        <p className="kt-body" style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--kt-fg-1)" }}>{content}</p>
      ) : state === "error" ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--kt-s-3)" }}>
          <span className="kt-small" style={{ color: "var(--kt-danger)" }}>We couldn&apos;t generate your brief.</span>
          <Button variant="ghost" size="sm" onClick={generate}>Try again</Button>
        </div>
      ) : null}
    </Card>
  );
}
