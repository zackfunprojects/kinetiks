/**
 * Pure SVG chart geometry. No React, no DOM, no dependencies.
 *
 * These helpers turn a series of numbers into the coordinate strings the
 * `@kinetiks/ui` chart primitives (Sparkline, TrendChart, MiniBars) render.
 * Keeping the math here (a) makes it unit-testable without a DOM and
 * (b) guarantees every chart shares one scaling implementation.
 */

export interface ChartPoint {
  x: number;
  y: number;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Map `value` within `[min,max]` to a y-coordinate in an SVG of `height`,
 * inverted so larger values sit higher (smaller y). `pad` reserves vertical
 * space so strokes and end-dots are not clipped. A flat series (min === max)
 * is centered.
 */
export function scaleY(value: number, min: number, max: number, height: number, pad = 0): number {
  const usable = Math.max(0, height - pad * 2);
  if (max === min) return pad + usable / 2;
  const t = (value - min) / (max - min);
  return pad + (1 - t) * usable;
}

/** Evenly distribute `count` points across `width`. A single point sits at the left pad. */
export function scaleX(index: number, count: number, width: number, pad = 0): number {
  if (count <= 1) return pad;
  const usable = Math.max(0, width - pad * 2);
  return pad + (index / (count - 1)) * usable;
}

/** Project a numeric series onto SVG coordinates. */
export function toPoints(values: number[], width: number, height: number, pad = 0): ChartPoint[] {
  const n = values.length;
  if (n === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map((v, i) => ({
    x: round(scaleX(i, n, width, pad)),
    y: round(scaleY(v, min, max, height, pad)),
  }));
}

/** `points` attribute string for an SVG `<polyline>` (Sparkline). */
export function sparklinePoints(values: number[], width: number, height: number, pad = 1): string {
  return toPoints(values, width, height, pad)
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
}

/**
 * Line + filled-area path `d` strings for a trend chart. A single value renders
 * as a flat line across the full width so the chart never collapses to a dot.
 */
export function trendPaths(
  values: number[],
  width: number,
  height: number,
  pad = 2,
): { line: string; area: string } {
  const pts = toPoints(values, width, height, pad);
  if (pts.length === 0) return { line: "", area: "" };
  const baseline = round(height - pad);
  if (pts.length === 1) {
    const y = pts[0].y;
    const line = `M ${round(pad)} ${y} L ${round(width - pad)} ${y}`;
    const area = `${line} L ${round(width - pad)} ${baseline} L ${round(pad)} ${baseline} Z`;
    return { line, area };
  }
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const first = pts[0];
  const last = pts[pts.length - 1];
  const area = `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
  return { line, area };
}

export interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bar rectangles for a MiniBars chart, scaled to the largest value (or 0-floor). */
export function barRects(values: number[], width: number, height: number, gap = 2, pad = 1): BarRect[] {
  const n = values.length;
  if (n === 0) return [];
  const max = Math.max(...values, 0);
  const usableW = Math.max(0, width - pad * 2);
  const usableH = Math.max(0, height - pad * 2);
  const barW = n > 0 ? Math.max(0, (usableW - gap * (n - 1)) / n) : 0;
  return values.map((v, i) => {
    const h = max === 0 ? 0 : (Math.max(0, v) / max) * usableH;
    return {
      x: round(pad + i * (barW + gap)),
      y: round(pad + (usableH - h)),
      width: round(barW),
      height: round(h),
    };
  });
}

/** Clamp a 0..1 fraction to a 0..100 percentage for CSS widths/offsets. */
export function fractionToPercent(fraction: number): number {
  // NaN slips through Math.min/Math.max and would surface as width:"NaN%"
  // and aria-valuenow="NaN" in ProgressBar; treat it as 0.
  if (Number.isNaN(fraction)) return 0;
  return round(Math.min(100, Math.max(0, fraction * 100)));
}
