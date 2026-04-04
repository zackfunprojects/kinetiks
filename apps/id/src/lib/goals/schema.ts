import type { CreateGoalInput, UpdateGoalInput } from "./types";

export function validateCreateGoal(input: CreateGoalInput): string | null {
  if (!input.name?.trim()) return "Name is required";
  if (!input.type || !["kpi_target", "okr"].includes(input.type)) {
    return "Type must be kpi_target or okr";
  }

  if (input.type === "kpi_target") {
    if (input.target_value === undefined || input.target_value === null) {
      return "KPI targets require a target value";
    }
    if (!input.target_period) {
      return "KPI targets require a target period";
    }
  }

  if (input.direction && !["above", "below", "exact"].includes(input.direction)) {
    return "Direction must be above, below, or exact";
  }

  if (input.target_period && !["weekly", "monthly", "quarterly", "annual"].includes(input.target_period)) {
    return "Period must be weekly, monthly, quarterly, or annual";
  }

  return null;
}

export function validateUpdateGoal(input: UpdateGoalInput): string | null {
  if (input.name !== undefined && !input.name.trim()) {
    return "Name cannot be empty";
  }

  if (input.status && !["active", "paused", "completed", "archived"].includes(input.status)) {
    return "Invalid status";
  }

  if (input.direction && !["above", "below", "exact"].includes(input.direction)) {
    return "Invalid direction";
  }

  return null;
}
