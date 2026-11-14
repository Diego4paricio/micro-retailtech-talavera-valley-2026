import type {
  QrDesign,
  QrDesignOverview,
  QrDesignSource,
  QrTemplate,
} from "@kardo/contracts";

/**
 * Estudio QR library — pure helpers (no DOM, tested in Node).
 *
 * A Touchpoint's design comes from, in order: its own design (`custom`), a
 * library design applied to it (`library`), its group's default (`group`) or
 * Kardo's default (`default`). Every QR encodes the Touchpoint's permanent
 * address, so none of this ever breaks a printed code.
 */

export const qrSourceLabels: Record<QrDesignSource, string> = {
  custom: "Propio",
  library: "Biblioteca",
  group: "Del grupo",
  default: "Kardo",
};

export const qrSourceDescriptions: Record<QrDesignSource, string> = {
  custom: "Diseño propio de este QR",
  library: "Diseño de la biblioteca",
  group: "Heredado de su grupo",
  default: "Diseño Kardo por defecto",
};

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** "12 QR y 2 grupos", "1 grupo" or "" when unused. */
export function usageCount(usage: {
  touchpoints: number;
  groups: number;
}): string {
  return [
    usage.touchpoints ? plural(usage.touchpoints, "QR", "QR") : null,
    usage.groups ? plural(usage.groups, "grupo", "grupos") : null,
  ]
    .filter(Boolean)
    .join(" y ");
}

/** "En 12 QR y 2 grupos", "En 1 grupo" or "Sin usar todavía". */
export function usageText(usage: {
  touchpoints: number;
  groups: number;
}): string {
  const count = usageCount(usage);
  return count ? `En ${count}` : "Sin usar todavía";
}

/** "lo usa 1 QR", "lo usan 12 QR y 2 grupos". */
export function usedByText(usage: {
  touchpoints: number;
  groups: number;
}): string {
  return `${usageTotal(usage) === 1 ? "lo usa" : "lo usan"} ${usageCount(usage)}`;
}

/** Whether saving a shared design reaches anyone else. */
export function usageTotal(usage: {
  touchpoints: number;
  groups: number;
}): number {
  return usage.touchpoints + usage.groups;
}

export type ResolvedQr = {
  touchpointId: string;
  source: QrDesignSource;
  templateId: string | null;
  templateName: string | null;
  /** The design a new print would use right now. */
  design: QrDesign;
  lastExport: QrDesignOverview[number]["lastExport"];
};

/**
 * The design in effect for each QR Touchpoint of the overview. A library
 * design missing from `templates` (deleted meanwhile) falls back to Kardo's.
 */
export function resolveOverview(
  rows: QrDesignOverview,
  templates: readonly QrTemplate[],
  fallback: QrDesign,
): Map<string, ResolvedQr> {
  const byId = new Map(templates.map((template) => [template.id, template]));
  const resolved = new Map<string, ResolvedQr>();
  for (const row of rows) {
    const template = row.templateId ? byId.get(row.templateId) : undefined;
    const design =
      row.source === "custom" && row.design
        ? row.design
        : template
          ? template.design
          : fallback;
    resolved.set(row.touchpointId, {
      touchpointId: row.touchpointId,
      source: row.source === "custom" && !row.design ? "default" : row.source,
      templateId: template?.id ?? null,
      templateName: template?.name ?? null,
      design,
      lastExport: row.lastExport,
    });
  }
  return resolved;
}

export type PrintState = "never" | "current" | "changed" | "checking";

/** Compares the last print with the design a new print would use. */
export function printState(
  lastExport: { fingerprint: string } | null,
  fingerprint: string | null | undefined,
): PrintState {
  if (!lastExport) return "never";
  if (!fingerprint) return "checking";
  return lastExport.fingerprint === fingerprint ? "current" : "changed";
}

/** The longest string (URL or name) of a list: the worst case for a preview. */
export function longest(values: readonly string[], fallback: string): string {
  let result = "";
  for (const value of values) if (value.length > result.length) result = value;
  return result || fallback;
}

/** "Copia de X", trimmed to the 60-character limit of a design name. */
export function copyName(name: string): string {
  return `Copia de ${name}`.slice(0, 60).trim();
}

export const qrExportFormatLabels = {
  png: "PNG",
  svg: "SVG",
  pdf: "PDF",
  sheet: "hoja PDF",
} as const;
