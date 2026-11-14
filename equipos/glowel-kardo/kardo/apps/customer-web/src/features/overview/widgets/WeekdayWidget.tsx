import { useId, useRef } from "react";
import { formatNumber } from "../../../lib/format.js";
import { niceTicks } from "../../analytics/charts/chart-utils.js";
import { useChartCursor } from "../../analytics/charts/use-chart-cursor.js";
import type { WidgetRenderProps } from "../dashboard/types.js";
import {
  sumWeekday,
  weekdayNames,
  weekdayShortLabels,
} from "./charts/aggregate.js";
import { COMPACT_HEIGHT, chartMargin } from "./charts/compact.js";
import { DarkTooltip, DarkTooltipRow } from "./charts/DarkTooltip.js";
import { roundedTopRect } from "./charts/shapes.js";
import { useMeasuredSize } from "./charts/use-measured-size.js";

const fullMargin = { top: 14, right: 10, bottom: 26, left: 36 };

/** Accesses by weekday (Monday first) across the period, landing-bar style. */
export function WeekdayWidget({ context, preview }: WidgetRenderProps) {
  const weekdays = sumWeekday(context.data.weekdayHour);
  const total = weekdays.reduce((sum, value) => sum + value, 0);

  if (!context.engineAvailable)
    return (
      <p className="kw-empty">Disponible cuando vuelva la analítica en vivo.</p>
    );
  if (total === 0)
    return <p className="kw-empty">Sin accesos en este periodo.</p>;

  return <WeekdayBody preview={preview} weekdays={weekdays} />;
}

function WeekdayBody({
  weekdays,
  preview,
}: {
  weekdays: number[];
  preview?: boolean | undefined;
}) {
  const id = useId();
  const [frameRef, width, height] = useMeasuredSize(280, 200);
  const svgRef = useRef<SVGSVGElement>(null);
  const n = weekdays.length;
  const compact = Boolean(preview) || height < COMPACT_HEIGHT;
  const margin = chartMargin(height, fullMargin);

  const { max, ticks } = niceTicks(Math.max(0, ...weekdays), 3);
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = Math.max(1, height - margin.top - margin.bottom);
  const baseY = margin.top + plotHeight;
  const slot = n ? plotWidth / n : 0;
  const barWidth = Math.max(6, Math.min(slot * 0.55, 36));
  const scale = (value: number) => (value / max) * plotHeight;

  const cursor = useChartCursor({
    count: n,
    svgRef,
    svgWidth: width,
    indexAt: (x) => Math.floor((x - margin.left) / (slot || 1)),
  });
  const active = cursor.active;
  const activeX = active !== null ? margin.left + active * slot + slot / 2 : 0;

  const table = (
    <table className="data-table">
      <caption className="visually-hidden">
        Accesos por día de la semana
      </caption>
      <thead>
        <tr>
          <th scope="col">Día</th>
          <th className="numeric" scope="col">
            Accesos
          </th>
        </tr>
      </thead>
      <tbody>
        {weekdayShortLabels.map((label, index) => (
          <tr key={label}>
            <td>{weekdayNames[index]}</td>
            <td className="numeric">{formatNumber(weekdays[index] ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="kw-fill-col">
      <figure
        aria-describedby={compact ? undefined : `${id}-readout`}
        aria-label="Accesos por día de la semana. Explora los días con las flechas izquierda y derecha."
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
          {compact
            ? null
            : ticks.map((tick) => (
                <g key={tick}>
                  <line
                    className="chart-grid"
                    x1={margin.left}
                    x2={width - margin.right}
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
          {weekdayShortLabels.map((label, index) => {
            const value = weekdays[index] ?? 0;
            const barHeight = scale(value);
            const x = margin.left + index * slot + (slot - barWidth) / 2;
            const clipId = `${id}-clip-${index}`;
            return (
              <g
                className={
                  cursor.active === index
                    ? "chart-column chart-column-active"
                    : "chart-column"
                }
                key={label}
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
                      style={{ animationDelay: `${index * 20}ms` }}
                      width={barWidth}
                      x={x}
                      y={baseY - barHeight}
                    />
                  </>
                ) : null}
                {compact ? null : (
                  <text
                    className="chart-axis-label"
                    textAnchor="middle"
                    x={margin.left + index * slot + slot / 2}
                    y={height - 6}
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}
          <line
            className="chart-baseline"
            x1={margin.left}
            x2={width - margin.right}
            y1={baseY}
            y2={baseY}
          />
        </svg>
        {active !== null ? (
          <DarkTooltip
            width={width}
            x={activeX}
            y={baseY - scale(weekdays[active] ?? 0)}
          >
            <span className="kw-dark-tooltip-title">
              {weekdayNames[active]}
            </span>
            <DarkTooltipRow
              label="accesos"
              value={formatNumber(weekdays[active] ?? 0)}
            />
          </DarkTooltip>
        ) : null}
      </figure>
      {compact ? null : (
        <p aria-live="polite" className="chart-hint" id={`${id}-readout`}>
          {active !== null
            ? `${weekdayNames[active]}: ${formatNumber(weekdays[active] ?? 0)} accesos.`
            : "Pasa el cursor o usa las flechas sobre la gráfica para ver cada día."}
        </p>
      )}
      <div className="visually-hidden">{table}</div>
    </div>
  );
}
