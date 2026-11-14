import { useState } from "react";
import { Icon } from "../../components/Icon.js";
import {
  ALL_DAYS,
  BREAK_DEFAULT,
  dayAfter,
  defaultRow,
  formatHours,
  HOURS_ROWS_MAX,
  type HoursRow,
  hoursProblem,
  MON_FRI,
  MON_SAT,
  openDays,
  parseHours,
  rowDaysLabel,
  timeLabel,
  timeOptions,
  weekdays,
  withDistinctDay,
  withTemplate,
} from "./hours.js";
import "./hours-picker.css";

/** The three one-tap templates for the main schedule (relevo 37 C1a: the
 * day-by-day grid was the hardest part of «Tu negocio»). */
const TEMPLATES: { label: string; days: number[] }[] = [
  { label: "Lunes a viernes", days: MON_FRI },
  { label: "Lunes a sábado", days: MON_SAT },
  { label: "Todos los días", days: ALL_DAYS },
];

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((day, index) => day === b[index]);
}

/**
 * The hours, picked instead of typed (owner, 2026-10-03; one-tap templates
 * and «Cierro a mediodía», 2026-10-08): a template for the main days
 * («Lunes a viernes»…), a midday break, and «Un día distinto» for one more
 * day with its own hours (the Dra. Paola's case: L a V 9 a 14 y 16 a 20,
 * sábado 9 a 14, in four taps). `value` and `onChange` use the profile's
 * text (`formatHours`). A text the picker cannot read (written by hand
 * before) stays as it is until the owner picks a template.
 *
 *   <HoursPicker id="fs-hours" value={hours} onChange={setHours} />
 */
export function HoursPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [rows, setRows] = useState<HoursRow[]>(() => rowsFor(value));
  // Written by hand before: shown until replaced.
  const [legacy, setLegacy] = useState(() =>
    parseHours(value) === null ? value : "",
  );
  // The text these rows stand for. A different `value` comes from outside
  // (a form that resets when its dialog opens again): read it again.
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setRows(rowsFor(value));
    setLegacy(parseHours(value) === null ? value : "");
  }

  function emit(text: string) {
    setSynced(text);
    onChange(text);
  }
  function update(next: HoursRow[]) {
    setRows(next);
    const text = formatHours(next);
    if (text || !legacy) {
      setLegacy("");
      emit(text);
    }
  }
  function pickTemplate(days: readonly number[]) {
    update(withTemplate(rows, days));
  }
  function setTime(rowIndex: number, key: "open" | "close", time: string) {
    update(
      rows.map((row, index) =>
        index === rowIndex ? { ...row, [key]: time } : row,
      ),
    );
  }
  function toggleBreak(rowIndex: number) {
    update(
      rows.map((row, index) => {
        if (index !== rowIndex) return row;
        if (row.breakStart && row.breakEnd) {
          const { breakStart: _s, breakEnd: _e, ...rest } = row;
          return rest;
        }
        return {
          ...row,
          breakStart: BREAK_DEFAULT.start,
          breakEnd: BREAK_DEFAULT.end,
        };
      }),
    );
  }
  function setBreakTime(
    rowIndex: number,
    key: "breakStart" | "breakEnd",
    time: string,
  ) {
    update(
      rows.map((row, index) =>
        index === rowIndex ? { ...row, [key]: time } : row,
      ),
    );
  }
  function setDistinctDay(rowIndex: number, day: number) {
    update(withDistinctDay(rows, rowIndex, day));
  }
  function removeRow(rowIndex: number) {
    update(rows.filter((_, index) => index !== rowIndex));
  }
  function addDistinctDay() {
    const main = rows[0];
    const used = new Set(rows.flatMap((row) => row.days));
    let day = dayAfter(main?.days ?? []);
    for (let tries = 0; used.has(day) && tries < 7; tries += 1)
      day = (day + 1) % 7;
    update([
      ...rows,
      {
        days: [day],
        open: main?.open ?? "09:00",
        close: main?.breakStart ?? main?.close ?? "18:00",
      },
    ]);
  }

  const preview = formatHours(rows);
  // Two lists read «Cierra»; each one says its days (relevo 37, round 3:
  // Paola changed the wrong one and ended with «de 16:00 a 13:00»).
  const problem = hoursProblem(rows);
  const mainDays = rows[0]?.days ?? [];
  // The templates say which days it opens, different days included.
  const allDays = openDays(rows);

  return (
    <fieldset className="hours-picker" id={id}>
      <legend className="visually-hidden">Horario</legend>
      <div className="hours-templates">
        {TEMPLATES.map((template) => (
          <button
            aria-pressed={sameDays(allDays, template.days)}
            className="hours-chip"
            key={template.label}
            onClick={() => pickTemplate(template.days)}
            type="button"
          >
            {template.label}
          </button>
        ))}
      </div>
      {rows.map((row, rowIndex) => {
        // A day of the main schedule can be picked: it moves here. Not
        // one of another different day, nor the main one's only day.
        const usedByOthers = new Set(
          rows.flatMap((other, index) =>
            index === rowIndex || (index === 0 && other.days.length > 1)
              ? []
              : other.days,
          ),
        );
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows hold no state of their own
          <div className="hours-row" key={rowIndex}>
            {rowIndex > 0 ? (
              <label className="hours-distinct-day">
                <span className="hours-time-label">Día</span>
                <select
                  className="input"
                  onChange={(event) =>
                    setDistinctDay(rowIndex, Number(event.target.value))
                  }
                  value={row.days[0] ?? 0}
                >
                  {weekdays.map((day, dayIndex) => (
                    <option
                      disabled={usedByOthers.has(dayIndex)}
                      key={day.name}
                      value={dayIndex}
                    >
                      {capitalize(day.name)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="hours-times">
              <label>
                <span className="hours-time-label">Abre</span>
                <select
                  aria-label={`Abre ${dayWords(row)}`}
                  className="input"
                  onChange={(event) =>
                    setTime(rowIndex, "open", event.target.value)
                  }
                  value={row.open}
                >
                  {timeOptions.map((time) => (
                    <option key={time} value={time}>
                      {timeLabel(time)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="hours-time-label">Cierra</span>
                <select
                  aria-label={`Cierra ${dayWords(row)}`}
                  className="input"
                  onChange={(event) =>
                    setTime(rowIndex, "close", event.target.value)
                  }
                  value={row.close}
                >
                  {timeOptions.map((time) => (
                    <option key={time} value={time}>
                      {timeLabel(time)}
                    </option>
                  ))}
                </select>
              </label>
              {rowIndex > 0 ? (
                <button
                  aria-label="Quitar este horario"
                  className="icon-button"
                  onClick={() => removeRow(rowIndex)}
                  type="button"
                >
                  <Icon name="close" size={16} />
                </button>
              ) : null}
            </div>
            {row.breakStart && row.breakEnd ? (
              <div className="hours-break">
                <span>Cierro a mediodía de</span>
                <select
                  aria-label="Hora en que cierras a mediodía"
                  className="input"
                  onChange={(event) =>
                    setBreakTime(rowIndex, "breakStart", event.target.value)
                  }
                  value={row.breakStart}
                >
                  {timeOptions.map((time) => (
                    <option key={time} value={time}>
                      {timeLabel(time)}
                    </option>
                  ))}
                </select>
                <span>a</span>
                <select
                  aria-label="Hora en que vuelves a abrir"
                  className="input"
                  onChange={(event) =>
                    setBreakTime(rowIndex, "breakEnd", event.target.value)
                  }
                  value={row.breakEnd}
                >
                  {timeOptions.map((time) => (
                    <option key={time} value={time}>
                      {timeLabel(time)}
                    </option>
                  ))}
                </select>
                <button
                  aria-label="Quitar el cierre de mediodía"
                  className="icon-button"
                  onClick={() => toggleBreak(rowIndex)}
                  type="button"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            ) : (
              <button
                className="hours-chip hours-chip-add"
                onClick={() => toggleBreak(rowIndex)}
                type="button"
              >
                Cierro a mediodía
              </button>
            )}
          </div>
        );
      })}
      {rows.length < HOURS_ROWS_MAX && mainDays.length ? (
        <button
          className="link-button hours-add"
          onClick={addDistinctDay}
          type="button"
        >
          <Icon name="plus" size={15} /> Un día distinto
        </button>
      ) : null}
      <p aria-live="polite" className="hours-preview">
        {legacy ? (
          <>
            Ahora dice: «{legacy}». Elige los días para cambiarlo.{" "}
            <button
              className="link-button"
              onClick={() => {
                setLegacy("");
                emit("");
              }}
              type="button"
            >
              Quitar
            </button>
          </>
        ) : preview ? (
          <>Se verá así: «{preview}»</>
        ) : (
          "Elige cuándo abres."
        )}
      </p>
      {problem ? (
        <p className="field-error" role="alert">
          {problem}
        </p>
      ) : null}
    </fieldset>
  );
}

/** «el sábado», «de lunes a viernes»: who a row's lists are for. */
function dayWords(row: HoursRow): string {
  const days = rowDaysLabel(row);
  if (!days) return "";
  return row.days.length === 1
    ? `el ${days}`
    : days === "todos los días"
      ? days
      : `de ${days}`;
}

function rowsFor(value: string): HoursRow[] {
  const parsed = parseHours(value);
  return parsed?.length ? parsed : [defaultRow()];
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
