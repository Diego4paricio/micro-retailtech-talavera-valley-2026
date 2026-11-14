import type {
  BlockStyle,
  CanvasItem,
  CanvasSection,
  DesignBackground,
  DesignBlock,
  DesignSection,
  DesignShape,
  DesignStyle,
  ImageMask,
  PageDesign,
  PageSection,
  SectionLayout,
  TextRun,
} from "@kardo/contracts";

/**
 * Small builders for `PageDesign` literals, used only by the starter
 * templates in this folder. They exist so each giro file reads as page
 * content (headings, copy, links) rather than repeated object shape
 * boilerplate. Every builder omits an optional key entirely when it is
 * unused (never assigns it `undefined`), matching the contracts'
 * `additionalProperties: false` schemas under `exactOptionalPropertyTypes`.
 */

export function heading(
  id: string,
  text: string,
  level: 1 | 2 | 3,
  style?: BlockStyle,
): DesignBlock {
  return { id, kind: "heading", text, level, ...(style ? { style } : {}) };
}

/** A single, plain text run (no bold/italic/link formatting). */
export function paragraph(
  id: string,
  text: string,
  style?: BlockStyle,
): DesignBlock {
  return { id, kind: "text", runs: [{ text }], ...(style ? { style } : {}) };
}

/** A text block built from several formatted runs (bold, italic, links). */
export function richText(
  id: string,
  runs: TextRun[],
  style?: BlockStyle,
): DesignBlock {
  return { id, kind: "text", runs, ...(style ? { style } : {}) };
}

export function button(
  id: string,
  label: string,
  href: string,
  variant: "primary" | "secondary" = "primary",
  style?: BlockStyle,
): DesignBlock {
  return {
    id,
    kind: "button",
    label,
    href,
    variant,
    ...(style ? { style } : {}),
  };
}

export function divider(id: string, style?: BlockStyle): DesignBlock {
  return { id, kind: "divider", ...(style ? { style } : {}) };
}

export function spacer(
  id: string,
  height: number,
  style?: BlockStyle,
): DesignBlock {
  return { id, kind: "spacer", height, ...(style ? { style } : {}) };
}

/** Bound block: shows the Experience's own title (links pages). */
export function contentTitleBlock(id: string, style?: BlockStyle): DesignBlock {
  return { id, kind: "contentTitle", ...(style ? { style } : {}) };
}

/** Bound block: shows the Experience's avatar, name and bio. */
export function profileHeaderBlock(
  id: string,
  layout: "stacked" | "inline",
  avatarShape: "circle" | "rounded" | "none",
  style?: BlockStyle,
): DesignBlock {
  return {
    id,
    kind: "profileHeader",
    layout,
    avatarShape,
    ...(style ? { style } : {}),
  };
}

/** Bound block: the Experience's own list of content links. */
export function contentLinksBlock(
  id: string,
  layout: "list" | "grid",
  style?: BlockStyle,
): DesignBlock {
  return { id, kind: "contentLinks", layout, ...(style ? { style } : {}) };
}

/** Bound block: the Experience's social network icons (Links only). */
export function contentSocialsBlock(
  id: string,
  size: "small" | "medium" | "large",
  style?: BlockStyle,
): DesignBlock {
  return { id, kind: "contentSocials", size, ...(style ? { style } : {}) };
}

/** Bound block: a Menú's sections and dishes. */
export function menuBlock(
  id: string,
  opts: {
    layout?: "list" | "cards" | "grid" | "compact";
    photos?: "none" | "small" | "large";
    photoShape?: "rounded" | "circle" | "square";
    descriptions?: boolean;
    sectionStyle?: "line" | "plain" | "pill" | "card";
    priceStyle?: "plain" | "accent" | "pill";
    columns?: 1 | 2;
    sectionIds?: string[];
  } = {},
  style?: BlockStyle,
): DesignBlock {
  return {
    id,
    kind: "menu",
    layout: opts.layout ?? "cards",
    photos: opts.photos ?? "small",
    ...(opts.photoShape ? { photoShape: opts.photoShape } : {}),
    ...(opts.descriptions !== undefined
      ? { descriptions: opts.descriptions }
      : {}),
    ...(opts.sectionStyle ? { sectionStyle: opts.sectionStyle } : {}),
    ...(opts.priceStyle ? { priceStyle: opts.priceStyle } : {}),
    ...(opts.columns ? { columns: opts.columns } : {}),
    ...(opts.sectionIds ? { sectionIds: opts.sectionIds } : {}),
    ...(style ? { style } : {}),
  };
}

/** Bound block: a Catálogo's products. */
export function catalogBlock(
  id: string,
  opts: {
    layout?: "grid" | "list" | "cards";
    columns?: 1 | 2 | 3;
    imageAspect?: "1:1" | "4:3" | "3:4";
    descriptions?: boolean;
    buttonLabel?: string;
    priceStyle?: "plain" | "accent" | "pill";
  } = {},
  style?: BlockStyle,
): DesignBlock {
  return {
    id,
    kind: "catalog",
    layout: opts.layout ?? "grid",
    columns: opts.columns ?? 2,
    ...(opts.imageAspect ? { imageAspect: opts.imageAspect } : {}),
    ...(opts.descriptions !== undefined
      ? { descriptions: opts.descriptions }
      : {}),
    ...(opts.buttonLabel ? { buttonLabel: opts.buttonLabel } : {}),
    ...(opts.priceStyle ? { priceStyle: opts.priceStyle } : {}),
    ...(style ? { style } : {}),
  };
}

/** Bound block: the Formulario's own fields. */
export function leadFormBlock(
  id: string,
  look: "boxed" | "card" | "underline" = "boxed",
  buttonWidth?: "full" | "auto",
  style?: BlockStyle,
): DesignBlock {
  return {
    id,
    kind: "leadForm",
    look,
    ...(buttonWidth ? { buttonWidth } : {}),
    ...(style ? { style } : {}),
  };
}

/** Bound block: a PDF's pages (visor) or its download card. */
export function documentPagesBlock(
  id: string,
  pageStyle: "shadow" | "border" | "flat" = "shadow",
  gap?: number,
  style?: BlockStyle,
): DesignBlock {
  return {
    id,
    kind: "documentPages",
    pageStyle,
    ...(gap !== undefined ? { gap } : {}),
    ...(style ? { style } : {}),
  };
}

/** Bound block: an Imagen Experience's own main photo. */
export function imageMainBlock(
  id: string,
  opts: {
    fit?: "contain" | "cover";
    frame?: "none" | "card" | "shadow";
    aspect?: "auto" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
    mask?: ImageMask;
  } = {},
  style?: BlockStyle,
): DesignBlock {
  return {
    id,
    kind: "imageMain",
    fit: opts.fit ?? "cover",
    frame: opts.frame ?? "none",
    ...(opts.aspect ? { aspect: opts.aspect } : {}),
    ...(opts.mask ? { mask: opts.mask } : {}),
    ...(style ? { style } : {}),
  };
}

/** A decorative shape (canvas sections only): a solid or gradient fill, an
 * optional outline (rect/ellipse/pill only) and any of the 9 closed shapes. */
export function shapeBlock(
  id: string,
  shape: DesignShape,
  fill: string,
  opts: {
    fillTo?: string;
    angle?: number;
    stroke?: string;
    strokeWidth?: number;
  } = {},
): DesignBlock {
  return {
    id,
    kind: "shape",
    shape,
    fill,
    ...(opts.fillTo ? { fillTo: opts.fillTo } : {}),
    ...(opts.angle !== undefined ? { angle: opts.angle } : {}),
    ...(opts.stroke ? { stroke: opts.stroke } : {}),
    ...(opts.strokeWidth !== undefined
      ? { strokeWidth: opts.strokeWidth }
      : {}),
  };
}

/** A free image block, canvas-ready (`mask` crops it into a shape). */
export function imageBlock(
  id: string,
  imageRef: string,
  opts: {
    alt?: string;
    aspect?: "auto" | "1:1" | "4:3" | "3:4" | "16:9";
    fit?: "cover" | "contain";
    href?: string;
    mask?: ImageMask;
  } = {},
  style?: BlockStyle,
): DesignBlock {
  return {
    id,
    kind: "image",
    imageRef,
    alt: opts.alt ?? "",
    aspect: opts.aspect ?? "1:1",
    fit: opts.fit ?? "cover",
    ...(opts.href ? { href: opts.href } : {}),
    ...(opts.mask ? { mask: opts.mask } : {}),
    ...(style ? { style } : {}),
  };
}

/** One block placed on a canvas section, at design px of a 390 px phone. */
export function canvasItem(
  block: DesignBlock,
  x: number,
  y: number,
  w: number,
  opts: { h?: number; z?: number; r?: number } = {},
): CanvasItem {
  return {
    block,
    x,
    y,
    w,
    ...(opts.h !== undefined ? { h: opts.h } : {}),
    ...(opts.z !== undefined ? { z: opts.z } : {}),
    ...(opts.r !== undefined ? { r: opts.r } : {}),
  };
}

/** A canvas section ("lienzo libre"): free-placed items instead of columns,
 * used by templates for a Canva-style cover (shapes, a masked image, a big
 * title) that shows the Estudio's freedom right away. */
export function canvasSection(
  id: string,
  height: number,
  items: CanvasItem[],
  background?: DesignBackground,
): CanvasSection {
  return {
    id,
    kind: "canvas",
    height,
    items,
    ...(background ? { background } : {}),
  };
}

export function section(
  id: string,
  layout: SectionLayout,
  columns: DesignBlock[][],
  opts: {
    background?: DesignBackground;
    card?: boolean;
    paddingTop?: number;
    paddingBottom?: number;
    gap?: number;
    align?: "start" | "center" | "end";
  } = {},
): DesignSection {
  return {
    id,
    layout,
    columns,
    paddingTop: opts.paddingTop ?? 64,
    paddingBottom: opts.paddingBottom ?? 64,
    gap: opts.gap ?? 28,
    align: opts.align ?? "center",
    ...(opts.background ? { background: opts.background } : {}),
    ...(opts.card !== undefined ? { card: opts.card } : {}),
  };
}

export function pageDesign(
  style: DesignStyle,
  sections: PageSection[],
): PageDesign {
  const schema = sections.some((section) => section.kind === "canvas") ? 2 : 1;
  return { schema, style, sections };
}
