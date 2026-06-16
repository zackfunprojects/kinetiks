import type { AppPanelOpen } from "@kinetiks/types";

/**
 * Rich response blocks rendered inline in Chat (spec-addendum-chat-ux §B.5).
 * A discriminated union so MessageBubble can render structured content (action
 * cards, app cards, tables, charts, progress, expandable detail) alongside
 * prose, instead of plain text only.
 */
export type RichBlock =
  | {
      kind: "action_card";
      title: string;
      summary?: string;
      steps?: string[];
      /** When present, the card offers an "Open" affordance that mounts the panel. */
      panel?: AppPanelOpen;
      approvalId?: string;
    }
  | {
      kind: "app_card";
      appName: string;
      description: string;
      /** Why this app fits the user's situation (spec §A.3 — backed by data). */
      rationale?: string;
    }
  | {
      kind: "data_table";
      columns: string[];
      rows: Array<Array<string | number>>;
      caption?: string;
    }
  | {
      kind: "mini_chart";
      chart: "sparkline" | "bars";
      values: number[];
      label?: string;
    }
  | {
      kind: "progress_indicator";
      label: string;
      /** 0..100. */
      progress: number;
      step?: string;
    }
  | { kind: "expandable"; summary: string; detail: string };

/** Shape of a `command_result` SSE payload (see CommandStreamEvent). */
export interface CommandResultLike {
  text: string;
  approval_ids: string[];
  data: Record<string, unknown>;
  app_panel_open?: AppPanelOpen;
}

/**
 * Map an aggregated command result into rich blocks. The prose `text` still
 * renders as the message body; these blocks augment it with an action card
 * (when work produced a viewable entity) and data tables (when an app returned
 * a results list). Pure + deterministic so it is unit-testable.
 */
export function commandResultToBlocks(result: CommandResultLike): RichBlock[] {
  const blocks: RichBlock[] = [];

  if (result.app_panel_open) {
    blocks.push({
      kind: "action_card",
      title: titleFor(result.app_panel_open.app_name),
      summary: result.text || undefined,
      panel: result.app_panel_open,
      approvalId: result.approval_ids[0],
    });
  }

  for (const [appName, value] of Object.entries(result.data)) {
    const results = (value as { results?: unknown }).results;
    if (Array.isArray(results) && results.length > 0) {
      blocks.push(resultsToTable(appName, results as Array<Record<string, unknown>>));
    }
  }

  return blocks;
}

function titleFor(appName: string): string {
  return appName.charAt(0).toUpperCase() + appName.slice(1);
}

function resultsToTable(
  appName: string,
  results: Array<Record<string, unknown>>
): Extract<RichBlock, { kind: "data_table" }> {
  const sample = results[0] ?? {};
  const columns = Object.keys(sample).slice(0, 5);
  const rows = results.slice(0, 25).map((row) =>
    columns.map((col) => {
      const v = row[col];
      return typeof v === "string" || typeof v === "number" ? v : JSON.stringify(v ?? "");
    })
  );
  return {
    kind: "data_table",
    columns: columns.length > 0 ? columns : ["value"],
    rows: columns.length > 0 ? rows : results.slice(0, 25).map((r) => [JSON.stringify(r)]),
    caption: `${titleFor(appName)} · ${results.length} result${results.length === 1 ? "" : "s"}`,
  };
}
