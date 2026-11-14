/**
 * Zone and hour format for every date the panel shows (ADR 023). Kept apart
 * from the profile store so `format.ts` stays a pure module; `undefined`
 * means the browser's own.
 */
export type DatePreferences = {
  timeZone: string | undefined;
  hourCycle: "h12" | "h23" | undefined;
};

let current: DatePreferences = { timeZone: undefined, hourCycle: undefined };

export function getDatePreferences(): DatePreferences {
  return current;
}

export function setDatePreferences(next: DatePreferences) {
  current = next;
}
