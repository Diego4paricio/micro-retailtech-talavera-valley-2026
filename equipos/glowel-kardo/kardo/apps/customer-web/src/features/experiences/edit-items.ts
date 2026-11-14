import {
  type DesignBlock,
  type ExperienceContent,
  type ExperienceSummary,
  isCanvasSection,
  type PageDesign,
} from "@kardo/contracts";
import {
  contentDesign,
  contentFeaturableItemIds,
  contentMenuSectionIds,
  withDesign,
} from "../studio/model/content.js";
import { limits } from "./content.js";
import type { SectionRows } from "./items/pasted-list.js";

/**
 * «Editar productos» (2026-10-03 study, finding 3): a Menú's dishes or a
 * Catálogo's products edited as plain rows of name and price, straight
 * from the Experience and from Disponibilidad, instead of Estudio →
 * Contenido → Añadir producto, one by one.
 */
export type ItemsPageType = "menu" | "catalog";

export function isItemsPage(type: string): type is ItemsPageType {
  return type === "menu" || type === "catalog";
}

/**
 * What saving does. A page already on its QR codes with nothing else
 * pending is published right away, so a new price reaches customers in
 * seconds; one with other unpublished edits only saves (publishing would
 * ship those too); a page never published only saves.
 */
export type ItemsSaveMode = "publish" | "save-pending" | "save-draft";

export function itemsSaveMode(
  experience: Pick<
    ExperienceSummary,
    "liveRevision" | "liveTouchpointCount" | "hasUnpublishedChanges"
  >,
): ItemsSaveMode {
  const live =
    (experience.liveRevision ?? null) !== null ||
    (experience.liveTouchpointCount ?? 0) > 0;
  if (!live) return "save-draft";
  return experience.hasUnpublishedChanges ? "save-pending" : "publish";
}

/** "platillos", "productos", "servicios"… as the button says them. */
export function itemsNoun(
  type: ItemsPageType,
  planNoun: { one: string; many: string } | null,
): { one: string; many: string } {
  if (planNoun && !planNoun.one.includes(" ")) return planNoun;
  return type === "menu"
    ? { one: "platillo", many: "platillos" }
    : { one: "producto", many: "productos" };
}

/**
 * The page's design after its dishes or products changed: a highlight
 * («Destacados») forgets the ones that were deleted, and goes away when
 * none is left; a menu block that shows chosen sections forgets the
 * deleted ones, and the last of them also shows the new sections. Without
 * this, saving would be refused for naming things that no longer exist.
 */
export function reconcileItemsDesign(
  design: PageDesign,
  type: ItemsPageType,
  content: ExperienceContent,
  previous: ExperienceContent,
): PageDesign {
  const items = new Set(contentFeaturableItemIds(type, content) ?? []);
  const sections = contentMenuSectionIds(content) ?? [];
  const known = new Set(sections);
  const before = new Set(contentMenuSectionIds(previous) ?? []);
  const added = sections.filter((id) => !before.has(id));

  const flow = design.sections.flatMap((section) =>
    isCanvasSection(section) ? [] : section.columns.flat(),
  );
  const chosen = flow.filter(
    (block) => block.kind === "menu" && block.sectionIds !== undefined,
  );
  const lastChosen = chosen.at(-1)?.id;
  const menuBlocks = flow.filter((block) => block.kind === "menu").length;

  const fix = (block: DesignBlock): DesignBlock | null => {
    if (block.kind === "featuredItems") {
      const itemIds = block.itemIds.filter((id) => items.has(id));
      if (!itemIds.length) return null;
      return itemIds.length === block.itemIds.length
        ? block
        : { ...block, itemIds };
    }
    if (block.kind === "menu" && block.sectionIds !== undefined) {
      const sectionIds = [
        ...block.sectionIds.filter((id) => known.has(id)),
        ...(block.id === lastChosen ? added : []),
      ];
      if (sectionIds.length) return { ...block, sectionIds };
      // A part of a split menu with nothing left to show goes away; the
      // only menu block shows every section instead.
      if (menuBlocks > 1) return null;
      const { sectionIds: _gone, ...whole } = block;
      return whole;
    }
    return block;
  };

  return {
    ...design,
    sections: design.sections.map((section) =>
      isCanvasSection(section)
        ? section
        : {
            ...section,
            columns: section.columns.map((column) =>
              column.flatMap((block) => {
                const next = fix(block);
                return next ? [next] : [];
              }),
            ),
          },
    ),
  };
}

/** `next` with its design (if any) reconciled against `previous`. */
export function withReconciledDesign(
  type: ItemsPageType,
  next: ExperienceContent,
  previous: ExperienceContent,
): ExperienceContent {
  const design = contentDesign(next);
  if (!design) return next;
  return withDesign(next, reconcileItemsDesign(design, type, next, previous));
}

/**
 * S1 (Disponibilidad → «Agregarlo», relevo 37): Rosa searched for an item
 * that was not there. `rowsFromContent` always leaves one empty row at the
 * end of the last section to type in — this starts it with the search
 * term already written, so completing it is the only thing left to do.
 */
export function withPrefilledRow(
  sections: readonly SectionRows[],
  name: string | null | undefined,
): SectionRows[] {
  const trimmed = name?.trim();
  const lastIndex = sections.length - 1;
  if (!trimmed || lastIndex < 0) return sections.slice();
  return sections.map((section, index) => {
    if (index !== lastIndex) return section;
    const lastRowIndex = section.rows.length - 1;
    const lastRow = section.rows[lastRowIndex];
    // Only the trailing empty row is taken; an unexpectedly filled one (the
    // shape `rowsFromContent` guarantees never has one) is left alone.
    if (!lastRow || lastRow.name.trim()) return section;
    const rows = section.rows.slice();
    rows[lastRowIndex] = { ...lastRow, name: trimmed.slice(0, limits.title) };
    return { ...section, rows };
  });
}
