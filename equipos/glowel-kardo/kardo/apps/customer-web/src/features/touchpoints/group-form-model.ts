import type {
  ExperienceSummary,
  Touchpoint,
  TouchpointGroup,
  TouchpointGroupKind,
} from "@kardo/contracts";
import { flattenGroupTree, groupPathLabel } from "./group-tree.js";

/**
 * The "Nuevo grupo / Editar grupo" dialog, as pure rules: name suggestions,
 * the sibling-name check, and the Touchpoints to choose from, sorted by
 * where each one is now.
 */

/** Names to start from, for several kinds of business. */
export const groupNameSuggestions: Record<
  TouchpointGroupKind,
  readonly string[]
> = {
  location: ["Sucursal Centro", "Local Norte", "Matriz", "Tienda Plaza"],
  group: ["Terraza", "Salón", "Barra", "Mostradores", "Probadores"],
};

export const groupKindDescriptions: Record<TouchpointGroupKind, string> = {
  location: "Una sucursal o local. Dentro creas zonas, mesas u otros grupos.",
  group: "Una zona o un conjunto de objetos: mesas, probadores, mostradores.",
};

/** Another group with this name in the same place (names are unique among
 * siblings), ignoring case and spaces and the group being edited. */
export function siblingNameTaken(
  groups: readonly Pick<TouchpointGroup, "id" | "name" | "parentId">[],
  parentId: string | null,
  name: string,
  selfId: string | null,
): boolean {
  const key = name.trim().toLowerCase();
  if (!key) return false;
  return groups.some(
    (group) =>
      group.id !== selfId &&
      (group.parentId ?? null) === parentId &&
      group.name.trim().toLowerCase() === key,
  );
}

export type MemberSection = {
  /** A group id, "self" (the group being edited) or "ungrouped". */
  id: string;
  title: string;
  items: Touchpoint[];
};

/**
 * The Touchpoints a group can hold, in sections by where each one is now:
 * the group's own (when editing), then those without a group, then every
 * other group in tree order with its path («Local Centro › Terraza»). A
 * Touchpoint whose group is not loaded goes with those without a group, so
 * none is ever hidden. `query` filters by name.
 */
export function memberSections(input: {
  touchpoints: readonly Touchpoint[];
  groups: readonly TouchpointGroup[];
  selfId: string | null;
  query?: string;
}): MemberSection[] {
  const needle = (input.query ?? "").trim().toLowerCase();
  const known = new Set(input.groups.map((group) => group.id));
  const byGroup = new Map<string, Touchpoint[]>();
  for (const touchpoint of input.touchpoints) {
    if (needle && !touchpoint.operationalName.toLowerCase().includes(needle))
      continue;
    const key =
      touchpoint.groupId && known.has(touchpoint.groupId)
        ? touchpoint.groupId === input.selfId
          ? "self"
          : touchpoint.groupId
        : "ungrouped";
    const list = byGroup.get(key) ?? [];
    list.push(touchpoint);
    byGroup.set(key, list);
  }
  const sections: MemberSection[] = [];
  const self = byGroup.get("self");
  if (self?.length)
    sections.push({ id: "self", title: "En este grupo", items: self });
  const loose = byGroup.get("ungrouped");
  if (loose?.length)
    sections.push({ id: "ungrouped", title: "Sin grupo", items: loose });
  for (const { group } of flattenGroupTree(input.groups)) {
    if (group.id === input.selfId) continue;
    const items = byGroup.get(group.id);
    if (items?.length)
      sections.push({
        id: group.id,
        title: `En «${groupPathLabel(input.groups, group.id)}»`,
        items,
      });
  }
  return sections;
}

/**
 * The non-archived pages that target a group directly (A9-13): deleting it
 * would otherwise drop the destination from their list without warning,
 * even though its Touchpoints keep showing what they show today.
 */
export function groupTargetingExperienceNames(
  experiences: readonly Pick<
    ExperienceSummary,
    "name" | "archivedAt" | "targets"
  >[],
  groupId: string,
): string[] {
  return experiences
    .filter((experience) => !experience.archivedAt)
    .filter((experience) => experience.targets?.groupIds.includes(groupId))
    .map((experience) => experience.name);
}

/**
 * «La página «Menú» se publica en este grupo: seguirá viéndose en sus QR y
 * etiquetas.» / «Las páginas «Menú» y «Catálogo»…»: the delete-group
 * warning for the pages found by `groupTargetingExperienceNames`. `null`
 * when none target the group.
 */
export function groupDeleteTargetingNotice(
  names: readonly string[],
): string | null {
  if (names.length === 0) return null;
  const quoted = names.map((name) => `«${name}»`);
  const joined =
    quoted.length === 1
      ? quoted[0]
      : quoted.length === 2
        ? quoted.join(" y ")
        : `${quoted.slice(0, -1).join(", ")} y ${quoted.at(-1)}`;
  const plural = quoted.length > 1;
  return `${plural ? "Las páginas" : "La página"} ${joined} ${
    plural ? "se publican" : "se publica"
  } en este grupo: ${
    plural ? "seguirán viéndose" : "seguirá viéndose"
  } en sus QR y etiquetas.`;
}
