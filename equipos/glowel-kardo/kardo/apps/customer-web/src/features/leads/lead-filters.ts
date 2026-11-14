import type { LeadStatusFilter } from "./labels.js";

/**
 * Los filtros de Solicitudes (relevo 37, C3d), por separado de las
 * etiquetas de estado de `features/leads/labels.ts` (que no se tocan aquí): el estudio
 * encontró que una persona confundía el filtro «Contactados» con el estado
 * de la solicitud, así que el filtro usa sus propias palabras.
 */
export const leadFilterOrder: LeadStatusFilter[] = [
  "new",
  "contacted",
  "closed",
  "all",
];

export const leadFilterLabels: Record<LeadStatusFilter, string> = {
  new: "Por atender",
  contacted: "Atendidas",
  closed: "Cerradas",
  all: "Todas",
};

/** El texto de un filtro con su contador, cuando se conoce (solo en «Por
 * atender»: es el único que importa resolver pronto). `null` deja el
 * filtro sin número, mientras carga o para cualquier otro filtro. */
export function leadFilterChipLabel(
  filter: LeadStatusFilter,
  countLabel: string | null,
): string {
  const label = leadFilterLabels[filter];
  if (filter !== "new" || countLabel === null) return label;
  return `${label} · ${countLabel}`;
}

/**
 * El vacío de cada filtro (C3d): «Aún no hay solicitudes» solo cuando no
 * hay ninguna de verdad, es decir, con «Todas» y sin filtrar por QR o
 * etiqueta. Con cualquier otro filtro (de estado, de QR o etiqueta, o los
 * dos), el vacío explica qué filtro es, nunca «Aún no hay solicitudes»
 * (eso haría creer que no ha llegado ninguna).
 */
export function leadsEmptyState(
  filter: LeadStatusFilter,
  touchpointFiltered: boolean,
): { title: string; body: string } {
  if (filter === "all" && !touchpointFiltered) {
    return {
      title: "Aún no hay solicitudes",
      body: "Cuando alguien complete un formulario publicado, aparecerá aquí.",
    };
  }
  const suffix = touchpointFiltered ? " de este QR o etiqueta" : "";
  switch (filter) {
    case "new":
      return {
        title: `No hay solicitudes por atender${suffix}`,
        body: "Ya respondiste a todas. Las nuevas aparecerán aquí.",
      };
    case "contacted":
      return {
        title: `No hay solicitudes atendidas${suffix}`,
        body: "Las que marques como atendidas aparecerán aquí.",
      };
    case "closed":
      return {
        title: `No hay solicitudes cerradas${suffix}`,
        body: "Las que cierres aparecerán aquí.",
      };
    default:
      return {
        title: "No hay solicitudes de este QR o etiqueta",
        body: "Prueba con «Todos» o con otro filtro.",
      };
  }
}
