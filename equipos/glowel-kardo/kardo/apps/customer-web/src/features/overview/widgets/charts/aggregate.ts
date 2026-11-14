import type { ChannelCounts } from "@kardo/contracts";

/** Pure, widget-local aggregation and formatting helpers — no React, no DOM.
 * Kept separate from the components so the logic is trivial to unit test
 * (see `test/overview-widgets.test.ts`). */

export const channelOrder: readonly (keyof ChannelCounts)[] = [
  "nfc",
  "qr",
  "link",
];

export const channelLabels: Record<keyof ChannelCounts, string> = {
  nfc: "NFC",
  qr: "QR",
  link: "URL directa",
};

/** CSS custom properties, not literal colors: never invent hex here. */
export const channelColorVar: Record<keyof ChannelCounts, string> = {
  nfc: "var(--teal)",
  qr: "var(--aqua)",
  link: "var(--ink)",
};

export function channelTotal(channels: ChannelCounts): number {
  return channels.nfc + channels.qr + channels.link;
}

/**
 * `channelOrder` capped to `limit` entries for a clipped legend: the
 * smallest channels drop first, but the ones kept stay in their usual
 * NFC/QR/URL order (never reshuffled by size).
 */
export function topChannels(
  channels: ChannelCounts,
  limit: number,
): readonly (keyof ChannelCounts)[] {
  if (limit >= channelOrder.length) return channelOrder;
  const bySize = [...channelOrder].sort((a, b) => channels[b] - channels[a]);
  const keep = new Set(bySize.slice(0, Math.max(0, limit)));
  return channelOrder.filter((key) => keep.has(key));
}

/** `part / whole`, 0 when there is nothing to divide. */
export function rate(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

/**
 * A9-23: the per-Touchpoint list is capped and ordered by taps — a
 * workspace over that cap has its tail cut off. `SilentWidget` would guess
 * wrong by treating a Touchpoint that never made the list as "sin
 * accesos", UNLESS even the least-tapped row that did make it already had
 * taps: then everything past it (sorted lower) is guaranteed to be zero.
 * This is true only when there was a cut (`touchpointsOmitted`) and the
 * lowest tap count shown is itself above zero.
 */
export function hasUnknownSilentTail(
  touchpointsOmitted: number | undefined,
  shownTaps: readonly number[],
): boolean {
  if (!touchpointsOmitted) return false;
  const lowestShown = shownTaps.length ? Math.min(...shownTaps) : 0;
  return lowestShown > 0;
}

export const weekdayShortLabels = [
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
  "Dom",
];
export const weekdayNames = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
];
/** One letter per weekday, for the heatmap's cramped preview column. */
export const weekdayInitials = ["L", "M", "X", "J", "V", "S", "D"];

/** `weekdayHour` (7 × 24, Monday first) summed into 24 hour-of-day totals. */
export function sumHourOfDay(
  weekdayHour: readonly (readonly number[])[] | undefined,
): number[] {
  const hours = Array<number>(24).fill(0);
  for (const row of weekdayHour ?? []) {
    row.forEach((value, hour) => {
      hours[hour] = (hours[hour] ?? 0) + value;
    });
  }
  return hours;
}

/** `weekdayHour` summed into 7 weekday totals (Monday first). */
export function sumWeekday(
  weekdayHour: readonly (readonly number[])[] | undefined,
): number[] {
  return (weekdayHour ?? []).map((row) =>
    row.reduce((sum, value) => sum + value, 0),
  );
}

/** The single busiest weekday × hour cell, for a heatmap's caption. */
export function busiestCell(
  weekdayHour: readonly (readonly number[])[] | undefined,
): { day: number; hour: number; value: number } | null {
  let best: { day: number; hour: number; value: number } | null = null;
  (weekdayHour ?? []).forEach((row, day) => {
    row.forEach((value, hour) => {
      if (value > (best?.value ?? 0)) best = { day, hour, value };
    });
  });
  return best;
}

export type RankMetric = "taps" | "clicks" | "leads" | "conversion";
export type RankSortable = { taps: number; clicks: number; leads: number };

export function rankMetricValue<T extends RankSortable>(
  row: T,
  metric: RankMetric,
): number {
  if (metric === "conversion") return rate(row.leads, row.taps);
  return row[metric];
}

/** Rows with at least one event, sorted by `metric` and cut to `limit`. */
export function rankRows<T extends RankSortable>(
  rows: readonly T[],
  metric: RankMetric,
  limit: number,
): T[] {
  return [...rows]
    .filter((row) => row.taps > 0 || row.clicks > 0 || row.leads > 0)
    .sort((a, b) => rankMetricValue(b, metric) - rankMetricValue(a, metric))
    .slice(0, Math.max(0, limit));
}

export type FunnelStepKey = "taps" | "clicks" | "leads";

export type FunnelStep = {
  key: FunnelStepKey;
  value: number;
  /** Share of the first step (accesses): the bar's width. */
  shareOfFirst: number;
  /** Share of the previous step; `null` for the first step. */
  shareOfPrevious: number | null;
};

/** Accesses → clicks → leads, each step's share of the first and previous
 * one. Shares are capped at 100 %: a bar never draws wider than its parent
 * even if the raw counts are noisy (e.g. a click logged without its access),
 * but the counts themselves are shown exactly as given. */
export function funnelSteps(totals: {
  taps: number;
  clicks: number;
  leads: number;
}): FunnelStep[] {
  const values: [FunnelStepKey, number][] = [
    ["taps", totals.taps],
    ["clicks", totals.clicks],
    ["leads", totals.leads],
  ];
  const first = values[0]?.[1] ?? 0;
  return values.map(([key, value], index) => {
    const previous = index > 0 ? (values[index - 1]?.[1] ?? 0) : null;
    return {
      key,
      value,
      shareOfFirst: first > 0 ? Math.min(1, value / first) : 0,
      shareOfPrevious:
        previous === null
          ? null
          : previous > 0
            ? Math.min(1, value / previous)
            : 0,
    };
  });
}
