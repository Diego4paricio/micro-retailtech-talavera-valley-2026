import type { CustomerPermission } from "@kardo/domain";
import type { IconName } from "../components/Icon.js";
import type { Route } from "../lib/router.js";

export type NavItem = {
  route: Route;
  label: string;
  icon: IconName;
  permission?: CustomerPermission;
  /** Short help shown as a tooltip; never changes the visible layout. */
  description?: string;
  /** A short visible line under the label (relevo 37, round 3: Javier
   * looked for «agotado» inside the Estudio and never saw Disponibilidad;
   * the description alone is a tooltip, invisible on a phone). */
  note?: string;
  /** Routes that keep this item highlighted. */
  matches: Route["name"][];
};

/** `label` is omitted for the home entry, which stands on its own. */
export type NavGroup = { id: string; label?: string; items: NavItem[] };

/**
 * The Resumen opens the panel and heads the navigation. Below it, products
 * stay separate: physical Touchpoints, digital Links, the content they show,
 * the results they produce, and the organization around them.
 */
export const navGroups: NavGroup[] = [
  {
    id: "inicio",
    items: [
      {
        route: { name: "overview" },
        label: "Resumen",
        icon: "overview",
        matches: ["overview"],
      },
    ],
  },
  {
    id: "fisico",
    label: "Físico",
    items: [
      {
        route: { name: "touchpoints" },
        label: "QR y etiquetas",
        icon: "touchpoint",
        matches: ["touchpoints", "touchpoint", "qr-studio", "activate-piece"],
      },
      {
        route: { name: "qr" },
        label: "Diseño del QR",
        icon: "qr",
        matches: ["qr", "qr-design"],
      },
    ],
  },
  {
    id: "digital",
    label: "Digital",
    items: [
      {
        route: { name: "links" },
        label: "Links",
        icon: "handle",
        matches: ["links", "link"],
      },
    ],
  },
  {
    id: "contenido",
    label: "Contenido",
    items: [
      {
        route: { name: "experiences" },
        label: "Páginas",
        icon: "experience",
        matches: [
          "experiences",
          "experience",
          "experience-new",
          "experience-scan",
          "experience-studio",
        ],
      },
      {
        route: { name: "availability" },
        label: "Disponibilidad",
        icon: "availability",
        description: "Qué hay hoy: marca lo que se acabó y lo que volvió",
        note: "Lo que se acabó hoy",
        matches: ["availability"],
      },
      {
        route: { name: "assets" },
        label: "Archivos",
        icon: "asset",
        matches: ["assets"],
      },
    ],
  },
  {
    id: "resultados",
    label: "Resultados",
    items: [
      {
        route: { name: "analytics" },
        label: "Analítica",
        icon: "analytics",
        permission: "analytics.read",
        matches: ["analytics"],
      },
      {
        route: { name: "leads" },
        label: "Solicitudes",
        icon: "lead",
        permission: "leads.read",
        matches: ["leads"],
      },
    ],
  },
  {
    id: "organizacion",
    label: "Organización",
    items: [
      {
        route: { name: "organization" },
        label: "Equipo",
        icon: "team",
        // An invitation is not this team yet: it lights nothing up (A2-19).
        matches: ["organization"],
      },
      {
        route: { name: "settings" },
        label: "Configuración",
        icon: "settings",
        matches: ["settings"],
      },
    ],
  },
];

/** Where a route lives in the navigation (for breadcrumbs). */
export function findNavLocation(
  routeName: Route["name"],
): { group: NavGroup; item: NavItem } | null {
  for (const group of navGroups)
    for (const item of group.items)
      if (item.matches.includes(routeName)) return { group, item };
  return null;
}

/** The trailing breadcrumb for screens below a section's list. */
export function detailLabel(route: Route): string | null {
  switch (route.name) {
    case "touchpoint":
    case "link":
      return "Detalle";
    case "qr-studio":
      // `qr-studio` (`/touchpoints/:id/qr`, one Touchpoint's own QR) lights
      // up «QR y etiquetas» above, not the separate «Diseño del QR» entry
      // (`qr`/`qr-design`): the trailing crumb must not reuse that name
      // (domain audit A9-28).
      return "Diseño";
    case "experience-studio":
      return "Estudio";
    case "qr-design":
      return "Diseño";
    case "experience":
      return route.view === "destinos"
        ? "Dónde se ve"
        : route.view === "historial"
          ? "Historial"
          : "Diseño";
    case "experience-new":
      return "Nueva";
    case "invitation":
      return "Invitación";
    default:
      return null;
  }
}
