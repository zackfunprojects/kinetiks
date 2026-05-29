import type { GoalProgress } from "./goal-tracker";

/**
 * Goal progress enriched for display: adds the human name, the bound metric,
 * its unit (for value formatting), and the recent snapshot series (for the
 * sparkline). The `/api/oracle/goals` route assembles this from the Goal row +
 * snapshots; the Analytics and Cortex goal surfaces both consume it.
 */
export interface GoalProgressView extends GoalProgress {
  name: string;
  metric_key: string | null;
  unit: string;
  recent_values: number[];
}
