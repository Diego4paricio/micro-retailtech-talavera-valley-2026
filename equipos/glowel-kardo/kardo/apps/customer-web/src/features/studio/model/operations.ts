import {
  type BlockStyle,
  type CanvasItem,
  type CanvasSection,
  type DesignBlock,
  type DesignSection,
  type DesignStyle,
  designBlocks,
  isCanvasSection,
  layoutColumns,
  type PageDesign,
  type PageSection,
  type SectionLayout,
} from "@kardo/contracts";
import { isBoundKind } from "./blocks.js";
import {
  alignItems,
  type CanvasPoint,
  canPlaceOnCanvas,
  clampItem,
  DUPLICATE_OFFSET,
  distributeItems,
  type MultiAlign,
  type MultiDistributeAxis,
  placeNewItem,
  withItemOnTop,
} from "./canvas-items.js";
import type { NewId } from "./ids.js";

/**
 * Pure edits of a page design. Every function returns a new design (the
 * input is never mutated) and ignores ids it cannot find, so a stale
 * selection can never corrupt the page. Flow sections hold columns of
 * blocks; canvas sections ("lienzo libre", see canvas.ts) hold placed items.
 */

/** A block in a column of a flow section. */
export type FlowBlockLocation = {
  on: "flow";
  sectionIndex: number;
  columnIndex: number;
  blockIndex: number;
  section: DesignSection;
  block: DesignBlock;
};

/** A block placed on a canvas section. */
export type CanvasBlockLocation = {
  on: "canvas";
  sectionIndex: number;
  /** Index in `section.items` (array order, not reading order). */
  itemIndex: number;
  section: CanvasSection;
  item: CanvasItem;
  block: DesignBlock;
};

export type BlockLocation = FlowBlockLocation | CanvasBlockLocation;

/**
 * Where a block goes: a column of a section, at an index of that column.
 * On a canvas the column and index do not matter: the block lands centered
 * on `at` (design px) or, without it, on the canvas.
 */
export type BlockTarget = {
  sectionId: string;
  columnIndex: number;
  index: number;
  at?: CanvasPoint | undefined;
};

export function locateBlock(
  design: PageDesign,
  blockId: string,
): BlockLocation | null {
  for (const [sectionIndex, section] of design.sections.entries()) {
    if (isCanvasSection(section)) {
      for (const [itemIndex, item] of section.items.entries())
        if (item.block.id === blockId)
          return {
            on: "canvas",
            sectionIndex,
            itemIndex,
            section,
            item,
            block: item.block,
          };
      continue;
    }
    for (const [columnIndex, column] of section.columns.entries())
      for (const [blockIndex, block] of column.entries())
        if (block.id === blockId)
          return {
            on: "flow",
            sectionIndex,
            columnIndex,
            blockIndex,
            section,
            block,
          };
  }
  return null;
}

export function sectionIndexOf(design: PageDesign, sectionId: string): number {
  return design.sections.findIndex((section) => section.id === sectionId);
}

export function findSection(
  design: PageDesign,
  sectionId: string,
): PageSection | null {
  return design.sections.find((section) => section.id === sectionId) ?? null;
}

export function findFlowSection(
  design: PageDesign,
  sectionId: string,
): DesignSection | null {
  const section = findSection(design, sectionId);
  return section && !isCanvasSection(section) ? section : null;
}

export function findCanvasSection(
  design: PageDesign,
  sectionId: string,
): CanvasSection | null {
  const section = findSection(design, sectionId);
  return section && isCanvasSection(section) ? section : null;
}

/** The schema a design needs: 2 as soon as it has a canvas section. */
export function normalizeSchema(design: PageDesign): PageDesign {
  const schema = design.sections.some(isCanvasSection) ? 2 : 1;
  return design.schema === schema ? design : { ...design, schema };
}

function replaceSections(
  design: PageDesign,
  sections: PageSection[],
): PageDesign {
  return normalizeSchema({ ...design, sections });
}

/** Swaps one section for what `recipe` returns (it may change its kind). */
export function replaceSection(
  design: PageDesign,
  sectionId: string,
  recipe: (section: PageSection) => PageSection,
): PageDesign {
  const index = sectionIndexOf(design, sectionId);
  const section = design.sections[index];
  if (!section) return design;
  const sections = design.sections.slice();
  sections[index] = recipe(section);
  return replaceSections(design, sections);
}

/** Edits a flow section (canvas sections are left alone). */
export function updateSection(
  design: PageDesign,
  sectionId: string,
  recipe: (section: DesignSection) => DesignSection,
): PageDesign {
  if (!findFlowSection(design, sectionId)) return design;
  return replaceSection(design, sectionId, (section) =>
    isCanvasSection(section) ? section : recipe(section),
  );
}

/** Edits a canvas section (flow sections are left alone). */
export function updateCanvasSection(
  design: PageDesign,
  sectionId: string,
  recipe: (section: CanvasSection) => CanvasSection,
): PageDesign {
  if (!findCanvasSection(design, sectionId)) return design;
  return replaceSection(design, sectionId, (section) =>
    isCanvasSection(section) ? recipe(section) : section,
  );
}

export function updateBlock(
  design: PageDesign,
  blockId: string,
  recipe: (block: DesignBlock) => DesignBlock,
): PageDesign {
  const at = locateBlock(design, blockId);
  if (!at) return design;
  if (at.on === "canvas")
    return updateCanvasSection(design, at.section.id, (section) => ({
      ...section,
      items: section.items.map((item) =>
        item.block.id === blockId
          ? { ...item, block: recipe(item.block) }
          : item,
      ),
    }));
  return updateSection(design, at.section.id, (section) => ({
    ...section,
    columns: section.columns.map((column, columnIndex) =>
      columnIndex === at.columnIndex
        ? column.map((block) => (block.id === blockId ? recipe(block) : block))
        : column,
    ),
  }));
}

export function updateStyle(
  design: PageDesign,
  recipe: (style: DesignStyle) => DesignStyle,
): PageDesign {
  return { ...design, style: recipe(design.style) };
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Whether a block of this kind may live in the section: canvases refuse
 * the list of links and spacers; shapes exist only on canvases. */
export function sectionAccepts(
  section: PageSection,
  kind: DesignBlock["kind"],
): boolean {
  return isCanvasSection(section) ? canPlaceOnCanvas(kind) : kind !== "shape";
}

/**
 * Inserts `block` at `target` (the index is clamped to the column). On a
 * canvas the block is placed on top, centered on `target.at` or on the
 * canvas. A kind the section does not accept leaves the design as it is.
 */
export function insertBlock(
  design: PageDesign,
  block: DesignBlock,
  target: BlockTarget,
): PageDesign {
  const section = findSection(design, target.sectionId);
  if (!section || !sectionAccepts(section, block.kind)) return design;
  if (isCanvasSection(section))
    return updateCanvasSection(design, section.id, (canvas) => ({
      ...canvas,
      items: withItemOnTop(
        canvas.items,
        placeNewItem(canvas, block, target.at),
      ),
    }));
  return updateSection(design, target.sectionId, (flow) => {
    const columnIndex = clamp(target.columnIndex, 0, flow.columns.length - 1);
    return {
      ...flow,
      columns: flow.columns.map((column, index) => {
        if (index !== columnIndex) return column;
        const next = column.slice();
        next.splice(clamp(target.index, 0, column.length), 0, block);
        return next;
      }),
    };
  });
}

export function removeBlock(design: PageDesign, blockId: string): PageDesign {
  const at = locateBlock(design, blockId);
  if (!at) return design;
  if (at.on === "canvas")
    return updateCanvasSection(design, at.section.id, (section) => ({
      ...section,
      items: section.items.filter((item) => item.block.id !== blockId),
    }));
  return updateSection(design, at.section.id, (section) => ({
    ...section,
    columns: section.columns.map((column) =>
      column.filter((block) => block.id !== blockId),
    ),
  }));
}

/**
 * Moves a block to `target`. The index counts positions in the destination
 * column after the block has been taken out (so, within one column, it
 * behaves like `arrayMove`). Between two canvases the block keeps its place
 * and size; within one canvas nothing happens (see `moveCanvasItem`). A
 * section that does not accept the kind leaves the design as it is.
 */
export function moveBlock(
  design: PageDesign,
  blockId: string,
  target: BlockTarget,
): PageDesign {
  const at = locateBlock(design, blockId);
  const destination = findSection(design, target.sectionId);
  if (!at || !destination || !sectionAccepts(destination, at.block.kind))
    return design;
  if (isCanvasSection(destination) && at.on === "canvas") {
    if (at.section.id === destination.id) return design;
    const moved = clampItem(at.item, destination.height);
    return updateCanvasSection(
      removeBlock(design, blockId),
      destination.id,
      (canvas) => ({ ...canvas, items: withItemOnTop(canvas.items, moved) }),
    );
  }
  return insertBlock(removeBlock(design, blockId), at.block, target);
}

/** Moves a block right before or after another one (drop on the stage). */
export function moveBlockNextTo(
  design: PageDesign,
  blockId: string,
  anchorId: string,
  placement: "before" | "after",
): PageDesign {
  if (blockId === anchorId) return design;
  const moving = locateBlock(design, blockId);
  const anchorAt = locateBlock(design, anchorId);
  if (!moving || !anchorAt) return design;
  if (!sectionAccepts(anchorAt.section, moving.block.kind)) return design;
  if (anchorAt.on === "canvas")
    return moveBlock(design, blockId, {
      sectionId: anchorAt.section.id,
      columnIndex: 0,
      index: 0,
    });
  const without = removeBlock(design, blockId);
  const anchor = locateBlock(without, anchorId);
  if (anchor?.on !== "flow") return design;
  return insertBlock(without, moving.block, {
    sectionId: anchor.section.id,
    columnIndex: anchor.columnIndex,
    index: anchor.blockIndex + (placement === "after" ? 1 : 0),
  });
}

/** Where a block lands right before or after `anchorId` (for new blocks).
 * Next to a canvas block, it lands on that canvas. */
export function targetNextTo(
  design: PageDesign,
  anchorId: string,
  placement: "before" | "after",
): BlockTarget | null {
  const anchor = locateBlock(design, anchorId);
  if (!anchor) return null;
  if (anchor.on === "canvas")
    return {
      sectionId: anchor.section.id,
      columnIndex: 0,
      index: anchor.section.items.length,
    };
  return {
    sectionId: anchor.section.id,
    columnIndex: anchor.columnIndex,
    index: anchor.blockIndex + (placement === "after" ? 1 : 0),
  };
}

/** The next flow section from `index` in `direction` (canvases are placed
 * by position, not stepped through). */
function nextFlowSection(
  design: PageDesign,
  index: number,
  direction: -1 | 1,
): DesignSection | null {
  for (
    let next = index + direction;
    next >= 0 && next < design.sections.length;
    next += direction
  ) {
    const section = design.sections[next];
    if (section && !isCanvasSection(section)) return section;
  }
  return null;
}

/**
 * One step up or down for the keyboard: within its column first, then into
 * the previous or next column, then into the previous or next flow
 * section. Canvas blocks move with their position instead (canvas.ts).
 */
export function moveBlockStep(
  design: PageDesign,
  blockId: string,
  direction: -1 | 1,
): PageDesign {
  const at = locateBlock(design, blockId);
  if (at?.on !== "flow") return design;
  const column = at.section.columns[at.columnIndex] ?? [];
  const inside = at.blockIndex + direction;
  if (inside >= 0 && inside < column.length)
    return moveBlock(design, blockId, {
      sectionId: at.section.id,
      columnIndex: at.columnIndex,
      index: inside,
    });
  // Next or previous column of the same section.
  const columnIndex = at.columnIndex + direction;
  if (columnIndex >= 0 && columnIndex < at.section.columns.length) {
    const neighbour = at.section.columns[columnIndex] ?? [];
    return moveBlock(design, blockId, {
      sectionId: at.section.id,
      columnIndex,
      index: direction === 1 ? 0 : neighbour.length,
    });
  }
  // Next or previous flow section.
  const section = nextFlowSection(design, at.sectionIndex, direction);
  if (!section) return design;
  const edgeColumn = direction === 1 ? 0 : section.columns.length - 1;
  return moveBlock(design, blockId, {
    sectionId: section.id,
    columnIndex: edgeColumn,
    index: direction === 1 ? 0 : (section.columns[edgeColumn]?.length ?? 0),
  });
}

export function canMoveBlockStep(
  design: PageDesign,
  blockId: string,
  direction: -1 | 1,
): boolean {
  const next = moveBlockStep(design, blockId, direction);
  return next !== design;
}

/** Moves a block to the end of a section's first column, or onto a canvas
 * (centered, or keeping its place when it comes from another canvas). */
export function moveBlockToSection(
  design: PageDesign,
  blockId: string,
  sectionId: string,
): PageDesign {
  const section = findSection(design, sectionId);
  if (!section) return design;
  return moveBlock(design, blockId, {
    sectionId,
    columnIndex: 0,
    index: isCanvasSection(section)
      ? section.items.length
      : (section.columns[0]?.length ?? 0),
  });
}

/** Copies a free block right after itself (on a canvas, 16 px down and to
 * the right, on top). Bound blocks appear once only. */
export function duplicateBlock(
  design: PageDesign,
  blockId: string,
  newId: NewId,
): { design: PageDesign; id: string } | null {
  const at = locateBlock(design, blockId);
  if (!at || isBoundKind(at.block.kind)) return null;
  const copy = { ...structuredClone(at.block), id: newId("b") };
  if (at.on === "canvas") {
    const item = clampItem(
      {
        ...structuredClone(at.item),
        block: copy,
        x: at.item.x + DUPLICATE_OFFSET,
        y: at.item.y + DUPLICATE_OFFSET,
      },
      at.section.height,
    );
    return {
      design: updateCanvasSection(design, at.section.id, (section) => ({
        ...section,
        items: withItemOnTop(section.items, item),
      })),
      id: copy.id,
    };
  }
  return {
    design: insertBlock(design, copy, {
      sectionId: at.section.id,
      columnIndex: at.columnIndex,
      index: at.blockIndex + 1,
    }),
    id: copy.id,
  };
}

/**
 * "Partir el menú": turns one `menu` block into two, so a title, an image or
 * a whole other section can go between the parts. The first keeps the first
 * half of the sections it was showing (or of `sectionIds`, the Menú's own
 * order, when it showed all of them); the new block gets the rest and lands
 * right after the first (on a canvas: nudged down, on top). `null` when the
 * block does not exist, is not a `menu`, or shows fewer than two sections
 * (see `splitMenuBlocker` for the user-facing reasons).
 */
export function splitMenuBlock(
  design: PageDesign,
  blockId: string,
  sectionIds: readonly string[],
  newId: NewId,
): { design: PageDesign; id: string } | null {
  const at = locateBlock(design, blockId);
  if (at?.block.kind !== "menu") return null;
  const shown = at.block.sectionIds ?? sectionIds;
  if (shown.length < 2) return null;
  const mid = Math.ceil(shown.length / 2);
  const firstHalf = shown.slice(0, mid);
  const secondHalf = shown.slice(mid);
  const withFirstHalf = updateBlock(design, blockId, (block) =>
    block.kind === "menu" ? { ...block, sectionIds: firstHalf } : block,
  );
  const copy: DesignBlock = {
    ...structuredClone(at.block),
    id: newId("b"),
    sectionIds: secondHalf,
  };
  if (at.on === "canvas") {
    const item = clampItem(
      {
        ...structuredClone(at.item),
        block: copy,
        x: at.item.x + DUPLICATE_OFFSET,
        y: at.item.y + DUPLICATE_OFFSET,
      },
      at.section.height,
    );
    return {
      design: updateCanvasSection(withFirstHalf, at.section.id, (section) => ({
        ...section,
        items: withItemOnTop(section.items, item),
      })),
      id: copy.id,
    };
  }
  return {
    design: insertBlock(withFirstHalf, copy, {
      sectionId: at.section.id,
      columnIndex: at.columnIndex,
      index: at.blockIndex + 1,
    }),
    id: copy.id,
  };
}

/** Values of the advanced style; `undefined` clears a field (inherits). */
export type BlockStylePatch = {
  [K in keyof BlockStyle]?: BlockStyle[K] | undefined;
};

export function setBlockStyle(
  design: PageDesign,
  blockId: string,
  patch: BlockStylePatch,
): PageDesign {
  return updateBlock(design, blockId, (block) => {
    const merged: Record<string, unknown> = { ...(block.style ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete merged[key];
      else merged[key] = value;
    }
    const { style: _style, ...rest } = block;
    return (
      Object.keys(merged).length
        ? { ...rest, style: merged as BlockStyle }
        : rest
    ) as DesignBlock;
  });
}

/** The same style patch applied to several blocks at once (a multi-
 * selection's "cambios comunes", e.g. one color or opacity for all of
 * them). Blocks that do not have the given field (e.g. `fontSize` on a
 * `divider`) simply keep it unset; the schema ignores unknown fields. */
export function setBlockStyleForMany(
  design: PageDesign,
  blockIds: readonly string[],
  patch: BlockStylePatch,
): PageDesign {
  return blockIds.reduce(
    (current, blockId) => setBlockStyle(current, blockId, patch),
    design,
  );
}

// ---------------------------------------------------------------------------
// Multi-select on a canvas: align or distribute several items at once.
// ---------------------------------------------------------------------------

/** The canvas section every one of `blockIds` sits on, or `null` when they
 * are not all on the very same canvas (align/distribute need that). */
export function commonCanvasSectionId(
  design: PageDesign,
  blockIds: readonly string[],
): string | null {
  let sectionId: string | null = null;
  for (const blockId of blockIds) {
    const at = locateBlock(design, blockId);
    if (at?.on !== "canvas") return null;
    if (sectionId === null) sectionId = at.section.id;
    else if (sectionId !== at.section.id) return null;
  }
  return sectionId;
}

/** Aligns the given items of one canvas to each other (left/center/right,
 * top/middle/bottom). Ids outside that canvas, or on another section, are
 * left untouched. */
export function alignCanvasItems(
  design: PageDesign,
  sectionId: string,
  blockIds: readonly string[],
  align: MultiAlign,
  measured?: (blockId: string) => number | undefined,
): PageDesign {
  return updateCanvasSection(design, sectionId, (section) => ({
    ...section,
    items: alignItems(section.items, blockIds, align, measured).map((item) =>
      clampItem(item, section.height, measured?.(item.block.id)),
    ),
  }));
}

/** Spreads the given items of one canvas evenly (needs at least 3). */
export function distributeCanvasItems(
  design: PageDesign,
  sectionId: string,
  blockIds: readonly string[],
  axis: MultiDistributeAxis,
  measured?: (blockId: string) => number | undefined,
): PageDesign {
  return updateCanvasSection(design, sectionId, (section) => ({
    ...section,
    items: distributeItems(section.items, blockIds, axis, measured).map(
      (item) => clampItem(item, section.height, measured?.(item.block.id)),
    ),
  }));
}

// ---------------------------------------------------------------------------
// Canvas item flags: rotation, lock and hide (addendum 3). Position and size
// are `setCanvasItemGeometry` in canvas.ts; these three never resize the
// item, so they live here instead of duplicating that module's `updateItem`.
// ---------------------------------------------------------------------------

export type CanvasItemFlagsPatch = {
  /** Degrees, -180 to 180; 0 (or omitted) clears it (no rotation stored). */
  r?: number | undefined;
  /** The Estudio will not move or resize it while locked. */
  locked?: boolean | undefined;
  /** Kept in the design but not drawn on the page while hidden. */
  hidden?: boolean | undefined;
};

/** Sets rotation, lock and/or hidden on a canvas item. Ignores ids that are
 * not on a canvas; a key left out of `patch` keeps its current value. */
export function setCanvasItemFlags(
  design: PageDesign,
  blockId: string,
  patch: CanvasItemFlagsPatch,
): PageDesign {
  const at = locateBlock(design, blockId);
  if (at?.on !== "canvas") return design;
  return updateCanvasSection(design, at.section.id, (section) => ({
    ...section,
    items: section.items.map((item) => {
      if (item.block.id !== blockId) return item;
      const { r: _r, locked: _locked, hidden: _hidden, ...rest } = item;
      const r =
        "r" in patch
          ? patch.r === undefined
            ? 0
            : Math.max(-180, Math.min(180, Math.round(patch.r)))
          : (item.r ?? 0);
      const locked =
        "locked" in patch ? Boolean(patch.locked) : Boolean(item.locked);
      const hidden =
        "hidden" in patch ? Boolean(patch.hidden) : Boolean(item.hidden);
      return {
        ...rest,
        ...(r ? { r } : {}),
        ...(locked ? { locked: true } : {}),
        ...(hidden ? { hidden: true } : {}),
      };
    }),
  }));
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** A new empty flow section with the given layout. */
export function createSection(
  newId: NewId,
  layout: SectionLayout = "1",
): DesignSection {
  return {
    id: newId("s"),
    layout,
    columns: Array.from({ length: layoutColumns[layout] }, () => []),
    paddingTop: 32,
    paddingBottom: 32,
    gap: 16,
    align: "start",
  };
}

export function addSection(
  design: PageDesign,
  section: PageSection,
  index = design.sections.length,
): PageDesign {
  const sections = design.sections.slice();
  sections.splice(clamp(index, 0, sections.length), 0, section);
  return replaceSections(design, sections);
}

export function removeSection(
  design: PageDesign,
  sectionId: string,
): PageDesign {
  if (design.sections.length <= 1) return design;
  const sections = design.sections.filter((item) => item.id !== sectionId);
  return sections.length === design.sections.length
    ? design
    : replaceSections(design, sections);
}

export function moveSection(
  design: PageDesign,
  sectionId: string,
  toIndex: number,
): PageDesign {
  const from = sectionIndexOf(design, sectionId);
  const section = design.sections[from];
  if (!section) return design;
  const sections = design.sections.slice();
  sections.splice(from, 1);
  sections.splice(clamp(toIndex, 0, sections.length), 0, section);
  return replaceSections(design, sections);
}

/**
 * Copies a section right after itself with new ids. Bound blocks stay only
 * in the original (they may appear once), so they are left out of the copy.
 * A canvas copy keeps every item where it was.
 */
export function duplicateSection(
  design: PageDesign,
  sectionId: string,
  newId: NewId,
): { design: PageDesign; id: string } | null {
  const index = sectionIndexOf(design, sectionId);
  const section = design.sections[index];
  if (!section) return null;
  const fresh = (block: DesignBlock): DesignBlock => ({
    ...structuredClone(block),
    id: newId("b"),
  });
  const copy: PageSection = isCanvasSection(section)
    ? {
        ...structuredClone(section),
        id: newId("s"),
        items: section.items
          .filter((item) => !isBoundKind(item.block.kind))
          .map((item) => ({
            ...structuredClone(item),
            block: fresh(item.block),
          })),
      }
    : {
        ...structuredClone(section),
        id: newId("s"),
        columns: section.columns.map((column) =>
          column.filter((block) => !isBoundKind(block.kind)).map(fresh),
        ),
      };
  return { design: addSection(design, copy, index + 1), id: copy.id };
}

/**
 * Changes the number of columns. Fewer columns: the blocks of the columns
 * that disappear move, in order, to the end of the last remaining one, so
 * nothing is ever lost. More columns: empty ones are added.
 */
export function setSectionLayout(
  design: PageDesign,
  sectionId: string,
  layout: SectionLayout,
): PageDesign {
  return updateSection(design, sectionId, (section) => {
    const count = layoutColumns[layout];
    const columns = section.columns
      .slice(0, count)
      .map((column) => [...column]);
    const overflow = section.columns.slice(count).flat();
    while (columns.length < count) columns.push([]);
    const last = columns[count - 1];
    if (last && overflow.length) last.push(...overflow);
    return { ...section, layout, columns };
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Kinds already on the page (for the one-of-each bound blocks). */
export function placedKinds(design: PageDesign): Set<DesignBlock["kind"]> {
  return new Set(designBlocks(design).map((block) => block.kind));
}

/** The section that holds a block. */
export function sectionOfBlock(
  design: PageDesign,
  blockId: string,
): PageSection | null {
  return locateBlock(design, blockId)?.section ?? null;
}
