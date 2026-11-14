import {
  type PublicStatusIncident,
  type ServiceStatus,
  type StatusComponentId,
  type StatusLevel,
  type StatusUpdateKind,
  statusComponentLabels,
  statusLevels,
} from "@kardo/contracts";
import { getDatePreferences } from "../../lib/date-preferences.js";

/** What the pill shows: a level, or why there is none. */
export type DisplayLevel = StatusLevel | "unknown" | "offline";

export type Tone = "success" | "info" | "warning" | "danger" | "neutral";

/** Customer words (ADR 022): no technical names, no milliseconds. */
export const levelView: Record<
  DisplayLevel,
  { pill: string; word: string; tone: Tone }
> = {
  operational: { pill: "Todo funciona", word: "Funciona", tone: "success" },
  maintenance: {
    pill: "Mantenimiento",
    word: "En mantenimiento",
    tone: "info",
  },
  degraded: { pill: "Funciona lento", word: "Lento", tone: "warning" },
  partial_outage: {
    pill: "Falla parcial",
    word: "Falla parcial",
    tone: "warning",
  },
  major_outage: { pill: "Falla", word: "No funciona", tone: "danger" },
  unknown: { pill: "Estado no disponible", word: "Sin datos", tone: "neutral" },
  offline: { pill: "Sin conexión", word: "Sin datos", tone: "neutral" },
};

export const updateKindLabel: Record<StatusUpdateKind, string> = {
  investigating: "Investigando",
  identified: "Causa encontrada",
  monitoring: "Vigilando",
  resolved: "Resuelto",
  scheduled: "Programado",
  in_progress: "En curso",
  completed: "Terminado",
};

/** Older than this, the last check says nothing about now. */
export const STALE_AFTER_MS = 10 * 60_000;

export function isStale(status: ServiceStatus, nowMs = Date.now()): boolean {
  if (!status.checkedAt) return true;
  return nowMs - Date.parse(status.checkedAt) > STALE_AFTER_MS;
}

export function displayLevel(
  status: ServiceStatus | null,
  options: { online: boolean; failed: boolean; nowMs?: number },
): DisplayLevel {
  if (!options.online) return "offline";
  if (!status || options.failed) return "unknown";
  // Staff incidents and maintenance stand even if the checks are old.
  if (isStale(status, options.nowMs) && status.incidents.length === 0)
    return "unknown";
  // Nothing measured at all is no «Todo funciona».
  if (
    status.components.length > 0 &&
    status.components.every(
      (component) =>
        component.measured === false || !isMeasured(component.level),
    )
  )
    return "unknown";
  return status.overall;
}

/** A level the status worker actually measured (not «unknown» or new). */
function isMeasured(level: string): boolean {
  return (statusLevels as readonly string[]).includes(level);
}

/**
 * What one area shows (A2-69, A2-70). A level the panel does not know (the
 * status worker marks an area it could not measure) reads «Sin datos», never
 * «Funciona». With the checks old, an area no open incident talks about says
 * «Sin datos recientes» instead of a level that may no longer hold.
 */
export function componentView(
  status: Pick<ServiceStatus, "checkedAt" | "incidents">,
  component: { id: StatusComponentId; level: string; measured?: boolean },
  nowMs = Date.now(),
): { word: string; tone: Tone } {
  // The status worker says no check covers this area (A2-69).
  if (component.measured === false)
    return { word: levelView.unknown.word, tone: levelView.unknown.tone };
  const known = (levelView as Record<string, (typeof levelView)[DisplayLevel]>)[
    component.level
  ];
  if (!known || component.level === "unknown" || component.level === "offline")
    return { word: levelView.unknown.word, tone: levelView.unknown.tone };
  const covered = status.incidents.some((incident) =>
    incident.components.includes(component.id),
  );
  if (!covered && isStale(status as ServiceStatus, nowMs))
    return { word: "Sin datos recientes", tone: "neutral" };
  return { word: known.word, tone: known.tone };
}

export function headline(status: ServiceStatus, level: DisplayLevel): string {
  const affected = status.components.filter((c) => c.level !== "operational");
  const providerOnly =
    affected.length > 0 && affected.every((component) => component.provider);
  switch (level) {
    case "operational":
      return "Todo funciona con normalidad.";
    case "maintenance":
      return "Hay un mantenimiento en curso.";
    case "degraded":
      return providerOnly
        ? "Un proveedor reporta lentitud que puede afectar a Kardo."
        : "Algunas partes funcionan más lento de lo normal.";
    case "partial_outage":
      return providerOnly
        ? "Un proveedor reporta una falla que puede afectar a Kardo."
        : "Algunas partes tienen fallas.";
    case "major_outage":
      return "Hay una falla importante. Ya estamos trabajando en ella.";
    case "offline":
      return "Tu dispositivo no tiene conexión a internet.";
    default:
      return "Por ahora no podemos consultar el estado del servicio.";
  }
}

export function componentLabel(id: StatusComponentId): string {
  return statusComponentLabels[id];
}

/** «dom 6 oct, 2:00 a 3:00» (same day) or «dom 6 oct, 23:00 a lun 7 oct, 1:00».
 * Zone and 12/24 h come from the person's preferences. */
export function formatWindow(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  const { timeZone, hourCycle } = getDatePreferences();
  const zone = timeZone ? { timeZone } : {};
  const day = new Intl.DateTimeFormat("es-MX", {
    ...zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = new Intl.DateTimeFormat("es-MX", {
    ...zone,
    ...(hourCycle ? { hourCycle } : {}),
    hour: "numeric",
    minute: "2-digit",
  });
  const from = `${day.format(start)}, ${time.format(start)}`;
  if (!endsAt) return `Desde ${from}`;
  const end = new Date(endsAt);
  const sameDay = day.format(start) === day.format(end);
  return sameDay
    ? `${from} a ${time.format(end)}`
    : `${from} a ${day.format(end)}, ${time.format(end)}`;
}

export function latestUpdate(
  incident: PublicStatusIncident,
): PublicStatusIncident["updates"][number] | null {
  return incident.updates[0] ?? null;
}
