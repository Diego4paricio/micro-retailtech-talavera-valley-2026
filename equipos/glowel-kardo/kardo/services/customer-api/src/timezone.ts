/**
 * Resolves a customer-supplied `tz` query parameter to a safe IANA time
 * zone, falling back to UTC for anything unrecognized (never throws — a bad
 * `tz` degrades to UTC bucketing rather than a 400). Validated first against
 * `Intl.supportedValuesOf("timeZone")` where available (Node 22 has it),
 * else by trying to actually construct a formatter with it, since an
 * IANA time zone accepted by `Intl.DateTimeFormat` is exactly the set of
 * values safe to use below.
 */
export function resolveTimeZone(candidate: string | undefined): string {
  if (!candidate) return "UTC";
  if (isSupportedTimeZone(candidate)) return candidate;
  return "UTC";
}

function isSupportedTimeZone(candidate: string): boolean {
  try {
    const supportedValuesOf = (
      Intl as unknown as {
        supportedValuesOf?: (key: string) => string[];
      }
    ).supportedValuesOf;
    if (typeof supportedValuesOf === "function") {
      return supportedValuesOf("timeZone").includes(candidate);
    }
  } catch {
    // Fall through to the constructor probe below.
  }
  try {
    const probe = new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return Boolean(probe);
  } catch {
    return false;
  }
}

export type LocalHourParts = {
  /** `YYYY-MM-DD` in the target time zone. */
  dateKey: string;
  /** 0 = Monday .. 6 = Sunday, in the target time zone. */
  weekday: number;
  /** 0-23, in the target time zone. */
  hour: number;
};

const WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Decomposes a UTC instant into its local calendar date, weekday
 * (Monday-first) and hour in `timeZone`, using `Intl` so DST and
 * fractional-hour offsets are handled correctly without manual math. */
export function localHourParts(date: Date, timeZone: string): LocalHourParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    parts[part.type] = part.value;
  }
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  // Some ICU builds render midnight as "24" with hour12:false.
  const rawHour = Number(parts.hour ?? "0");
  const hour = rawHour === 24 ? 0 : rawHour;
  const weekday = WEEKDAY_ORDER.indexOf(parts.weekday ?? "");
  return { dateKey, weekday: weekday >= 0 ? weekday : 0, hour };
}

/** Shifts a `YYYY-MM-DD` calendar-date string by `days` (may be negative).
 * Pure calendar arithmetic — not tied to any time zone or instant. */
export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
