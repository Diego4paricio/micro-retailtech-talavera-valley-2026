import type { AnalyticsSummary } from "@kardo/contracts";
import { formatNumber } from "../../../../lib/format.js";
import {
  percentChange,
  shortDate,
} from "../../../analytics/charts/chart-utils.js";
import type { KpiMetric } from "../../dashboard/catalog.js";
import { channelLabels, rate } from "./aggregate.js";

/** Pure mapping from a `kpiMetrics` value to what the KPI card shows. Kept
 * free of React so the formatting rules are unit-testable on their own. */

const rateFormat = new Intl.NumberFormat("es-MX", {
  style: "percent",
  maximumFractionDigits: 1,
});
/** Shares read best whole: "18 % de los accesos". */
const shareFormat = new Intl.NumberFormat("es-MX", {
  style: "percent",
  maximumFractionDigits: 0,
});
const averageFormat = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 1,
});

/** KPIs whose value comes from taps or clicks: unknown while Analytics
 * Engine does not answer. `leads` and `activeTouchpoints` do not depend on
 * it (leads are Postgres-backed; active/total touchpoints are a headcount). */
export const accessDependentKpis = new Set<KpiMetric>([
  "taps",
  "clicks",
  "conversionRate",
  "interactionRate",
  "dailyAverage",
  "reachedTouchpoints",
  "peakHour",
  "topChannel",
  "peakDay",
]);

export type KpiView = {
  value: string;
  /** With `format`, the KPI card counts up from 0 the first time it renders. */
  numericValue?: number | undefined;
  format?: ((value: number) => string) | undefined;
  trendPercent?: number | null | undefined;
  detail?: string | undefined;
  /** Daily series for the sparkline; omitted when there is nothing to draw. */
  sparkline?: number[] | undefined;
};

/** `null` when the server has not computed `kpis` for this summary yet
 * (older cached responses, or a demo payload that predates the field). */
export function buildKpiView(
  metric: KpiMetric,
  data: AnalyticsSummary,
  sparklineOn: boolean,
): KpiView | null {
  const kpis = data.kpis;
  if (!kpis) return null;
  const daily = data.daily;
  const series = (pick: (day: AnalyticsSummary["daily"][number]) => number) =>
    sparklineOn && daily.length > 1 ? daily.map(pick) : undefined;

  switch (metric) {
    case "taps":
      return {
        value: formatNumber(Math.round(kpis.taps.value)),
        numericValue: kpis.taps.value,
        format: (value) => formatNumber(Math.round(value)),
        trendPercent: percentChange(kpis.taps.value, kpis.taps.previous),
        sparkline: series((day) => day.taps),
      };
    case "clicks":
      return {
        value: formatNumber(Math.round(kpis.clicks.value)),
        numericValue: kpis.clicks.value,
        format: (value) => formatNumber(Math.round(value)),
        trendPercent: percentChange(kpis.clicks.value, kpis.clicks.previous),
        sparkline: series((day) => day.clicks),
      };
    case "leads":
      return {
        value: formatNumber(Math.round(kpis.leads.value)),
        numericValue: kpis.leads.value,
        format: (value) => formatNumber(Math.round(value)),
        trendPercent: percentChange(kpis.leads.value, kpis.leads.previous),
        sparkline: series((day) => day.leads ?? 0),
      };
    case "conversionRate":
      return {
        value: rateFormat.format(kpis.conversionRate.value),
        numericValue: kpis.conversionRate.value,
        format: (value) => rateFormat.format(value),
        trendPercent: percentChange(
          kpis.conversionRate.value,
          kpis.conversionRate.previous,
        ),
        sparkline: series((day) => rate(day.leads ?? 0, day.taps)),
      };
    case "interactionRate":
      return {
        value: rateFormat.format(kpis.interactionRate.value),
        numericValue: kpis.interactionRate.value,
        format: (value) => rateFormat.format(value),
        trendPercent: percentChange(
          kpis.interactionRate.value,
          kpis.interactionRate.previous,
        ),
        sparkline: series((day) => rate(day.clicks, day.taps)),
      };
    case "dailyAverage":
      return {
        value: averageFormat.format(kpis.dailyAverage.value),
        numericValue: kpis.dailyAverage.value,
        format: (value) => averageFormat.format(value),
        trendPercent: percentChange(
          kpis.dailyAverage.value,
          kpis.dailyAverage.previous,
        ),
      };
    case "activeTouchpoints":
      return {
        value: `${formatNumber(kpis.touchpoints.active)} / ${formatNumber(kpis.touchpoints.total)}`,
        trendPercent: null,
        detail: "Activos de los que tienes registrados.",
      };
    case "reachedTouchpoints":
      return {
        value: formatNumber(Math.round(kpis.reachedTouchpoints.value)),
        numericValue: kpis.reachedTouchpoints.value,
        format: (value) => formatNumber(Math.round(value)),
        trendPercent: percentChange(
          kpis.reachedTouchpoints.value,
          kpis.reachedTouchpoints.previous,
        ),
      };
    case "peakHour":
      if (kpis.peakHour.hour === null)
        return { value: "—", trendPercent: null, detail: "Sin accesos aún" };
      return {
        value: `${String(kpis.peakHour.hour).padStart(2, "0")}:00`,
        trendPercent: null,
        detail: `${shareFormat.format(kpis.peakHour.share)} de los accesos`,
      };
    case "topChannel":
      if (kpis.topChannel.channel === null)
        return { value: "—", trendPercent: null, detail: "Sin accesos aún" };
      return {
        value: channelLabels[kpis.topChannel.channel],
        trendPercent: null,
        detail: `${shareFormat.format(kpis.topChannel.share)} de los accesos`,
      };
    case "peakDay":
      if (kpis.peakDay.date === null)
        return { value: "—", trendPercent: null, detail: "Sin accesos aún" };
      return {
        value: shortDate(kpis.peakDay.date),
        trendPercent: null,
        detail: `${formatNumber(kpis.peakDay.taps)} accesos ese día`,
      };
    default:
      return null;
  }
}
