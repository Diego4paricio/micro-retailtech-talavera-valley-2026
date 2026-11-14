import { useId, useRef } from "react";
import { formatNumber } from "../../../lib/format.js";
import { niceTicks } from "../../analytics/charts/chart-utils.js";
import { useChartCursor } from "../../analytics/charts/use-chart-cursor.js";
import type { WidgetRenderProps } from "../dashboard/types.js";
import {
  channelLabels,
  channelOrder,
  channelTotal,
  rate,
} from "./charts/aggregate.js";
import { COMPACT_HEIGHT, chartMargin } from "./charts/compact.js";
import { DarkTooltip, DarkTooltipRow } from "./charts/DarkTooltip.js";
import { roundedTopRect } from "./charts/shapes.js";
import { useMeasuredSize } from "./charts/use-measured-size.js";

const rateFormat = new Intl.NumberFormat("es-MX", {
  style: "percent",
  maximumFractionDigits: 1,
});
const fullMargin = { top: 16, right: 12, bottom: 30, left: 42 };

/** Which channel turns an access into a click: accesses and clicks side by
 * side per channel, with the click rate for each. */
export function ChannelInteractionWidget({
  context,
  preview,
}: WidgetRenderProps) {
  const { channels, clickChannels } = context.data.totals;
  const clicks = clickChannels ?? { nfc: 0, qr: 0, link: 0 };

  if (!context.engineAvailable)
    return (
      <p className="kw-empty">Disponible cuando vuelva la analítica en vivo.</p>
    );
  if (channelTotal(channels) === 0)
    return (
      <p className="kw-empty">
        Cuando alguien acerque su celular o escanee un código, verás aquí qué
        canal genera más clics.
      </p>
    );

  return (
    <ChannelInteractionBody
      channels={channels}
      clicks={clicks}
      preview={preview}
    />
  );
}

function ChannelInteractionBody({
  channels,
  clicks,
  preview,
}: {
  channels: Record<"nfc" | "qr" | "link", number>;
  clicks: Record<"nfc" | "qr" | "link", number>;
  preview?: boolean | undefined;
}) {
  const id = useId();
  const [frameRef, width, height] = useMeasuredSize(320, 220);
  const svgRef = useRef<SVGSVGElement>(null);
  const n = channelOrder.length;
  const compact = Boolean(preview) || height < COMPACT_HEIGHT;
  const margin = chartMargin(height, fullMargin);

  const { max, ticks } = niceTicks(
    Math.max(
      ...channelOrder.map((key) => Math.max(channels[key], clicks[key])),
    ),
  );
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = Math.max(1, height - margin.top - margin.bottom);
  const baseY = margin.top + plotHeight;
  const groupSlot = plotWidth / n;
  const barWidth = Math.max(6, Math.min(groupSlot * 0.3, 30));
  const barGap = Math.max(3, groupSlot * 0.06);
  const scale = (value: number) => (value / max) * plotHeight;

  const cursor = useChartCursor({
    count: n,
    svgRef,
    svgWidth: width,
    indexAt: (x) => Math.floor((x - margin.left) / (groupSlot || 1)),
  });
  const activeKey =
    cursor.active !== null ? channelOrder[cursor.active] : undefined;
  const activeGroupX =
    cursor.active !== null
      ? margin.left + cursor.active * groupSlot + groupSlot / 2
      : 0;

  const table = (
    <table className="data-table">
      <caption className="visually-hidden">Accesos y clics por canal</caption>
      <thead>
        <tr>
          <th scope="col">Canal</th>
          <th className="numeric" scope="col">
            Accesos
          </th>
          <th className="numeric" scope="col">
            Clics
          </th>
          <th className="numeric" scope="col">
            Tasa de clic
          </th>
        </tr>
      </thead>
      <tbody>
        {channelOrder.map((key) => (
          <tr key={key}>
            <td>{channelLabels[key]}</td>
            <td className="numeric">{formatNumber(channels[key])}</td>
            <td className="numeric">{formatNumber(clicks[key])}</td>
            <td className="numeric">
              {rateFormat.format(rate(clicks[key], channels[key]))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="kw-fill-col">
      {compact ? null : (
        <ul className="kw-inline-legend">
          <li>
            <span aria-hidden="true" className="kw-swatch kw-swatch-taps" />
            Accesos
          </li>
          <li>
            <span aria-hidden="true" className="kw-swatch kw-swatch-clicks" />
            Clics
          </li>
        </ul>
      )}
      <figure
        aria-describedby={compact ? undefined : `${id}-readout`}
        aria-label="Accesos y clics por canal. Explora los canales con las flechas izquierda y derecha."
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
              width={groupSlot}
              x={margin.left + cursor.active * groupSlot}
              y={margin.top}
            />
          ) : null}
          {channelOrder.map((key, index) => {
            const groupX = margin.left + index * groupSlot + groupSlot / 2;
            const tapsHeight = scale(channels[key]);
            const clicksHeight = scale(clicks[key]);
            const tapsX = groupX - barGap / 2 - barWidth;
            const clicksX = groupX + barGap / 2;
            const clipTaps = `${id}-taps-${index}`;
            const clipClicks = `${id}-clicks-${index}`;
            return (
              <g
                className={
                  cursor.active === index
                    ? "chart-column chart-column-active"
                    : "chart-column"
                }
                key={key}
              >
                {tapsHeight > 0 ? (
                  <>
                    <clipPath id={clipTaps}>
                      <path
                        d={roundedTopRect(
                          tapsX,
                          baseY - tapsHeight,
                          barWidth,
                          tapsHeight,
                          4,
                        )}
                      />
                    </clipPath>
                    <rect
                      className="chart-column-bars"
                      clipPath={`url(#${clipTaps})`}
                      fill="var(--teal)"
                      height={tapsHeight}
                      width={barWidth}
                      x={tapsX}
                      y={baseY - tapsHeight}
                    />
                  </>
                ) : null}
                {clicksHeight > 0 ? (
                  <>
                    <clipPath id={clipClicks}>
                      <path
                        d={roundedTopRect(
                          clicksX,
                          baseY - clicksHeight,
                          barWidth,
                          clicksHeight,
                          4,
                        )}
                      />
                    </clipPath>
                    <rect
                      className="chart-column-bars"
                      clipPath={`url(#${clipClicks})`}
                      fill="var(--aqua)"
                      height={clicksHeight}
                      width={barWidth}
                      x={clicksX}
                      y={baseY - clicksHeight}
                    />
                  </>
                ) : null}
                {compact ? null : (
                  <text
                    className="chart-axis-label"
                    textAnchor="middle"
                    x={groupX}
                    y={height - 8}
                  >
                    {channelLabels[key]}
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
        {activeKey ? (
          <DarkTooltip width={width} x={activeGroupX} y={margin.top}>
            <span className="kw-dark-tooltip-title">
              {channelLabels[activeKey]}
            </span>
            <DarkTooltipRow
              label="accesos"
              value={formatNumber(channels[activeKey])}
            />
            <DarkTooltipRow
              label="clics"
              value={formatNumber(clicks[activeKey])}
            />
            <span className="kw-dark-tooltip-note">
              {rateFormat.format(rate(clicks[activeKey], channels[activeKey]))}{" "}
              tasa de clic
            </span>
          </DarkTooltip>
        ) : null}
      </figure>
      {compact ? null : (
        <p aria-live="polite" className="chart-hint" id={`${id}-readout`}>
          {activeKey
            ? `${channelLabels[activeKey]}: ${formatNumber(channels[activeKey])} accesos, ${formatNumber(clicks[activeKey])} clics (${rateFormat.format(rate(clicks[activeKey], channels[activeKey]))} de tasa de clic).`
            : "Pasa el cursor o usa las flechas sobre la gráfica para ver cada canal."}
        </p>
      )}
      <div className="visually-hidden">{table}</div>
    </div>
  );
}
