/**
 * A write on a limited or paused organization answers `403 PLAN_REQUIRED`
 * (ADR 020). `lib/api.ts` announces it here and the shell shows one dialog,
 * so no screen has to handle the code on its own.
 */
const eventName = "kardo:plan-required";

/** Emits the event only for the plan-required refusal. */
export function notifyPlanRequired(
  status: number,
  code: string | null,
): boolean {
  if (status !== 403 || code !== "PLAN_REQUIRED") return false;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(eventName));
  return true;
}

/** Subscribes to the event; returns the unsubscribe function. */
export function onPlanRequired(handler: () => void): () => void {
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}

/**
 * A write over a plan limit answers `403 PLAN_LIMIT` with the limit's key
 * (`touchpoints.max`, `links.max`, ...). `lib/api.ts` announces it here, and
 * the shell may offer the extra that fits, besides moving up a plan (A2-60).
 */
const limitEventName = "kardo:plan-limit";

export type PlanLimitNotice = { key: string };

/** Emits the event only for the plan-limit refusal that names its key. */
export function notifyPlanLimit(
  status: number,
  code: string | null,
  details: { key?: unknown } | null | undefined,
): boolean {
  if (status !== 403 || code !== "PLAN_LIMIT") return false;
  const key = details?.key;
  if (typeof key !== "string") return false;
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent<PlanLimitNotice>(limitEventName, { detail: { key } }),
    );
  return true;
}

/** Subscribes to the plan-limit event; returns the unsubscribe function. */
export function onPlanLimit(
  handler: (notice: PlanLimitNotice) => void,
): () => void {
  const listener = (event: Event) =>
    handler((event as CustomEvent<PlanLimitNotice>).detail);
  window.addEventListener(limitEventName, listener);
  return () => window.removeEventListener(limitEventName, listener);
}
