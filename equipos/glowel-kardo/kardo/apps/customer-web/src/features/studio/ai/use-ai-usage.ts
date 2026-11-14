import type { DesignAiUsage } from "@kardo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { designAiSessionApi } from "../../../api/design-ai.js";

/**
 * What is left of the organization's Kardo AI (relevo 29, 2026-10-03), to
 * show before generating. Null while loading or when it cannot be read (the
 * demo build, an API that does not have the route yet): the rail then just
 * does not show the counter.
 */
export function useAiUsage(workspaceId: string) {
  const [usage, setUsage] = useState<DesignAiUsage | null>(null);
  const live = useRef(true);

  const reload = useCallback(async () => {
    try {
      const next = await designAiSessionApi.usage(workspaceId);
      if (live.current) setUsage(next);
    } catch {
      // The counter is a convenience: without it the rail still works.
    }
  }, [workspaceId]);

  useEffect(() => {
    live.current = true;
    void reload();
    return () => {
      live.current = false;
    };
  }, [reload]);

  return { usage, reload };
}

/** Starts left this hour for this person (designs, ideas, HTML and code
 * blocks share them). Null when the API does not say (older API). */
export function hourLeft(usage: DesignAiUsage | null): number | null {
  return usage?.hour ? usage.hour.remaining : null;
}

/** Only worth saying when it is about to bite (2 or fewer left). */
export function hourNote(usage: DesignAiUsage | null): string | null {
  const hour = usage?.hour;
  if (!hour || hour.remaining > 2) return null;
  if (hour.remaining === 0)
    return `Ya hiciste tus ${hour.limit} solicitudes de esta hora. Espera un poco.`;
  return hour.remaining === 1
    ? "En esta hora te queda 1 solicitud."
    : `En esta hora te quedan ${hour.remaining} solicitudes.`;
}

/** Designs left right now: the tighter of today's and the month's. */
export function designsLeft(usage: DesignAiUsage | null): number | null {
  if (!usage) return null;
  if (!usage.enabled || usage.spendCapReached) return 0;
  const month = usage.month.remaining;
  return month === null
    ? usage.day.remaining
    : Math.min(month, usage.day.remaining);
}

function joinNotes(...notes: (string | null)[]): string | null {
  const present = notes.filter(Boolean);
  return present.length ? present.join(" ") : null;
}

/** The counter's line, in the owner's words. */
export function usageLine(usage: DesignAiUsage): {
  main: string;
  detail: string | null;
} {
  if (!usage.enabled)
    return { main: "Tu plan no incluye diseños con IA", detail: null };
  if (usage.spendCapReached)
    return {
      main: "Ya usaste la IA de este mes",
      detail: "Vuelve el próximo mes o cambia de plan.",
    };
  const { month, day } = usage;
  if (month.limit !== null && month.remaining !== null) {
    const main =
      month.remaining === 1
        ? `Te queda 1 de ${month.limit} diseños este mes`
        : `Te quedan ${month.remaining} de ${month.limit} diseños este mes`;
    const dayNote =
      day.remaining < month.remaining
        ? `Hoy puedes hacer ${day.remaining} más.`
        : null;
    return { main, detail: joinNotes(dayNote, hourNote(usage)) };
  }
  return {
    main:
      day.remaining === 1
        ? "Te queda 1 diseño hoy"
        : `Te quedan ${day.remaining} diseños hoy`,
    detail: hourNote(usage),
  };
}
