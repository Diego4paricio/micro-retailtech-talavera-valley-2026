import type {
  DesignableExperienceType,
  ExperienceContent,
} from "@kardo/contracts";

/**
 * A product or dish added and left empty — no name, no price — never
 * blocks Guardar (relevo 37, C5c): Ana added 3 packages in the Estudio's
 * Contenido panel and kept getting a validation error on an extra item she
 * never meant to fill in, on her phone, where she never saw why saving
 * failed. One with a price but no name is kept: its missing name still
 * shows as a normal error to fix (it clearly is a product, just unnamed).
 * A section or the whole list never goes below its required one item —
 * pruning is skipped there rather than risk a worse error.
 */

type ItemLike = { name: string; price?: number };
type MenuLike = { sections: { items: ItemLike[] }[] };
type CatalogLike = { items: ItemLike[] };

function isEmptyItem(item: ItemLike): boolean {
  return !item.name.trim() && item.price === undefined;
}

export type PruneResult = {
  content: ExperienceContent;
  /** How many empty items came out, for "Quitamos N productos vacíos". */
  removed: number;
};

export function pruneEmptyItems(
  type: DesignableExperienceType,
  content: ExperienceContent,
): PruneResult {
  if (type === "menu") {
    const value = content as unknown as MenuLike;
    let removed = 0;
    let changed = false;
    const sections = value.sections.map((section) => {
      const kept = section.items.filter((item) => !isEmptyItem(item));
      // Never leave a section with zero items: that is its own, different
      // error ("Añade al menos un producto"), not an extra to drop quietly.
      if (!kept.length || kept.length === section.items.length) return section;
      removed += section.items.length - kept.length;
      changed = true;
      return { ...section, items: kept };
    });
    if (!changed) return { content, removed: 0 };
    return {
      content: { ...(content as object), sections } as ExperienceContent,
      removed,
    };
  }
  if (type === "catalog") {
    const value = content as unknown as CatalogLike;
    const kept = value.items.filter((item) => !isEmptyItem(item));
    const removed = value.items.length - kept.length;
    if (!removed || !kept.length) return { content, removed: 0 };
    return {
      content: { ...(content as object), items: kept } as ExperienceContent,
      removed,
    };
  }
  return { content, removed: 0 };
}
