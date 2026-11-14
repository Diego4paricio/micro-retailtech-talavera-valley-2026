import { WORKSPACE_PROFILE_HOURS_MAX } from "@kardo/contracts";
import { foldText } from "../../lib/text.js";

/**
 * The organization's hours, picked instead of typed (owner, 2026-10-03;
 * one-tap templates and a mid-day break, 2026-10-08): days and an opening
 * and closing time, an optional mid-day break («Cierro a mediodía») and
 * another schedule for one different day («Un día distinto»). The profile
 * keeps the text the templates and the AI already read («Lunes a viernes,
 * de 9:00 a 14:00 y de 16:00 a 20:00; sábado, de 9:00 a 14:00»), so there
 * is no contract change; `parseHours` reads it back to edit it, and also
 * the shorter texts written before the mid-day break existed.
 */

/** Monday first, as schedules are written in Mexico. */
export const weekdays = [
  { short: "L", name: "lunes", abbr: "lun" },
  { short: "M", name: "martes", abbr: "mar" },
  { short: "M", name: "miércoles", abbr: "mié" },
  { short: "J", name: "jueves", abbr: "jue" },
  { short: "V", name: "viernes", abbr: "vie" },
  { short: "S", name: "sábado", abbr: "sáb" },
  { short: "D", name: "domingo", abbr: "dom" },
] as const;

/** `days` are indexes in `weekdays`; times are "HH:MM", 24 h. A row with
 * both `breakStart` and `breakEnd` closes for lunch between the two
 * (two ranges in the profile text instead of one). */
export type HoursRow = {
  days: number[];
  open: string;
  close: string;
  breakStart?: string;
  breakEnd?: string;
};

export const HOURS_ROWS_MAX = 3;
export const defaultRow = (days: number[] = []): HoursRow => ({
  days,
  open: "09:00",
  close: "18:00",
});

/** The three one-tap day templates for the main schedule (2026-10-07
 * study: grouping days by hand was the hardest part of «Tu negocio»). */
export const MON_FRI = [0, 1, 2, 3, 4];
export const MON_SAT = [0, 1, 2, 3, 4, 5];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** «Cierro a mediodía»'s starting guess: a two-hour midday break. */
export const BREAK_DEFAULT = { start: "14:00", end: "16:00" } as const;

/** The day right after the last one in `days`, «Un día distinto»'s guess
 * (Saturday, after a Monday-to-Friday week). Falls back to Saturday when
 * no day is chosen yet. */
export function dayAfter(days: readonly number[]): number {
  if (!days.length) return 5;
  return (Math.max(...days) + 1) % 7;
}

/** Every half hour of the day, for the opening and closing lists. */
export const timeOptions: string[] = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  return `${hours}:${index % 2 ? "30" : "00"}`;
});

/** "09:00" → "9:00". */
export function timeLabel(time: string): string {
  return time.replace(/^0(\d)/, "$1");
}

function daysText(days: readonly number[], short: boolean): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "todos los días";
  const name = (day: number) =>
    short ? (weekdays[day]?.abbr ?? "") : (weekdays[day]?.name ?? "");
  // Three or more days in a row read «lunes a viernes».
  const runs: number[][] = [];
  for (const day of sorted) {
    const run = runs.at(-1);
    if (run && run.at(-1) === day - 1) run.push(day);
    else runs.push([day]);
  }
  const parts = runs.flatMap((run) =>
    run.length >= 3
      ? [`${name(run[0] ?? 0)} a ${name(run.at(-1) ?? 0)}`]
      : run.map(name),
  );
  if (parts.length === 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
}

type HoursRange = { open: string; close: string };

/** The one or two open-close ranges a row stands for: two when it closes
 * for lunch (`breakStart`/`breakEnd`). */
function rowRanges(row: HoursRow): HoursRange[] {
  if (row.breakStart && row.breakEnd)
    return [
      { open: row.open, close: row.breakStart },
      { open: row.breakEnd, close: row.close },
    ];
  return [{ open: row.open, close: row.close }];
}

function rangeText(range: HoursRange, short: boolean): string {
  return `${short ? "" : "de "}${timeLabel(range.open)} a ${timeLabel(range.close)}`;
}

function rowText(row: HoursRow, short: boolean): string {
  const ranges = rowRanges(row)
    .map((range) => rangeText(range, short))
    .join(" y ");
  return `${daysText(row.days, short)}, ${ranges}`;
}

/** The profile text for the rows with days; "" when there are none. Falls
 * back to short day names if the full text does not fit. */
export function formatHours(rows: readonly HoursRow[]): string {
  const used = rows.filter((row) => row.days.length > 0);
  if (!used.length) return "";
  for (const short of [false, true]) {
    const text = used.map((row) => rowText(row, short)).join("; ");
    const sentence = text.charAt(0).toUpperCase() + text.slice(1);
    if (sentence.length <= WORKSPACE_PROFILE_HOURS_MAX || short)
      return sentence.slice(0, WORKSPACE_PROFILE_HOURS_MAX);
  }
  return "";
}

const fold = foldText;

const dayIndex = new Map<string, number>();
weekdays.forEach((day, index) => {
  for (const key of [day.name, day.abbr]) dayIndex.set(fold(key), index);
});
// Also «lu», «mi», «sa», and the dotted abbreviations people write.
for (const [key, index] of [
  ["lu", 0],
  ["mi", 2],
  ["mie", 2],
  ["ju", 3],
  ["vi", 4],
  ["sa", 5],
  ["do", 6],
] as const)
  dayIndex.set(key, index);

function parseDays(text: string): number[] | null {
  const folded = fold(text).replace(/\./g, "");
  if (folded === "todos los dias" || folded === "diario")
    return [0, 1, 2, 3, 4, 5, 6];
  const days: number[] = [];
  for (const token of folded.split(/\s*,\s*|\s+y\s+/)) {
    if (!token) return null;
    const range = token.match(/^(\S+)\s+a\s+(\S+)$/);
    if (range) {
      const from = dayIndex.get(range[1] ?? "");
      const to = dayIndex.get(range[2] ?? "");
      if (from === undefined || to === undefined || to < from) return null;
      for (let day = from; day <= to; day += 1) days.push(day);
      continue;
    }
    const day = dayIndex.get(token);
    if (day === undefined) return null;
    days.push(day);
  }
  return days.length ? [...new Set(days)].sort((a, b) => a - b) : null;
}

function parseTime(text: string): string | null {
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || (minutes !== 0 && minutes !== 30)) return null;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

/**
 * The rows of a text written by `formatHours` (or close to it, like
 * «Lun a sáb, 8:00 a 17:00», or with a midday break, «Lunes a viernes, de
 * 9:00 a 14:00 y de 16:00 a 20:00»); null when it reads otherwise, so the
 * picker keeps the owner's text until they pick new hours.
 */
export function parseHours(text: string): HoursRow[] | null {
  if (!text.trim()) return [];
  const rows: HoursRow[] = [];
  for (const part of text.split(";")) {
    const match = part
      .trim()
      .match(
        /^(.+?),\s*(?:de\s+)?(\d{1,2}:\d{2})\s+a\s+(\d{1,2}:\d{2})(?:\s+y\s+(?:de\s+)?(\d{1,2}:\d{2})\s+a\s+(\d{1,2}:\d{2}))?$/i,
      );
    if (!match) return null;
    const days = parseDays(match[1] ?? "");
    const open = parseTime(match[2] ?? "");
    const midClose = parseTime(match[3] ?? "");
    if (!days || !open || !midClose) return null;
    if (match[4] && match[5]) {
      const reopen = parseTime(match[4]);
      const close = parseTime(match[5]);
      if (!reopen || !close) return null;
      rows.push({ days, open, close, breakStart: midClose, breakEnd: reopen });
    } else {
      rows.push({ days, open, close: midClose });
    }
  }
  return rows.length <= HOURS_ROWS_MAX ? rows : null;
}

/** Every day the schedule opens, all rows together, sorted: what the
 * templates («Lunes a sábado»…) light up. */
export function openDays(rows: readonly HoursRow[]): number[] {
  return [...new Set(rows.flatMap((row) => row.days))].sort((a, b) => a - b);
}

/**
 * A day template for the main schedule. The days that already have hours of
 * their own («Un día distinto») keep them and leave the main row; a
 * different day outside the template goes (the business does not open it).
 */
export function withTemplate(
  rows: readonly HoursRow[],
  template: readonly number[],
): HoursRow[] {
  const [main = defaultRow(), ...others] = rows;
  const kept = others.filter((row) =>
    row.days.every((day) => template.includes(day)),
  );
  const own = new Set(kept.flatMap((row) => row.days));
  const days = template.filter((day) => !own.has(day));
  if (!days.length) return [{ ...main, days: [...template] }];
  return [{ ...main, days }, ...kept];
}

/**
 * «Un día distinto» set to `day`: that day leaves every other row, so it is
 * never in two schedules (relevo 37, round 3, second pass: Paola picked
 * «Lunes a sábado», then «sábado» as her different day, and her profile
 * said Saturday twice). A row left with no days goes, except the main one.
 */
export function withDistinctDay(
  rows: readonly HoursRow[],
  rowIndex: number,
  day: number,
): HoursRow[] {
  return rows.flatMap((row, index) => {
    if (index === rowIndex) return [{ ...row, days: [day] }];
    const days = row.days.filter((other) => other !== day);
    if (days.length) return [{ ...row, days }];
    return index === 0 ? [row] : [];
  });
}

/** The days of a row in words, for labels («lunes a viernes», «sábado»). */
export function rowDaysLabel(row: Pick<HoursRow, "days">): string {
  return daysText(row.days, false);
}

/**
 * What does not make sense in a schedule, said plainly (relevo 37, round 3:
 * Paola ended with «de 16:00 a 13:00» and nothing told her). Null when every
 * row reads well.
 */
export function hoursProblem(rows: readonly HoursRow[]): string | null {
  const seen = new Set<number>();
  for (const day of rows.flatMap((row) => row.days)) {
    if (seen.has(day))
      return `El ${weekdays[day]?.name ?? "día"} aparece dos veces. Déjalo en un solo horario.`;
    seen.add(day);
  }
  for (const row of rows) {
    if (!row.days.length) continue;
    const days = daysText(row.days, false);
    if (row.close <= row.open) return `Revisa ${days}: cierras antes de abrir.`;
    if (row.breakStart && row.breakEnd) {
      if (row.breakEnd <= row.breakStart)
        return `Revisa ${days}: la comida termina antes de empezar.`;
      if (row.breakStart <= row.open || row.breakEnd >= row.close)
        return `Revisa ${days}: la comida va entre la hora de abrir y la de cerrar.`;
    }
  }
  return null;
}
