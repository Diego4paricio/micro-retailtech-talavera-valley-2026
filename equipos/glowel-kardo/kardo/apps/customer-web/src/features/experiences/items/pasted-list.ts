import { limits, newItemId } from "../content.js";

/**
 * Rows of name and price — a Menú's dishes or a Catálogo's products — and
 * the pure reader for a list already written («Pegar mi lista», relevo 37
 * C5a): one item per line, its price at the end ("Concha 18", "Concha -
 * $18", "Concha $18.50"). No network, no React, so it is reused as-is by
 * Primeros pasos' `QuickItemsEditor` and by «Editar productos y precios»
 * (`experiences/EditItemsDialog.tsx`, which already reuses
 * `QuickItemsEditor` itself; this module is for anything that only needs
 * the reader).
 */

/** "menu" groups items in named sections; "catalog" is one flat list. */
export type FirstPageType = "menu" | "catalog";

/** One guisado of a «comida corrida» (relevo 37, D1); matches `MenuChoice`
 * in `@kardo/contracts` (own id, so it sells out on its own). */
export type ItemChoice = { id: string; name: string };

export type ItemRow = {
  /** The content item's id when it already exists (keeps its photo). */
  id: string;
  name: string;
  price: string;
  /** The dish or product photo (relevo 37, D3): a validated image already
   * in Archivos, picked or just uploaded. */
  imageAssetId?: string;
  /** «Menú del día»: guisados to choose from, a Menú dish only (D1). */
  choices?: ItemChoice[];
  /** The line above the choices; «Elige tu guisado» when absent. */
  choicesLabel?: string;
};
export type SectionRows = { id: string; name: string; rows: ItemRow[] };

export const emptyRow = (): ItemRow => ({
  id: newItemId(),
  name: "",
  price: "",
});

/** "$75", "75.50", "75,50 pesos" → 75.5; anything else → undefined. */
export function parsePrice(text: string): number | undefined {
  const cleaned = text
    .replace(/pesos|mxn|\$/gi, "")
    .replace(/\s/g, "")
    .replace(/,(\d{1,2})$/, ".$1")
    .replace(/,/g, "");
  if (!cleaned) return undefined;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 && value <= limits.maxPrice
    ? Math.round(value * 100) / 100
    : undefined;
}

export function formatPrice(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Rows that will be saved: a name, and a price that reads as one. */
export function filledRows(rows: readonly ItemRow[]): ItemRow[] {
  return rows.filter((row) => row.name.trim());
}

/** A price typed that does not read as a number (the row says so). */
export function rowPriceError(row: ItemRow): boolean {
  return Boolean(row.price.trim()) && parsePrice(row.price) === undefined;
}

/**
 * «Pegar mi lista»: one item per line with its price at the end
 * ("Chilaquiles verdes $75", "Molletes - 55", "Café de olla 20 pesos").
 * On a Menú, a line without a price before priced lines starts a section
 * ("Desayunos:"). Done here, not by the AI: instant and free.
 */
export function parsePastedList(
  text: string,
  type: FirstPageType,
  defaultSection: string,
): SectionRows[] {
  const sections: SectionRows[] = [];
  let current: SectionRows | null = null;
  const pricePattern =
    /^(.*?)[\s.·…:\-–—]*\$?\s*(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:pesos|mxn)?\.?$/i;
  for (const raw of text.split(/\r?\n/)) {
    // List markers only ("1.", "2)", "•", "-"): "3 tacos" keeps its 3.
    const line = raw.replace(/^\s*(?:[•*\-–—]|\d+[.)])\s+/, "").trim();
    if (!line) continue;
    const match = pricePattern.exec(line);
    const name = (match?.[1] ?? line)
      .trim()
      .replace(/[:.\-–—]+$/, "")
      .trim();
    const price = match?.[2] ? parsePrice(match[2]) : undefined;
    if (price === undefined && type === "menu" && name.length <= 40) {
      current = { id: newItemId(), name, rows: [] };
      sections.push(current);
      continue;
    }
    if (!name) continue;
    if (!current) {
      current = {
        id: type === "menu" ? newItemId() : "items",
        name: type === "menu" ? defaultSection : "",
        rows: [],
      };
      sections.push(current);
    }
    current.rows.push({
      id: newItemId(),
      name: name.slice(0, limits.title),
      price: price === undefined ? "" : formatPrice(price),
    });
  }
  return sections.filter((section) => section.rows.length > 0);
}

/** Adds pasted sections to the ones on screen (same name → same section). */
export function mergeSections(
  current: readonly SectionRows[],
  pasted: readonly SectionRows[],
): SectionRows[] {
  const next = current.map((section) => ({
    ...section,
    rows: filledRows(section.rows),
  }));
  for (const section of pasted) {
    const same = next.find(
      (item) =>
        item.name.trim().toLowerCase() === section.name.trim().toLowerCase(),
    );
    if (same) same.rows.push(...section.rows);
    else next.push({ ...section, rows: [...section.rows] });
  }
  const kept = next.filter((section) => section.rows.length > 0);
  return kept.map((section) => ({
    ...section,
    rows: [...section.rows, emptyRow()],
  }));
}
