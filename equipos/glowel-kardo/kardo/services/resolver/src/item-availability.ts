import type { CatalogItem, ExperiencePayload, MenuItem } from "./snapshot.js";
import { isRecord } from "./snapshot.js";

// ---------------------------------------------------------------------------
// Live Menu/Catalog item availability. Deliberately NOT part of a published
// Experience version or its Resolver snapshot: it changes many times a day
// and must never create a version or go through publishing. Postgres (owned
// by the Customer API) is the source of truth; the Resolver keeps a copy per
// Experience in the `ItemAvailabilityState` Durable Object (see index.ts) and
// applies it on top of the immutable snapshot at render time, using the pure
// functions in this file.
// ---------------------------------------------------------------------------

export type ItemAvailabilityStatus = "available" | "sold_out" | "hidden";

export type ItemAvailabilityEntry = {
  status: ItemAvailabilityStatus;
  quantity: number | null;
};

/** Keyed by item id. Items absent from this overlay are available. */
export type ItemAvailabilityOverlay = Record<string, ItemAvailabilityEntry>;

export type AvailabilityBadge = {
  soldOut: boolean;
  /** Units left to advertise ("Quedan N"); null when not worth showing
   * (unknown, zero — which is `soldOut` instead — or not tracked). */
  remaining: number | null;
};

/** A choice of a dish (D1); `soldOut` from its own live state. */
export type AnnotatedMenuChoice = { id: string; name: string; soldOut?: true };
export type AnnotatedMenuItem = Omit<MenuItem, "choices"> & {
  availability?: AvailabilityBadge;
  choices?: AnnotatedMenuChoice[];
};
export type AnnotatedMenuSection = {
  id: string;
  name: string;
  items: AnnotatedMenuItem[];
};
export type MenuRenderData = {
  title: string;
  description?: string;
  currency: string;
  sections: AnnotatedMenuSection[];
};

export type AnnotatedCatalogItem = CatalogItem & {
  availability?: AvailabilityBadge;
};
export type CatalogRenderData = {
  title: string;
  description?: string;
  currency: string;
  items: AnnotatedCatalogItem[];
};

function resolveItem(
  overlay: ItemAvailabilityOverlay,
  itemId: string,
): { hidden: true } | { hidden: false; availability?: AvailabilityBadge } {
  const entry = overlay[itemId];
  if (!entry) return { hidden: false };
  if (entry.status === "hidden") return { hidden: true };
  const soldOut = entry.status === "sold_out" || entry.quantity === 0;
  const remaining =
    !soldOut && entry.quantity !== null && entry.quantity > 0
      ? entry.quantity
      : null;
  return { hidden: false, availability: { soldOut, remaining } };
}

/** A dish with its choices resolved (relevo 37, D1): a hidden choice is
 * dropped, a sold-out one is marked, and when no choice is left to pick the
 * dish itself reads as sold out. */
function withChoices(
  item: MenuItem,
  overlay: ItemAvailabilityOverlay,
  availability: AvailabilityBadge | undefined,
): AnnotatedMenuItem {
  const { choices: ownChoices, ...dish } = item;
  if (!ownChoices) return availability ? { ...dish, availability } : dish;
  const choices: AnnotatedMenuChoice[] = [];
  for (const choice of ownChoices) {
    const resolved = resolveItem(overlay, choice.id);
    if (resolved.hidden) continue;
    choices.push(
      resolved.availability?.soldOut
        ? { id: choice.id, name: choice.name, soldOut: true }
        : { id: choice.id, name: choice.name },
    );
  }
  const nothingLeft = choices.every((choice) => choice.soldOut);
  const badge: AvailabilityBadge | undefined = nothingLeft
    ? { soldOut: true, remaining: null }
    : availability;
  return {
    ...dish,
    ...(choices.length > 0 ? { choices } : {}),
    ...(badge ? { availability: badge } : {}),
  };
}

/**
 * Applies a live availability overlay to a Menu experience, purely: no I/O,
 * same input always yields the same output. `hidden` items are dropped, a
 * section left with no items is dropped, and an id absent from `overlay` (or
 * an id in `overlay` with no matching item) is treated as available/ignored
 * respectively. Call with `overlay: {}` to get the unmodified experience back
 * (used when no live overlay is available, e.g. the DO lookup failed).
 */
export function applyMenuAvailability(
  experience: Extract<ExperiencePayload, { type: "menu" }>,
  overlay: ItemAvailabilityOverlay,
): MenuRenderData {
  const sections: AnnotatedMenuSection[] = [];
  for (const section of experience.sections) {
    const items: AnnotatedMenuItem[] = [];
    for (const item of section.items) {
      const resolved = resolveItem(overlay, item.id);
      if (resolved.hidden) continue;
      items.push(withChoices(item, overlay, resolved.availability));
    }
    if (items.length > 0)
      sections.push({ id: section.id, name: section.name, items });
  }
  return {
    title: experience.title,
    ...(experience.description !== undefined
      ? { description: experience.description }
      : {}),
    currency: experience.currency,
    sections,
  };
}

/** Catalog counterpart of `applyMenuAvailability`; see its docs. */
export function applyCatalogAvailability(
  experience: Extract<ExperiencePayload, { type: "catalog" }>,
  overlay: ItemAvailabilityOverlay,
): CatalogRenderData {
  const items: AnnotatedCatalogItem[] = [];
  for (const item of experience.items) {
    const resolved = resolveItem(overlay, item.id);
    if (resolved.hidden) continue;
    items.push(
      resolved.availability
        ? { ...item, availability: resolved.availability }
        : { ...item },
    );
  }
  return {
    title: experience.title,
    ...(experience.description !== undefined
      ? { description: experience.description }
      : {}),
    currency: experience.currency,
    items,
  };
}

export function applyItemAvailability(
  experience: Extract<ExperiencePayload, { type: "menu" }>,
  overlay: ItemAvailabilityOverlay,
): MenuRenderData;
export function applyItemAvailability(
  experience: Extract<ExperiencePayload, { type: "catalog" }>,
  overlay: ItemAvailabilityOverlay,
): CatalogRenderData;
export function applyItemAvailability(
  experience: Extract<ExperiencePayload, { type: "menu" | "catalog" }>,
  overlay: ItemAvailabilityOverlay,
): MenuRenderData | CatalogRenderData {
  return experience.type === "menu"
    ? applyMenuAvailability(experience, overlay)
    : applyCatalogAvailability(experience, overlay);
}

// ---------------------------------------------------------------------------
// POST /internal/item-availability body parsing. Pure and unit-testable in
// isolation from the Durable Object / HTTP handler in index.ts.
// ---------------------------------------------------------------------------

export type ItemAvailabilityCommandItem = {
  id: string;
  status: ItemAvailabilityStatus;
  quantity: number | null;
};

export type ItemAvailabilityCommand = {
  experienceId: string;
  version: number;
  items: ItemAvailabilityCommandItem[];
};

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const itemIdPattern = /^[a-zA-Z0-9_-]{1,64}$/;

/** The Customer API only ever sends the non-default entries for the
 * Touchpoints it publishes to, but a Menu/Catalog can be live on several
 * Touchpoints across versions, so the union of ids in one command can exceed
 * a single Experience's own item cap. */
export const MAX_ITEM_AVAILABILITY_ITEMS = 500;

function isItemAvailabilityStatus(
  value: unknown,
): value is ItemAvailabilityStatus {
  return value === "available" || value === "sold_out" || value === "hidden";
}

function parseQuantity(value: unknown): number | null | typeof INVALID {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 9_999
  )
    return INVALID;
  return value;
}

const INVALID = Symbol("invalid");

function parseItem(value: unknown): ItemAvailabilityCommandItem | null {
  if (!isRecord(value)) return null;
  const allowedKeys = new Set(["id", "status", "quantity"]);
  if (!Object.keys(value).every((key) => allowedKeys.has(key))) return null;
  const { id, status, quantity } = value;
  if (typeof id !== "string" || !itemIdPattern.test(id)) return null;
  if (!isItemAvailabilityStatus(status)) return null;
  const parsedQuantity = parseQuantity(quantity);
  if (parsedQuantity === INVALID) return null;
  return { id, status, quantity: parsedQuantity };
}

export function parseItemAvailabilityCommand(
  value: unknown,
): ItemAvailabilityCommand | null {
  if (!isRecord(value)) return null;
  const allowedKeys = new Set(["experienceId", "version", "items"]);
  if (!Object.keys(value).every((key) => allowedKeys.has(key))) return null;
  const { experienceId, version, items } = value;
  if (
    typeof experienceId !== "string" ||
    !canonicalUuidPattern.test(experienceId)
  )
    return null;
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > Number.MAX_SAFE_INTEGER
  )
    return null;
  // An empty list is valid and clears the overlay: the Customer API sends only
  // non-default entries, so "everything available again" arrives as `[]`.
  if (!Array.isArray(items) || items.length > MAX_ITEM_AVAILABILITY_ITEMS)
    return null;

  const seen = new Set<string>();
  const parsedItems: ItemAvailabilityCommandItem[] = [];
  for (const raw of items) {
    const parsed = parseItem(raw);
    if (!parsed || seen.has(parsed.id)) return null;
    seen.add(parsed.id);
    parsedItems.push(parsed);
  }

  return { experienceId, version, items: parsedItems };
}
