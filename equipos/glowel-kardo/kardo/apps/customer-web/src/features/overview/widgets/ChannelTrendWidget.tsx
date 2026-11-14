import type { AnalyticsSummary } from "@kardo/contracts";
import { useId, useRef } from "react";
import { formatNumber, formatPercent } from "../../../lib/format.js";
import {
  longDate,
  niceTicks,
  shortDate,
  weekdayDate,
} from "../../analytics/charts/chart-utils.js";
import { useChartCursor } from "../../analytics/charts/use-chart-cursor.js";
import type { WidgetRenderProps } from "../dashboard/types.js";
import {
  channelColorVar,
  channelLabels,
  channelOrder,
} from "./charts/aggregate.js";
import { COMPACT_HEIGHT, chartMargin } from "./charts/compact.js";
import { DarkTooltip, DarkTooltipRow } from "./charts/DarkTooltip.js";
import { roundedTopRect } from "./charts/shapes.js";
import { useMeasuredSize } from "./charts/use-measured-size.js";

type DailyPoint = AnalyticsSummary["daily"][number];
const fullMargin = { top: 14, right: 10, bottom: 28, left: 42 };

function dayTotal(day: DailyPoint): number {
  return day.channels.nfc + day.channels.qr + day.channels.link;
}

/** Daily accesses stacked by channel, landing-bar style — whether the mix
 * of NFC, QR and direct URL shifts over the period. */
export function ChannelTrendWidget({ context, preview }: WidgetRenderProps) {
  const { daily } = context.data;
  const total = daily.reduce((sum, day) => sum + dayTotal(day), 0);

  if (!context.engineAvailable)
    return (
      <p className="kw-empty">Disponible cuando vuelva la analítica en vivo.</p>
    );
  if (total === 0)
    return (
      <p className="kw-empty">
        Cuando alguien acerque su celular o escanee un código, verás aquí cómo
        se reparten los canales día a día.
      </p>
    );

  return <ChannelTrendBody daily={daily} preview={preview} />;
}

function ChannelTrendBody({
  daily,
  preview,
}: {
  daily: DailyPoint[];
  preview?: boolean | undefined;
}) {
  const id = useId();
  const [frameRef, width, height] = useMeasuredSize(360, 220);
  const svgRef = useRef<SVGSVGElement>(null);
  const n = daily.length;
  const compact = Boolean(preview) || height < COMPACT_HEIGHT;
  const margin = chartMargin(height, fullMargin);

  const { max, ticks } = niceTicks(Math.max(0, ...daily.map(dayTotal)));
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = Math.max(1, height - margin.top - margin.bottom);
  const baseY = margin.top + plotHeight;
  const slot = n ? plotWidth / n : 0;
  const barWidth = Math.max(3, Math.min(slot * 0.62, 28));
  const labelEvery = Math.max(1, Math.ceil(n / 6));
  const scale = (value: number) => (value / max) * plotHeight;

  const cursor = useChartCursor({
    count: n,
    svgRef,
    svgWidth: width,
    indexAt: (x) => Math.floor((x - margin.left) / (slot || 1)),
  });
  const active = cursor.active !== null ? daily[cursor.active] : undefined;
  const activeTotal = active ? dayTotal(active) : 0;
  const activeX =
    cursor.active !== null ? margin.left + cursor.active * slot + slot / 2 : 0;

  const table = (
    <table className="data-table">
      <caption className="visually-hidden">Accesos diarios por canal</caption>
      <thead>
        <tr>
          <th scope="col">Fecha</th>
          {channelOrder.map((key) => (
            <th className="numeric" key={key} scope="col">
              {channelLabels[key]}
            </th>
          ))}
          <th className="numeric" scope="col">
            Total
          </th>
        </tr>
      </thead>
      <tbody>
        {daily.map((day) => (
          <tr key={day.date}>
            <td>{longDate(day.date)}</td>
            {channelOrder.map((key) => (
              <td className="numeric" key={key}>
                {formatNumber(day.channels[key])}
              </td>
            ))}
            <td className="numeric">{formatNumber(dayTotal(day))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="kw-fill-col">
      {compact ? null : (
        <ul className="kw-inline-legend">
          {channelOrder.map((key) => (
            <li key={key}>
              <span
                aria-hidden="true"
                className={`chart-legend-swatch chart-legend-${key}`}
              />
              {channelLabels[key]}
            </li>
          ))}
        </ul>
      )}
      <figure
        aria-describedby={compact ? undefined : `${id}-readout`}
        aria-label="Accesos por día y canal. Explora los días con las flechas izquierda y derecha."
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
            : ticks.map((tick) => {
                const y = baseY - scale(tick);
                return (
                  <g key={tick}>
                    <line
                      className="chart-grid"
                      x1={margin.left}
                      x2={width - margin.right}
                      y1={y}
                      y2={y}
                    />
                    <text
                      className="chart-axis-label"
                      textAnchor="end"
                      x={margin.left - 10}
                      y={y + 3.5}
                    >
                      {formatNumber(tick)}
                    </text>
                  </g>
                );
              })}
          {cursor.active !== null ? (
            <rect
              className="chart-column-highlight"
              height={plotHeight}
              rx={6}
              width={slot}
              x={margin.left + cursor.active * slot}
              y={margin.top}
            />
          ) : null}
          {daily.map((day, index) => {
            const total = dayTotal(day);
            const totalHeight = scale(total);
            const x = margin.left + index * slot + (slot - barWidth) / 2;
            const clipId = `${id}-clip-${index}`;
            let offset = 0;
            return (
              <g
                className={
                  cursor.active === index
                    ? "chart-column chart-column-active"
                    : "chart-column"
                }
                key={day.date}
              >
                {totalHeight > 0 ? (
                  <>
                    <clipPath id={clipId}>
                      <path
                        d={roundedTopRect(
                          x,
                          baseY - totalHeight,
                          barWidth,
                          totalHeight,
                          4,
                        )}
                      />
                    </clipPath>
                    <g
                      className="chart-column-bars"
                      clipPath={`url(#${clipId})`}
                      style={{
                        animationDelay: `${Math.min(index * 12, 260)}ms`,
                      }}
                    >
                      {channelOrder.map((key) => {
                        const segment = scale(day.channels[key]);
                        offset += segment;
                        return segment > 0 ? (
                          <rect
                            fill={channelColorVar[key]}
                            height={segment}
                            key={key}
                            stroke="var(--surface)"
                            strokeWidth={2}
                            width={barWidth}
                            x={x}
                            y={baseY - offset}
                          />
                        ) : null;
                      })}
                    </g>
                  </>
                ) : null}
                {!compact && index % labelEvery === 0 ? (
                  <text
                    className="chart-axis-label"
                    textAnchor="middle"
                    x={margin.left + index * slot + slot / 2}
                    y={height - 8}
                  >
                    {shortDate(day.date)}
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
        {active ? (
          <DarkTooltip width={width} x={activeX} y={margin.top}>
            <span className="kw-dark-tooltip-title">
              {weekdayDate(active.date)}
            </span>
            <DarkTooltipRow
              label="accesos en total"
              value={formatNumber(activeTotal)}
            />
            {channelOrder.map((key) => (
              <DarkTooltipRow
                key={key}
                label={`${channelLabels[key]} · ${formatPercent(active.channels[key], activeTotal)}`}
                swatch={key}
                value={formatNumber(active.channels[key])}
              />
            ))}
          </DarkTooltip>
        ) : null}
      </figure>
      {compact ? null : (
        <p aria-live="polite" className="chart-hint" id={`${id}-readout`}>
          {active
            ? `${longDate(active.date)}: ${formatNumber(activeTotal)} accesos. NFC ${formatNumber(active.channels.nfc)}, QR ${formatNumber(active.channels.qr)}, URL directa ${formatNumber(active.channels.link)}.`
            : "Pasa el cursor o usa las flechas sobre la gráfica para ver el desglose del día."}
        </p>
      )}
      <div className="visually-hidden">{table}</div>
    </div>
  );
}
