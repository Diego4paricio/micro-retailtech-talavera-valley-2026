import {
  boundBlockKinds,
  boundBlocksByType,
  type DesignableExperienceType,
  type DesignBackground,
  type DesignBlock,
  type DesignBlockKind,
  isCanvasSection,
  type PageDesign,
  type PageSection,
  repeatableBoundBlocks,
} from "@kardo/contracts";
import { contentBlocksFor } from "./from-content.js";
import type { NewId } from "./ids.js";

/**
 * "Igual que otra de tus páginas" (relevo 37, C4a): what a design carries
 * over when it is copied onto a DIFFERENT page, of the same type or not.
 *
 * - **The look always copies.** `style` (palette, fonts, buttons, radius,
 *   background, ambient…) never depended on what the page shows, so it
 *   copies as-is, whatever the new type is.
 * - **Free blocks always copy.** `heading`, `text`, `image`, `gallery`,
 *   `features`, `button`, `brandButton`, `divider`, `shape`, `html` and
 *   `spacer` only hold their own text, image or link: nothing that points
 *   at the old page's content.
 * - **Bound blocks** — the ones that draw the page's own content — copy
 *   only when the new type also places that exact kind
 *   (`boundBlocksByType`): a Menú's `menu` block has nowhere to go on a
 *   Formulario, so it is dropped; a Menú copied onto another Menú keeps
 *   it. Two kinds never survive even when the kind does match the new
 *   type, because they name specific pieces of the OLD page's content:
 *     - `featuredItems` ("Destacados") always drops — its `itemIds` are
 *       specific dishes or products of the old page, never valid on the
 *       new one (even Menú → Menú).
 *     - `menu` keeps its look (layout, photos, prices…) but loses
 *       `sectionIds` — the old menu's own section ids; without them it
 *       shows every section of whichever menu it lands on, instead of a
 *       stale, likely-missing subset.
 * - **Whatever the new type still needs is filled in from its own basic
 *   design** (`contentBlocksFor`, the same blocks a brand-new page of that
 *   type starts with), in one more section at the end. This is what "lo
 *   que no aplica se reemplaza por lo del diseño básico del tipo nuevo"
 *   means in practice, and it guarantees the result always keeps the one
 *   bound block `checkDesign` requires for the new type.
 *
 * Every id is reassigned through `newId`, so the result never repeats one
 * of its own ids or one already used by the new page's own content.
 */
export function copyDesignToType(
  source: PageDesign,
  targetType: DesignableExperienceType,
  newId: NewId,
): PageDesign {
  const boundKindSet = new Set<DesignBlockKind>(boundBlockKinds);
  const repeatableSet = new Set<DesignBlockKind>(repeatableBoundBlocks);
  const allowed = new Set<DesignBlockKind>(boundBlocksByType[targetType]);
  const present = new Set<DesignBlockKind>();

  const keepBlock = (block: DesignBlock): DesignBlock | null => {
    if (!boundKindSet.has(block.kind))
      return { ...block, id: newId("b") } as DesignBlock;
    if (block.kind === "featuredItems") return null; // page-specific items
    if (!allowed.has(block.kind)) return null; // not available for this type
    if (present.has(block.kind) && !repeatableSet.has(block.kind)) return null; // one each, except menu
    present.add(block.kind);
    if (block.kind === "menu") {
      const { sectionIds: _old, ...rest } = block;
      return { ...rest, id: newId("b") } as DesignBlock;
    }
    return { ...block, id: newId("b") } as DesignBlock;
  };

  const sections: PageSection[] = source.sections
    .map((section): PageSection => {
      if (isCanvasSection(section)) {
        return {
          ...section,
          id: newId("s"),
          items: section.items
            .map((item) => {
              const block = keepBlock(item.block);
              return block ? { ...item, block } : null;
            })
            .filter((item): item is NonNullable<typeof item> => item !== null),
        };
      }
      return {
        ...section,
        id: newId("s"),
        columns: section.columns.map((column) =>
          column
            .map((block) => keepBlock(block))
            .filter((block): block is DesignBlock => block !== null),
        ),
      };
    })
    .filter((section) =>
      isCanvasSection(section)
        ? section.items.length > 0
        : section.columns.some((column) => column.length > 0),
    );

  const missing = contentBlocksFor(targetType, newId).filter(
    (block) => !present.has(block.kind),
  );
  if (missing.length) sections.push(defaultSection(targetType, missing, newId));

  return {
    schema: sections.some(isCanvasSection) ? 2 : 1,
    style: structuredClone(source.style),
    sections: sections.length
      ? sections
      : [
          defaultSection(
            targetType,
            contentBlocksFor(targetType, newId),
            newId,
          ),
        ],
  };
}

/** Sections align to the left by default; a header-shaped type (a
 * person's profile, a link-in-bio page or a single photo) reads better
 * centered — same rule `designFromContent` uses for a brand-new page. */
const centeredTypes: readonly DesignableExperienceType[] = [
  "linkpage",
  "image",
];

function defaultSection(
  type: DesignableExperienceType,
  blocks: DesignBlock[],
  newId: NewId,
): PageSection {
  return {
    id: newId("s"),
    layout: "1",
    columns: [blocks],
    card: type !== "image",
    paddingTop: 28,
    paddingBottom: 28,
    gap: 16,
    align: centeredTypes.includes(type) ? "center" : "start",
  };
}

// ---------------------------------------------------------------------------
// Copying from another organization (D6, Diego's case): the design still
// travels through `copyDesignToType` above; this only strips what that
// organization's own file library left behind.
// ---------------------------------------------------------------------------

/** Same pattern `designHtmlAssetRefs` (@kardo/contracts) scans a whole
 * design for, checked against one `html` block's own source. */
const assetRefPattern = /kardo-asset:[0-9a-fA-F-]{32,64}/;

function htmlBlockNamesAnAsset(block: { html: string; css: string }): boolean {
  return assetRefPattern.test(block.html) || assetRefPattern.test(block.css);
}

/** Drops `imageRef` from a background, keeping its `color` (the fallback a
 * background already falls back to while the photo loads). Backgrounds
 * that are not an image pass through unchanged. */
function withoutBackgroundImage(
  background: DesignBackground,
): DesignBackground {
  if (background.kind !== "image" || !background.imageRef) return background;
  const { imageRef: _old, ...rest } = background;
  return rest;
}

/** `null` means "drop the block entirely" (an `html` block naming an
 * asset); every other kind is cleaned in place. */
function withoutBlockImages(block: DesignBlock): DesignBlock | null {
  switch (block.kind) {
    case "image": {
      if (!block.imageRef) return block;
      const { imageRef: _old, ...rest } = block;
      return rest;
    }
    case "gallery":
      return {
        ...block,
        images: block.images.map(({ imageRef: _old, ...rest }) => rest),
      };
    case "html":
      // Its own markup could reference the image in attributes or CSS in
      // several places; there is no safe partial edit, so the block goes.
      return htmlBlockNamesAnAsset(block) ? null : block;
    default:
      return block;
  }
}

/**
 * Strips every reference to another organization's own files from a design
 * copied from it (D6): its photos, logos and PDFs live in THAT workspace's
 * library, so a copy can never show them here. Everything else about the
 * look — palette, fonts, layout, button shapes — is untouched; call this
 * right after `copyDesignToType`, only when the source page belongs to a
 * different organization.
 *
 * - An `image` block, or one photo of a `gallery`, loses its `imageRef`:
 *   it becomes an "espacio para foto" (2026-10-03's placeholder for a
 *   photo not uploaded yet), the same empty state a brand-new block
 *   starts in, with "Falta tu foto" in the Estudio until the owner adds
 *   their own.
 * - A page or section background of `kind: "image"` loses its `imageRef`
 *   the same way; its `color` stays, so the page still has a background.
 * - An `html` block that names a workspace asset (`kardo-asset:…`) is
 *   dropped outright, for the reason in `withoutBlockImages`.
 * - Nothing else changes. An avatar or a logo is never stored inside the
 *   design itself (it comes from the page's own content, or the
 *   organization's brand), so there is nothing to strip for those.
 */
export function withoutForeignImages(design: PageDesign): PageDesign {
  const sections: PageSection[] = design.sections.map((section) => {
    const withBg = section.background
      ? { background: withoutBackgroundImage(section.background) }
      : {};
    if (isCanvasSection(section)) {
      return {
        ...section,
        ...withBg,
        items: section.items
          .map((item) => {
            const block = withoutBlockImages(item.block);
            return block ? { ...item, block } : null;
          })
          .filter((item): item is NonNullable<typeof item> => item !== null),
      };
    }
    return {
      ...section,
      ...withBg,
      columns: section.columns.map((column) =>
        column
          .map((block) => withoutBlockImages(block))
          .filter((block): block is DesignBlock => block !== null),
      ),
    };
  });

  return {
    ...design,
    style: {
      ...design.style,
      background: withoutBackgroundImage(design.style.background),
    },
    sections,
  };
}
