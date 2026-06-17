"use client";

import type { ReactNode } from "react";
import { Badge } from "./badge";
import { Button } from "./button";
import { ProgressBar } from "./progress-bar";
import { cn } from "./cn";

// Local types keep @kinetiks/ui decoupled from @kinetiks/types; structurally
// identical to ActiveTaskStep / ActiveTaskStepStatus in collaborative.ts.
export type TaskDrawerStepStatus =
  | "queued"
  | "working"
  | "done"
  | "skipped"
  | "failed";

export interface TaskDrawerStep {
  index: number;
  appName: string;
  label: string;
  status: TaskDrawerStepStatus;
}

export interface TaskDrawerProps {
  /** The user's named system, e.g. "Kit". */
  systemName: string;
  /** Task name (from the SynapseCommand). */
  name: string;
  /** Current app badge — which app the system is working in. */
  appName: string;
  /** 0–100. */
  progress: number;
  /** "Step 2 of 4: Drafting email 2" — the current-step label. */
  currentStepLabel?: string;
  /** Full plan for multi-step orchestrations (§8.4). */
  steps?: TaskDrawerStep[];
  /** "2m 14s" — elapsed time, shown when expanded. */
  elapsedLabel?: string;
  expanded: boolean;
  onToggle: () => void;
  /** Kill the whole task — opens the "What went wrong?" prompt. */
  onKill: () => void;
  /** Skip just the current step (§8.4); omit to hide per-step controls. */
  onSkipStep?: (index: number) => void;
  /** Reference-surface label. */
  fixture?: boolean;
  /** Rendered inside the expanded drawer — the kill prompt (slice 2). */
  killPrompt?: ReactNode;
}

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d="M3.5 2 L6.5 5 L3.5 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The task drawer (spec §8 / §16.1): a floating pill anchored to the bottom of
 * the app panel. Collapsed = system name + current step + progress + Kill (red
 * text, always visible). Expanded reveals the multi-step plan, elapsed time, and
 * step-level controls. Token-only; light + dark; reduced-motion respected.
 */
export function TaskDrawer({
  systemName,
  name,
  appName,
  progress,
  currentStepLabel,
  steps = [],
  elapsedLabel,
  expanded,
  onToggle,
  onKill,
  onSkipStep,
  fixture = false,
  killPrompt,
}: TaskDrawerProps) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="kt-floating-bar kt-task-drawer" role="region" aria-label="Active task">
      <div className="kt-task-drawer__head">
        <button
          type="button"
          className="kt-task-drawer__toggle"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse task drawer" : "Expand task drawer"}
          onClick={onToggle}
        >
          <Chevron />
        </button>

        <div className="kt-task-drawer__meta">
          <div className="kt-task-drawer__name">
            <span className="kt-task-drawer__name-label">{name}</span>
            <Badge label={appName} variant="accent" />
            {fixture ? <Badge label="fixture" variant="warning" /> : null}
          </div>
          {currentStepLabel ? (
            <div className="kt-task-drawer__step">{currentStepLabel}</div>
          ) : null}
        </div>

        <div className="kt-task-drawer__progress">
          <ProgressBar
            value={pct / 100}
            tone="accent"
            ariaLabel={`${systemName} task progress: ${pct} percent`}
          />
          <div className="kt-task-drawer__pct">{pct}%</div>
        </div>

        <Button variant="danger" size="sm" onClick={onKill}>
          Kill Task
        </Button>
      </div>

      <div className={cn("kt-task-drawer__body", expanded && "kt-task-drawer__body--open")}>
        {steps.length > 0 ? (
          <ol className="kt-task-drawer__plan">
            {steps.map((step) => (
              <li
                key={step.index}
                className={cn(
                  "kt-task-drawer__plan-item",
                  `kt-task-drawer__plan-item--${step.status}`,
                )}
              >
                <span className="kt-task-drawer__plan-index">{step.index + 1}</span>
                <span className="kt-task-drawer__plan-label">
                  {step.label}
                  {step.appName ? ` (${step.appName})` : ""}
                </span>
                <StepStatusPill status={step.status} />
                {onSkipStep && step.status === "working" ? (
                  <Button variant="ghost" size="sm" onClick={() => onSkipStep(step.index)}>
                    Skip
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}

        {elapsedLabel ? (
          <div className="kt-task-drawer__elapsed">Elapsed {elapsedLabel}</div>
        ) : null}

        {killPrompt ? <div className="kt-task-drawer__kill-prompt">{killPrompt}</div> : null}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<TaskDrawerStepStatus, string> = {
  queued: "queued",
  working: "working…",
  done: "done",
  skipped: "skipped",
  failed: "failed",
};

function StepStatusPill({ status }: { status: TaskDrawerStepStatus }) {
  const variant =
    status === "done"
      ? "success"
      : status === "failed"
        ? "error"
        : status === "working"
          ? "accent"
          : "default";
  return <Badge label={STATUS_LABEL[status]} variant={variant} />;
}
