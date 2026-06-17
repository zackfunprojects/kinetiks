import type { CSSProperties } from "react";
import { cn } from "./cn";

export type AgentCursorState = "idle" | "uncertain" | "typing" | "selecting";

export interface AgentCursorProps {
  /** Position within the positioned container, in px. */
  x: number;
  y: number;
  /** System name shown on the cursor label (e.g. "Kit"). */
  label: string;
  /** Brand color (any `--kt-*` token reference). Defaults to the accent. */
  color?: string;
  state?: AgentCursorState;
  /** Why the agent paused — surfaced as the title when state is "uncertain". */
  uncertaintyReason?: string;
  className?: string;
}

/**
 * The named system's presence on a shared surface (spec §5.1): a labeled dot
 * that animates to the field it's operating on. Pulses when uncertain; shows a
 * typing caret when generating text. Token-driven; `prefers-reduced-motion`
 * disables the movement transition + pulse. Render inside a positioned
 * container; `x`/`y` are relative to it.
 */
export function AgentCursor({
  x,
  y,
  label,
  color = "var(--kt-accent)",
  state = "idle",
  uncertaintyReason,
  className,
}: AgentCursorProps) {
  const style: CSSProperties = {
    transform: `translate(${x}px, ${y}px)`,
    color,
  };

  return (
    <div
      className={cn(
        "kt-agent-cursor",
        state === "uncertain" && "kt-agent-cursor--uncertain",
        state === "selecting" && "kt-agent-cursor--selecting",
        className
      )}
      style={style}
      aria-hidden="true"
      title={state === "uncertain" ? uncertaintyReason : undefined}
    >
      <span className="kt-agent-cursor__dot" />
      <span className="kt-agent-cursor__label">
        {label}
        {state === "typing" && <span className="kt-cursor" aria-hidden="true" />}
      </span>
    </div>
  );
}
