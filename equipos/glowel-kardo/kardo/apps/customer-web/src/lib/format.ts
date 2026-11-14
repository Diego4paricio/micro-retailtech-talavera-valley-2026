import { getDatePreferences } from "./date-preferences.js";

const locale = "es-MX";

/**
 * The person's zone and hour format (Configuración → Preferencias), unless
 * `timeZone` is given explicitly — for the few readouts that must follow a
 * zone the person just picked on screen (Analítica/Resumen's «Horas en…»
 * selector, A9-25) instead of their general Preferencias.
 */
function dateOptions(timeZone?: string): Intl.DateTimeFormatOptions {
  const preferences = getDatePreferences();
  const zone = timeZone ?? preferences.timeZone;
  return {
    ...(zone ? { timeZone: zone } : {}),
    ...(preferences.hourCycle ? { hourCycle: preferences.hourCycle } : {}),
  };
}

export function formatDate(
  value: string | null | undefined,
  options?: { timeZone?: string | undefined },
): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    ...dateOptions(options?.timeZone),
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(
  value: string | null | undefined,
  options?: { timeZone?: string | undefined },
): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    ...dateOptions(options?.timeZone),
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** «13 oct», in the person's zone (QR prints, object steps). */
export function formatDayMonth(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    ...dateOptions(),
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

/** «13 oct, 12:41», in the person's zone and hour format. */
export function formatDayMonthTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    ...dateOptions(),
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/** A time of day in the person's format: «3:30 p. m.» or «15:30». */
export function formatTime(
  value: Date | string,
  options?: { timeZone?: string | undefined },
): string {
  return new Intl.DateTimeFormat(locale, {
    ...dateOptions(options?.timeZone),
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size)
      return formatter.format(Math.round(seconds / size), unit);
  }
  return "hace un momento";
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatPercent(part: number, total: number): string {
  if (!total) return "0 %";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(part / total);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function formatPrice(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

/** The tones of `StatusBadge`/`StatusText`; each domain's labels (domain
 * audit A2-72) live with their feature: `features/experiences/labels.ts`,
 * `features/touchpoints/labels.ts`, `features/leads/labels.ts`,
 * `features/assets/labels.ts` and `features/organization/role-labels.ts`. */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";
