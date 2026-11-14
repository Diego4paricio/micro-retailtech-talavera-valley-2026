import type { CustomerRole } from "@kardo/contracts";

const locale = "es-MX";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * Date and time in Mexico City time, with the year. Staff read notices and
 * access dates against the customer's clock, not the machine's.
 */
export function formatDateTimeMx(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
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

export function formatRatio(ratio: number | null): string {
  if (ratio === null || Number.isNaN(ratio)) return "—";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(ratio);
}

/** Rounds and signs a relative change vs. the previous period, e.g. "+12". */
export function formatDelta(percent: number | null): string | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  const rounded = Math.round(percent);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

/** Relative % change of `current` vs `previous`; null hides the trend. */
export function trendDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Formats a duration in seconds as e.g. "42 s", "3.2 min" or "1.4 h". */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3_600) return `${(seconds / 60).toFixed(1)} min`;
  return `${(seconds / 3_600).toFixed(1)} h`;
}

export const touchpointStatusLabels: Record<string, string> = {
  prepared: "Preparado",
  available: "Disponible",
  assigned: "Asignado",
  active: "Activo",
  paused: "Pausado",
  lost: "Perdido",
  replaced: "Reemplazado",
  retired: "Retirado",
};

export function touchpointStatusView(status: string): {
  label: string;
  tone: StatusTone;
} {
  switch (status) {
    case "active":
      return { label: "Activo", tone: "success" };
    case "paused":
      return { label: "Pausado", tone: "warning" };
    case "lost":
    case "retired":
      return {
        label: touchpointStatusLabels[status] ?? status,
        tone: "danger",
      };
    case "replaced":
      return { label: "Reemplazado", tone: "neutral" };
    case "assigned":
      return { label: "Asignado", tone: "info" };
    default:
      return {
        label: touchpointStatusLabels[status] ?? status,
        tone: "neutral",
      };
  }
}

export const publicationStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  processing: "Publicando",
  published: "Publicada",
  failed: "Falló",
  superseded: "Reemplazada",
};

export function publicationStatusView(status: string): {
  label: string;
  tone: StatusTone;
} {
  switch (status) {
    case "published":
      return { label: "Publicada", tone: "success" };
    case "pending":
    case "processing":
      return { label: publicationStatusLabels[status] ?? status, tone: "info" };
    case "failed":
      return { label: "Falló", tone: "danger" };
    case "superseded":
      return { label: "Reemplazada", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export const roleLabels: Record<CustomerRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const experienceTypeLabels: Record<string, string> = {
  redirect: "Redirección",
  links: "Página de enlaces",
  profile: "Perfil",
  image: "Imagen",
  document: "Documento PDF",
  menu: "Menú",
  catalog: "Catálogo",
  form: "Formulario",
};

export const workspaceKindLabels: Record<string, string> = {
  personal: "Personal",
  organization: "Organización",
};

/** Formats an entitlement value (`null` means unlimited per the contract). */
export function formatEntitlement(value: number | boolean | null): string {
  if (value === null) return "Ilimitado";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return formatNumber(value);
}
