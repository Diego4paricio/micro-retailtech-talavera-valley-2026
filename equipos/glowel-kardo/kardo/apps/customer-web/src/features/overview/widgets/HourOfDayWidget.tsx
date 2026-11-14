import { type KeyboardEvent, useId, useState } from "react";
import { formatNumber } from "../../../lib/format.js";
import type { WidgetRenderProps } from "../dashboard/types.js";
import { sumHourOfDay } from "./charts/aggregate.js";
import { heatStep } from "./charts/shapes.js";

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Accesses by hour of day, summed across the whole period — the landing's
 * "Actividad por hora" strip, colored with the teal ramp. */
export function HourOfDayWidget({ context, preview }: WidgetRenderProps) {
  const hours = sumHourOfDay(context.data.weekdayHour);
  const total = hours.reduce((sum, value) => sum + value, 0);

  if (!context.engineAvailable)
    return (
      <p className="kw-empty">Disponible cuando vuelva la analítica en vivo.</p>
    );
  if (total === 0)
    return <p className="kw-empty">Sin accesos en este periodo.</p>;

  return <HourOfDayBody hours={hours} preview={preview} />;
}

function HourOfDayBody({
  hours,
  preview,
}: {
  hours: number[];
  preview?: boolean | undefined;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...hours);
  const total = hours.reduce((sum, value) => sum + value, 0);
  const peak = hours.reduce(
    (best, value, hour) => (value > (hours[best] ?? 0) ? hour : best),
    0,
  );

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const current = active ?? peak;
    const next =
      event.key === "ArrowRight"
        ? Math.min(23, current + 1)
        : event.key === "ArrowLeft"
          ? Math.max(0, current - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? 23
              : null;
    if (event.key === "Escape") setActive(null);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
  }

  return (
    <div className="kw-fill-col">
      <figure
        aria-describedby={preview ? undefined : `${id}-readout`}
        aria-label="Accesos por hora del día. Recorre las horas con las flechas."
        className="kw-fill kw-strip-frame"
        onBlur={() => setActive(null)}
        onFocus={() => setActive((value) => value ?? peak)}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setActive(null)}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: one tab stop to explore the strip with the arrow keys
        tabIndex={0}
      >
        <ol aria-hidden="true" className="kw-strip">
          {hours.map((value, hour) => (
            <li
              className={
                hour === active
                  ? "kw-strip-cell kw-strip-cell-active"
                  : "kw-strip-cell"
              }
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed 24-hour columns
              key={hour}
              onPointerEnter={() => setActive(hour)}
              style={
                value > 0 ? { background: heatStep(value / max) } : undefined
              }
            />
          ))}
        </ol>
        <div aria-hidden="true" className="kw-strip-axis">
          <span>00:00</span>
          <span>12:00</span>
          <span>23:00</span>
        </div>
      </figure>
      <div className="kw-heatmap-footer">
        {preview ? null : (
          <p aria-live="polite" className="chart-hint" id={`${id}-readout`}>
            {active !== null
              ? `${hourLabel(active)}: ${formatNumber(hours[active] ?? 0)} ${(hours[active] ?? 0) === 1 ? "acceso" : "accesos"}.`
              : `Hora con más accesos: ${hourLabel(peak)}, con ${formatNumber(hours[peak] ?? 0)}.`}
          </p>
        )}
        <div aria-hidden="true" className="kw-heat-scale">
          <span>Menos</span>
          <span className="kw-heat-scale-ramp" />
          <span>Más</span>
        </div>
      </div>
      {/* A `<table>` never actually shrinks to 1 px (auto layout keeps its
          min-content width): the div, not the table, carries
          `.visually-hidden` so it clips the table instead of leaving it at
          its natural width and forcing a horizontal scrollbar on a phone. */}
      <div className="visually-hidden">
        <table>
          <caption>Accesos por hora del día</caption>
          <thead>
            <tr>
              <th scope="col">Hora</th>
              <th scope="col">Accesos</th>
            </tr>
          </thead>
          <tbody>
            {hours.map((value, hour) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed 24-hour columns
              <tr key={hour}>
                <td>{hourLabel(hour)}</td>
                <td>{formatNumber(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="visually-hidden">{formatNumber(total)} accesos en total.</p>
    </div>
  );
}
