/**
 * CPPI gate behavior (Quality Addendum #4).
 *
 * The math lives in `packages/deskof/src/types/cppi.ts` and Phase 2.5
 * already shipped the boundary fixes. This file is just the gate
 * mapping:
 *
 *   low      → no advisory surfaced (silent)
 *   moderate → info row, passing
 *   high     → warning advisory
 *   critical → blocking
 */

import type { GateCheck } from "../../types/gate";
import type { LensInput } from "../types";

export function checkCppi(input: LensInput): GateCheck | null {
  const cppi = input.cppi;
  if (!cppi) return null;

  const pct = `${Math.round(cppi.score * 100)}%`;

  if (cppi.level === "critical") {
    return {
      type: "cppi",
      passed: false,
      severity: "blocking",
      message: `Cross-platform promotional load is critical (CPPI ${pct}). Your activity across platforms is concentrated and bursty.`,
      recommendation:
        "Pause promotional replies for 48-72 hours. The score is rolling 7-day, so a short cool-off recovers it quickly.",
    };
  }
  if (cppi.level === "high") {
    return {
      type: "cppi",
      passed: false,
      severity: "warning",
      message: `Cross-platform promotional load is high (CPPI ${pct}). Healthy is below 60%.`,
      recommendation:
        "Spread promotional activity across more days and platforms before posting another product mention.",
    };
  }
  if (cppi.level === "moderate") {
    return {
      type: "cppi",
      passed: true,
      severity: "info",
      message: `Cross-platform promotional load is moderate (CPPI ${pct}).`,
      recommendation: "",
    };
  }
  // low → don't surface a row at all
  return null;
}
