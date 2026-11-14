import { useId, useRef, useState } from "react";
import { SectionHeading } from "../../../components/PageHeader.js";
import { formatNumber } from "../../../lib/format.js";
import { useElementWidth } from "../../../lib/use-element-width.js";

type TapDay = { date: string; nfc: number; qr: number; link: number };

const marginLeft = 34;
const marginBottom = 22;
const marginTop = 10;
const svgHeight = 220;

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function longDate(value: string | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

/** Bottom-flush, top-rounded rect: the shape every stacked bar is clipped to. */
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

/** Taps per day by channel (NFC / QR / URL directa), only shown when taps data exists. */
export function TapsChannelsChart({ daily }: { daily: TapDay[] }) {
  const chartId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const maxTotal = Math.max(
    1,
    ...daily.map((day) => day.nfc + day.qr + day.link),
  );
  const plotHeight = svgHeight - marginTop - marginBottom;
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerWidth = useElementWidth(scrollRef, 720);
  const minSlot = daily.length <= 10 ? 28 : daily.length <= 31 ? 14 : 8;
  const svgWidth = Math.max(
    marginLeft + daily.length * minSlot + 12,
    containerWidth,
  );
  const barSlot = daily.length
    ? (svgWidth - marginLeft - 12) / daily.length
    : 0;
  const barWidth = Math.max(3, Math.min(barSlot * 0.62, 36));
  const labelStep = daily.length <= 10 ? 1 : Math.ceil(daily.length / 6);
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) =>
    Math.round((maxTotal / tickCount) * index),
  );

  function scale(value: number): number {
    return (value / maxTotal) * plotHeight;
  }

  const active = activeIndex !== null ? daily[activeIndex] : undefined;
  const headingId = `${chartId}-taps-heading`;

  return (
    <section aria-labelledby={headingId} className="panel chart-panel">
      <SectionHeading
        actions={
          <button
            aria-pressed={showTable}
            className="button button-secondary button-small"
            onClick={() => setShowTable((current) => !current)}
            type="button"
          >
            {showTable ? "Ver gráfica" : "Ver como tabla"}
          </button>
        }
        id={headingId}
        title="Taps por día y canal"
      />
      {showTable ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">
              Taps diarios por canal
            </caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th className="numeric" scope="col">
                  NFC
                </th>
                <th className="numeric" scope="col">
                  QR
                </th>
                <th className="numeric" scope="col">
                  URL directa
                </th>
                <th className="numeric" scope="col">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {daily.map((day) => (
                <tr key={day.date}>
                  <td>{longDate(day.date)}</td>
                  <td className="numeric">{formatNumber(day.nfc)}</td>
                  <td className="numeric">{formatNumber(day.qr)}</td>
                  <td className="numeric">{formatNumber(day.link)}</td>
                  <td className="numeric">
                    {formatNumber(day.nfc + day.qr + day.link)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <ul className="chart-legend">
            <li>
              <span
                aria-hidden="true"
                className="chart-legend-swatch chart-legend-a"
              />
              NFC
            </li>
            <li>
              <span
                aria-hidden="true"
                className="chart-legend-swatch chart-legend-b"
              />
              QR
            </li>
            <li>
              <span
                aria-hidden="true"
                className="chart-legend-swatch chart-legend-c"
              />
              URL directa
            </li>
          </ul>
          <div className="chart-scroll" ref={scrollRef}>
            <svg
              aria-label={`Taps diarios por canal, del ${longDate(daily[0]?.date)} al ${longDate(daily[daily.length - 1]?.date)}`}
              height={svgHeight}
              role="img"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              width={svgWidth}
            >
              {ticks.map((tick) => {
                const tickY = marginTop + plotHeight - scale(tick);
                return (
                  <g key={tick}>
                    <line
                      stroke="var(--line)"
                      strokeWidth={1}
                      x1={marginLeft}
                      x2={svgWidth - 4}
                      y1={tickY}
                      y2={tickY}
                    />
                    <text
                      fill="var(--text-faint)"
                      fontSize={9}
                      textAnchor="end"
                      x={marginLeft - 6}
                      y={tickY + 3}
                    >
                      {formatNumber(tick)}
                    </text>
                  </g>
                );
              })}
              {daily.map((day, index) => {
                const nfcHeight = scale(day.nfc);
                const qrHeight = scale(day.qr);
                const linkHeight = scale(day.link);
                const total = day.nfc + day.qr + day.link;
                const totalHeight = scale(total);
                const x =
                  marginLeft + index * barSlot + (barSlot - barWidth) / 2;
                const baseY = marginTop + plotHeight;
                const clipId = `${chartId}-clip-${index}`;
                const isActive = activeIndex === index;
                return (
                  <g key={day.date}>
                    {/* biome-ignore lint/a11y/noStaticElementInteractions: keyboard-focusable hit target revealing the aria-live breakdown below the chart. */}
                    <rect
                      className="chart-bar-hit"
                      fill="transparent"
                      height={plotHeight}
                      onBlur={() =>
                        setActiveIndex((current) =>
                          current === index ? null : current,
                        )
                      }
                      onFocus={() => setActiveIndex(index)}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseLeave={() =>
                        setActiveIndex((current) =>
                          current === index ? null : current,
                        )
                      }
                      tabIndex={0}
                      width={barSlot}
                      x={marginLeft + index * barSlot}
                      y={marginTop}
                    >
                      <title>{`${longDate(day.date)}: ${formatNumber(total)} taps totales. NFC ${formatNumber(day.nfc)}, QR ${formatNumber(day.qr)}, URL directa ${formatNumber(day.link)}.`}</title>
                    </rect>
                    {totalHeight > 0 ? (
                      <>
                        <clipPath id={clipId}>
                          <path
                            d={roundedTopRectPath(
                              x,
                              baseY - totalHeight,
                              barWidth,
                              totalHeight,
                              3,
                            )}
                          />
                        </clipPath>
                        <g clipPath={`url(#${clipId})`}>
                          <rect
                            fill="var(--teal)"
                            height={nfcHeight}
                            stroke="var(--surface)"
                            strokeWidth={2}
                            width={barWidth}
                            x={x}
                            y={baseY - nfcHeight}
                          />
                          <rect
                            fill="var(--aqua)"
                            height={qrHeight}
                            stroke="var(--surface)"
                            strokeWidth={2}
                            width={barWidth}
                            x={x}
                            y={baseY - nfcHeight - qrHeight}
                          />
                          <rect
                            fill="var(--ink)"
                            height={linkHeight}
                            stroke="var(--surface)"
                            strokeWidth={2}
                            width={barWidth}
                            x={x}
                            y={baseY - nfcHeight - qrHeight - linkHeight}
                          />
                        </g>
                      </>
                    ) : null}
                    {isActive ? (
                      <rect
                        fill="none"
                        height={plotHeight}
                        stroke="var(--teal)"
                        strokeDasharray="2 2"
                        width={barSlot}
                        x={marginLeft + index * barSlot}
                        y={marginTop}
                      />
                    ) : null}
                    {index % labelStep === 0 ? (
                      <text
                        fill="var(--text-faint)"
                        fontSize={9}
                        textAnchor="middle"
                        x={marginLeft + index * barSlot + barSlot / 2}
                        y={svgHeight - 6}
                      >
                        {shortDate(day.date)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
          {active ? (
            <div
              aria-live="polite"
              className="chart-tooltip-live"
              role="status"
            >
              <strong>{longDate(active.date)}</strong>
              <span>
                Total: {formatNumber(active.nfc + active.qr + active.link)}
              </span>
              <span>NFC: {formatNumber(active.nfc)}</span>
              <span>QR: {formatNumber(active.qr)}</span>
              <span>URL directa: {formatNumber(active.link)}</span>
            </div>
          ) : (
            <p className="chart-tooltip-hint muted">
              Pasa el cursor o navega con tabulador sobre una barra para ver el
              desglose del día.
            </p>
          )}
        </>
      )}
    </section>
  );
}
