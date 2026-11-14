import { describeRange } from "../metrics.js";

/**
 * Words of the Resumen header: the greeting for the time of day, the line
 * that supports the title and the period pill ("22 – 28 sep 2026" and, in
 * a second tone, what it is compared with).
 */

/** 5:00–11:59 mañana, 12:00–18:59 tarde, 19:00–4:59 noche. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

/**
 * The name the person chose to be shown as ("Nombre visible"), tidied up.
 * It is used whole: compound first names ("María José") are common and a
 * first-word cut would get them wrong.
 */
export function cleanDisplayName(
  displayName: string | null | undefined,
): string | null {
  const name = (displayName ?? "").replace(/\s+/g, " ").trim();
  return name ? name : null;
}

/** The warm line under the title, with the organization's name. */
export function supportLine(workspace: {
  name: string;
  kind: "personal" | "organization";
}): string {
  const name = workspace.name.replace(/\s+/g, " ").trim();
  return workspace.kind === "organization" && name
    ? `Así se mueven tus QR y etiquetas en ${name}.`
    : "Así se mueven tus QR y etiquetas.";
}

// ---------------------------------------------------------------------------
// Period pill
// ---------------------------------------------------------------------------

/** Fixed abbreviations: the same on every browser and ICU version. */
const shortMonths = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

const DAY_MS = 86_400_000;

/** A calendar day key (YYYY-MM-DD) as a UTC midnight. */
function dayAt(key: string, offsetDays = 0): Date | null {
  const date = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date;
}

const month = (date: Date) => shortMonths[date.getUTCMonth()] ?? "";

/**
 * "22 – 28 sep 2026", "29 ago – 27 sep 2026" or, across years,
 * "15 dic 2025 – 12 ene 2026". `withYear: false` drops the year when both
 * ends share it (the comparison, next to a range that already says it).
 */
export function formatDayRange(from: Date, to: Date, withYear = true): string {
  const fromYear = from.getUTCFullYear();
  const toYear = to.getUTCFullYear();
  const year = withYear ? ` ${toYear}` : "";
  if (fromYear !== toYear)
    return `${from.getUTCDate()} ${month(from)} ${fromYear} – ${to.getUTCDate()} ${month(to)} ${toYear}`;
  if (from.getTime() === to.getTime())
    return `${to.getUTCDate()} ${month(to)}${year}`;
  if (from.getUTCMonth() === to.getUTCMonth())
    return `${from.getUTCDate()} – ${to.getUTCDate()} ${month(to)}${year}`;
  return `${from.getUTCDate()} ${month(from)} – ${to.getUTCDate()} ${month(to)}${year}`;
}

export type PeriodLabels = {
  /** "22 – 28 sep 2026" */
  current: string;
  /** "vs. 15 – 21 sep" */
  previous: string;
  /** The whole sentence, for assistive tech. */
  spoken: string;
};

/**
 * The pill's words for a summary's calendar days (`first`…`last`), compared
 * with the same number of days right before. Without days (the numbers of
 * a new filter are still loading), it names the period by its length.
 */
export function periodLabels(
  days: number,
  first: string | null | undefined,
  last: string | null | undefined,
): PeriodLabels {
  const from = first ? dayAt(first) : null;
  const to = last ? dayAt(last) : null;
  if (!from || !to || to < from)
    return {
      current: `Últimos ${days} días`,
      previous: `vs. ${days} días anteriores`,
      spoken: `Últimos ${days} días, comparado con los ${days} días anteriores.`,
    };
  const length = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  const previousTo = new Date(from.getTime() - DAY_MS);
  const previousFrom = new Date(from.getTime() - length * DAY_MS);
  const sameYear =
    previousFrom.getUTCFullYear() === to.getUTCFullYear() &&
    previousTo.getUTCFullYear() === to.getUTCFullYear();
  const spokenRange = describeRange(from, to);
  return {
    current: formatDayRange(from, to),
    previous: `vs. ${formatDayRange(previousFrom, previousTo, !sameYear)}`,
    spoken: `${spokenRange.charAt(0).toUpperCase()}${spokenRange.slice(1)}, comparado con el periodo ${describeRange(previousFrom, previousTo)}.`,
  };
}
