import type { AnalyticsSummary } from "@kardo/contracts";

const locale = "es-MX";

const dayMonth = new Intl.DateTimeFormat(locale, {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const dayOnly = new Intl.DateTimeFormat(locale, {
  day: "numeric",
  timeZone: "UTC",
});

function dateAt(key: string, offsetDays = 0): Date {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date;
}

/** "del 21 al 27 de septiembre" / "del 29 de agosto al 27 de septiembre". */
export function describeRange(from: Date, to: Date): string {
  const sameMonth =
    from.getUTCMonth() === to.getUTCMonth() &&
    from.getUTCFullYear() === to.getUTCFullYear();
  return sameMonth
    ? `del ${dayOnly.format(from)} al ${dayMonth.format(to)}`
    : `del ${dayMonth.format(from)} al ${dayMonth.format(to)}`;
}

/** The dateline under the title, from the summary's own calendar days. */
export function describePeriod(data: AnalyticsSummary): string {
  const first = data.daily[0]?.date;
  const last = data.daily[data.daily.length - 1]?.date;
  if (!first || !last) return `Últimos ${data.days} días`;
  const range = describeRange(dateAt(first), dateAt(last));
  return `${range.charAt(0).toUpperCase()}${range.slice(1)}, comparado con los ${data.days} días anteriores.`;
}
