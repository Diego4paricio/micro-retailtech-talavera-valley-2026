import type { AnalyticsSummary } from "@kardo/contracts";
import { useId, useRef, useState } from "react";
import { SectionHeading } from "../../../components/PageHeader.js";
import { formatNumber, formatPercent } from "../../../lib/format.js";
import { ChartTooltip, TooltipRow } from "./ChartTooltip.js";
import { longDate, niceTicks, shortDate, weekdayDate } from "./chart-utils.js";
import { useChartCursor } from "./use-chart-cursor.js";
import { useMeasuredWidth } from "./use-measured-width.js";

type DailyPoint = AnalyticsSummary["daily"][number];

const margin = { top: 12, right: 8, bottom: 26, left: 40 };
const svgHeight = 232;
const channels = [
  { key: "nfc", label: "NFC", fill: "var(--teal)" },
  { key: "qr", label: "QR", fill: "var(--aqua)" },
  { key: "link", label: "URL directa", fill: "var(--ink)" },
] as const;

/** Bottom-flush, top-rounded rect: the shape every stacked column is clipped to. */
function roundedTopRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const r = Math.min(radius, width / 2, Math.max(height, 0));
  if (height <= 0 || width <= 0) return "";
  return `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`;
}

function dayTotal(day: DailyPoint): number {
  return day.channels.nfc + day.channels.qr + day.channels.link;
}

/** Daily accesses stacked by channel (NFC · QR · URL directa). */
export function DailyChannelsChart({
  daily,
  title = "Accesos por día y canal",
  isUpdating,
}: {
  daily: DailyPoint[];
  title?: string | undefined;
  isUpdating?: boolean | undefined;
}) {
  const chartId = useId();
  const headingId = `${chartId}-heading`;
  const [showTable, setShowTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const [scrollRef, containerWidth] = useMeasuredWidth(720);

  const { max, ticks } = niceTicks(Math.max(0, ...daily.map(dayTotal)));
  const plotHeight = svgHeight - margin.top - margin.bottom;
  const baseY = margin.top + plotHeight;
  // Fill the panel; below a readable minimum per column the chart scrolls.
  const minSlot = daily.length <= 10 ? 28 : daily.length <= 31 ? 14 : 8;
  const svgWidth = Math.max(
    margin.left + daily.length * minSlot + margin.right,
    containerWidth,
  );
  const slot = daily.length
    ? (svgWidth - margin.left - margin.right) / daily.length
    : 0;
  const barWidth = Math.max(3, Math.min(slot * 0.62, 24));
  const labelEvery = daily.length <= 10 ? 1 : Math.ceil(daily.length / 7);
  const scale = (value: number) => (value / max) * plotHeight;

  const cursor = useChartCursor({
    count: daily.length,
    svgRef,
    svgWidth,
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
          {channels.map((channel) => (
            <th className="numeric" key={channel.key} scope="col">
              {channel.label}
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
            {channels.map((channel) => (
              <td className="numeric" key={channel.key}>
                {formatNumber(day.channels[channel.key])}
              </td>
            ))}
            <td className="numeric">{formatNumber(dayTotal(day))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <section aria-labelledby={headingId} className="panel chart-panel">
      <SectionHeading
        actions={
          <button
            aria-pressed={showTable}
            className="button button-ghost button-small"
            onClick={() => setShowTable((current) => !current)}
            type="button"
          >
            {showTable ? "Ver gráfica" : "Ver como tabla"}
          </button>
        }
        id={headingId}
        title={title}
      />

      {showTable ? (
        <div className="table-wrap enter-fade">{table}</div>
      ) : (
        <>
          <ul className="chart-legend">
            {channels.map((channel) => (
              <li key={channel.key}>
                <span
                  aria-hidden="true"
                  className={`chart-legend-swatch chart-legend-${channel.key}`}
                />
                {channel.label}
              </li>
            ))}
          </ul>
          <figure
            aria-busy={isUpdating || undefined}
            aria-describedby={`${chartId}-keys`}
            aria-label={`${title}. Explora los días con las flechas izquierda y derecha.`}
            className="chart-plot chart-scroll"
            ref={scrollRef}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: one tab stop to explore the chart with the arrow keys
            tabIndex={0}
            {...cursor.frameHandlers}
          >
            <svg
              aria-label={`Accesos diarios por canal, del ${longDate(daily[0]?.date)} al ${longDate(daily[daily.length - 1]?.date)}`}
              className="chart-svg chart-svg-scroll"
              data-active={cursor.active !== null || undefined}
              height={svgHeight}
              ref={svgRef}
              role="img"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              width={svgWidth}
              {...cursor.svgHandlers}
            >
              {ticks.map((tick) => {
                const y = baseY - scale(tick);
                return (
                  <g key={tick}>
                    <line
                      className="chart-grid"
                      x1={margin.left}
                      x2={svgWidth - margin.right}
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
                const clipId = `${chartId}-clip-${index}`;
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
                            d={roundedTopRectPath(
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
                            animationDelay: `${Math.min(index * 14, 280)}ms`,
                          }}
                        >
                          {channels.map((channel) => {
                            const segment = scale(day.channels[channel.key]);
                            offset += segment;
                            return segment > 0 ? (
                              <rect
                                fill={channel.fill}
                                height={segment}
                                key={channel.key}
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
                    {index % labelEvery === 0 ? (
                      <text
                        className="chart-axis-label"
                        textAnchor="middle"
                        x={margin.left + index * slot + slot / 2}
                        y={svgHeight - 8}
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
                x2={svgWidth - margin.right}
                y1={baseY}
                y2={baseY}
              />
            </svg>
            {active ? (
              <ChartTooltip side width={svgWidth} x={activeX} y={margin.top}>
                <span className="chart-tooltip-title">
                  {weekdayDate(active.date)}
                </span>
                <TooltipRow
                  label="accesos en total"
                  swatch="line"
                  value={formatNumber(activeTotal)}
                />
                {channels.map((channel) => (
                  <TooltipRow
                    key={channel.key}
                    label={`${channel.label} · ${formatPercent(active.channels[channel.key], activeTotal)}`}
                    swatch={channel.key}
                    value={formatNumber(active.channels[channel.key])}
                  />
                ))}
              </ChartTooltip>
            ) : null}
          </figure>
          <p aria-live="polite" className="chart-hint" id={`${chartId}-keys`}>
            {active
              ? `${longDate(active.date)}: ${formatNumber(activeTotal)} accesos. NFC ${formatNumber(active.channels.nfc)}, QR ${formatNumber(active.channels.qr)}, URL directa ${formatNumber(active.channels.link)}.`
              : "Pasa el cursor o usa las flechas sobre la gráfica para ver el desglose del día."}
          </p>
          <div className="visually-hidden">{table}</div>
        </>
      )}
    </section>
  );
}
