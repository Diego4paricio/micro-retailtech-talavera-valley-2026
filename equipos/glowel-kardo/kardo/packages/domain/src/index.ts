export const customerRoles = ["owner", "admin", "editor", "viewer"] as const;
export type CustomerRole = (typeof customerRoles)[number];

/**
 * What each role is called and what it can do, in the words the panel shows,
 * in one place (domain audit 2026-10-13, A2-15): the label, the summary of
 * «Roles» and the one-line hint of the role picker. It describes the matrix
 * below, which the server enforces.
 */
export const customerRoleText: Record<
  CustomerRole,
  { label: string; summary: string; hint: string }
> = {
  owner: {
    label: "Owner",
    summary:
      "Control total de la organización. Es el único que contrata, cambia o cancela el plan y la forma de pago, y el único que puede pasarle la propiedad a otra persona.",
    hint: "Control total de la organización.",
  },
  admin: {
    label: "Admin",
    summary:
      "Todo lo de Editor, y además administra al equipo, la configuración y las solicitudes, y retira QR y etiquetas. Ve el plan y las facturas, pero no los cambia ni puede modificar al Owner.",
    hint: "Todo lo de Editor, más el equipo, las solicitudes y la configuración.",
  },
  editor: {
    label: "Editor",
    summary:
      "Crea y edita QR y etiquetas, páginas y archivos, publica y ve la analítica. No ve las solicitudes ni administra al equipo.",
    hint: "Crea, edita y publica. No ve las solicitudes.",
  },
  viewer: {
    label: "Viewer",
    summary:
      "Consulta la organización y su analítica sin cambiar nada. No ve las solicitudes.",
    hint: "Solo consulta y ve la analítica.",
  },
};

export const customerPermissions = [
  "workspace.manage",
  "members.manage",
  "touchpoints.manage",
  /** Irreversible: a retired Touchpoint's printed QR/NFC never serves again. */
  "touchpoints.retire",
  "experiences.edit",
  "experiences.publish",
  "assets.manage",
  "leads.read",
  /** Change lead status, delete leads and set lead retention. */
  "leads.manage",
  "analytics.read",
  /** Only owners transfer ownership. */
  "ownership.transfer",
  /** Modo HTML del Estudio: free HTML/CSS on public pages (owner, admin). */
  "experiences.custom_html",
  /** Suscripciones (ADR 019): see the plan, usage and invoices. */
  "billing.read",
  /** Subscribe, change plan, update the card, cancel. Owner only. */
  "billing.manage",
] as const;
export type CustomerPermission = (typeof customerPermissions)[number];

// Server-side authorization is the source of truth; the Customer App uses the
// same matrix only to hide controls a role could never use.
const permissionsByRole: Record<CustomerRole, readonly CustomerPermission[]> = {
  owner: customerPermissions,
  admin: [
    "workspace.manage",
    "members.manage",
    "touchpoints.manage",
    "touchpoints.retire",
    "experiences.edit",
    "experiences.publish",
    "assets.manage",
    "leads.read",
    "leads.manage",
    "analytics.read",
    "experiences.custom_html",
    "billing.read",
  ],
  editor: [
    "touchpoints.manage",
    "experiences.edit",
    "experiences.publish",
    "assets.manage",
    "analytics.read",
  ],
  viewer: ["analytics.read"],
};

export function canCustomer(
  role: CustomerRole,
  permission: CustomerPermission,
): boolean {
  return permissionsByRole[role].includes(permission);
}

/** Owners and admins manage members, but only an owner can manage an owner. */
export function canManageMember(
  actorRole: CustomerRole,
  targetRole: CustomerRole,
): boolean {
  if (!canCustomer(actorRole, "members.manage")) return false;
  return targetRole !== "owner" || actorRole === "owner";
}

export function isSafeRedirect(destination: string): boolean {
  try {
    const url = new URL(destination);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function hasWhitespaceOrControl(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f || /\s/.test(character)) return true;
  }
  return false;
}

/**
 * Canonical public-URL rule shared by API, Publisher and Resolver: absolute
 * HTTPS, no embedded credentials, no whitespace/control characters and a
 * bounded length. Returns the normalized URL or null.
 */
export function normalizePublicHttpsUrl(value: string): string | null {
  if (value.length > 2048 || hasWhitespaceOrControl(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!url.hostname || url.hostname.endsWith(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
