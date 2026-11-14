import {
  type AddStatusUpdate,
  type CreateStatusIncident,
  closingStatusUpdate,
  STATUS_LIMITS,
  type StatusComponentId,
  type StatusIncidentImpact,
  type StatusIncidentKind,
  type StatusLevel,
  type StatusUpdateKind,
  statusUpdateKindsFor,
} from "@kardo/contracts";
import type { StatusTone } from "../../lib/format.js";

/** Pure labels, wording and request builders for the status area. */

export const levelLabels: Record<StatusLevel, string> = {
  operational: "Funciona",
  maintenance: "En mantenimiento",
  degraded: "Lento",
  partial_outage: "Falla parcial",
  major_outage: "No funciona",
};

export const levelTones: Record<StatusLevel, StatusTone> = {
  operational: "success",
  maintenance: "info",
  degraded: "warning",
  partial_outage: "danger",
  major_outage: "danger",
};

export const impactLabels: Record<StatusIncidentImpact, string> = {
  degraded: "Lento",
  partial_outage: "Falla parcial",
  major_outage: "No funciona",
  maintenance: "Mantenimiento",
};

export const incidentImpacts: readonly StatusIncidentImpact[] = [
  "degraded",
  "partial_outage",
  "major_outage",
];

export const kindLabels: Record<StatusIncidentKind, string> = {
  incident: "Incidente",
  maintenance: "Mantenimiento",
};

export const updateLabels: Record<StatusUpdateKind, string> = {
  investigating: "Investigando",
  identified: "Causa encontrada",
  monitoring: "Vigilando",
  resolved: "Resuelto",
  scheduled: "Programado",
  in_progress: "En curso",
  completed: "Terminado",
};

export const probeLabels: Record<string, string> = {
  api: "Customer API",
  queue: "Cola de publicación",
  resolver: "Resolver (QR de prueba)",
  publisher: "Publisher",
  assets: "Assets Worker",
  analytics: "Analytics Worker",
  "panel-app": "Panel (Pages)",
};

export function probeLabel(id: string): string {
  return probeLabels[id] ?? id;
}

export const providerLabels: Record<string, string> = {
  cloudflare: "Cloudflare",
  supabase: "Supabase",
  "google-cloud": "Google Cloud",
  anthropic: "Anthropic",
};

/** «Revisado hace 3 min», relative to `now`. */
export function checkedAgoText(
  checkedAt: string | null,
  now: number = Date.now(),
): string {
  if (!checkedAt) return "Aún no se ha revisado";
  const minutes = Math.floor((now - new Date(checkedAt).getTime()) / 60_000);
  if (minutes < 1) return "Revisado hace menos de 1 min";
  if (minutes < 60) return `Revisado hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `Revisado hace ${hours} h`;
}

/** The update to preselect: the step after the latest one in the flow. */
export function nextUpdateKind(
  kind: StatusIncidentKind,
  latest: StatusUpdateKind | undefined,
): StatusUpdateKind {
  const flow = statusUpdateKindsFor(kind);
  const index = latest ? flow.indexOf(latest) : -1;
  return (
    flow[Math.min(index + 1, flow.length - 1)] ?? flow[0] ?? "investigating"
  );
}

export function closesIncident(
  kind: StatusIncidentKind,
  status: StatusUpdateKind,
): boolean {
  return status === closingStatusUpdate(kind);
}

// --- Create incident / maintenance -----------------------------------------

export type IncidentForm = {
  kind: StatusIncidentKind;
  title: string;
  impact: StatusIncidentImpact;
  components: StatusComponentId[];
  message: string;
  /** `datetime-local` values; only used by maintenance. */
  startsAt: string;
  endsAt: string;
};

export function emptyIncidentForm(kind: StatusIncidentKind): IncidentForm {
  return {
    kind,
    title: "",
    impact: kind === "maintenance" ? "maintenance" : "degraded",
    components: [],
    message: "",
    startsAt: "",
    endsAt: "",
  };
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export type IncidentFormErrors = Partial<
  Record<"title" | "components" | "message" | "startsAt" | "endsAt", string>
>;

export function validateIncidentForm(form: IncidentForm): IncidentFormErrors {
  const errors: IncidentFormErrors = {};
  if (form.title.trim() === "") errors.title = "Escribe un título.";
  else if (form.title.trim().length > STATUS_LIMITS.title)
    errors.title = `El título admite hasta ${STATUS_LIMITS.title} caracteres.`;
  if (form.components.length === 0)
    errors.components = "Elige al menos un área afectada.";
  if (form.message.trim() === "") errors.message = "Escribe el mensaje.";
  else if (form.message.trim().length > STATUS_LIMITS.message)
    errors.message = `El mensaje admite hasta ${STATUS_LIMITS.message} caracteres.`;
  if (form.kind === "maintenance") {
    const start = toIso(form.startsAt);
    const end = toIso(form.endsAt);
    if (!start) errors.startsAt = "Elige cuándo empieza.";
    if (!end) errors.endsAt = "Elige cuándo termina.";
    else if (start && new Date(end) <= new Date(start))
      errors.endsAt = "El fin debe ser después del inicio.";
  }
  return errors;
}

/** Form to the API body. Call `validateIncidentForm` first. */
export function toCreateIncident(form: IncidentForm): CreateStatusIncident {
  const base: CreateStatusIncident = {
    kind: form.kind,
    title: form.title.trim(),
    impact: form.kind === "maintenance" ? "maintenance" : form.impact,
    components: form.components,
    message: form.message.trim(),
  };
  if (form.kind !== "maintenance") return base;
  const startsAt = toIso(form.startsAt);
  const endsAt = toIso(form.endsAt);
  return {
    ...base,
    ...(startsAt ? { startsAt } : {}),
    ...(endsAt ? { endsAt } : {}),
  };
}

/** Update body; `impact` is only sent for incidents and only when changed. */
export function toAddUpdate(
  kind: StatusIncidentKind,
  status: StatusUpdateKind,
  message: string,
  impact: StatusIncidentImpact | "",
): AddStatusUpdate {
  return {
    status,
    message: message.trim(),
    ...(kind === "incident" && impact ? { impact } : {}),
  };
}
