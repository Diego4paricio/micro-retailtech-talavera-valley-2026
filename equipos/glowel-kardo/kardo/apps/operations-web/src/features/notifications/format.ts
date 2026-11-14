import type {
  NotificationAudience,
  NotificationAudienceEstimate,
  NotificationBillingState,
  NotificationCategory,
  StaffNotification,
  StaffNotificationState,
} from "@kardo/contracts";
import type { StatusTone } from "../../lib/format.js";

/** Pure labels and wording for the notifications area (no React, no DOM). */

export const categoryLabels: Record<NotificationCategory, string> = {
  news: "Novedad",
  maintenance: "Mantenimiento",
  account: "Tu cuenta",
  tip: "Consejo",
};

export const categoryOrder: readonly NotificationCategory[] = [
  "news",
  "maintenance",
  "account",
  "tip",
];

export const stateLabels: Record<StaffNotificationState, string> = {
  active: "Activa",
  scheduled: "Programada",
  expired: "Caducada",
  retired: "Retirada",
};

export function stateView(state: StaffNotificationState): {
  label: string;
  tone: StatusTone;
} {
  const tones: Record<StaffNotificationState, StatusTone> = {
    active: "success",
    scheduled: "info",
    expired: "neutral",
    retired: "danger",
  };
  return { label: stateLabels[state], tone: tones[state] };
}

export const billingStateLabels: Record<NotificationBillingState, string> = {
  trial: "En prueba",
  subscribed: "Con suscripción",
  manual: "Plan manual",
  none: "Sin plan",
};

export const accountTypeLabels = {
  personal: "Personal",
  business: "Negocio",
} as const;

export type RoleValue = "owner" | "admin" | "editor" | "viewer";

export const roleOrder: readonly RoleValue[] = [
  "owner",
  "admin",
  "editor",
  "viewer",
];

export const roleLabelsSingular: Record<RoleValue, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Lector",
};

const rolePlural: Record<RoleValue, string> = {
  owner: "Owners",
  admin: "Admins",
  editor: "Editores",
  viewer: "Lectores",
};

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** "solo Owners y Admins", or null when the audience is not narrowed by role. */
export function rolesPhrase(roles: readonly RoleValue[] | undefined) {
  if (!roles || roles.length === 0 || roles.length === roleOrder.length)
    return null;
  const ordered = roleOrder.filter((role) => roles.includes(role));
  return `solo ${joinList(ordered.map((role) => rolePlural[role]))}`;
}

/** Audience in words, e.g. «Todos los clientes · solo Owners». */
export function audienceDescription(
  notification: Pick<StaffNotification, "audience" | "audienceLabel">,
): string {
  const { audience, audienceLabel } = notification;
  let base: string;
  switch (audience.kind) {
    case "all":
      base = "Todos los clientes";
      break;
    case "segment": {
      const parts = [
        ...(audience.planCodes ?? []),
        ...(audience.billingStates ?? []).map((state) =>
          billingStateLabels[state].toLowerCase(),
        ),
        ...(audience.accountTypes ?? []).map((type) => accountTypeLabels[type]),
      ];
      base = `Segmento: ${joinList(parts)}`;
      break;
    }
    case "workspace":
      base = `Organización: ${audienceLabel.workspaceName ?? "sin nombre"}`;
      break;
    case "profile":
      base = `Persona: ${audienceLabel.profileEmail ?? "sin correo"}`;
      break;
  }
  const roles = rolesPhrase(audience.roles);
  return roles ? `${base} · ${roles}` : base;
}

/** Whether a staff member may change or retire a notification. */
export function canManageAudience(
  audience: NotificationAudience,
  can: { send: boolean; broadcast: boolean },
): boolean {
  return audience.kind === "all" || audience.kind === "segment"
    ? can.broadcast
    : can.send;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function estimateText(estimate: NotificationAudienceEstimate): string {
  const people = plural(estimate.profiles, "persona", "personas");
  const orgs = plural(estimate.workspaces, "organización", "organizaciones");
  return `Llegará a ${people} de ${orgs}`;
}

export function readsText(reads: number): string {
  if (reads === 0) return "Nadie la ha leído";
  return reads === 1 ? "Leída por 1 persona" : `Leída por ${reads} personas`;
}

/** First `max` characters of a body, cut at a word and with an ellipsis. */
export function previewSnippet(body: string, max = 140): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
