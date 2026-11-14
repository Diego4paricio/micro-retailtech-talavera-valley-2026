import type { ReactNode } from "react";
import { Icon } from "../../components/Icon.js";
import { useCountUp } from "../../components/motion.js";
import { Tooltip } from "../../components/Tooltip.js";
import {
  formatDelta,
  isEmptyPeriodKpi,
} from "../analytics/charts/chart-utils.js";
import { Sparkline } from "../analytics/charts/Sparkline.js";

export function KpiCard({
  label,
  value,
  numericValue,
  format,
  trendPercent,
  trendLabel = "vs. periodo anterior",
  detail,
  help,
  sparkline,
  sparklineTone,
  accent,
}: {
  label: string;
  /** Final, formatted value (also what assistive tech reads). */
  value: string;
  /** With `format`, the figure counts up from 0 the first time it loads. */
  numericValue?: number | undefined;
  format?: ((value: number) => string) | undefined;
  /** Relative % change vs. the previous period, or null/undefined to hide the trend. */
  trendPercent?: number | null | undefined;
  trendLabel?: string | undefined;
  detail?: ReactNode | undefined;
  help?: string | undefined;
  /** Daily values for an 80 × 24 sparkline. */
  sparkline?: number[] | undefined;
  sparklineTone?: "teal" | "aqua" | "ink" | undefined;
  /** Channel accent line along the top edge. */
  accent?: "nfc" | "qr" | "link" | undefined;
}) {
  const counted = useCountUp(numericValue ?? 0);
  const display =
    numericValue !== undefined && format ? format(counted) : value;
  const hasTrend =
    typeof trendPercent === "number" && Number.isFinite(trendPercent);
  // A9-29: a zero value with nothing to compare against (no previous period
  // to divide by, so there is no trend, and no other footer text) reads as
  // an empty hole under the figure. Name it instead of leaving it blank.
  const isEmptyZero = isEmptyPeriodKpi({
    hasTrend,
    hasDetail: Boolean(detail),
    numericValue,
  });
  const direction = !hasTrend
    ? "flat"
    : Math.round((trendPercent as number) * 10) === 0
      ? "flat"
      : (trendPercent as number) > 0
        ? "up"
        : "down";

  return (
    <article
      className={
        accent
          ? `status-card kd-kpi-card status-card-${accent}`
          : "status-card kd-kpi-card"
      }
    >
      <p className="kd-kpi-label">
        {label}
        {help ? (
          <Tooltip content={help}>
            <button
              aria-label={`Qué es: ${label}`}
              className="kd-kpi-help"
              type="button"
            >
              <Icon name="info" size={13} />
            </button>
          </Tooltip>
        ) : null}
      </p>
      <div className="kd-kpi-body">
        <strong className="kd-kpi-value">
          <span aria-hidden="true">{display}</span>
          <span className="visually-hidden">{value}</span>
        </strong>
        {sparkline && sparkline.length > 1 ? (
          <Sparkline tone={sparklineTone} values={sparkline} />
        ) : null}
      </div>
      {hasTrend ? (
        <small className="kd-kpi-foot">
          <span className={`kd-delta kd-delta-${direction}`}>
            {formatDelta(trendPercent as number)}
          </span>
          <span>{trendLabel}</span>
        </small>
      ) : detail ? (
        <small className="kd-kpi-foot">{detail}</small>
      ) : isEmptyZero ? (
        <small className="kd-kpi-foot">Sin visitas todavía</small>
      ) : null}
    </article>
  );
}
