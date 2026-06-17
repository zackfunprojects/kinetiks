"use client";

import { useEffect, useRef, useState } from "react";
import { Button, TaskDrawer, type TaskDrawerStep } from "@kinetiks/ui";
import { useActiveTask } from "@/lib/embed/useActiveTask";
import { KillPrompt } from "./KillPrompt";
import type { ActiveTaskStep } from "@kinetiks/types";

/**
 * The reference surface has no real command pipeline, so a clearly-labeled
 * fixture playback opens a multi-step orchestration and advances its progress
 * over the same kinetiks_active_tasks APIs a real command would use (§8.4).
 * Honors the fixtures contract (source_app: kinetiks_fixtures, server-side).
 */
const FIXTURE_STEPS: ActiveTaskStep[] = [
  { index: 0, app_name: "Dark Madder", label: "Draft blog post", status: "done" },
  { index: 1, app_name: "Harvest", label: "Build sequence", status: "working" },
  { index: 2, app_name: "Litmus", label: "Draft PR pitch", status: "queued" },
];

/** Progress beats — advance the build, hold (do not auto-complete, so the
 *  drawer stays visible as "actively working"). */
const PLAYBACK: Array<{ progress: number; current_step_index: number; steps: ActiveTaskStep[] }> = [
  { progress: 35, current_step_index: 1, steps: FIXTURE_STEPS },
  { progress: 55, current_step_index: 1, steps: FIXTURE_STEPS },
  { progress: 70, current_step_index: 1, steps: FIXTURE_STEPS },
];

function stepLabel(steps: TaskDrawerStep[]): string | undefined {
  const working = steps.find((s) => s.status === "working");
  if (!working) return undefined;
  return `Step ${working.index + 1} of ${steps.length}: ${working.label} (${working.appName})`;
}

interface TaskDrawerSurfaceProps {
  systemName: string | null;
  accountId: string;
  threadId: string | null;
  enabled: boolean;
}

export function TaskDrawerSurface({
  systemName,
  accountId,
  threadId,
  enabled,
}: TaskDrawerSurfaceProps) {
  const { task, open, advance, skipStep, kill } = useActiveTask(accountId, threadId);
  const [expanded, setExpanded] = useState(false);
  const [killing, setKilling] = useState(false);
  const [killPending, setKillPending] = useState(false);
  const [ack, setAck] = useState<string | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    opened.current = false;
    setKilling(false);
    setAck(null);
  }, [threadId]);

  // Open the fixture task once per thread, then play the progress beats.
  useEffect(() => {
    if (!enabled || !threadId || opened.current) return;
    if (task) {
      opened.current = true;
      return;
    }
    opened.current = true;
    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    void (async () => {
      const created = await open({
        name: "Launch fintech security campaign",
        description: "Blog post, outbound sequence, then PR pitch",
        app_name: "Harvest",
        steps: FIXTURE_STEPS,
        current_step_index: 1,
        progress: 20,
      });
      if (cancelled || !created) return;
      PLAYBACK.forEach((beat, i) => {
        timers.push(
          setTimeout(() => {
            void advance(created.id, beat);
          }, 1500 * (i + 1)),
        );
      });
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [enabled, threadId, task, open, advance]);

  if (!enabled) return null;

  // After a kill the task is gone; show a transient acknowledgement (§8.3 step 4).
  if (!task) {
    if (!ack) return null;
    return (
      <div style={anchorStyle}>
        <div className="kt-floating-bar kt-floating-bar--success" role="status">
          <span className="kt-floating-bar__body" style={{ fontSize: "var(--kt-fs-13)" }}>
            {ack}
          </span>
          <span className="kt-floating-bar__actions">
            <Button variant="ghost" size="sm" onClick={() => setAck(null)} aria-label="Dismiss">
              ×
            </Button>
          </span>
        </div>
      </div>
    );
  }

  const steps: TaskDrawerStep[] = task.steps.map((s) => ({
    index: s.index,
    appName: s.app_name,
    label: s.label,
    status: s.status,
  }));

  const handleConfirmKill = async (reasonCode: Parameters<typeof kill>[0]["reasonCode"], feedback: string) => {
    setKillPending(true);
    const result = await kill({ taskId: task.id, reasonCode, feedback: feedback || undefined });
    setKillPending(false);
    setKilling(false);
    setExpanded(false);
    if (result) setAck(result.acknowledgement);
  };

  return (
    <div style={anchorStyle}>
      <TaskDrawer
        systemName={systemName ?? "Kinetiks"}
        name={task.name}
        appName={task.app_name}
        progress={task.progress}
        currentStepLabel={stepLabel(steps)}
        steps={steps}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        onKill={() => {
          setKilling(true);
          setExpanded(true);
        }}
        onSkipStep={(index) => void skipStep(task.id, index)}
        fixture
        killPrompt={
          killing ? (
            <KillPrompt
              pending={killPending}
              onConfirm={(reasonCode, feedback) => void handleConfirmKill(reasonCode, feedback)}
              onCancel={() => setKilling(false)}
            />
          ) : undefined
        }
      />
    </div>
  );
}

const anchorStyle = {
  position: "absolute",
  left: "50%",
  bottom: "var(--kt-s-4)",
  transform: "translateX(-50%)",
  zIndex: 22,
  width: "min(560px, calc(100% - var(--kt-s-6)))",
} as const;
