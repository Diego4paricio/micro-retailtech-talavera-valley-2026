import {
  type AvailabilityExperience,
  type AvailabilityItem,
  type AvailabilitySection,
  ITEM_QUANTITY_MAX,
  type ItemAvailabilityChange,
  type ItemAvailabilityStatus,
} from "@kardo/contracts";
import { ApiRequestError, errorMessage } from "../../lib/api.js";

/**
 * Pure rules of Disponibilidad: what customers see for an item, how a tap on
 * a control turns into a new state, filters, counts and labels. No React and
 * no network here, so every rule is unit-tested.
 */

/** The part of an item that the business changes live. */
export type ItemState = Pick<AvailabilityItem, "status" | "quantity">;

/** What customers see: a counted item with 0 units left reads as sold out. */
export type PublicState = ItemAvailabilityStatus;

export function publicState(state: ItemState): PublicState {
  if (state.status === "hidden") return "hidden";
  if (state.status === "sold_out" || state.quantity === 0) return "sold_out";
  return "available";
}

export function isCounting(state: ItemState): boolean {
  return state.quantity !== null;
}

export function sameState(a: ItemState, b: ItemState): boolean {
  return a.status === b.status && a.quantity === b.quantity;
}

export function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(ITEM_QUANTITY_MAX, Math.max(0, Math.round(value)));
}

/**
 * Reads what was typed in the units field: digits only, at most four. Empty
 * input returns null (the field is being edited and nothing is saved yet).
 */
export function parseQuantityInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (!digits) return null;
  return clampQuantity(Number.parseInt(digits, 10));
}

// ---------------------------------------------------------------------------
// Transitions: one user gesture → the next state of the item.
// ---------------------------------------------------------------------------

/**
 * The status control shows what customers see, so a counted item at 0 shows
 * "Agotado". Choosing "Disponible" again stops counting (otherwise it would
 * keep reading as sold out); the other two keep the count for later.
 */
export function withStatus(
  state: ItemState,
  status: ItemAvailabilityStatus,
): ItemState {
  if (status === "available")
    return {
      status,
      quantity: state.quantity === 0 ? null : state.quantity,
    };
  return { status, quantity: state.quantity };
}

/** Units left drive "sold out": more than 0 on a sold-out item brings it back. */
export function withQuantity(state: ItemState, quantity: number): ItemState {
  const next = clampQuantity(quantity);
  return {
    status:
      state.status === "sold_out" && next > 0 ? "available" : state.status,
    quantity: next,
  };
}

/** Starts counting: 1 unit left, or 0 for an item already sold out. */
export function startCounting(state: ItemState): ItemState {
  return {
    status: state.status,
    quantity: state.status === "sold_out" ? 0 : 1,
  };
}

export function stopCounting(state: ItemState): ItemState {
  return { status: state.status, quantity: null };
}

// ---------------------------------------------------------------------------
// Counts and filters.
// ---------------------------------------------------------------------------

export const availabilityFilters = [
  "all",
  "available",
  "sold_out",
  "hidden",
  "counted",
] as const;
export type AvailabilityFilter = (typeof availabilityFilters)[number];

export const filterLabels: Record<AvailabilityFilter, string> = {
  all: "Todos",
  available: "Disponibles",
  sold_out: "Agotados",
  hidden: "Ocultos",
  counted: "Con piezas",
};

export type AvailabilityCounts = Record<AvailabilityFilter, number>;

/**
 * A short list fits on one or two screens: no search and no filters, just
 * the items (simplified with the owner, 2026-10-12, after round 4: Rosa's
 * one comida corrida came with a search box and four filters). They stay
 * while a search or a filter is on, so it can always be cleared.
 */
export const listToolsFrom = 7;

export function showsListTools(
  itemCount: number,
  filter: AvailabilityFilter,
  query: string,
): boolean {
  return itemCount >= listToolsFrom || filter !== "all" || query.trim() !== "";
}

/** Photos only when the page has any: an empty box per item is noise. */
export function hasItemPhotos(
  experience: Pick<AvailabilityExperience, "sections">,
): boolean {
  return experience.sections.some((section) =>
    section.items.some((item) => Boolean(item.imageAssetId)),
  );
}

export function matchesFilter(
  state: ItemState,
  filter: AvailabilityFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "counted")
    return state.quantity !== null && state.quantity > 0;
  return publicState(state) === filter;
}

export function allItems(
  experience: Pick<AvailabilityExperience, "sections">,
): AvailabilityItem[] {
  return experience.sections.flatMap((section) => section.items);
}

/** A dish (relevo 37, D1): every real item but a guisado of one. */
export function isDish(item: Pick<AvailabilityItem, "choiceOf">): boolean {
  return !item.choiceOf;
}

/** A dish with its guisados right after it (`choiceOf`), the order the API
 * and the demo already keep them in. Used to search and to render a dish's
 * guisados nested under it, each with its own control. */
export type ItemGroup = { dish: AvailabilityItem; choices: AvailabilityItem[] };

export function groupItems(items: readonly AvailabilityItem[]): ItemGroup[] {
  const groups: ItemGroup[] = [];
  const byDishId = new Map<string, ItemGroup>();
  for (const item of items) {
    if (item.choiceOf) {
      byDishId.get(item.choiceOf)?.choices.push(item);
      continue;
    }
    const group: ItemGroup = { dish: item, choices: [] };
    groups.push(group);
    byDishId.set(item.id, group);
  }
  return groups;
}

/**
 * Counted by dish, never by dish-plus-guisados: a «Comida corrida» with 4
 * guisados is 1 artículo, not 5 (relevo 37, D1 — "los conteos de la sección
 * no cuentan doble"). A sold-out or hidden guisado does count in «Agotados»
 * and «Ocultos» (round 3: Rosa sold out the mole, read «Agotados 0» and
 * doubted it had worked).
 */
export function countItems(
  experience: Pick<AvailabilityExperience, "sections">,
): AvailabilityCounts {
  const counts: AvailabilityCounts = {
    all: 0,
    available: 0,
    sold_out: 0,
    hidden: 0,
    counted: 0,
  };
  for (const item of allItems(experience)) {
    const state = publicState(item);
    if (!isDish(item)) {
      if (state !== "available") counts[state] += 1;
      continue;
    }
    counts.all += 1;
    counts[state] += 1;
    if (matchesFilter(item, "counted")) counts.counted += 1;
  }
  return counts;
}

/** Case- and accent-insensitive: "cafe" finds "Café de olla". */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es-MX")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The sections to render: items matching the filter and the name search,
 * plus `keep` (items changed while this filter was on, so they do not vanish
 * under the finger). Sections left empty are dropped.
 *
 * A dish and its guisados (relevo 37, D1) are judged as one group: the
 * filter looks at the dish (a guisado sells out on its own, but the status
 * chips count dishes — `countItems`), the search looks at the dish's name
 * and every one of its guisados' names ("mole" finds a guisado even when
 * the dish is «Comida corrida»). A group that is shown always shows the
 * dish with every one of its guisados, nested under it.
 */
export function filterSections(
  sections: readonly AvailabilitySection[],
  filter: AvailabilityFilter,
  query: string,
  keep: ReadonlySet<string> = new Set(),
): AvailabilitySection[] {
  const needle = normalizeSearch(query);
  if (filter === "all" && !needle) return sections.slice();
  const result: AvailabilitySection[] = [];
  for (const section of sections) {
    const items: AvailabilityItem[] = [];
    for (const group of groupItems(section.items)) {
      const members = [group.dish, ...group.choices];
      const anyKept = members.some((item) => keep.has(item.id));
      // «Agotados» and «Ocultos» also bring a dish whose guisado is.
      const matchesStatus =
        anyKept ||
        matchesFilter(group.dish, filter) ||
        ((filter === "sold_out" || filter === "hidden") &&
          group.choices.some((choice) => matchesFilter(choice, filter)));
      const matchesSearch =
        anyKept ||
        !needle ||
        members.some((item) => normalizeSearch(item.name).includes(needle));
      if (matchesStatus && matchesSearch) items.push(...members);
    }
    if (items.length > 0)
      result.push(
        items.length === section.items.length ? section : { ...section, items },
      );
  }
  return result;
}

/** "Todo disponible": every item not already available and uncounted. */
export function allAvailableChanges(
  experience: Pick<AvailabilityExperience, "sections">,
): ItemAvailabilityChange[] {
  return allItems(experience)
    .filter((item) => item.status !== "available" || item.quantity !== null)
    .map((item) => ({ itemId: item.id, status: "available", quantity: null }));
}

/** The exact states of the given items, to undo a bulk change. */
export function snapshotChanges(
  experience: Pick<AvailabilityExperience, "sections">,
  itemIds: readonly string[],
): ItemAvailabilityChange[] {
  const wanted = new Set(itemIds);
  return allItems(experience)
    .filter((item) => wanted.has(item.id))
    .map((item) => ({
      itemId: item.id,
      status: item.status,
      quantity: item.quantity,
    }));
}

// ---------------------------------------------------------------------------
// Labels.
// ---------------------------------------------------------------------------

export const statusLabels: Record<ItemAvailabilityStatus, string> = {
  available: "Disponible",
  sold_out: "Agotado",
  hidden: "Oculto",
};

export type ItemBadge = {
  label: string;
  tone: "sold-out" | "hidden" | "low" | "count";
};

/** The chip next to the name: exactly what the public page shows. */
export function itemBadge(state: ItemState): ItemBadge | null {
  const visible = publicState(state);
  if (visible === "hidden") return { label: "Oculto", tone: "hidden" };
  if (visible === "sold_out") return { label: "Agotado", tone: "sold-out" };
  if (state.quantity !== null)
    return {
      label: `Quedan ${state.quantity}`,
      tone: state.quantity <= 3 ? "low" : "count",
    };
  return null;
}

/** Short summary of an Experience for the picker: what needs attention. */
export function countsSummary(counts: AvailabilityCounts): string {
  const parts: string[] = [];
  if (counts.sold_out)
    parts.push(
      `${counts.sold_out} ${counts.sold_out === 1 ? "agotado" : "agotados"}`,
    );
  if (counts.hidden)
    parts.push(
      `${counts.hidden} ${counts.hidden === 1 ? "oculto" : "ocultos"}`,
    );
  if (parts.length) return parts.join(" · ");
  if (!counts.all) return "Sin artículos";
  return "Todo disponible";
}

export function touchpointsLabel(count: number): string {
  if (count === 0) return "Sin QR ni etiquetas en vivo";
  return count === 1
    ? "En vivo en 1 QR o etiqueta"
    : `En vivo en ${count} QR y etiquetas`;
}

export function itemsLabel(count: number): string {
  return count === 1 ? "1 artículo" : `${count} artículos`;
}

/** Under a section name: its size and, when any, how many are sold out. */
export function sectionSummary(section: AvailabilitySection): string {
  let dishes = 0;
  let soldOut = 0;
  let choicesSoldOut = 0;
  for (const item of section.items) {
    const gone = publicState(item) === "sold_out";
    if (isDish(item)) {
      dishes += 1;
      if (gone) soldOut += 1;
    } else if (gone) choicesSoldOut += 1;
  }
  const parts = [itemsLabel(dishes)];
  if (soldOut)
    parts.push(`${soldOut} ${soldOut === 1 ? "agotado" : "agotados"}`);
  if (choicesSoldOut)
    parts.push(
      `${choicesSoldOut} ${choicesSoldOut === 1 ? "guisado agotado" : "guisados agotados"}`,
    );
  return parts.join(" · ");
}

const emptyFilterMessages: Record<AvailabilityFilter, string> = {
  all: "No hay artículos.",
  available: "Ningún artículo está disponible en este momento.",
  sold_out: "No hay artículos agotados.",
  hidden: "No hay artículos ocultos.",
  counted: "Ningún artículo tiene piezas contadas.",
};

/** Why the list is empty under the current filter and search. */
export function emptyFilterMessage(
  filter: AvailabilityFilter,
  query: string,
): string {
  const text = query.trim();
  if (!text) return emptyFilterMessages[filter];
  return filter === "all"
    ? `Ningún artículo coincide con «${text}».`
    : `Ningún artículo de «${filterLabels[filter]}» coincide con «${text}».`;
}

/** What the empty list offers (relevo 37, S1): Rosa searched for «mole» and
 * only got «Nada por aquí» — no way to add it from there. A search with
 * nothing found now offers to add that exact name, when the person can
 * edit the page's items; a filter alone (no search) keeps the older,
 * softer message. Pure, so the board's JSX stays thin. */
export type SearchEmptyState = {
  title: string;
  /** Shown under the title; null once `offerToAdd` already explains why. */
  message: string | null;
  /** The name to prefill «Editar productos y precios» with, or null. */
  offerToAdd: string | null;
};

export function searchEmptyState(
  counts: AvailabilityCounts,
  filter: AvailabilityFilter,
  query: string,
  canAddItems: boolean,
): SearchEmptyState {
  const term = query.trim();
  if (term)
    return {
      title: `No hay «${term.slice(0, 60)}»`,
      message: null,
      offerToAdd: canAddItems ? term : null,
    };
  if (counts.all)
    return {
      title: "Nada por aquí",
      message: emptyFilterMessage(filter, query),
      offerToAdd: null,
    };
  return {
    title: "Sin artículos",
    message:
      "Esta página todavía no tiene artículos. Agrégalos desde el editor y publícala.",
    offerToAdd: null,
  };
}

const relativeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "hace 5 minutos"; a date slightly in the future (clock skew) is "now". */
export function relativeTime(value: string, now: number): string {
  const seconds = Math.min(
    0,
    Math.round((new Date(value).getTime() - now) / 1000),
  );
  if (Number.isNaN(seconds)) return "";
  const formatter = new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" });
  for (const [unit, size] of relativeUnits)
    if (Math.abs(seconds) >= size)
      return formatter.format(Math.round(seconds / size), unit);
  return "hace un momento";
}

// ---------------------------------------------------------------------------
// Errors.
// ---------------------------------------------------------------------------

/** Customer-facing explanation of a failed save (Spanish, tuteo). */
export function availabilityErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === "ITEM_AVAILABILITY_UNAVAILABLE")
      return "No pudimos confirmar el cambio con tus QR y etiquetas, así que no se aplicó. Intenta de nuevo.";
    if (error.code === "EXPERIENCE_ARCHIVED")
      return "Esta página se archivó y ya no acepta cambios de disponibilidad.";
  }
  return errorMessage(error);
}
