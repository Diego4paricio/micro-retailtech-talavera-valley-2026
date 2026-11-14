/** Shared helpers for Kardo's hand-built SVG charts (no chart library). */

const locale = "es-MX";

export function shortDate(value: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function longDate(value: string | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function weekdayDate(value: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

/** A "nice" axis maximum and evenly spaced integer ticks (0 … max). */
export function niceTicks(
  maxValue: number,
  count = 4,
): { max: number; ticks: number[] } {
  if (maxValue <= 0) return { max: count, ticks: [0, 1, 2, 3, 4] };
  const rough = maxValue / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step =
    Math.max(
      1,
      (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude,
    ) || 1;
  const max = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 2; value += step)
    ticks.push(Math.round(value));
  return { max, ticks };
}

export type Point = { x: number; y: number };

/**
 * A smooth path through points using monotone cubic interpolation (Fritsch–
 * Carlson): curves never overshoot, so a zero day never dips below zero.
 */
export function monotonePath(points: Point[]): string {
  const n = points.length;
  const first = points[0];
  if (!first) return "";
  if (n === 1) return `M${first.x},${first.y}`;
  const dx: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    const h = b.x - a.x || 1;
    dx.push(h);
    slopes.push((b.y - a.y) / h);
  }
  const tangents: number[] = [slopes[0] ?? 0];
  for (let i = 1; i < n - 1; i++) {
    const s0 = slopes[i - 1] ?? 0;
    const s1 = slopes[i] ?? 0;
    if (s0 * s1 <= 0) tangents.push(0);
    else {
      const h0 = dx[i - 1] ?? 1;
      const h1 = dx[i] ?? 1;
      const w1 = 2 * h1 + h0;
      const w2 = h1 + 2 * h0;
      tangents.push((w1 + w2) / (w1 / s0 + w2 / s1));
    }
  }
  tangents.push(slopes[n - 2] ?? 0);

  let d = `M${first.x.toFixed(2)},${first.y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const a = points[i] as Point;
    const b = points[i + 1] as Point;
    const h = dx[i] ?? 1;
    const t0 = tangents[i] ?? 0;
    const t1 = tangents[i + 1] ?? 0;
    d += ` C${(a.x + h / 3).toFixed(2)},${(a.y + (t0 * h) / 3).toFixed(2)} ${(b.x - h / 3).toFixed(2)},${(b.y - (t1 * h) / 3).toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
  }
  return d;
}

/** Relative % change; null when there is no baseline to compare against. */
export function percentChange(
  current: number,
  previous: number | null | undefined,
): number | null {
  if (previous === null || previous === undefined || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function formatDelta(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  const abs = new Intl.NumberFormat(locale, {
    maximumFractionDigits: Math.abs(rounded) < 10 ? 1 : 0,
  }).format(Math.abs(rounded));
  if (rounded === 0) return "0 %";
  return `${rounded > 0 ? "▲" : "▼"} ${abs} %`;
}

/**
 * A9-29: a KPI card at zero with nothing else to show below it (no trend —
 * no previous period to compare against — and no other detail text) reads
 * as an empty hole. `KpiCard` names it instead («Sin visitas todavía»).
 */
export function isEmptyPeriodKpi(input: {
  hasTrend: boolean;
  hasDetail: boolean;
  numericValue: number | undefined;
}): boolean {
  return !input.hasTrend && !input.hasDetail && input.numericValue === 0;
}
