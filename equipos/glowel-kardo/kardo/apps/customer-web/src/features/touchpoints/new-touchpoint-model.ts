import { batchNames } from "./batch-preview.js";
import { type PhysicalTouchpointKind, touchpointKindLabels } from "./kind.js";

/**
 * The "Nuevo touchpoint" assistant (a three-step dialog): what the object is,
 * what the team calls it (one or many), and the optional details. Pure, so
 * the steps, their validation and the summary are tested without a browser.
 */

export const newTouchpointSteps = [
  { id: "kind", label: "Objeto" },
  { id: "name", label: "Nombre" },
  { id: "details", label: "Orden" },
] as const;
export type NewTouchpointStep = (typeof newTouchpointSteps)[number]["id"];

/** Where the new touchpoints go: no group, a group that exists, a group
 * created on the spot, or (many at once) split across several groups. */
export type GroupMode = "none" | "existing" | "new" | "split";

/** One part of a split batch: a group name (new, or an existing group's
 * name) and how many consecutive touchpoints it gets. */
export type GroupSplit = { name: string; count: number };

export type NewTouchpointDraft = {
  kind: PhysicalTouchpointKind | null;
  mode: "single" | "batch";
  name: string;
  namePrefix: string;
  start: number;
  count: number;
  groupMode: GroupMode;
  groupId: string;
  newGroupName: string;
  /** Where new groups go ("" = top level). Groups nest (ADR 021). */
  newGroupParentId: string;
  splits: GroupSplit[];
  /** The customer picked an option in "Orden" (defaults stop applying). */
  orderTouched: boolean;
  qrTemplateId: string;
};

export const emptyNewTouchpointDraft: NewTouchpointDraft = {
  kind: null,
  mode: "single",
  name: "",
  namePrefix: "",
  start: 1,
  count: 10,
  groupMode: "none",
  groupId: "",
  newGroupName: "",
  newGroupParentId: "",
  splits: [],
  orderTouched: false,
  qrTemplateId: "",
};

export const BATCH_MAX = 100;

/** What each format is for, with examples from several kinds of business. */
export const touchpointKindExamples: Record<PhysicalTouchpointKind, string> = {
  qr: "Mesas, mostradores, probadores, volantes y empaques.",
  nfc: "Tarjetas de presentación, llaveros y stickers en caja.",
  other: "Pantallas, firmas de correo o redes: solo compartes la URL.",
  kardo:
    "Stand, Card, Magnet o Sticker: lo activas con el código que viene con tu pieza.",
};

/** Names the team often uses, to start from instead of a blank field.
 * "Mostrador" leads the QR chips (relevo 37, C9b): a food truck or a
 * tianguis stall has no giro of its own, so a QR's first suggestion should
 * not assume tables exist the way "Mesa 1" once did. */
export const touchpointNameSuggestions: Record<
  PhysicalTouchpointKind,
  readonly string[]
> = {
  qr: ["Mostrador", "Mesa 1", "Recepción", "Probador", "Camión", "Puesto"],
  nfc: ["Tarjeta de presentación", "Llavero", "Sticker de caja"],
  other: ["Pantalla de recepción", "Firma de correo", "Bio de Instagram"],
  kardo: ["Mostrador", "Tarjeta de presentación", "Refri"],
};

export function clampBatch(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * A plural for a batch's group name: "Mesa" → "Mesas", "Mostrador" →
 * "Mostradores", "Luz" → "Luces". Only one-word names change; anything
 * longer stays as written (the customer edits it anyway).
 */
export function pluralGroupName(prefix: string): string {
  const name = prefix.trim();
  if (!name || /\s/.test(name)) return name;
  if (/[aeiouáéíóú]$/i.test(name)) return `${name}s`;
  if (/z$/i.test(name)) return `${name.slice(0, -1)}ces`;
  if (/s$/i.test(name)) return name;
  return `${name}es`;
}

/** Two halves to start a split from (the customer renames and resizes). */
export function defaultSplits(count: number): GroupSplit[] {
  if (count < 2) return [{ name: "", count: Math.max(count, 1) }];
  const first = Math.ceil(count / 2);
  return [
    { name: "", count: first },
    { name: "", count: count - first },
  ];
}

/**
 * After the customer changes one group's count, the last group takes what is
 * left so the total keeps matching (it never goes below zero). Editing the
 * last group itself changes nothing else.
 */
export function withCountAt(
  total: number,
  splits: readonly GroupSplit[],
  index: number,
  count: number,
): GroupSplit[] {
  const next = splits.map((split, at) =>
    at === index ? { ...split, count } : split,
  );
  const last = next.length - 1;
  if (index >= last || last < 1) return next;
  const others = next
    .slice(0, last)
    .reduce((sum, split) => sum + split.count, 0);
  const lastSplit = next[last];
  if (lastSplit)
    next[last] = { ...lastSplit, count: Math.max(0, total - others) };
  return next;
}

/** The consecutive range each split gets, from the batch's first number. */
export function splitRanges(
  start: number,
  splits: readonly GroupSplit[],
): { name: string; start: number; count: number }[] {
  let next = start;
  return splits.map((split) => {
    const range = { name: split.name.trim(), start: next, count: split.count };
    next += split.count;
    return range;
  });
}

/** The same groups (names kept), with `count` shared as evenly as possible. */
export function evenSplits(
  count: number,
  splits: readonly GroupSplit[],
): GroupSplit[] {
  const parts = Math.max(1, Math.min(splits.length, count));
  const base = Math.floor(count / parts);
  const extra = count % parts;
  return splits.slice(0, parts).map((split, index) => ({
    name: split.name,
    count: base + (index < extra ? 1 : 0),
  }));
}

/**
 * What "Orden" proposes when the customer arrives: many at once go to a new
 * group named after them ("Mesa" → «Mesas»); one goes without a group. Once
 * the customer picks an option, it is kept.
 */
export function withOrderDefaults(
  draft: NewTouchpointDraft,
): NewTouchpointDraft {
  if (draft.mode === "single" && draft.groupMode === "split")
    return { ...draft, groupMode: "none" };
  if (draft.orderTouched) return draft;
  if (draft.mode === "batch")
    return {
      ...draft,
      groupMode: "new",
      newGroupName: pluralGroupName(draft.namePrefix),
    };
  return { ...draft, groupMode: "none" };
}

/** An existing group with this name (case and spaces ignored), if any. */
export function groupNamed<T extends { name: string }>(
  groups: readonly T[],
  name: string,
): T | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return groups.find((group) => group.name.trim().toLowerCase() === key);
}

/**
 * The summary's line about where the new touchpoints go. `existingGroupName`
 * is the chosen group (its path, «Local Centro › Terraza»); `parentName` is
 * where new groups go, if inside another one.
 */
export function orderSummary(
  draft: NewTouchpointDraft,
  existingGroupName: string | null,
  parentName: string | null = null,
): string {
  const inside = parentName ? ` dentro de «${parentName}»` : "";
  if (draft.groupMode === "existing" && existingGroupName)
    return `En el grupo «${existingGroupName}»`;
  if (draft.groupMode === "new" && draft.newGroupName.trim())
    return `En el grupo nuevo «${draft.newGroupName.trim()}»${inside}`;
  if (draft.groupMode === "split" && draft.mode === "batch")
    return `Repartidos en ${draft.splits.length} grupos${inside}: ${draft.splits
      .map((split) => `${split.name.trim() || "sin nombre"} (${split.count})`)
      .join(", ")}`;
  return "Sin grupo";
}

/** Why a split cannot be created yet, or null when it can. */
export function splitProblem(
  draft: Pick<NewTouchpointDraft, "count" | "splits">,
): string | null {
  if (draft.splits.length < 2) return "Reparte en al menos dos grupos.";
  if (draft.splits.some((split) => !split.name.trim()))
    return "Ponle nombre a cada grupo.";
  if (draft.splits.some((split) => split.count < 1))
    return "Cada grupo necesita al menos un touchpoint.";
  const names = draft.splits.map((split) => split.name.trim().toLowerCase());
  if (new Set(names).size !== names.length)
    return "Usa un nombre distinto para cada grupo.";
  const total = draft.splits.reduce((sum, split) => sum + split.count, 0);
  if (total !== draft.count)
    return total < draft.count
      ? `Faltan ${draft.count - total} por repartir.`
      : `Sobran ${total - draft.count}: reparte ${draft.count} en total.`;
  return null;
}

/** True when the "Orden" step has what it needs. */
export function groupChoiceIsComplete(draft: NewTouchpointDraft): boolean {
  if (draft.groupMode === "existing") return Boolean(draft.groupId);
  if (draft.groupMode === "new") return draft.newGroupName.trim().length > 0;
  if (draft.groupMode === "split")
    return draft.mode === "batch" && splitProblem(draft) === null;
  return true;
}

/** True when a step has what it needs to move on. */
export function stepIsComplete(
  step: NewTouchpointStep,
  draft: NewTouchpointDraft,
): boolean {
  if (step === "kind") return draft.kind !== null;
  if (step === "name") {
    if (draft.mode === "single") return draft.name.trim().length > 0;
    return (
      draft.namePrefix.trim().length > 0 &&
      draft.count >= 1 &&
      draft.count <= BATCH_MAX &&
      draft.start >= 1
    );
  }
  return (
    stepIsComplete("kind", draft) &&
    stepIsComplete("name", draft) &&
    groupChoiceIsComplete(draft)
  );
}

/** The step to show first: the earliest one still missing something. */
export function firstOpenStep(draft: NewTouchpointDraft): NewTouchpointStep {
  if (!stepIsComplete("kind", draft)) return "kind";
  if (!stepIsComplete("name", draft)) return "name";
  return "details";
}

/** Up to `visible` names of a batch, plus how many more there are. */
export function batchNamePreview(
  draft: Pick<NewTouchpointDraft, "namePrefix" | "start" | "count">,
  visible = 3,
): { names: string[]; last: string | null; more: number } {
  const all = batchNames(draft.namePrefix, draft.start, draft.count);
  if (all.length <= visible + 1) return { names: all, last: null, more: 0 };
  return {
    names: all.slice(0, visible),
    last: all[all.length - 1] ?? null,
    more: all.length - visible - 1,
  };
}

/** "1 touchpoint QR" / "20 touchpoints NFC". */
export function creationHeadline(draft: NewTouchpointDraft): string {
  const kind = draft.kind ? touchpointKindLabels[draft.kind] : "";
  const count = draft.mode === "single" ? 1 : draft.count;
  return `${count} ${count === 1 ? "touchpoint" : "touchpoints"}${kind ? ` ${kind}` : ""}`;
}

/** The names that will be created, as one line. */
export function creationNames(draft: NewTouchpointDraft): string {
  if (draft.mode === "single") return draft.name.trim();
  const preview = batchNamePreview(draft, 1);
  if (!preview.names.length) return "";
  return preview.last
    ? `${preview.names[0]} … ${preview.last}`
    : preview.names.join(", ");
}
