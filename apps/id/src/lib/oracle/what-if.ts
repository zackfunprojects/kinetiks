/**
 * What-if scenario modeling engine.
 * Models the impact of variable changes on goal projections.
 */

export interface ScenarioInput {
  variable: string; // metric key
  change_type: "multiply" | "add" | "set";
  change_value: number;
}

export interface ScenarioResult {
  variable: string;
  original_projection: number;
  modified_projection: number;
  impact_percentage: number;
  affected_goals: string[];
  confidence: number;
}

/**
 * Model the impact of changing a variable on projections.
 */
export function modelScenario(
  input: ScenarioInput,
  currentValue: number,
  historicalValues: number[],
  goalTargets: { goal_id: string; target_value: number; current_value: number }[]
): ScenarioResult {
  // Calculate original projection using simple linear forecast
  const originalProjection = forecastValue(historicalValues, 30);

  // Apply the change
  let modifiedCurrent: number;
  switch (input.change_type) {
    case "multiply":
      modifiedCurrent = currentValue * input.change_value;
      break;
    case "add":
      modifiedCurrent = currentValue + input.change_value;
      break;
    case "set":
      modifiedCurrent = input.change_value;
      break;
  }

  // Scale projection proportionally
  // When currentValue is 0, use additive offset instead of multiplicative scaling
  let modifiedProjection: number;
  if (currentValue > 0) {
    const scaleFactor = modifiedCurrent / currentValue;
    modifiedProjection = originalProjection * scaleFactor;
  } else {
    const delta = modifiedCurrent - currentValue;
    modifiedProjection = originalProjection + delta;
  }

  const impactPercentage =
    originalProjection > 0
      ? ((modifiedProjection - originalProjection) / originalProjection) * 100
      : 0;

  // Find affected goals - any goal where the scenario changes distance to target
  const ratio = currentValue > 0 ? modifiedCurrent / currentValue : 1;
  const delta = modifiedCurrent - currentValue;
  const affectedGoals = goalTargets
    .filter((g) => {
      const originalDistance = Math.abs(g.target_value - g.current_value);
      const modifiedValue = currentValue > 0
        ? g.current_value * ratio
        : g.current_value + delta;
      const modifiedDistance = Math.abs(g.target_value - modifiedValue);
      return Math.abs(modifiedDistance - originalDistance) > 0.01;
    })
    .map((g) => g.goal_id);

  return {
    variable: input.variable,
    original_projection: Math.round(originalProjection * 100) / 100,
    modified_projection: Math.round(modifiedProjection * 100) / 100,
    impact_percentage: Math.round(impactPercentage * 100) / 100,
    affected_goals: affectedGoals,
    confidence: historicalValues.length >= 14 ? 75 : historicalValues.length >= 7 ? 50 : 25,
  };
}

function forecastValue(values: number[], daysAhead: number): number {
  if (values.length < 2) return values[values.length - 1] ?? 0;

  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return intercept + slope * (n - 1 + daysAhead);
}
