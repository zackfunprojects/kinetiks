export type GoalType = "kpi_target" | "okr";
export type GoalStatus = "active" | "paused" | "completed" | "archived";
export type GoalProgressStatus = "on_track" | "behind" | "ahead" | "at_risk" | "critical";
export type GoalPeriod = "weekly" | "monthly" | "quarterly" | "annual";
export type GoalDirection = "above" | "below" | "exact";

export interface Goal {
  id: string;
  account_id: string;
  name: string;
  type: GoalType;
  metric_key: string | null;
  target_value: number | null;
  target_period: GoalPeriod | null;
  direction: GoalDirection | null;
  current_value: number;
  contributing_apps: string[];
  status: GoalStatus;
  progress_status: GoalProgressStatus;
  parent_goal_id: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoalSnapshot {
  id: string;
  goal_id: string;
  account_id: string;
  value: number;
  snapshot_at: string;
}

export interface CreateGoalInput {
  name: string;
  type: GoalType;
  metric_key?: string;
  target_value?: number;
  target_period?: GoalPeriod;
  direction?: GoalDirection;
  contributing_apps?: string[];
  parent_goal_id?: string;
  period_start?: string;
  period_end?: string;
}

export interface UpdateGoalInput {
  name?: string;
  target_value?: number;
  target_period?: GoalPeriod;
  direction?: GoalDirection;
  status?: GoalStatus;
  contributing_apps?: string[];
  period_start?: string;
  period_end?: string;
}

export interface Budget {
  id: string;
  account_id: string;
  total_budget: number;
  currency: string;
  period: string | null;
  period_start: string;
  period_end: string;
  approval_status: string;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetAllocation {
  id: string;
  budget_id: string;
  category: string;
  app: string | null;
  allocated_amount: number;
  spent_amount: number;
  created_at: string;
}

export interface SystemIdentity {
  id: string;
  account_id: string;
  email_provider: string | null;
  email_address: string | null;
  slack_workspace_id: string | null;
  slack_bot_user_id: string | null;
  slack_channels: string[];
  calendar_connected: boolean;
  created_at: string;
  updated_at: string;
}
