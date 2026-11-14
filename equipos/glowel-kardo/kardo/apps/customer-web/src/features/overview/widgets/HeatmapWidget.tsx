import { Fragment, type KeyboardEvent, useId, useState } from "react";
import { formatNumber } from "../../../lib/format.js";
import type { WidgetRenderProps } from "../dashboard/types.js";
import {
  busiestCell,
  weekdayInitials,
  weekdayNames,
  weekdayShortLabels,
} from "./charts/aggregate.js";
import { heatStep } from "./charts/shapes.js";

type Cell = { day: number; hour: number };

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}h`;
}

/** A gallery/editor preview (~160–270 px total) has no room for 8 hour
 * labels: just the day's edges and midday, so the grid still reads as a
 * clock without the header row crowding into the cells. */
const previewHourMarks = new Set([0, 11, 23]);

/**
 * Accesses by weekday × hour — Kardo's original heatmap, colored with the
 * landing's 5-tone teal ramp instead of a single blended hue. One tab stop;
 * the arrow keys move across days and hours.
 */
export function HeatmapWidget({ context, preview }: WidgetRenderProps) {
  const matrix = context.data.weekdayHour;
  const hasData = Boolean(
    matrix?.some((row) => row.some((value) => value > 0)),
  );

  if (!context.engineAvailable)
    return (
      <p className="kw-empty">Disponible cuando vuelva la analítica en vivo.</p>
    );
  if (!matrix || !hasData)
    return (
      <p className="kw-empty">
        Sin accesos en este periodo. Aquí verás qué días y horas se usan más tus
        QR y etiquetas.
      </p>
    );

  return <HeatmapBody data={matrix} preview={preview} />;
}

function HeatmapBody({
  data,
  preview,
}: {
  data: readonly (readonly number[])[];
  preview?: boolean | undefined;
}) {
  const id = useId();
  const [active, setActive] = useState<Cell | null>(null);
  const max = Math.max(1, ...data.flat());
  const busiest = busiestCell(data);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const current = active ?? { day: 0, hour: 0 };
    const moves: Record<string, Cell> = {
      ArrowRight: { day: current.day, hour: Math.min(23, current.hour + 1) },
      ArrowLeft: { day: current.day, hour: Math.max(0, current.hour - 1) },
      ArrowDown: { day: Math.min(6, current.day + 1), hour: current.hour },
      ArrowUp: { day: Math.max(0, current.day - 1), hour: current.hour },
      Home: { day: current.day, hour: 0 },
      End: { day: current.day, hour: 23 },
    };
    if (event.key === "Escape") {
      setActive(null);
      return;
    }
    const next = moves[event.key];
    if (!next) return;
    event.preventDefault();
    setActive(next);
  }

  const activeValue = active ? (data[active.day]?.[active.hour] ?? 0) : 0;

  return (
    <div className="kw-fill-col">
      <figure
        aria-describedby={preview ? undefined : `${id}-readout`}
        aria-label="Mapa de actividad. Usa las flechas para recorrer días y horas."
        className="kw-fill kw-heatmap-frame"
        onBlur={() => setActive(null)}
        onFocus={() => setActive((current) => current ?? { day: 0, hour: 0 })}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setActive(null)}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: one tab stop to explore the heatmap with the arrow keys
        tabIndex={0}
      >
        <div
          aria-hidden="true"
          className={preview ? "kw-heatmap kw-heatmap-preview" : "kw-heatmap"}
        >
          <span className="kw-heatmap-corner" />
          {Array.from({ length: 24 }, (_, hour) => {
            const shown = preview ? previewHourMarks.has(hour) : hour % 3 === 0;
            // The first and last hour columns butt right against the
            // frame's edges in the cramped preview: centering "23h" there
            // would clip its "h" against the frame, so the edge marks hug
            // inward instead of centering over their (barely-there) column.
            const align =
              preview && hour === 0
                ? "flex-start"
                : preview && hour === 23
                  ? "flex-end"
                  : undefined;
            return (
              <span
                className="kw-heatmap-hour"
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed 24-hour columns
                key={hour}
                style={align ? { justifyContent: align } : undefined}
              >
                {shown ? hourLabel(hour) : ""}
              </span>
            );
          })}
          {weekdayShortLabels.map((label, day) => (
            <Fragment key={label}>
              <span className="kw-heatmap-day">
                {preview ? weekdayInitials[day] : label}
              </span>
              {(data[day] ?? []).map((value, hour) => {
                const isActive = active?.day === day && active.hour === hour;
                const style =
                  value === 0
                    ? undefined
                    : { background: heatStep(value / max) };
                return (
                  <span
                    className={[
                      "kw-heat-cell",
                      value === 0 ? "kw-heat-cell-empty" : "",
                      isActive ? "kw-heat-cell-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed 24-hour columns
                    key={hour}
                    onPointerEnter={() => setActive({ day, hour })}
                    style={style}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </figure>
      <div className="kw-heatmap-footer">
        {preview ? null : (
          <p aria-live="polite" className="chart-hint" id={`${id}-readout`}>
            {active
              ? `${weekdayNames[active.day]} a las ${hourLabel(active.hour)}: ${formatNumber(activeValue)} ${activeValue === 1 ? "acceso" : "accesos"}.`
              : busiest
                ? `Más actividad: ${weekdayNames[busiest.day]} a las ${hourLabel(busiest.hour)}.`
                : "Pasa el cursor o usa las flechas para ver cada franja."}
          </p>
        )}
        <div aria-hidden="true" className="kw-heat-scale">
          <span>Menos</span>
          <span className="kw-heat-scale-ramp" />
          <span>Más</span>
        </div>
      </div>
      {/* A `<table>` can't itself shrink to 1 px (auto layout keeps its
          min-content width, 25 columns here), so the div — not the table —
          carries `.visually-hidden`: it clips the table instead of leaving
          it full width and forcing a horizontal scrollbar on a phone. */}
      <div className="visually-hidden">
        <table>
          <caption>Accesos por día de la semana y hora</caption>
          <thead>
            <tr>
              <th scope="col">Día</th>
              {Array.from({ length: 24 }, (_, hour) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed 24-hour columns
                <th key={hour} scope="col">
                  {hour}h
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weekdayShortLabels.map((label, day) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {(data[day] ?? []).map((value, hour) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed 24-hour columns
                  <td key={hour}>{formatNumber(value)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
