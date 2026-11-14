import type { AnalyticsSummary } from "@kardo/contracts";
import { useId, useRef } from "react";
import { formatNumber, formatTime } from "../../../lib/format.js";
import { niceTicks } from "../../analytics/charts/chart-utils.js";
import { useChartCursor } from "../../analytics/charts/use-chart-cursor.js";
import type { WidgetRenderProps } from "../dashboard/types.js";
import { COMPACT_HEIGHT, chartMargin } from "./charts/compact.js";
import { DarkTooltip, DarkTooltipRow } from "./charts/DarkTooltip.js";
import { roundedTopRect } from "./charts/shapes.js";
import { useMeasuredSize } from "./charts/use-measured-size.js";

type HourlyPoint = AnalyticsSummary["hourly"][number];
const fullMargin = { top: 14, right: 8, bottom: 26, left: 36 };

/** The last 24 hours, one landing-style bar per hour in the chosen zone
 * (A9-25: the summary's own `timezone`, browser or business, not the
 * viewer's general Preferencias), the current hour last and highlighted. */
export function Hours24Widget({ context, preview }: WidgetRenderProps) {
  const { hourly, timezone } = context.data;
  const total = hourly.reduce((sum, hour) => sum + hour.taps, 0);

  if (!context.engineAvailable)
    return (
      <p className="kw-empty">Disponible cuando vuelva la analítica en vivo.</p>
    );
  if (total === 0)
    return <p className="kw-empty">Sin accesos en las últimas 24 horas.</p>;

  return <Hours24Body hourly={hourly} preview={preview} timeZone={timezone} />;
}

function Hours24Body({
  hourly,
  preview,
  timeZone,
}: {
  hourly: HourlyPoint[];
  preview?: boolean | undefined;
  timeZone: string | undefined;
}) {
  const hourFormat = (value: string) => formatTime(value, { timeZone });
  const id = useId();
  const [frameRef, width, height] = useMeasuredSize(320, 180);
  const svgRef = useRef<SVGSVGElement>(null);
  const n = hourly.length;
  const nowIndex = n - 1;
  const compact = Boolean(preview) || height < COMPACT_HEIGHT;
  const margin = chartMargin(height, fullMargin);

  const { max, ticks } = niceTicks(
    Math.max(0, ...hourly.map((p) => p.taps)),
    3,
  );
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = Math.max(1, height - margin.top - margin.bottom);
  const baseY = margin.top + plotHeight;
  const slot = n ? plotWidth / n : 0;
  const barWidth = Math.max(3, Math.min(slot * 0.62, 22));
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const scale = (value: number) => (value / max) * plotHeight;

  const cursor = useChartCursor({
    count: n,
    svgRef,
    svgWidth: width,
    indexAt: (x) => Math.floor((x - margin.left) / (slot || 1)),
  });
  const activeIndex = cursor.active ?? nowIndex;
  const active = hourly[activeIndex];
  const activeX = margin.left + activeIndex * slot + slot / 2;

  const table = (
    <table className="data-table">
      <caption className="visually-hidden">
        Accesos por hora en las últimas 24 horas
      </caption>
      <thead>
        <tr>
          <th scope="col">Hora</th>
          <th className="numeric" scope="col">
            Accesos
          </th>
        </tr>
      </thead>
      <tbody>
        {hourly.map((point) => (
          <tr key={point.hour}>
            <td>{hourFormat(point.hour)}</td>
            <td className="numeric">{formatNumber(point.taps)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="kw-fill-col">
      <figure
        aria-describedby={compact ? undefined : `${id}-readout`}
        aria-label="Accesos por hora en las últimas 24 horas. Explora las horas con las flechas izquierda y derecha."
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
          {hourly.map((point, index) => {
            const barHeight = scale(point.taps);
            const x = margin.left + index * slot + (slot - barWidth) / 2;
            const clipId = `${id}-clip-${index}`;
            const isNow = index === nowIndex;
            return (
              <g
                className={
                  cursor.active === index
                    ? "chart-column chart-column-active"
                    : "chart-column"
                }
                key={point.hour}
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
                      fill={isNow ? "var(--teal-deep)" : "var(--teal)"}
                      height={barHeight}
                      style={{
                        animationDelay: `${Math.min(index * 10, 260)}ms`,
                      }}
                      width={barWidth}
                      x={x}
                      y={baseY - barHeight}
                    />
                  </>
                ) : null}
                {!compact &&
                ((index % labelEvery === 0 && index < n - 2) || isNow) ? (
                  <text
                    className="chart-axis-label"
                    textAnchor="middle"
                    x={margin.left + index * slot + slot / 2}
                    y={height - 6}
                  >
                    {isNow ? "Ahora" : hourFormat(point.hour)}
                  </text>
                ) : null}
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
        {/* `active` defaults to the current hour so its tooltip is the
            board's at-a-glance reading with nothing hovered yet — but an
            inert preview (gallery/editor) never gets that hover in the
            first place, so the fixed bubble would just sit there as
            clutter in an already tiny box. */}
        {!preview && active ? (
          <DarkTooltip width={width} x={activeX} y={baseY - scale(active.taps)}>
            <span className="kw-dark-tooltip-title">
              {activeIndex === nowIndex ? "Ahora" : hourFormat(active.hour)}
            </span>
            <DarkTooltipRow label="accesos" value={formatNumber(active.taps)} />
          </DarkTooltip>
        ) : null}
      </figure>
      {compact ? null : (
        <p aria-live="polite" className="chart-hint" id={`${id}-readout`}>
          {cursor.active !== null && active
            ? `${hourFormat(active.hour)}: ${formatNumber(active.taps)} ${active.taps === 1 ? "acceso" : "accesos"}.`
            : "Pasa el cursor o usa las flechas sobre la gráfica para ver cada hora."}
        </p>
      )}
      <div className="visually-hidden">{table}</div>
    </div>
  );
}
