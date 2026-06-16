"use client";

import type { AppPanelOpen } from "@kinetiks/types";
import type { RichBlock } from "./types";
import { ActionCard } from "./ActionCard";
import { AppCard } from "./AppCard";
import { DataTable } from "./DataTable";
import { MiniChart } from "./MiniChart";
import { ProgressIndicator } from "./ProgressIndicator";
import { ExpandableSection } from "./ExpandableSection";

export interface RichResponseProps {
  blocks: RichBlock[];
  /** "Open" affordance on action cards → mount the collaborative app panel. */
  onOpenPanel?: (panel: AppPanelOpen) => void;
  /** "Activate" affordance on app cards → one-step activation (spec §A.5). */
  onActivateApp?: (appName: string) => void;
}

/**
 * Content-derived key so streaming inserts/reorders don't remount the wrong
 * block (which would lose ExpandableSection's open state). Stable across
 * position changes, unlike an array index.
 */
function blockKey(block: RichBlock): string {
  switch (block.kind) {
    case "action_card":
      return `action:${block.panel?.entity_id ?? block.title}`;
    case "app_card":
      return `app:${block.appName}`;
    case "data_table":
      return `table:${block.caption ?? block.columns.join(",")}`;
    case "mini_chart":
      return `chart:${block.chart}:${block.label ?? block.values.join(",")}`;
    case "progress_indicator":
      return `progress:${block.label}`;
    case "expandable":
      return `expand:${block.summary}`;
    default:
      return "block";
  }
}

/** Renders a list of rich blocks (spec-addendum-chat-ux §B.5). */
export function RichResponse({ blocks, onOpenPanel, onActivateApp }: RichResponseProps) {
  if (blocks.length === 0) return null;
  return (
    <>
      {blocks.map((block) => {
        const key = blockKey(block);
        switch (block.kind) {
          case "action_card":
            return (
              <ActionCard
                key={key}
                title={block.title}
                summary={block.summary}
                steps={block.steps}
                panel={block.panel}
                approvalId={block.approvalId}
                onOpen={onOpenPanel}
              />
            );
          case "app_card":
            return (
              <AppCard
                key={key}
                appName={block.appName}
                description={block.description}
                rationale={block.rationale}
                onActivate={onActivateApp}
              />
            );
          case "data_table":
            return (
              <DataTable
                key={key}
                columns={block.columns}
                rows={block.rows}
                caption={block.caption}
              />
            );
          case "mini_chart":
            return (
              <MiniChart key={key} chart={block.chart} values={block.values} label={block.label} />
            );
          case "progress_indicator":
            return (
              <ProgressIndicator
                key={key}
                label={block.label}
                progress={block.progress}
                step={block.step}
              />
            );
          case "expandable":
            return <ExpandableSection key={key} summary={block.summary} detail={block.detail} />;
          default:
            return null;
        }
      })}
    </>
  );
}
