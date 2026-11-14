import type { AnalyticsSummary } from "@kardo/contracts";
import { useId, useRef } from "react";
import { SectionHeading } from "../../../components/PageHeader.js";
import { formatNumber } from "../../../lib/format.js";
import { ChartTooltip, TooltipRow } from "./ChartTooltip.js";
import { niceTicks } from "./chart-utils.js";
import { useChartCursor } from "./use-chart-cursor.js";
import { useMeasuredWidth } from "./use-measured-width.js";

type HourlyPoint = AnalyticsSummary["hourly"][number];

const svgHeight = 168;
const margin = { top: 10, right: 8, bottom: 24, left: 34 };

function hourLabel(value: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** Last 24 hours, one column per hour. */
export function HourlyChart({
  hourly,
  isUpdating,
}: {
  hourly: HourlyPoint[];
  isUpdating?: boolean | undefined;
}) {
  const chartId = useId();
  const headingId = `${chartId}-hourly-heading`;
  const svgRef = useRef<SVGSVGElement>(null);
  const [frameRef, measured] = useMeasuredWidth(480);
  const svgWidth = Math.max(280, measured);
  const { max, ticks } = niceTicks(
    Math.max(0, ...hourly.map((point) => point.taps)),
    3,
  );
  const plotHeight = svgHeight - margin.top - margin.bottom;
  const plotWidth = svgWidth - margin.left - margin.right;
  const baseY = margin.top + plotHeight;
  const slot = hourly.length ? plotWidth / hourly.length : 0;
  const barWidth = Math.max(2, Math.min(slot * 0.6, 18));
  const labelEvery = Math.max(1, Math.ceil(hourly.length / 8));
  const scale = (value: number) => (value / max) * plotHeight;
  const total = hourly.reduce((sum, point) => sum + point.taps, 0);
  const peak = hourly.reduce<HourlyPoint | undefined>(
    (best, point) => (!best || point.taps > best.taps ? point : best),
    undefined,
  );

  const cursor = useChartCursor({
    count: hourly.length,
    svgRef,
    svgWidth,
    indexAt: (x) => Math.floor((x - margin.left) / (slot || 1)),
  });
  const active = cursor.active !== null ? hourly[cursor.active] : undefined;

  return (
    <section aria-labelledby={headingId} className="panel chart-panel">
      <SectionHeading
        description={
          peak && peak.taps > 0
            ? `${formatNumber(total)} accesos · hora más activa: ${hourLabel(peak.hour)}`
            : "Sin accesos en las últimas 24 horas."
        }
        id={headingId}
        title="Últimas 24 horas"
      />
      <figure
        aria-busy={isUpdating || undefined}
        aria-describedby={`${chartId}-keys`}
        aria-label="Accesos por hora. Explora las horas con las flechas izquierda y derecha."
        className="chart-plot"
        ref={frameRef}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: one tab stop to explore the chart with the arrow keys
        tabIndex={0}
        {...cursor.frameHandlers}
      >
        <svg
          aria-label={`Accesos por hora en las últimas 24 horas: ${formatNumber(total)} en total.`}
          className="chart-svg"
          data-active={cursor.active !== null || undefined}
          height={svgHeight}
          ref={svgRef}
          role="img"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width={svgWidth}
          {...cursor.svgHandlers}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="chart-grid"
                x1={margin.left}
                x2={svgWidth - margin.right}
                y1={baseY - scale(tick)}
                y2={baseY - scale(tick)}
              />
              <text
                className="chart-axis-label"
                textAnchor="end"
                x={margin.left - 8}
                y={baseY - scale(tick) + 3.5}
              >
                {formatNumber(tick)}
              </text>
            </g>
          ))}
          {cursor.active !== null ? (
            <rect
              className="chart-column-highlight"
              height={plotHeight}
              rx={5}
              width={slot}
              x={margin.left + cursor.active * slot}
              y={margin.top}
            />
          ) : null}
          {hourly.map((point, index) => {
            const height = scale(point.taps);
            const x = margin.left + index * slot + (slot - barWidth) / 2;
            return (
              <g
                className={
                  cursor.active === index
                    ? "chart-column chart-column-active"
                    : "chart-column"
                }
                key={point.hour}
              >
                {height > 0 ? (
                  <rect
                    className="chart-column-bars"
                    fill="var(--teal)"
                    height={height}
                    rx={Math.min(3, barWidth / 2)}
                    style={{
                      animationDelay: `${Math.min(index * 12, 280)}ms`,
                    }}
                    width={barWidth}
                    x={x}
                    y={baseY - height}
                  />
                ) : null}
                {index % labelEvery === 0 ? (
                  <text
                    className="chart-axis-label"
                    textAnchor="middle"
                    x={margin.left + index * slot + slot / 2}
                    y={svgHeight - 6}
                  >
                    {hourLabel(point.hour)}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line
            className="chart-baseline"
            x1={margin.left}
            x2={svgWidth - margin.right}
            y1={baseY}
            y2={baseY}
          />
        </svg>
        {active && cursor.active !== null ? (
          <ChartTooltip
            width={svgWidth}
            x={margin.left + cursor.active * slot + slot / 2}
            y={baseY - scale(active.taps)}
          >
            <span className="chart-tooltip-title">
              {hourLabel(active.hour)}
            </span>
            <TooltipRow
              label="accesos"
              swatch="nfc"
              value={formatNumber(active.taps)}
            />
          </ChartTooltip>
        ) : null}
      </figure>
      <p aria-live="polite" className="chart-hint" id={`${chartId}-keys`}>
        {active
          ? `${hourLabel(active.hour)}: ${formatNumber(active.taps)} accesos.`
          : "Pasa el cursor o usa las flechas sobre la gráfica para ver cada hora."}
      </p>
      <table className="visually-hidden">
        <caption>Accesos por hora en las últimas 24 horas</caption>
        <thead>
          <tr>
            <th scope="col">Hora</th>
            <th scope="col">Accesos</th>
          </tr>
        </thead>
        <tbody>
          {hourly.map((point) => (
            <tr key={point.hour}>
              <td>{hourLabel(point.hour)}</td>
              <td>{formatNumber(point.taps)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
