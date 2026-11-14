import type { StaffMetricsOverview } from "@kardo/contracts";
import { useId, useRef, useState } from "react";
import { SectionHeading } from "../../../components/PageHeader.js";
import { niceMax, scaleValue } from "../../../lib/chart-scale.js";
import { formatNumber } from "../../../lib/format.js";
import { useElementWidth } from "../../../lib/use-element-width.js";

type DailyPoint = StaffMetricsOverview["daily"][number];

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

/** New customers + new Touchpoints per day: two lines over the period. */
export function DailyGrowthChart({ daily }: { daily: DailyPoint[] }) {
  const chartId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const maxValue = niceMax(
    daily.flatMap((day) => [day.newCustomers, day.newTouchpoints]),
  );
  const plotHeight = svgHeight - marginTop - marginBottom;
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerWidth = useElementWidth(scrollRef, 720);
  const minSlot = daily.length <= 10 ? 28 : daily.length <= 31 ? 16 : 8;
  const svgWidth = Math.max(
    marginLeft + daily.length * minSlot + 12,
    containerWidth,
  );
  const slot = daily.length ? (svgWidth - marginLeft - 12) / daily.length : 0;
  const labelStep = daily.length <= 10 ? 1 : Math.ceil(daily.length / 6);
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) =>
    Math.round((maxValue / tickCount) * index),
  );

  function x(index: number): number {
    return marginLeft + index * slot + slot / 2;
  }
  function y(value: number): number {
    return marginTop + plotHeight - scaleValue(value, maxValue, plotHeight);
  }

  function pathFor(key: "newCustomers" | "newTouchpoints"): string {
    return daily
      .map(
        (day, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(day[key])}`,
      )
      .join(" ");
  }

  const active = activeIndex !== null ? daily[activeIndex] : undefined;
  const headingId = `${chartId}-growth-heading`;

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
        title="Crecimiento diario"
      />
      {showTable ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">
              Clientes y Touchpoints nuevos por día
            </caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th className="numeric" scope="col">
                  Clientes nuevos
                </th>
                <th className="numeric" scope="col">
                  Touchpoints nuevos
                </th>
              </tr>
            </thead>
            <tbody>
              {daily.map((day) => (
                <tr key={day.date}>
                  <td>{longDate(day.date)}</td>
                  <td className="numeric">{formatNumber(day.newCustomers)}</td>
                  <td className="numeric">
                    {formatNumber(day.newTouchpoints)}
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
              Clientes nuevos
            </li>
            <li>
              <span
                aria-hidden="true"
                className="chart-legend-swatch chart-legend-b"
              />
              Touchpoints nuevos
            </li>
          </ul>
          <div className="chart-scroll" ref={scrollRef}>
            <svg
              aria-label={`Crecimiento diario, del ${longDate(daily[0]?.date)} al ${longDate(daily[daily.length - 1]?.date)}`}
              height={svgHeight}
              role="img"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              width={svgWidth}
            >
              {ticks.map((tick) => {
                const tickY =
                  marginTop +
                  plotHeight -
                  scaleValue(tick, maxValue, plotHeight);
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
              <path
                d={pathFor("newTouchpoints")}
                fill="none"
                stroke="var(--aqua)"
                strokeWidth={2}
              />
              <path
                d={pathFor("newCustomers")}
                fill="none"
                stroke="var(--teal)"
                strokeWidth={2}
              />
              {daily.map((day, index) => (
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
                    width={slot}
                    x={marginLeft + index * slot}
                    y={marginTop}
                  >
                    <title>{`${longDate(day.date)}: ${formatNumber(day.newCustomers)} clientes nuevos, ${formatNumber(day.newTouchpoints)} Touchpoints nuevos.`}</title>
                  </rect>
                  <circle
                    cx={x(index)}
                    cy={y(day.newCustomers)}
                    fill="var(--teal)"
                    r={2.4}
                  />
                  <circle
                    cx={x(index)}
                    cy={y(day.newTouchpoints)}
                    fill="var(--aqua)"
                    r={2.4}
                  />
                  {index % labelStep === 0 ? (
                    <text
                      fill="var(--text-faint)"
                      fontSize={9}
                      textAnchor="middle"
                      x={x(index)}
                      y={svgHeight - 6}
                    >
                      {shortDate(day.date)}
                    </text>
                  ) : null}
                </g>
              ))}
            </svg>
          </div>
          {active ? (
            <div
              aria-live="polite"
              className="chart-tooltip-live"
              role="status"
            >
              <strong>{longDate(active.date)}</strong>
              <span>Clientes nuevos: {formatNumber(active.newCustomers)}</span>
              <span>
                Touchpoints nuevos: {formatNumber(active.newTouchpoints)}
              </span>
            </div>
          ) : (
            <p className="chart-tooltip-hint muted">
              Pasa el cursor o navega con tabulador sobre el día para ver el
              detalle.
            </p>
          )}
        </>
      )}
    </section>
  );
}
