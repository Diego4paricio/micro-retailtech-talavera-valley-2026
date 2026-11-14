import {
  type DesignableExperienceType,
  type DesignBlock,
  type DesignBlockKind,
  type DesignSection,
  isCanvasSection,
  layoutColumns,
  type PageDesign,
  type PageSection,
} from "@kardo/contracts";
import { type StudioTemplate, templatesFor } from "../templates/index.js";
import {
  boundKindsFor,
  createBlock,
  isBoundKind,
  isRepeatableBoundKind,
  optionalBoundKinds,
} from "./blocks.js";
import { createIdFactory, type NewId } from "./ids.js";

export type { StudioTemplate };

/** Kept for callers that imported the old (flow-only) name; templates may
 * now carry canvas sections too (addendum 3), so this is just `PageDesign`. */
export type FlowPageDesign = PageDesign;

/** Kardo's templates for a type, or the Estudio's own starting point. */
export function studioTemplatesFor(
  type: DesignableExperienceType,
): StudioTemplate[] {
  const templates = templatesFor(type);
  return templates.length ? templates : [fallbackTemplate];
}

/**
 * Makes a template's design valid for one page: fresh ids that never
 * collide with the content's links and socials, only the content blocks the
 * type allows (once each, except a Menú's `menu` block, which may repeat),
 * every required one of them present, and as many columns as each layout
 * asks for. Canvas sections (a "portada" cover, for example) are kept as
 * they are, only with fresh ids; the design's schema follows from whether
 * any survive.
 */
export function adaptTemplateDesign(
  source: PageDesign,
  type: DesignableExperienceType,
  contentIds: readonly string[],
  newId: NewId = createIdFactory(contentIds),
): PageDesign {
  const allowed = new Set<DesignBlockKind>(boundKindsFor(type));
  const seen = new Set<DesignBlockKind>();
  const keep = (block: DesignBlock) => {
    if (!isBoundKind(block.kind)) return true;
    if (!allowed.has(block.kind)) return false;
    if (seen.has(block.kind) && !isRepeatableBoundKind(block.kind))
      return false;
    seen.add(block.kind);
    return true;
  };
  const sections: PageSection[] = source.sections.map((section) => {
    if (isCanvasSection(section)) {
      const items = section.items
        .filter((item) => keep(item.block))
        .map((item) => ({
          ...structuredClone(item),
          block: { ...structuredClone(item.block), id: newId("b") },
        }));
      return { ...structuredClone(section), id: newId("s"), items };
    }
    const count = layoutColumns[section.layout];
    const columns = section.columns
      .slice(0, count)
      .map((column) =>
        column
          .filter(keep)
          .map((block) => ({ ...structuredClone(block), id: newId("b") })),
      );
    const overflow = section.columns
      .slice(count)
      .flat()
      .filter(keep)
      .map((block) => ({ ...structuredClone(block), id: newId("b") }));
    while (columns.length < count) columns.push([]);
    columns[count - 1]?.push(...overflow);
    return { ...structuredClone(section), id: newId("s"), columns };
  });
  const design: PageDesign = {
    schema: sections.some(isCanvasSection) ? 2 : 1,
    style: structuredClone(source.style),
    sections: sections.length
      ? sections
      : [
          {
            id: newId("s"),
            layout: "1",
            columns: [[]],
            paddingTop: 32,
            paddingBottom: 32,
            gap: 16,
            align: "start",
          },
        ],
  };
  for (const kind of boundKindsFor(type))
    if (!seen.has(kind) && !optionalBoundKinds.includes(kind))
      placeMissing(design, kind, newId);
  return design;
}

/** The first flow (non-canvas) section, made at the top when none exists:
 * every bound block that grows with content (links, a menu, a catalog, a
 * form, PDF pages) must live in one, never on a canvas. */
function firstFlowSection(design: PageDesign, newId: NewId): DesignSection {
  for (const section of design.sections)
    if (!isCanvasSection(section)) return section;
  const created: DesignSection = {
    id: newId("s"),
    layout: "1",
    columns: [[]],
    paddingTop: 32,
    paddingBottom: 32,
    gap: 16,
    align: "start",
  };
  design.sections.unshift(created);
  return created;
}

/** Puts a missing content block where today's pages show it. */
function placeMissing(
  design: PageDesign,
  kind: DesignBlockKind,
  newId: NewId,
): void {
  const block = createBlock(kind, newId);
  const find = (wanted: DesignBlockKind) => {
    for (const section of design.sections) {
      if (isCanvasSection(section)) continue;
      for (const column of section.columns) {
        const index = column.findIndex((item) => item.kind === wanted);
        if (index >= 0) return { column, index };
      }
    }
    return null;
  };
  const firstColumn = firstFlowSection(design, newId).columns[0];
  if (!firstColumn) return;
  if (
    kind === "contentTitle" ||
    kind === "profileHeader" ||
    kind === "imageMain"
  ) {
    firstColumn.unshift(block);
    return;
  }
  if (kind === "contentSocials") {
    const header = find("profileHeader");
    if (header) header.column.splice(header.index + 1, 0, block);
    else firstColumn.unshift(block);
    return;
  }
  const anchor =
    find("contentSocials") ?? find("profileHeader") ?? find("contentTitle");
  if (anchor) anchor.column.splice(anchor.index + 1, 0, block);
  else firstColumn.push(block);
}

/**
 * The Estudio's own starting point, used while the Kardo template gallery
 * is not available: calm paper tones, Geist titles and one card for the
 * links. It carries every content block; `adaptTemplateDesign` keeps the
 * ones each type allows.
 */
export const fallbackTemplate: StudioTemplate = {
  id: "kardo-esencial",
  name: "Kardo esencial",
  giro: "General",
  types: ["links", "profile", "linkpage"],
  description:
    "Tonos de papel, títulos en Geist y tus enlaces en una tarjeta al centro.",
  design: {
    schema: 1,
    style: {
      palette: {
        background: "#f4f1ea",
        surface: "#fffdf8",
        text: "#16232e",
        muted: "#5b6b73",
        accent: "#0a6c78",
      },
      fonts: { heading: "geist", body: "dm-sans" },
      radius: 18,
      buttonStyle: "solid",
      buttonShape: "pill",
      shadow: "soft",
      background: {
        kind: "gradient",
        color: "#e3f0ef",
        colorTo: "#f6f2ea",
        angle: 180,
      },
      maxWidth: 560,
    },
    sections: [
      {
        id: "encabezado",
        layout: "1",
        columns: [
          [
            { id: "titulo", kind: "contentTitle" },
            {
              id: "perfil",
              kind: "profileHeader",
              layout: "stacked",
              avatarShape: "circle",
            },
            { id: "redes", kind: "contentSocials", size: "medium" },
          ],
        ],
        paddingTop: 56,
        paddingBottom: 12,
        gap: 16,
        align: "center",
      },
      {
        id: "enlaces",
        layout: "1",
        columns: [[{ id: "botones", kind: "contentLinks", layout: "list" }]],
        card: true,
        paddingTop: 24,
        paddingBottom: 24,
        gap: 12,
        align: "center",
      },
    ],
  },
};
