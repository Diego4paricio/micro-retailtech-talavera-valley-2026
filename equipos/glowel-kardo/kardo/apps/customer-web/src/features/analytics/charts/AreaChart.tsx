import { type ReactNode, useId, useRef, useState } from "react";
import { SectionHeading } from "../../../components/PageHeader.js";
import { formatNumber } from "../../../lib/format.js";
import { ChartTooltip, TooltipRow } from "./ChartTooltip.js";
import {
  formatDelta,
  longDate,
  monotonePath,
  niceTicks,
  percentChange,
  shortDate,
  weekdayDate,
} from "./chart-utils.js";
import { useChartCursor } from "./use-chart-cursor.js";
import { useMeasuredWidth } from "./use-measured-width.js";

export type AreaPoint = { date: string; value: number };

const baseHeight = 248;
const baseMargin = { top: 14, right: 14, bottom: 28, left: 42 };

/**
 * Trend over time (research §5): a 2 px line over a gradient wash, the
 * previous period as a neutral dashed reference, a crosshair tooltip, and a
 * table for anyone who prefers — or needs — the numbers.
 */
export function AreaChart({
  title,
  description,
  points,
  unit,
  previousAverage,
  emptyState,
  isUpdating,
  xAxisTitle,
  yAxisTitle,
}: {
  title: string;
  description?: ReactNode | undefined;
  points: AreaPoint[];
  /** Plural unit for values, e.g. "accesos". */
  unit: string;
  /** Daily average of the previous period, drawn as a dashed reference. */
  previousAverage?: number | null | undefined;
  /** Rendered instead of the plot when every value is zero. */
  emptyState?: ReactNode | undefined;
  /** Dims the chart while fresher data loads (the frame stays put). */
  isUpdating?: boolean | undefined;
  /** What each axis measures, written along it (owner, 2026-09-28: charts
   * carry axis legends). Optional: without them nothing moves. */
  xAxisTitle?: string | undefined;
  yAxisTitle?: string | undefined;
}) {
  const margin = {
    ...baseMargin,
    left: baseMargin.left + (yAxisTitle ? 18 : 0),
    bottom: baseMargin.bottom + (xAxisTitle ? 20 : 0),
  };
  const height = baseHeight + (xAxisTitle ? 20 : 0);
  const id = useId();
  const headingId = `${id}-heading`;
  const [showTable, setShowTable] = useState(false);
  const [frameRef, measured] = useMeasuredWidth(720);
  const svgRef = useRef<SVGSVGElement>(null);
  const width = Math.max(280, measured);

  const total = points.reduce((sum, point) => sum + point.value, 0);
  const hasPrevious =
    typeof previousAverage === "number" && Number.isFinite(previousAverage);
  const maxValue = Math.max(
    ...points.map((point) => point.value),
    hasPrevious ? (previousAverage as number) : 0,
  );
  const { max, ticks } = niceTicks(maxValue);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const baseY = margin.top + plotHeight;
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const xAt = (index: number) =>
    points.length > 1
      ? margin.left + index * step
      : margin.left + plotWidth / 2;
  const yAt = (value: number) => baseY - (value / max) * plotHeight;

  const coords = points.map((point, index) => ({
    x: xAt(index),
    y: yAt(point.value),
  }));
  const line = monotonePath(coords);
  const firstX = coords[0]?.x ?? margin.left;
  const lastX = coords[coords.length - 1]?.x ?? margin.left;
  const area = line ? `${line} L${lastX},${baseY} L${firstX},${baseY} Z` : "";
  // About one date every 70 px, never more than 7: fewer when the chart
  // shrinks, so the dates never run into each other.
  const labelEvery = Math.max(
    1,
    Math.ceil(
      points.length / Math.min(7, Math.max(2, Math.floor(plotWidth / 70))),
    ),
  );
  const lastIndex = points.length - 1;

  const cursor = useChartCursor({
    count: points.length,
    svgRef,
    svgWidth: width,
    indexAt: (x) => (step ? Math.round((x - margin.left) / step) : 0),
  });
  const active = cursor.active !== null ? points[cursor.active] : undefined;
  const activeCoord =
    cursor.active !== null ? coords[cursor.active] : undefined;
  const activeDelta =
    active && hasPrevious
      ? percentChange(active.value, previousAverage as number)
      : null;

  const peak = points.reduce<AreaPoint | undefined>(
    (best, point) => (!best || point.value > best.value ? point : best),
    undefined,
  );
  const summary = points.length
    ? `${formatNumber(total)} ${unit} del ${longDate(points[0]?.date)} al ${longDate(points[points.length - 1]?.date)}.${peak && peak.value > 0 ? ` Día con más ${unit}: ${longDate(peak.date)}, con ${formatNumber(peak.value)}.` : ""}${hasPrevious ? ` Promedio diario del periodo anterior: ${formatNumber(Math.round(previousAverage as number))}.` : ""}`
    : `Sin datos para este periodo.`;
  const isEmpty = total === 0 && Boolean(emptyState);

  const table = (
    <table className="data-table">
      <caption className="visually-hidden">
        {title}: {unit} por día
      </caption>
      <thead>
        <tr>
          <th scope="col">Fecha</th>
          <th className="numeric" scope="col">
            {unit.charAt(0).toUpperCase() + unit.slice(1)}
          </th>
          {hasPrevious ? (
            <th className="numeric" scope="col">
              vs. promedio anterior
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {points.map((point) => {
          const delta = hasPrevious
            ? percentChange(point.value, previousAverage as number)
            : null;
          return (
            <tr key={point.date}>
              <td>{longDate(point.date)}</td>
              <td className="numeric">{formatNumber(point.value)}</td>
              {hasPrevious ? (
                <td className="numeric">
                  {delta === null ? "—" : formatDelta(delta)}
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <section aria-labelledby={headingId} className="panel chart-panel">
      <SectionHeading
        actions={
          isEmpty ? null : (
            <button
              aria-pressed={showTable}
              className="button button-ghost button-small"
              onClick={() => setShowTable((current) => !current)}
              type="button"
            >
              {showTable ? "Ver gráfica" : "Ver como tabla"}
            </button>
          )
        }
        description={description}
        id={headingId}
        title={title}
      />

      {isEmpty ? (
        emptyState
      ) : showTable ? (
        <div className="table-wrap enter-fade">{table}</div>
      ) : (
        <>
          {hasPrevious ? (
            <ul className="chart-legend">
              <li>
                <span aria-hidden="true" className="chart-key chart-key-line" />
                Este periodo
              </li>
              <li>
                <span
                  aria-hidden="true"
                  className="chart-key chart-key-dashed"
                />
                Promedio diario del periodo anterior
              </li>
            </ul>
          ) : null}
          <figure
            aria-busy={isUpdating || undefined}
            aria-describedby={`${id}-keys`}
            aria-label={`${title}. Explora los días con las flechas izquierda y derecha.`}
            className="chart-plot"
            ref={frameRef}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: one tab stop to explore the chart with the arrow keys
            tabIndex={0}
            {...cursor.frameHandlers}
          >
            <svg
              aria-labelledby={`${id}-title ${id}-desc`}
              className="chart-svg"
              height={height}
              ref={svgRef}
              role="img"
              viewBox={`0 0 ${width} ${height}`}
              width={width}
              {...cursor.svgHandlers}
            >
              <title id={`${id}-title`}>{title}</title>
              <desc id={`${id}-desc`}>{summary}</desc>
              <defs>
                <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-area-top)" />
                  <stop offset="100%" stopColor="var(--chart-area-bottom)" />
                </linearGradient>
              </defs>
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    className="chart-grid"
                    x1={margin.left}
                    x2={width - margin.right}
                    y1={yAt(tick)}
                    y2={yAt(tick)}
                  />
                  <text
                    className="chart-axis-label"
                    textAnchor="end"
                    x={margin.left - 10}
                    y={yAt(tick) + 3.5}
                  >
                    {formatNumber(tick)}
                  </text>
                </g>
              ))}
              {points.map((point, index) =>
                // The last date always shows; a regular one too close to it
                // gives way.
                (index % labelEvery === 0 &&
                  lastIndex - index >= labelEvery / 2) ||
                index === lastIndex ? (
                  <text
                    className="chart-axis-label"
                    key={point.date}
                    textAnchor={
                      index === 0
                        ? "start"
                        : index === points.length - 1
                          ? "end"
                          : "middle"
                    }
                    x={xAt(index)}
                    y={height - (xAxisTitle ? 28 : 8)}
                  >
                    {shortDate(point.date)}
                  </text>
                ) : null,
              )}
              {yAxisTitle ? (
                <text
                  className="chart-axis-title"
                  textAnchor="middle"
                  transform={`translate(12 ${margin.top + plotHeight / 2}) rotate(-90)`}
                >
                  {yAxisTitle}
                </text>
              ) : null}
              {xAxisTitle ? (
                <text
                  className="chart-axis-title"
                  textAnchor="middle"
                  x={margin.left + plotWidth / 2}
                  y={height - 6}
                >
                  {xAxisTitle}
                </text>
              ) : null}
              {area ? (
                <path
                  className="chart-area"
                  d={area}
                  fill={`url(#${id}-fill)`}
                />
              ) : null}
              {hasPrevious ? (
                <line
                  className="chart-previous"
                  x1={margin.left}
                  x2={width - margin.right}
                  y1={yAt(previousAverage as number)}
                  y2={yAt(previousAverage as number)}
                />
              ) : null}
              {line ? (
                <path className="chart-line" d={line} pathLength={1} />
              ) : null}
              {coords.length ? (
                <circle
                  className="chart-end-dot"
                  cx={coords[coords.length - 1]?.x}
                  cy={coords[coords.length - 1]?.y}
                  r={4}
                />
              ) : null}
              {activeCoord ? (
                <g className="chart-cursor">
                  <line
                    className="chart-crosshair"
                    x1={activeCoord.x}
                    x2={activeCoord.x}
                    y1={margin.top}
                    y2={baseY}
                  />
                  <circle
                    className="chart-active-dot"
                    cx={activeCoord.x}
                    cy={activeCoord.y}
                    r={5}
                  />
                </g>
              ) : null}
            </svg>
            {active && activeCoord ? (
              <ChartTooltip width={width} x={activeCoord.x} y={activeCoord.y}>
                <span className="chart-tooltip-title">
                  {weekdayDate(active.date)}
                </span>
                <TooltipRow
                  label={unit}
                  swatch="line"
                  value={formatNumber(active.value)}
                />
                {activeDelta !== null ? (
                  <span
                    className={
                      activeDelta >= 0
                        ? "chart-delta chart-delta-up"
                        : "chart-delta chart-delta-down"
                    }
                  >
                    {formatDelta(activeDelta)} vs. promedio anterior
                  </span>
                ) : null}
              </ChartTooltip>
            ) : null}
          </figure>
          <p aria-live="polite" className="chart-hint" id={`${id}-keys`}>
            {active
              ? `${longDate(active.date)}: ${formatNumber(active.value)} ${unit}${activeDelta !== null ? ` (${formatDelta(activeDelta)} vs. promedio anterior)` : ""}.`
              : "Pasa el cursor o usa las flechas sobre la gráfica para ver cada día."}
          </p>
          <div className="visually-hidden">{table}</div>
        </>
      )}
    </section>
  );
}
