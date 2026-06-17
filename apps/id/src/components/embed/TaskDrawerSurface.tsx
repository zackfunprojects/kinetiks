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

const COMPLETED_STEPS: ActiveTaskStep[] = FIXTURE_STEPS.map((s) => ({ ...s, status: "done" }));

/** Progress beats — advance the build, then finish (the system hands the work
 *  off for review, §9.1). */
const PLAYBACK: Array<{ progress: number; current_step_index: number; steps: ActiveTaskStep[] }> = [
  { progress: 35, current_step_index: 1, steps: FIXTURE_STEPS },
  { progress: 60, current_step_index: 1, steps: FIXTURE_STEPS },
  { progress: 85, current_step_index: 2, steps: COMPLETED_STEPS },
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
  /** The system finished the work — hand off to the review phase (§9.1). */
  onWorkComplete?: () => void;
  /** The user killed the task — return to idle, no review. */
  onKilled?: () => void;
}

export function TaskDrawerSurface({
  systemName,
  accountId,
  threadId,
  enabled,
  onWorkComplete,
  onKilled,
}: TaskDrawerSurfaceProps) {
  const { task, open, advance, complete, skipStep, kill } = useActiveTask(accountId, threadId);
  const [expanded, setExpanded] = useState(false);
  const [killing, setKilling] = useState(false);
  const [killPending, setKillPending] = useState(false);
  const [ack, setAck] = useState<string | null>(null);
  const opened = useRef(false);
  // Stops the playback from mutating a task the user just killed.
  const killedRef = useRef(false);

  useEffect(() => {
    opened.current = false;
    killedRef.current = false;
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
            if (cancelled || killedRef.current) return;
            void advance(created.id, beat);
          }, 1500 * (i + 1)),
        );
      });
      // Finale: finish the work, then hand off to the review phase (§9.1).
      timers.push(
        setTimeout(
          () => {
            if (cancelled || killedRef.current) return;
            void (async () => {
              await advance(created.id, {
                progress: 100,
                current_step_index: 2,
                steps: COMPLETED_STEPS,
              });
              await complete(created.id);
              if (!cancelled && !killedRef.current) onWorkComplete?.();
            })();
          },
          1500 * (PLAYBACK.length + 1),
        ),
      );
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [enabled, threadId, task, open, advance, complete, onWorkComplete]);

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
    killedRef.current = true; // stop the playback from touching the killed task
    setKillPending(true);
    const result = await kill({ taskId: task.id, reasonCode, feedback: feedback || undefined });
    setKillPending(false);
    setKilling(false);
    setExpanded(false);
    if (result) setAck(result.acknowledgement);
    onKilled?.();
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
