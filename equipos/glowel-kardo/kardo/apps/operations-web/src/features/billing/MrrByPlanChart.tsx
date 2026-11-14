import type { StaffBillingOverview } from "@kardo/contracts";
import { useId, useRef, useState } from "react";
import { SectionHeading } from "../../components/PageHeader.js";
import { barWidthFor, scaleValue } from "../../lib/chart-scale.js";
import { formatNumber } from "../../lib/format.js";
import { useElementWidth } from "../../lib/use-element-width.js";
import { formatMoney, niceCeil } from "./format.js";

type PlanRow = StaffBillingOverview["byPlan"][number];

const marginLeft = 74;
const marginRight = 12;
const marginTop = 12;
const marginBottom = 56;
const svgHeight = 280;
const tickCount = 4;

function planLabel(row: PlanRow): string {
  return row.planName ?? row.planCode ?? "Sin plan";
}

/** MRR per plan: one vertical bar each, with titled axes and units. */
export function MrrByPlanChart({
  byPlan,
  currency,
}: {
  byPlan: PlanRow[];
  currency: string;
}) {
  const chartId = useId();
  const headingId = `${chartId}-heading`;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerWidth = useElementWidth(scrollRef, 640);

  const rows = byPlan.filter((row) => row.subscriptions > 0 || row.mrr > 0);
  const maxPesos = niceCeil(Math.max(0, ...rows.map((row) => row.mrr / 100)));
  const ticks = Array.from(
    { length: tickCount + 1 },
    (_, index) => (maxPesos / tickCount) * index,
  );
  const svgWidth = Math.max(containerWidth, marginLeft + rows.length * 72);
  const plotWidth = svgWidth - marginLeft - marginRight;
  const plotHeight = svgHeight - marginTop - marginBottom;
  const slot = rows.length ? plotWidth / rows.length : 0;
  const barWidth = barWidthFor(slot, 0.55, 8, 64);

  const active = activeIndex !== null ? rows[activeIndex] : undefined;
  const unit = currency.toUpperCase();

  return (
    <section aria-labelledby={headingId} className="panel chart-panel">
      <SectionHeading
        actions={
          rows.length ? (
            <button
              aria-pressed={showTable}
              className="button button-secondary button-small"
              onClick={() => setShowTable((current) => !current)}
              type="button"
            >
              {showTable ? "Ver gráfica" : "Ver como tabla"}
            </button>
          ) : null
        }
        description="Ingreso mensual recurrente normalizado (los planes anuales se dividen entre 12), con IVA incluido."
        id={headingId}
        title="MRR por plan"
      />
      {rows.length === 0 ? (
        <p className="muted">Todavía no hay suscripciones que generen MRR.</p>
      ) : showTable ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">MRR por plan</caption>
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th className="numeric" scope="col">
                  Suscripciones
                </th>
                <th className="numeric" scope="col">
                  MRR ({unit} / mes)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.planCode ?? "sin-plan"}>
                  <td>{planLabel(row)}</td>
                  <td className="numeric">{formatNumber(row.subscriptions)}</td>
                  <td className="numeric">{formatMoney(row.mrr, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="chart-scroll" ref={scrollRef}>
            <svg
              aria-label={`MRR por plan en ${unit} al mes`}
              height={svgHeight}
              role="img"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              width={svgWidth}
            >
              {ticks.map((tick) => {
                const tickY =
                  marginTop +
                  plotHeight -
                  scaleValue(tick, maxPesos, plotHeight);
                return (
                  <g key={tick}>
                    <line
                      stroke="var(--line)"
                      strokeWidth={1}
                      x1={marginLeft}
                      x2={svgWidth - marginRight}
                      y1={tickY}
                      y2={tickY}
                    />
                    <text
                      fill="var(--text-faint)"
                      fontSize={10}
                      textAnchor="end"
                      x={marginLeft - 8}
                      y={tickY + 3}
                    >
                      {formatMoney(Math.round(tick * 100), currency)}
                    </text>
                  </g>
                );
              })}
              {rows.map((row, index) => {
                const height = scaleValue(row.mrr / 100, maxPesos, plotHeight);
                const centerX = marginLeft + index * slot + slot / 2;
                return (
                  <g key={row.planCode ?? "sin-plan"}>
                    <rect
                      fill="var(--teal)"
                      height={height}
                      opacity={
                        activeIndex === null || activeIndex === index ? 1 : 0.55
                      }
                      width={barWidth}
                      x={centerX - barWidth / 2}
                      y={marginTop + plotHeight - height}
                    />
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
                      <title>{`${planLabel(row)}: ${formatMoney(row.mrr, currency)} al mes, ${formatNumber(row.subscriptions)} suscripciones.`}</title>
                    </rect>
                    <text
                      fill="var(--text)"
                      fontSize={11}
                      fontWeight={700}
                      textAnchor="middle"
                      x={centerX}
                      y={marginTop + plotHeight + 16}
                    >
                      {planLabel(row)}
                    </text>
                  </g>
                );
              })}
              <line
                stroke="var(--line-cool)"
                x1={marginLeft}
                x2={svgWidth - marginRight}
                y1={marginTop + plotHeight}
                y2={marginTop + plotHeight}
              />
              <text
                fill="var(--text-muted)"
                fontSize={11}
                textAnchor="middle"
                x={marginLeft + plotWidth / 2}
                y={svgHeight - 8}
              >
                Plan
              </text>
              <text
                fill="var(--text-muted)"
                fontSize={11}
                textAnchor="middle"
                transform={`rotate(-90) translate(${-(marginTop + plotHeight / 2)} 14)`}
              >
                {`MRR (${unit} por mes)`}
              </text>
            </svg>
          </div>
          {active ? (
            <div
              aria-live="polite"
              className="chart-tooltip-live"
              role="status"
            >
              <strong>{planLabel(active)}</strong>
              <span>
                MRR: {formatMoney(active.mrr, currency, { withCode: true })} al
                mes
              </span>
              <span>Suscripciones: {formatNumber(active.subscriptions)}</span>
            </div>
          ) : (
            <p className="chart-tooltip-hint muted">
              Pasa el cursor o navega con tabulador sobre una barra para ver el
              detalle.
            </p>
          )}
        </>
      )}
    </section>
  );
}
