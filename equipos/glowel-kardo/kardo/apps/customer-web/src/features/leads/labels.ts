import type { LeadStatus } from "@kardo/contracts";

/** Request states and retention words for Solicitudes (moved from
 * `lib/format.ts`, domain audit A2-72). */
export const leadStatusLabels: Record<LeadStatus, string> = {
  new: "Nueva",
  contacted: "Atendida",
  closed: "Cerrada",
};

export type LeadStatusFilter = "all" | LeadStatus;

export const leadStatusFilterLabels: Record<LeadStatusFilter, string> = {
  all: "Todas",
  new: "Nuevas",
  contacted: "Atendidas",
  closed: "Cerradas",
};

export const leadStatusFilters: LeadStatusFilter[] = [
  "all",
  "new",
  "contacted",
  "closed",
];

/** `null` means leads are kept forever. */
export function leadRetentionLabel(days: number | null): string {
  if (days === null) return "Conservar indefinidamente";
  return `${days} días`;
}
