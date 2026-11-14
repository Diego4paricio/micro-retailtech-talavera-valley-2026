import type { ExperienceType, PieceModel } from "@kardo/contracts";
import { touchpointNameSuggestions } from "./new-touchpoint-model.js";
import { pieceViews } from "./pieces/pieces.js";

/*
 * The one naming rule for a new QR or tag, wherever it is created (domain
 * audit A9-9): «Nuevo QR o etiqueta», the publish dialog and Primeros pasos.
 * It reads the format, the page it will show, the giro, the business's own
 * name and the names already in use, so it never repeats one and a tag never
 * gets a QR's name.
 */

/** A business name that says it is a truck or a tianguis stall: neither has
 * a giro of its own, so the type alone ("menu") must not suggest "Mesas"
 * (relevo 37, C9b — Paty, Chema). */
const truckName = /food\s*truck|\btruck\b|cami[oó]n/i;
const tianguisName = /tianguis/i;

/**
 * The name a first QR gets when Kardo creates it for the owner (publish
 * dialog without Touchpoints, Primeros pasos): where it will be stuck, in
 * the owner's words. In the simulated-user study 4 of 5 owners who tried to
 * publish were sent away to create a Touchpoint first (relevo 31, finding 1).
 * Only a confident giro — or the business's own name — earns a specific
 * guess; otherwise it stays neutral (relevo 37, C9b) instead of assuming a
 * sit-down restaurant, a shop counter or a reception desk exist.
 */
export function suggestedQrName(
  type: ExperienceType,
  industry?: string | null,
  businessName?: string | null,
): string {
  if (type === "menu" && businessName) {
    if (truckName.test(businessName)) return "Camión";
    if (tianguisName.test(businessName)) return "Puesto";
  }
  if (industry === "floreria" || industry === "papeleria") return "Mostrador";
  if (industry === "panaderia") return "Mostrador";
  if (industry === "agencia") return "Tarjetas";
  if (industry === "belleza") return "Espejo";
  if (industry === "servicios" || industry === "salud") return "Tarjetas";
  if (industry === "retail") return "Mostrador";
  if (industry === "hotel") return "Recepción";
  // A restaurant, a café or a bar is a confident guess for "Mesas" (round 3:
  // Lucía's café got «Mi QR» twice); any other giro (or none at all) stays
  // neutral instead of assuming tables exist.
  if (
    type === "menu" &&
    (industry === "restaurante" ||
      industry === "cafeteria" ||
      industry === "bar")
  )
    return "Mesas";
  if (type === "catalog") return "Mostrador";
  if (type === "form") return "Tarjetas";
  return "Mi QR";
}

/** Extra chips per giro, before the neutral options (relevo 37, C9b). The
 * confident single guess (`suggestedQrName`) always comes first. */
const qrChipsByIndustry: Partial<Record<string, string[]>> = {
  restaurante: ["Mesas", "Mostrador", "Barra"],
  cafeteria: ["Mesas", "Barra", "Mostrador"],
  bar: ["Mesas", "Barra"],
  floreria: ["Mostrador", "Arreglos", "Tarjetas"],
  panaderia: ["Mostrador", "Vitrina"],
  agencia: ["Tarjetas", "Recepción"],
  papeleria: ["Mostrador", "Letreros"],
  belleza: ["Espejo", "Recepción", "Mostrador"],
  servicios: ["Tarjetas", "Recepción", "Mostrador"],
  salud: ["Tarjetas", "Recepción", "Mostrador"],
  retail: ["Mostrador", "Probador", "Caja"],
  hotel: ["Recepción", "Mostrador", "Habitaciones"],
};

/**
 * Up to five chips to choose a new destination's name from (C9b: elegir
 * antes que escribir). "Otro nombre" (free text) is always offered by the
 * caller, never one of these. For `kind: "nfc"` the usual tag names apply
 * regardless of giro — no "Mesas"-style guess was ever made for those.
 */
export function suggestedDestinationNameChips(
  kind: "qr" | "nfc",
  type: ExperienceType,
  industry?: string | null,
  businessName?: string | null,
  /** Names the business already uses: never offered again (two QR called
   * «Mi QR» read as one). The page's own name takes their place. */
  taken: readonly string[] = [],
  pageName?: string | null,
): string[] {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));
  const free = (names: readonly string[]) => {
    const kept = names.filter((name) => !used.has(name.trim().toLowerCase()));
    // A copy's «(copia)» says nothing about where the QR goes (round 4).
    const own = pageName?.replace(/\s*\(copia(?:\s+\d+)?\)\s*$/i, "").trim();
    if (own && !used.has(own.toLowerCase()) && kept.length < names.length)
      kept.unshift(own.slice(0, 60));
    return kept.slice(0, 5);
  };
  if (kind === "nfc") return free([...touchpointNameSuggestions.nfc]);
  const first = suggestedQrName(type, industry, businessName);
  const pool = (industry && qrChipsByIndustry[industry]) || [];
  const neutral =
    type === "menu"
      ? ["Mi QR", "Mostrador", "Camión", "Puesto", "Letreros"]
      : type === "catalog"
        ? ["Mostrador", "Mi QR", "Caja"]
        : type === "form"
          ? ["Tarjetas", "Mostrador", "Mi QR"]
          : ["Mi QR", "Mostrador", "Recepción"];
  const names = [first, ...pool, ...neutral];
  return free([...new Set(names)].slice(0, 5));
}

/** What a new QR or tag is about to show and where it lives. */
export type TouchpointNameContext = {
  kind: "qr" | "nfc";
  pageType: ExperienceType;
  industry?: string | null | undefined;
  businessName?: string | null | undefined;
  /** Names the business already uses (they are never suggested again). */
  existingNames?: readonly string[] | undefined;
  pageName?: string | null | undefined;
};

/** The chips to choose a new QR's or tag's name from, best guess first. */
export function suggestTouchpointNames(input: TouchpointNameContext): string[] {
  return suggestedDestinationNameChips(
    input.kind,
    input.pageType,
    input.industry,
    input.businessName,
    input.existingNames ?? [],
    input.pageName,
  );
}

/**
 * The name Kardo gives a new QR or tag when nobody types one: the first free
 * suggestion, or the usual one numbered («Mostrador 2») when every
 * suggestion is taken. Never a name already in use.
 */
export function suggestTouchpointName(input: TouchpointNameContext): string {
  const first = suggestTouchpointNames(input)[0];
  if (first) return first;
  const base =
    input.kind === "nfc"
      ? (touchpointNameSuggestions.nfc[0] ?? "Etiqueta")
      : suggestedQrName(input.pageType, input.industry, input.businessName);
  const used = new Set(
    (input.existingNames ?? []).map((name) => name.trim().toLowerCase()),
  );
  for (let number = 2; number < 1000; number += 1) {
    const candidate = `${base} ${number}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

/**
 * Names for Kardo pieces being activated (ADR 026), in the order given: a
 * lone model keeps its name («Stand»), several are numbered like a batch
 * («Magnet 1 … 25»), and a name already in use is skipped («Card 2» when
 * «Card» exists). The owner can change any of them before activating.
 */
export function suggestPieceNames(
  models: readonly PieceModel[],
  existingNames: readonly string[] = [],
): string[] {
  const used = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  const totals = new Map<PieceModel, number>();
  for (const model of models) totals.set(model, (totals.get(model) ?? 0) + 1);
  // Per model, the next number to try (0: the bare name).
  const next = new Map<PieceModel, number>();
  return models.map((model) => {
    const base = pieceViews[model].name;
    let number = next.get(model) ?? (totals.get(model) === 1 ? 0 : 1);
    for (;;) {
      const candidate = number === 0 ? base : `${base} ${number}`;
      number = number === 0 ? 2 : number + 1;
      if (!used.has(candidate.toLowerCase())) {
        used.add(candidate.toLowerCase());
        next.set(model, number);
        return candidate;
      }
    }
  });
}
