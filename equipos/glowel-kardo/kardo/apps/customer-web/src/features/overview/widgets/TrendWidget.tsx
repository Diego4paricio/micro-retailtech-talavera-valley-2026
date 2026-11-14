import { useId, useRef } from "react";
import { formatNumber } from "../../../lib/format.js";
import { Link } from "../../../lib/router.js";
import {
  ChartTooltip,
  TooltipRow,
} from "../../analytics/charts/ChartTooltip.js";
import {
  formatDelta,
  longDate,
  monotonePath,
  niceTicks,
  percentChange,
  shortDate,
  weekdayDate,
} from "../../analytics/charts/chart-utils.js";
import { useChartCursor } from "../../analytics/charts/use-chart-cursor.js";
import type { WidgetRenderProps } from "../dashboard/types.js";
import { COMPACT_HEIGHT, chartMargin } from "./charts/compact.js";
import { DarkTooltip, DarkTooltipRow } from "./charts/DarkTooltip.js";
import { roundedTopRect } from "./charts/shapes.js";
import { useMeasuredSize } from "./charts/use-measured-size.js";

const trendMetrics = ["taps", "clicks", "leads"] as const;
type TrendMetric = (typeof trendMetrics)[number];
const metricLabels: Record<TrendMetric, string> = {
  taps: "Accesos",
  clicks: "Clics",
  leads: "Solicitudes",
};
const metricUnits: Record<TrendMetric, string> = {
  taps: "accesos",
  clicks: "clics",
  leads: "solicitudes",
};
type ChartForm = "area" | "bars" | "line";

function resolveMetric(value: unknown): TrendMetric {
  return trendMetrics.includes(value as TrendMetric)
    ? (value as TrendMetric)
    : "taps";
}
function resolveChart(value: unknown): ChartForm {
  return value === "bars" || value === "line" ? value : "area";
}
function pick(metric: TrendMetric) {
  return (day: {
    taps: number;
    clicks: number;
    leads?: number | undefined;
  }): number =>
    metric === "clicks"
      ? day.clicks
      : metric === "leads"
        ? (day.leads ?? 0)
        : day.taps;
}

const fullMargin = { top: 16, right: 14, bottom: 28, left: 44 };

/** Daily accesses, clicks or leads — an area with a gradient wash (like
 * `AreaChart`), landing-style bars, or a plain line — with the previous
 * period as a dashed reference and a per-day comparison tooltip. */
export function TrendWidget({ widget, context, preview }: WidgetRenderProps) {
  const { data, days, engineAvailable, canManage } = context;
  const metric = resolveMetric(widget.config.metric);
  const chart = resolveChart(widget.config.chart);
  const compare = widget.config.compare !== false;
  const unitLabel = metricUnits[metric];
  const value = pick(metric);

  const points = data.daily.map((day) => ({
    date: day.date,
    value: value(day),
  }));
  const previousSource = compare ? data.previousDaily : undefined;
  const previousPoints =
    previousSource && previousSource.length === points.length
      ? previousSource.map((day) => ({ date: day.date, value: value(day) }))
      : undefined;
  const total = points.reduce((sum, point) => sum + point.value, 0);

  if (!engineAvailable && metric !== "leads")
    return (
      <p className="kw-empty">Disponible cuando vuelva la analítica en vivo.</p>
    );

  if (total === 0)
    return (
      <div className="kw-empty-block">
        <p>
          Sin {unitLabel} en este periodo.{" "}
          {metric === "taps"
            ? "Publica una página y acerca tu celular a un QR o etiqueta: el primer acceso aparece aquí en minutos."
            : "Aparecerán aquí en cuanto ocurran."}
        </p>
        {canManage && metric === "taps" ? (
          <Link
            className="button button-secondary button-small"
            to={{ name: "touchpoints" }}
          >
            Ver mis QR y etiquetas
          </Link>
        ) : null}
      </div>
    );

  return (
    <TrendChartBody
      chart={chart}
      days={days}
      metricLabel={metricLabels[metric]}
      points={points}
      preview={preview}
      previousPoints={previousPoints}
      unitLabel={unitLabel}
    />
  );
}

function TrendChartBody({
  points,
  previousPoints,
  unitLabel,
  metricLabel,
  chart,
  days,
  preview,
}: {
  points: { date: string; value: number }[];
  previousPoints: { date: string; value: number }[] | undefined;
  unitLabel: string;
  metricLabel: string;
  chart: ChartForm;
  days: number;
  preview?: boolean | undefined;
}) {
  const id = useId();
  const [frameRef, width, height] = useMeasuredSize(360, 220);
  const svgRef = useRef<SVGSVGElement>(null);
  const isBars = chart === "bars";
  const hasPrevious = Boolean(previousPoints?.length);
  const compact = Boolean(preview) || height < COMPACT_HEIGHT;
  const margin = chartMargin(height, fullMargin);

  const maxValue = Math.max(
    ...points.map((point) => point.value),
    ...(previousPoints?.map((point) => point.value) ?? [0]),
  );
  const { max, ticks } = niceTicks(maxValue);
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = Math.max(1, height - margin.top - margin.bottom);
  const baseY = margin.top + plotHeight;
  const n = points.length;
  const slot = isBars ? plotWidth / n : n > 1 ? plotWidth / (n - 1) : 0;
  const xLeft = (index: number) => margin.left + index * slot;
  const xCenter = (index: number) =>
    isBars
      ? xLeft(index) + slot / 2
      : n > 1
        ? xLeft(index)
        : margin.left + plotWidth / 2;
  const yAt = (v: number) => baseY - (v / max) * plotHeight;
  const scale = (v: number) => (v / max) * plotHeight;

  const coords = points.map((point, index) => ({
    x: xCenter(index),
    y: yAt(point.value),
  }));
  const previousCoords = previousPoints?.map((point, index) => ({
    x: xCenter(index),
    y: yAt(point.value),
  }));
  const line = chart !== "bars" ? monotonePath(coords) : "";
  const firstX = coords[0]?.x ?? margin.left;
  const lastX = coords[coords.length - 1]?.x ?? margin.left;
  const area =
    chart === "area" && line
      ? `${line} L${lastX},${baseY} L${firstX},${baseY} Z`
      : "";
  const previousLine = previousCoords ? monotonePath(previousCoords) : "";
  const barWidth = isBars ? Math.max(3, Math.min(slot * 0.62, 32)) : 0;
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  const cursor = useChartCursor({
    count: n,
    svgRef,
    svgWidth: width,
    indexAt: (x) => {
      if (!slot) return 0;
      const raw = (x - margin.left) / slot;
      return isBars ? Math.floor(raw) : Math.round(raw);
    },
  });
  const activeIndex = cursor.active;
  const active = activeIndex !== null ? points[activeIndex] : undefined;
  const activeCoord = activeIndex !== null ? coords[activeIndex] : undefined;
  const activePrevious =
    activeIndex !== null ? previousPoints?.[activeIndex] : undefined;
  const activeDelta =
    active && activePrevious
      ? percentChange(active.value, activePrevious.value)
      : null;

  const table = (
    <table className="data-table">
      <caption className="visually-hidden">{metricLabel} por día</caption>
      <thead>
        <tr>
          <th scope="col">Fecha</th>
          <th className="numeric" scope="col">
            {metricLabel}
          </th>
          {hasPrevious ? (
            <th className="numeric" scope="col">
              Día equivalente anterior
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {points.map((point, index) => {
          const previous = previousPoints?.[index];
          return (
            <tr key={point.date}>
              <td>{longDate(point.date)}</td>
              <td className="numeric">{formatNumber(point.value)}</td>
              {hasPrevious ? (
                <td className="numeric">
                  {previous ? formatNumber(previous.value) : "—"}
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="kw-fill-col">
      <figure
        aria-describedby={compact ? undefined : `${id}-readout`}
        aria-label={`${metricLabel} por día. Explora los días con las flechas izquierda y derecha.`}
        className="chart-plot kw-fill"
        ref={frameRef}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: one tab stop to explore the chart with the arrow keys
        tabIndex={0}
        {...cursor.frameHandlers}
      >
        <svg
          aria-hidden="true"
          className="chart-svg"
          data-active={cursor.active !== null || undefined}
          height={height}
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          {...cursor.svgHandlers}
        >
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-area-top)" />
              <stop offset="100%" stopColor="var(--chart-area-bottom)" />
            </linearGradient>
          </defs>
          {compact
            ? null
            : ticks.map((tick) => (
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
          {compact
            ? null
            : points.map((point, index) =>
                index % labelEvery === 0 || index === n - 1 ? (
                  <text
                    className="chart-axis-label"
                    key={point.date}
                    textAnchor={
                      index === 0 ? "start" : index === n - 1 ? "end" : "middle"
                    }
                    x={xCenter(index)}
                    y={height - 8}
                  >
                    {shortDate(point.date)}
                  </text>
                ) : null,
              )}
          {isBars ? (
            <>
              {cursor.active !== null ? (
                <rect
                  className="chart-column-highlight"
                  height={plotHeight}
                  rx={6}
                  width={slot}
                  x={xLeft(cursor.active)}
                  y={margin.top}
                />
              ) : null}
              {points.map((point, index) => {
                const barHeight = scale(point.value);
                const x = xLeft(index) + (slot - barWidth) / 2;
                const clipId = `${id}-clip-${index}`;
                return (
                  <g
                    className={
                      cursor.active === index
                        ? "chart-column chart-column-active"
                        : "chart-column"
                    }
                    key={point.date}
                  >
                    {barHeight > 0 ? (
                      <>
                        <clipPath id={clipId}>
                          <path
                            d={roundedTopRect(
                              x,
                              baseY - barHeight,
                              barWidth,
                              barHeight,
                              4,
                            )}
                          />
                        </clipPath>
                        <rect
                          className="chart-column-bars"
                          clipPath={`url(#${clipId})`}
                          fill="var(--teal)"
                          height={barHeight}
                          style={{
                            animationDelay: `${Math.min(index * 12, 260)}ms`,
                          }}
                          width={barWidth}
                          x={x}
                          y={baseY - barHeight}
                        />
                      </>
                    ) : null}
                  </g>
                );
              })}
            </>
          ) : (
            <>
              {area ? (
                <path
                  className="chart-area"
                  d={area}
                  fill={`url(#${id}-fill)`}
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
            </>
          )}
          {previousLine ? (
            <path className="chart-previous" d={previousLine} fill="none" />
          ) : null}
          <line
            className="chart-baseline"
            x1={margin.left}
            x2={width - margin.right}
            y1={baseY}
            y2={baseY}
          />
          {activeCoord && !isBars ? (
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
          isBars ? (
            <DarkTooltip width={width} x={activeCoord.x} y={activeCoord.y}>
              <span className="kw-dark-tooltip-title">
                {weekdayDate(active.date)}
              </span>
              <DarkTooltipRow
                label={unitLabel}
                value={formatNumber(active.value)}
              />
              {activeDelta !== null ? (
                <span className="kw-dark-tooltip-note">
                  {formatDelta(activeDelta)} vs. día equivalente anterior
                </span>
              ) : null}
            </DarkTooltip>
          ) : (
            <ChartTooltip width={width} x={activeCoord.x} y={activeCoord.y}>
              <span className="chart-tooltip-title">
                {weekdayDate(active.date)}
              </span>
              <TooltipRow
                label={unitLabel}
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
                  {formatDelta(activeDelta)} vs. día equivalente anterior
                </span>
              ) : null}
            </ChartTooltip>
          )
        ) : null}
      </figure>
      {compact ? null : (
        <p aria-live="polite" className="chart-hint" id={`${id}-readout`}>
          {active
            ? `${longDate(active.date)}: ${formatNumber(active.value)} ${unitLabel}${activeDelta !== null ? ` (${formatDelta(activeDelta)} frente al día equivalente hace ${days} días)` : ""}.`
            : "Pasa el cursor o usa las flechas sobre la gráfica para ver cada día."}
        </p>
      )}
      <div className="visually-hidden">{table}</div>
    </div>
  );
}
