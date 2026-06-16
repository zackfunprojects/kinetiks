import type { CommandProgress } from "@kinetiks/synapse";
import type { AppPanelOpen } from "@kinetiks/types";

/**
 * SSE event contract for the command pipeline (spec §7). Shared by
 * `/api/marcus/command` and, when command intent is detected inline, by
 * `/api/marcus/chat`. The Chat UI renders `command_progress` as a live
 * progress indicator, `command_result` as the final response, and `panel_open`
 * mounts the collaborative app panel (spec §4.2).
 */
export type CommandStreamEvent =
  | { type: "command_progress"; progress: CommandProgress }
  | {
      type: "command_result";
      text: string;
      has_errors: boolean;
      approval_ids: string[];
      data: Record<string, unknown>;
      app_panel_open?: AppPanelOpen;
    }
  | { type: "panel_open"; panel: AppPanelOpen }
  | { type: "clarification"; message: string }
  | { type: "no_match"; message: string }
  | { type: "translation_failed"; message: string }
  | { type: "error"; error: string };

/** Encode a command-stream event as a single SSE frame. */
export function encodeCommandEvent(event: CommandStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
