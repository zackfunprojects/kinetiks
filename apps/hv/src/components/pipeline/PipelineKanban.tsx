"use client";

import { KanbanColumn } from "./KanbanColumn";
import { DEAL_STAGES } from "@/types/pipeline";
import type { HvDeal, DealStage } from "@/types/pipeline";

interface PipelineKanbanProps {
  dealsByStage: Record<DealStage, HvDeal[]>;
  onDealClick: (dealId: string) => void;
  onStageChange: (dealId: string, newStage: DealStage) => void;
}

export function PipelineKanban({ dealsByStage, onDealClick, onStageChange }: PipelineKanbanProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        overflowX: "auto",
        paddingBottom: "8px",
      }}
    >
      {DEAL_STAGES.map((stage) => (
        <KanbanColumn
          key={stage.value}
          stage={stage.value}
          label={stage.label}
          color={stage.color}
          deals={dealsByStage[stage.value] ?? []}
          onDealClick={onDealClick}
          onDrop={onStageChange}
        />
      ))}
    </div>
  );
}
