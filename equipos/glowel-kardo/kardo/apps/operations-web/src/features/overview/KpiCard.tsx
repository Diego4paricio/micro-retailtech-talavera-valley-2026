import type { ReactNode } from "react";
import { Icon } from "../../components/Icon.js";
import { Tooltip } from "../../components/Tooltip.js";
import { formatDelta } from "../../lib/format.js";

export function KpiCard({
  label,
  value,
  trendPercent,
  trendLabel = "vs. periodo anterior",
  detail,
  help,
}: {
  label: string;
  value: string;
  /** Relative % change vs. the previous period, or null/undefined to hide the trend. */
  trendPercent?: number | null;
  trendLabel?: string;
  detail?: ReactNode;
  help?: string;
}) {
  const delta = formatDelta(trendPercent ?? null);
  const isDown = delta?.startsWith("-") ?? false;

  return (
    <article className="status-card kd-kpi-card">
      <p>
        {label}
        {help ? (
          <Tooltip content={help}>
            <button
              aria-label={`Ayuda sobre ${label}`}
              className="kd-kpi-help"
              type="button"
            >
              <Icon name="info" size={13} />
            </button>
          </Tooltip>
        ) : null}
      </p>
      <strong>{value}</strong>
      {delta !== null ? (
        <small
          className={isDown ? "kd-trend kd-trend-down" : "kd-trend kd-trend-up"}
        >
          <Icon name={isDown ? "trend-down" : "trend-up"} size={13} />
          {delta}% {trendLabel}
        </small>
      ) : detail ? (
        <small>{detail}</small>
      ) : null}
    </article>
  );
}
