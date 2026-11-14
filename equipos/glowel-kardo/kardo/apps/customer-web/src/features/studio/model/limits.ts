import {
  DESIGN_LIMITS,
  type DesignableExperienceType,
  type DesignBlock,
  type DesignBlockKind,
  designBlocks,
  designHtmlBlocks,
  isCanvasSection,
  type PageDesign,
  type PageSection,
  sectionBlocks,
} from "@kardo/contracts";
import {
  blockKindLabel,
  boundKindsFor,
  isBoundKind,
  isRepeatableBoundKind,
  isRequiredKind,
} from "./blocks.js";
import { canPlaceOnCanvas } from "./canvas-items.js";
import { findSection, locateBlock, placedKinds } from "./operations.js";

/**
 * The contract's limits, as the reasons the UI shows next to a disabled
 * "Agregar" (Spanish, short). `null` means the action is allowed.
 */

export type DesignCounts = {
  sections: number;
  canvases: number;
  blocks: number;
  buttons: number;
  images: number;
  /** `html` blocks (addendum 3, capped at `DESIGN_LIMITS.htmlBlocks`). */
  htmlBlocks: number;
  /** `menu` blocks: a Menú may be split into several (addendum 3). */
  menuBlocks: number;
  /** `featuredItems` blocks: a Menú/Catálogo may highlight a few sets of its
   * own items (motor de 3 bloques, addendum 2026-10-03). */
  featuredBlocks: number;
  bytes: number;
};

const isButton = (block: DesignBlock) =>
  block.kind === "button" || block.kind === "brandButton";

export function designCounts(design: PageDesign): DesignCounts {
  const blocks = designBlocks(design);
  return {
    sections: design.sections.length,
    canvases: design.sections.filter(isCanvasSection).length,
    blocks: blocks.length,
    buttons: blocks.filter(isButton).length,
    // A gallery's own photos count toward the page's image budget too.
    images: blocks.reduce(
      (total, block) =>
        total +
        (block.kind === "image"
          ? 1
          : block.kind === "gallery"
            ? block.images.length
            : 0),
      0,
    ),
    htmlBlocks: blocks.filter((block) => block.kind === "html").length,
    menuBlocks: blocks.filter((block) => block.kind === "menu").length,
    featuredBlocks: blocks.filter((block) => block.kind === "featuredItems")
      .length,
    bytes: JSON.stringify(design).length,
  };
}

// ---------------------------------------------------------------------------
// Code blocks (`html`) share modo HTML's permission: only who has
// `experiences.custom_html` (owner, admin) may create, change, remove or
// reorder them, and the server refuses a save that does (domain audit
// A2-35). Everything that touches one asks first, instead of failing at
// Guardar with no explanation.
// ---------------------------------------------------------------------------

export const htmlBlockPermissionBlocker =
  "Solo quien administra puede cambiar los bloques de código.";

/** Why code blocks cannot be touched (`null` when they can, or there are
 * none among `blocks`). */
export function htmlBlocksBlocker(
  canEditHtml: boolean,
  blocks: readonly Pick<DesignBlock, "kind">[],
): string | null {
  if (canEditHtml) return null;
  return blocks.some((block) => block.kind === "html")
    ? htmlBlockPermissionBlocker
    : null;
}

type HtmlBlockSignature = { id: string; html: string; css: string };

/** A design's `html` blocks as the API compares them: id, html and css, in
 * reading order. */
export function designHtmlBlockSignature(
  design: PageDesign | null | undefined,
): HtmlBlockSignature[] {
  if (!design) return [];
  return designHtmlBlocks(design).map((block) => ({
    id: block.id,
    html: block.html,
    css: block.css,
  }));
}

/** Whether saving `next` over `previous` creates, changes, removes or
 * reorders a code block: what the API refuses without the permission. */
export function designHtmlBlocksChanged(
  previous: PageDesign | null | undefined,
  next: PageDesign | null | undefined,
): boolean {
  return (
    JSON.stringify(designHtmlBlockSignature(previous)) !==
    JSON.stringify(designHtmlBlockSignature(next))
  );
}

/** What stops a save, in the person's words (`null`: it can go). */
export function saveHtmlBlocksBlocker(
  canEditHtml: boolean,
  saved: PageDesign | null | undefined,
  next: PageDesign,
): string | null {
  if (canEditHtml || !designHtmlBlocksChanged(saved, next)) return null;
  return `${htmlBlockPermissionBlocker} Deshaz tus cambios en ellos para guardar el resto.`;
}

/** Room a new block needs, roughly (keeps a margin under the byte limit). */
const newBlockBytes = 400;

/** Why a kind cannot go on a canvas (`null` when it can). */
export function canvasKindBlocker(
  kind: DesignBlockKind,
  type?: DesignableExperienceType,
): string | null {
  if (canPlaceOnCanvas(kind)) return null;
  if (kind === "spacer")
    return "En un espacio libre no hace falta: coloca cada bloque donde quieras.";
  if (kind === "contentLinks")
    return `«${blockKindLabel(kind, type)}» crece con cada enlace, por eso va en una sección normal.`;
  return "No se puede colocar en un espacio libre.";
}

const shapeBlocker = "Las figuras solo van en una sección de espacio libre.";

export function addBlockBlocker(
  design: PageDesign,
  type: DesignableExperienceType,
  kind: DesignBlockKind,
  target?: { sectionId: string; columnIndex: number } | undefined,
  canEditHtml = true,
): string | null {
  if (kind === "html" && !canEditHtml) return htmlBlockPermissionBlocker;
  if (isBoundKind(kind)) {
    if (!boundKindsFor(type).includes(kind))
      return "No está disponible en este tipo de página.";
    // Repeatable bound kinds (menu, featuredItems) may be added again; their
    // own count is capped below, like `htmlBlocks` or `buttons`.
    if (placedKinds(design).has(kind) && !isRepeatableBoundKind(kind))
      return "Ya está en tu página.";
  }
  const counts = designCounts(design);
  if (counts.blocks >= DESIGN_LIMITS.blocks)
    return `Llegaste al máximo de ${DESIGN_LIMITS.blocks} bloques.`;
  if (
    (kind === "button" || kind === "brandButton") &&
    counts.buttons >= DESIGN_LIMITS.buttons
  )
    return `Llegaste al máximo de ${DESIGN_LIMITS.buttons} botones.`;
  if (kind === "image" && counts.images >= DESIGN_LIMITS.images)
    return `Llegaste al máximo de ${DESIGN_LIMITS.images} imágenes.`;
  if (kind === "html" && counts.htmlBlocks >= DESIGN_LIMITS.htmlBlocks)
    return `Llegaste al máximo de ${DESIGN_LIMITS.htmlBlocks} bloques HTML.`;
  if (kind === "menu" && counts.menuBlocks >= DESIGN_LIMITS.menuBlocks)
    return `Llegaste al máximo de ${DESIGN_LIMITS.menuBlocks} bloques de menú.`;
  if (
    kind === "featuredItems" &&
    counts.featuredBlocks >= DESIGN_LIMITS.featuredBlocks
  )
    return `Llegaste al máximo de ${DESIGN_LIMITS.featuredBlocks} bloques de destacados.`;
  if (counts.bytes + newBlockBytes > DESIGN_LIMITS.bytes)
    return "El diseño llegó a su tamaño máximo.";
  const section = target ? findSection(design, target.sectionId) : null;
  if (section && isCanvasSection(section)) {
    const blocked = canvasKindBlocker(kind, type);
    if (blocked) return blocked;
    if (section.items.length >= DESIGN_LIMITS.canvasItems)
      return `Este espacio libre ya tiene ${DESIGN_LIMITS.canvasItems} bloques.`;
    return null;
  }
  if (kind === "shape") return shapeBlocker;
  if (section && target) {
    const column = section.columns[target.columnIndex];
    if (column && column.length >= DESIGN_LIMITS.blocksPerColumn)
      return `Esta columna ya tiene ${DESIGN_LIMITS.blocksPerColumn} bloques.`;
  }
  return null;
}

export function addSectionBlocker(design: PageDesign): string | null {
  if (design.sections.length >= DESIGN_LIMITS.sections)
    return `Llegaste al máximo de ${DESIGN_LIMITS.sections} secciones.`;
  if (JSON.stringify(design).length + newBlockBytes > DESIGN_LIMITS.bytes)
    return "El diseño llegó a su tamaño máximo.";
  return null;
}

/** A new canvas section ("Sección lienzo"). */
export function addCanvasSectionBlocker(design: PageDesign): string | null {
  const blocked = addSectionBlocker(design);
  if (blocked) return blocked;
  if (designCounts(design).canvases >= DESIGN_LIMITS.canvasSections)
    return `Llegaste al máximo de ${DESIGN_LIMITS.canvasSections} secciones de espacio libre.`;
  return null;
}

/** Whether a (moved or new) block fits in a column, or on a canvas. */
export function columnFull(
  design: PageDesign,
  sectionId: string,
  columnIndex: number,
  ignoreBlockId?: string,
): boolean {
  const section = findSection(design, sectionId);
  if (!section) return false;
  if (isCanvasSection(section))
    return (
      section.items.filter((item) => item.block.id !== ignoreBlockId).length >=
      DESIGN_LIMITS.canvasItems
    );
  const column = section.columns[columnIndex] ?? [];
  const count = column.filter((block) => block.id !== ignoreBlockId).length;
  return count >= DESIGN_LIMITS.blocksPerColumn;
}

/** Why a block cannot move to another section ("Mover a la sección N"). */
export function moveToSectionBlocker(
  design: PageDesign,
  type: DesignableExperienceType,
  blockId: string,
  sectionId: string,
  canEditHtml = true,
): string | null {
  const at = locateBlock(design, blockId);
  if (!at) return "Este bloque ya no existe.";
  const noHtml = htmlBlocksBlocker(canEditHtml, [at.block]);
  if (noHtml) return noHtml;
  const section = findSection(design, sectionId);
  if (!section) return "Esta sección ya no existe.";
  if (isCanvasSection(section)) {
    const blocked = canvasKindBlocker(at.block.kind, type);
    if (blocked) return blocked;
  } else if (at.block.kind === "shape") return shapeBlocker;
  if (columnFull(design, sectionId, 0, blockId))
    return isCanvasSection(section)
      ? `Ese espacio libre ya tiene ${DESIGN_LIMITS.canvasItems} bloques.`
      : "Esa columna ya está llena.";
  return null;
}

export function duplicateBlockBlocker(
  design: PageDesign,
  type: DesignableExperienceType,
  blockId: string,
  canEditHtml = true,
): string | null {
  const at = locateBlock(design, blockId);
  if (!at) return "Este bloque ya no existe.";
  const noHtml = htmlBlocksBlocker(canEditHtml, [at.block]);
  if (noHtml) return noHtml;
  if (isBoundKind(at.block.kind)) {
    if (at.block.kind === "menu")
      return "Usa «Partir el menú» para agregar otro bloque de este menú.";
    if (at.block.kind === "featuredItems")
      return "Agrega otro bloque de «Destacados» desde Agregar.";
    return "Este bloque muestra tu contenido y solo puede aparecer una vez.";
  }
  return addBlockBlocker(
    design,
    type,
    at.block.kind,
    {
      sectionId: at.section.id,
      columnIndex: at.on === "flow" ? at.columnIndex : 0,
    },
    canEditHtml,
  );
}

export function removeBlockBlocker(
  design: PageDesign,
  type: DesignableExperienceType,
  blockId: string,
  canEditHtml = true,
): string | null {
  const at = locateBlock(design, blockId);
  if (!at) return "Este bloque ya no existe.";
  const noHtml = htmlBlocksBlocker(canEditHtml, [at.block]);
  if (noHtml) return noHtml;
  if (isRequiredKind(type, at.block.kind)) {
    const sameKindCount = designBlocks(design).filter(
      (block) => block.kind === at.block.kind,
    ).length;
    if (!(isRepeatableBoundKind(at.block.kind) && sameKindCount > 1))
      return `Tu página necesita «${blockKindLabel(at.block.kind, type)}».`;
  }
  return null;
}

export function removeSectionBlocker(
  design: PageDesign,
  type: DesignableExperienceType,
  sectionId: string,
  canEditHtml = true,
): string | null {
  const section = findSection(design, sectionId);
  if (!section) return "Esta sección ya no existe.";
  const noHtml = htmlBlocksBlocker(canEditHtml, sectionBlocks(section));
  if (noHtml) return noHtml;
  if (design.sections.length <= 1)
    return "La página necesita al menos una sección.";
  const required = sectionBlocks(section).find((block) =>
    isRequiredKind(type, block.kind),
  );
  if (required)
    return `Mueve «${blockKindLabel(required.kind, type)}» a otra sección antes de eliminar esta.`;
  return null;
}

function withoutBoundBlocks(section: PageSection): PageSection {
  return isCanvasSection(section)
    ? {
        ...section,
        items: section.items.filter((item) => !isBoundKind(item.block.kind)),
      }
    : {
        ...section,
        columns: section.columns.map((column) =>
          column.filter((block) => !isBoundKind(block.kind)),
        ),
      };
}

export function duplicateSectionBlocker(
  design: PageDesign,
  sectionId: string,
  canEditHtml = true,
): string | null {
  const section = findSection(design, sectionId);
  if (!section) return "Esta sección ya no existe.";
  const noHtml = htmlBlocksBlocker(canEditHtml, sectionBlocks(section));
  if (noHtml) return noHtml;
  const blocked = isCanvasSection(section)
    ? addCanvasSectionBlocker(design)
    : addSectionBlocker(design);
  if (blocked) return blocked;
  const counts = designCounts(design);
  // What the copy adds, counted the way `designCounts` counts the whole
  // page: the copy leaves out the blocks bound to the content (`duplicateSection`).
  const copied = designCounts({
    ...design,
    sections: [withoutBoundBlocks(section)],
  });
  if (counts.blocks + copied.blocks > DESIGN_LIMITS.blocks)
    return `La copia pasaría de ${DESIGN_LIMITS.blocks} bloques.`;
  if (counts.buttons + copied.buttons > DESIGN_LIMITS.buttons)
    return `La copia pasaría de ${DESIGN_LIMITS.buttons} botones.`;
  if (counts.images + copied.images > DESIGN_LIMITS.images)
    return `La copia pasaría de ${DESIGN_LIMITS.images} imágenes.`;
  if (counts.htmlBlocks + copied.htmlBlocks > DESIGN_LIMITS.htmlBlocks)
    return `La copia pasaría de ${DESIGN_LIMITS.htmlBlocks} bloques HTML.`;
  if (counts.menuBlocks + copied.menuBlocks > DESIGN_LIMITS.menuBlocks)
    return `La copia pasaría de ${DESIGN_LIMITS.menuBlocks} bloques de menú.`;
  if (
    counts.featuredBlocks + copied.featuredBlocks >
    DESIGN_LIMITS.featuredBlocks
  )
    return `La copia pasaría de ${DESIGN_LIMITS.featuredBlocks} bloques de destacados.`;
  const bytes = JSON.stringify(section).length;
  if (counts.bytes + bytes > DESIGN_LIMITS.bytes)
    return "La copia no cabe en el tamaño máximo del diseño.";
  return null;
}

/** "Convertir en lienzo": what keeps a flow section from becoming a canvas. */
export function convertToCanvasBlocker(
  design: PageDesign,
  type: DesignableExperienceType,
  sectionId: string,
): string | null {
  const section = findSection(design, sectionId);
  if (!section) return "Esta sección ya no existe.";
  if (isCanvasSection(section)) return "Ya es un espacio libre.";
  if (designCounts(design).canvases >= DESIGN_LIMITS.canvasSections)
    return `Llegaste al máximo de ${DESIGN_LIMITS.canvasSections} secciones de espacio libre.`;
  const blocks = sectionBlocks(section);
  const links = blocks.find((block) => block.kind === "contentLinks");
  if (links)
    return `Mueve «${blockKindLabel(links.kind, type)}» a otra sección: en un espacio libre no cabe, porque crece con cada enlace.`;
  if (blocks.some((block) => block.kind === "spacer"))
    return "Quita los espacios de esta sección: en un espacio libre no hacen falta.";
  if (blocks.some((block) => !canPlaceOnCanvas(block.kind)))
    return "Esta sección tiene un bloque que no va en un espacio libre.";
  if (blocks.length > DESIGN_LIMITS.canvasItems)
    return `Un espacio libre admite hasta ${DESIGN_LIMITS.canvasItems} bloques.`;
  // Each placed block adds its position (about 40 characters).
  if (JSON.stringify(design).length + blocks.length * 40 > DESIGN_LIMITS.bytes)
    return "El diseño llegó a su tamaño máximo.";
  return null;
}

/** "Partir el menú": what keeps a `menu` block from splitting into two
 * (the second keeps the sections the first stops showing). `sectionIds` is
 * the Menú's own section order (used when the block shows every section,
 * i.e. `sectionIds` is absent). */
export function splitMenuBlocker(
  design: PageDesign,
  blockId: string,
  sectionIds: readonly string[],
): string | null {
  const at = locateBlock(design, blockId);
  if (!at) return "Este bloque ya no existe.";
  if (at.block.kind !== "menu") return "Esto solo aplica a bloques de menú.";
  const shown = at.block.sectionIds ?? sectionIds;
  if (shown.length < 2)
    return "Este bloque ya muestra una sola sección: no se puede partir.";
  const counts = designCounts(design);
  if (counts.menuBlocks >= DESIGN_LIMITS.menuBlocks)
    return `Llegaste al máximo de ${DESIGN_LIMITS.menuBlocks} bloques de menú.`;
  if (counts.blocks >= DESIGN_LIMITS.blocks)
    return `Llegaste al máximo de ${DESIGN_LIMITS.blocks} bloques.`;
  if (
    at.on === "canvas" &&
    at.section.items.length >= DESIGN_LIMITS.canvasItems
  )
    return `Este espacio libre ya tiene ${DESIGN_LIMITS.canvasItems} bloques.`;
  if (at.on === "flow") {
    const column = at.section.columns[at.columnIndex] ?? [];
    if (column.length >= DESIGN_LIMITS.blocksPerColumn)
      return `Esta columna ya tiene ${DESIGN_LIMITS.blocksPerColumn} bloques.`;
  }
  if (counts.bytes + newBlockBytes > DESIGN_LIMITS.bytes)
    return "El diseño llegó a su tamaño máximo.";
  return null;
}
