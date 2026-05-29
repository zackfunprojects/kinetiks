"use client";

import { useState } from "react";
import { Button, Skeleton } from "@kinetiks/ui";
import type { ContextLayer } from "@kinetiks/types";

type State = "idle" | "loading" | "done" | "empty" | "error";

/**
 * "What the system understands" reflection for a Context layer. Rendered in
 * the serif voice role. Fetched on demand (button press) so it does not spend
 * a model call on every page view.
 */
export function LayerReflection({ layer }: { layer: ContextLayer }) {
  const [state, setState] = useState<State>("idle");
  const [text, setText] = useState<string | null>(null);

  async function reflect() {
    setState("loading");
    try {
      const res = await fetch(`/api/context/${layer}/reflection`);
      if (!res.ok) throw new Error("failed");
      const body = await res.json();
      const reflection = (body.data?.reflection ?? null) as string | null;
      if (!reflection) {
        setState("empty");
        return;
      }
      setText(reflection);
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "idle") {
    return (
      <div style={{ marginBottom: "var(--kt-s-5)" }}>
        <Button variant="ghost" size="sm" onClick={reflect}>Reflect on this layer</Button>
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: "var(--kt-s-5)",
        padding: "var(--kt-s-4)",
        borderRadius: "var(--kt-radius-2)",
        background: "var(--kt-bg-subtle)",
        border: "1px solid var(--kt-border-1)",
      }}
    >
      <div className="kt-eyebrow" style={{ marginBottom: "var(--kt-s-2)" }}>What I understand here</div>
      {state === "loading" ? (
        <Skeleton height={20} width="80%" />
      ) : state === "done" ? (
        <p className="kt-voice-quote" style={{ margin: 0 }}>{text}</p>
      ) : state === "empty" ? (
        <p className="kt-small" style={{ margin: 0 }}>Not enough in this layer yet to reflect on. Add a few fields and try again.</p>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--kt-s-3)" }}>
          <span className="kt-small" style={{ color: "var(--kt-danger)" }}>Couldn&apos;t generate a reflection.</span>
          <Button variant="ghost" size="sm" onClick={reflect}>Try again</Button>
        </div>
      )}
    </div>
  );
}
