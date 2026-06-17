"use client";

import { useEffect, useRef, useState } from "react";
import { TaskDrawer, type TaskDrawerStep } from "@kinetiks/ui";
import { useActiveTask } from "@/lib/embed/useActiveTask";
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
  const { task, open, advance, skipStep } = useActiveTask(accountId, threadId);
  const [expanded, setExpanded] = useState(false);
  const opened = useRef(false);

  useEffect(() => {
    opened.current = false;
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

  if (!enabled || !task) return null;

  const steps: TaskDrawerStep[] = task.steps.map((s) => ({
    index: s.index,
    appName: s.app_name,
    label: s.label,
    status: s.status,
  }));

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: "var(--kt-s-4)",
        transform: "translateX(-50%)",
        zIndex: 22,
        width: "min(560px, calc(100% - var(--kt-s-6)))",
      }}
    >
      <TaskDrawer
        systemName={systemName ?? "Kinetiks"}
        name={task.name}
        appName={task.app_name}
        progress={task.progress}
        currentStepLabel={stepLabel(steps)}
        steps={steps}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        // Kill prompt + kill() wiring land in Slice 2; for now Kill expands the
        // drawer to reveal the full plan.
        onKill={() => setExpanded(true)}
        onSkipStep={(index) => void skipStep(task.id, index)}
        fixture
      />
    </div>
  );
}
