import {
  CANVAS_WIDTH,
  type CanvasItem,
  type CanvasSection,
  type DesignableExperienceType,
  type DesignBackground,
  type DesignBlock,
  type DesignPhotoMode,
  isCanvasSection,
  type PageDesign,
  requiredBlockByType,
} from "@kardo/contracts";
import {
  type CanvasTexts,
  estimateHeight,
  fitCanvasText,
} from "./canvas-fit.js";
import { contrastRatio } from "./readable-palette.js";

// ---------------------------------------------------------------------------
// Layout review (relevo 29, 2026-10-03). The owner saw Kardo's AI misplace
// photos and buttons; the test bench showed why: the model places every
// canvas item by numbers it never sees drawn. This applies, after the
// design validates and without another turn, the placement rules the
// prompt states in numbers (`placementRules` in
// `packages/contracts/src/design-composition.ts`):
// - the customer's photo choice ("Sin fotos" leaves no photo anywhere the
//   design controls; "Con fotos" never leaves the menu without them);
// - a name drawn twice (a cover heading repeating the bound title);
// - texts and buttons inside the canvas margins, sharing one left edge;
// - a photo centered on the shape that frames it;
// - text that reads on what is really behind it on a canvas;
// - texts that fit (canvas-fit.ts) and a canvas that ends where its
//   content does.
// Each change is listed (`LayoutFix`) for the audit and the bench.
// ---------------------------------------------------------------------------

type AnySection = PageDesign["sections"][number];

export type LayoutContext = CanvasTexts & {
  type: DesignableExperienceType;
  /** The profile's or link page's name, drawn by `profileHeader`. */
  displayName?: string | undefined;
  photos?: DesignPhotoMode | undefined;
  /** The organization's logo: still allowed in a design without photos. */
  logoRef?: string | undefined;
  /** Profile or link page: whether the content has its own photo (without
   * one, profileHeader draws the initials). */
  hasAvatar?: boolean | undefined;
};

export type LayoutFix = { path: string; what: string };

/** Canvas margin for texts and buttons (`placementRules`). */
const MARGIN = 24;
/** Below this, a text or a button counts as touching the edge. */
const EDGE = 16;
/** Two left edges this close (but not equal) were meant to be one. */
const SNAP = 12;
const MIN_TEXT_WIDTH = 120;
/** Room left under the last item of a canvas before it is trimmed. */
const TAIL = 48;

const HEX = /^#[0-9a-f]{6}$/i;

const textKinds = new Set<DesignBlock["kind"]>([
  "heading",
  "text",
  "button",
  "brandButton",
  "contentTitle",
  "contentSocials",
]);

function normalized(text: string | undefined): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function colorOf(
  value: string | undefined,
  design: PageDesign,
): string | undefined {
  if (!value) return undefined;
  if (HEX.test(value)) return value;
  const palette = design.style.palette as Record<string, string>;
  return palette[value];
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const v = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** The page's own color behind a section with no background. */
function pageColor(design: PageDesign): string {
  const background = design.style.background;
  if (background.kind === "solid" && background.color) return background.color;
  return design.style.palette.background;
}

/** What a canvas really shows behind its items, as one color, or null when
 * it is a photo (its overlay decides, see `readOverPhoto`). */
function canvasGround(
  background: DesignBackground | undefined,
  design: PageDesign,
): string | null {
  if (!background || background.kind === "none") return pageColor(design);
  if (background.kind === "solid") return background.color ?? pageColor(design);
  if (background.kind === "gradient") {
    const from = background.color ?? pageColor(design);
    const to = background.colorTo ?? from;
    // The lighter end decides: text must read over all of it.
    return luminance(from) > luminance(to) ? from : to;
  }
  // A photo space shows its color until the owner uploads the photo.
  if (!background.imageRef) return background.color ?? pageColor(design);
  return null;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

function withoutPhotos(
  design: PageDesign,
  context: LayoutContext,
  fixes: LayoutFix[],
): PageDesign {
  const required = requiredBlockByType[context.type];
  const keepImage = (block: DesignBlock) =>
    block.kind === "image" &&
    context.logoRef !== undefined &&
    block.imageRef === context.logoRef;
  const dropBlock = (block: DesignBlock) =>
    block.kind !== required &&
    ((block.kind === "image" && !keepImage(block)) ||
      block.kind === "gallery" ||
      block.kind === "featuredItems");
  const flatten = (background: DesignBackground | undefined, path: string) => {
    if (background?.kind !== "image") return background;
    fixes.push({ path, what: "sin fotos: fondo de color" });
    return {
      kind: "solid" as const,
      color: background.color ?? design.style.palette.text,
    };
  };
  const sections = design.sections.map((section, index): AnySection => {
    const background = flatten(
      section.background,
      `/sections/${index}/background`,
    );
    if (isCanvasSection(section)) {
      const items = section.items.filter((item) => {
        if (!dropBlock(item.block)) return true;
        fixes.push({
          path: `/sections/${index}/items/${item.block.id}`,
          what: `sin fotos: quita ${item.block.kind}`,
        });
        return false;
      });
      return {
        ...section,
        items,
        ...(background ? { background } : {}),
      } as CanvasSection;
    }
    const columns = section.columns.map((column) =>
      column
        .filter((block) => {
          if (!dropBlock(block)) return true;
          fixes.push({
            path: `/sections/${index}/blocks/${block.id}`,
            what: `sin fotos: quita ${block.kind}`,
          });
          return false;
        })
        .map((block) => {
          if (block.kind === "menu" && block.photos !== "none") {
            fixes.push({
              path: `/sections/${index}/blocks/${block.id}`,
              what: "sin fotos: menú sin fotos",
            });
            return {
              ...block,
              photos: "none" as const,
              ...(block.layout === "grid" || block.layout === "cards"
                ? { layout: "list" as const }
                : {}),
            };
          }
          return block;
        }),
    );
    return { ...section, columns, ...(background ? { background } : {}) };
  });
  const pageBackground = flatten(design.style.background, "/style/background");
  return {
    ...design,
    sections,
    style: {
      ...design.style,
      ...(pageBackground ? { background: pageBackground } : {}),
    },
  };
}

function withPhotos(design: PageDesign, fixes: LayoutFix[]): PageDesign {
  let changed = false;
  const sections = design.sections.map((section, index) => {
    if (isCanvasSection(section)) return section;
    const columns = section.columns.map((column) =>
      column.map((block) => {
        if (block.kind !== "menu" || block.photos !== "none") return block;
        changed = true;
        fixes.push({
          path: `/sections/${index}/blocks/${block.id}`,
          what: "con fotos: menú con fotos",
        });
        return {
          ...block,
          photos:
            block.layout === "cards" || block.layout === "grid"
              ? ("large" as const)
              : ("small" as const),
          ...(block.layout === "compact" ? { layout: "list" as const } : {}),
        };
      }),
    );
    return { ...section, columns };
  });
  return changed ? { ...design, sections } : design;
}

// ---------------------------------------------------------------------------
// A name drawn twice
// ---------------------------------------------------------------------------

function boundNames(design: PageDesign, context: LayoutContext): string[] {
  const kinds = new Set<string>();
  for (const section of design.sections) {
    const blocks = isCanvasSection(section)
      ? section.items.map((item) => item.block)
      : section.columns.flat();
    for (const block of blocks) kinds.add(block.kind);
  }
  const names: string[] = [];
  if (kinds.has("contentTitle") && context.title)
    names.push(normalized(context.title));
  if (kinds.has("profileHeader") && context.displayName)
    names.push(normalized(context.displayName));
  return names.filter(Boolean);
}

function dropRepeatedNames(
  design: PageDesign,
  context: LayoutContext,
  fixes: LayoutFix[],
): PageDesign {
  const names = boundNames(design, context);
  if (names.length === 0) return design;
  const repeats = (block: DesignBlock) =>
    block.kind === "heading" && names.includes(normalized(block.text));
  let changed = false;
  const sections = design.sections.map((section, index): AnySection => {
    if (isCanvasSection(section)) {
      const items = section.items.filter((item) => {
        if (!repeats(item.block)) return true;
        changed = true;
        fixes.push({
          path: `/sections/${index}/items/${item.block.id}`,
          what: "nombre repetido",
        });
        return false;
      });
      return { ...section, items };
    }
    const columns = section.columns.map((column) =>
      column.filter((block) => {
        if (!repeats(block)) return true;
        changed = true;
        fixes.push({
          path: `/sections/${index}/blocks/${block.id}`,
          what: "nombre repetido",
        });
        return false;
      }),
    );
    return { ...section, columns };
  });
  return changed ? { ...design, sections } : design;
}

// ---------------------------------------------------------------------------
// Canvas placement
// ---------------------------------------------------------------------------

const isText = (item: CanvasItem) =>
  !item.hidden && textKinds.has(item.block.kind);

const centered = (item: CanvasItem) =>
  (item.block.style as { align?: string } | undefined)?.align === "center" ||
  Math.abs(item.x + item.w / 2 - CANVAS_WIDTH / 2) <= 2;

/** Texts and buttons back inside the canvas margins. */
function keepInside(items: CanvasItem[], fixes: LayoutFix[], path: string) {
  return items.map((item) => {
    if (!isText(item) || item.r) return item;
    let { x, w } = item;
    if (x < EDGE) {
      const shift = MARGIN - x;
      x = MARGIN;
      w = Math.max(MIN_TEXT_WIDTH, w - shift);
    }
    if (x + w > CANVAS_WIDTH - EDGE) {
      w = Math.max(MIN_TEXT_WIDTH, CANVAS_WIDTH - MARGIN - x);
      if (x + w > CANVAS_WIDTH - MARGIN) x = CANVAS_WIDTH - MARGIN - w;
    }
    if (x === item.x && w === item.w) return item;
    fixes.push({ path: `${path}/items/${item.block.id}`, what: "márgenes" });
    return { ...item, x, w };
  });
}

/** Left-aligned texts whose left edges almost match share one. */
function snapLeftEdges(items: CanvasItem[], fixes: LayoutFix[], path: string) {
  const lefts = items.filter((item) => isText(item) && !centered(item));
  if (lefts.length < 2) return items;
  const counts = new Map<number, number>();
  for (const item of lefts) counts.set(item.x, (counts.get(item.x) ?? 0) + 1);
  const [edge] = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0] - b[0],
  )[0] as [number, number];
  return items.map((item) => {
    if (!lefts.includes(item) || item.x === edge) return item;
    if (Math.abs(item.x - edge) > SNAP) return item;
    fixes.push({ path: `${path}/items/${item.block.id}`, what: "alineación" });
    return {
      ...item,
      x: edge,
      w: Math.max(MIN_TEXT_WIDTH, item.w + item.x - edge),
    };
  });
}

function boxOf(item: CanvasItem): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return { x: item.x, y: item.y, w: item.w, h: item.h ?? item.w };
}

/** A photo framed by a shape sits in its middle: an even ring, never a
 * photo pushed against one side of its frame. */
function centerPhotosOnShapes(
  items: CanvasItem[],
  fixes: LayoutFix[],
  path: string,
) {
  return items.map((item) => {
    if (item.hidden || item.block.kind !== "image" || item.r) return item;
    const photo = boxOf(item);
    const frame = items.find((other) => {
      if (other === item || other.hidden || other.block.kind !== "shape")
        return false;
      if ((other.z ?? 0) > (item.z ?? 0)) return false;
      const box = boxOf(other);
      return (
        box.x <= photo.x &&
        box.y <= photo.y &&
        box.x + box.w >= photo.x + photo.w &&
        box.y + box.h >= photo.y + photo.h &&
        box.w - photo.w <= 64 &&
        box.h - photo.h <= 64
      );
    });
    if (!frame) return item;
    const box = boxOf(frame);
    const x = Math.round(box.x + (box.w - photo.w) / 2);
    const y = Math.round(box.y + (box.h - photo.h) / 2);
    if (Math.abs(x - item.x) <= 2 && Math.abs(y - item.y) <= 2) return item;
    fixes.push({
      path: `${path}/items/${item.block.id}`,
      what: "foto centrada en su forma",
    });
    return { ...item, x, y };
  });
}

/** The color a text item really sits on: a shape under it, else the
 * canvas's own ground (null on a photo). */
function groundUnder(
  item: CanvasItem,
  items: CanvasItem[],
  canvasColor: string | null,
  design: PageDesign,
): string | null | undefined {
  const cx = item.x + item.w / 2;
  const cy = item.y + 12;
  const under = items
    .filter(
      (other) =>
        other !== item &&
        !other.hidden &&
        (other.z ?? 0) <= (item.z ?? 0) &&
        (other.block.kind === "shape" || other.block.kind === "image") &&
        cx >= other.x &&
        cx <= other.x + other.w &&
        cy >= other.y &&
        cy <= other.y + (other.h ?? other.w),
    )
    .sort((a, b) => (b.z ?? 0) - (a.z ?? 0))[0];
  if (under?.block.kind === "image") return undefined;
  if (under?.block.kind === "shape") {
    const block = under.block as Extract<DesignBlock, { kind: "shape" }>;
    const opacity = (block.style as { opacity?: number } | undefined)?.opacity;
    if (opacity !== undefined && opacity < 90) return canvasColor;
    return colorOf(block.fill, design) ?? canvasColor;
  }
  return canvasColor;
}

/** Text that does not read on what is behind it takes the palette's text
 * color or white, whichever reads; on a photo, light text gets enough
 * overlay. */
function readableCanvas(
  section: CanvasSection,
  design: PageDesign,
  fixes: LayoutFix[],
  path: string,
): CanvasSection {
  const canvasColor = canvasGround(section.background, design);
  let background = section.background;
  const items = section.items.map((item) => {
    if (!isText(item)) return item;
    if (
      item.block.kind === "button" ||
      item.block.kind === "brandButton" ||
      item.block.kind === "contentSocials"
    )
      return item;
    const style = item.block.style as { color?: string } | undefined;
    const color = colorOf(style?.color, design) ?? design.style.palette.text;
    const ground = groundUnder(item, section.items, canvasColor, design);
    if (ground === undefined) return item;
    if (ground === null) {
      // On a photo: light text needs the overlay to read.
      if (
        background?.kind === "image" &&
        luminance(color) > 0.5 &&
        (background.overlay ?? 0) < 40
      ) {
        background = { ...background, overlay: 45 };
        fixes.push({
          path: `${path}/background/overlay`,
          what: "overlay para leer",
        });
      }
      return item;
    }
    if (contrastRatio(color, ground) >= 3) return item;
    // The palette's own text color when it reads; else white or near
    // black, whichever reads better.
    const best =
      contrastRatio(design.style.palette.text, ground) >= 4.5
        ? design.style.palette.text
        : contrastRatio("#ffffff", ground) >= contrastRatio("#111111", ground)
          ? "#ffffff"
          : "#111111";
    fixes.push({ path: `${path}/items/${item.block.id}`, what: "contraste" });
    return {
      ...item,
      block: {
        ...item.block,
        style: { ...item.block.style, color: best },
      } as DesignBlock,
    };
  });
  return { ...section, items, ...(background ? { background } : {}) };
}

/** A canvas without a photo ends where its content does. */
function trimTail(
  section: CanvasSection,
  texts: CanvasTexts,
  fixes: LayoutFix[],
  path: string,
): CanvasSection {
  if (section.background?.kind === "image") return section;
  const bottoms = section.items
    .filter((item) => !item.hidden)
    .map((item) => {
      const block = item.block;
      if (textKinds.has(block.kind) && block.kind !== "contentSocials") {
        const height = estimateHeight(
          block as Parameters<typeof estimateHeight>[0],
          item.w,
          texts,
        );
        return item.y + Math.max(height, item.h ?? 0);
      }
      return item.y + (item.h ?? item.w);
    });
  if (bottoms.length === 0) return section;
  const lowest = Math.max(...bottoms);
  if (lowest + TAIL >= section.height) return section;
  const height = Math.max(80, Math.ceil(lowest + 32));
  fixes.push({ path: `${path}/height`, what: "lienzo sin espacio de sobra" });
  return { ...section, height };
}

// ---------------------------------------------------------------------------
// One main action, one face (relevo 29, from the bench's visual review)
// ---------------------------------------------------------------------------

/** In a Formulario the form is the action: a button on a canvas that would
 * compete with it becomes secondary (a WhatsApp button keeps its logo, as
 * an outline). */
function formIsTheAction(
  design: PageDesign,
  context: LayoutContext,
  fixes: LayoutFix[],
): PageDesign {
  if (context.type !== "form") return design;
  let changed = false;
  const sections = design.sections.map((section, index) => {
    if (!isCanvasSection(section)) return section;
    const items = section.items.map((item) => {
      const block = item.block;
      if (block.kind === "button" && block.variant === "primary") {
        changed = true;
        fixes.push({
          path: `/sections/${index}/items/${block.id}`,
          what: "el formulario es la acción",
        });
        return { ...item, block: { ...block, variant: "secondary" as const } };
      }
      if (block.kind === "brandButton" && block.look === "brand") {
        changed = true;
        fixes.push({
          path: `/sections/${index}/items/${block.id}`,
          what: "el formulario es la acción",
        });
        return { ...item, block: { ...block, look: "outline" as const } };
      }
      return item;
    });
    return { ...section, items };
  });
  return changed ? { ...design, sections } : design;
}

/** A profile whose content has no photo draws its initials: when the page
 * already shows the logo, the initials are a second face. */
function oneFace(
  design: PageDesign,
  context: LayoutContext,
  fixes: LayoutFix[],
): PageDesign {
  if (context.hasAvatar !== false || !context.logoRef) return design;
  const logoShown = design.sections.some((section) =>
    (isCanvasSection(section)
      ? section.items.map((item) => item.block)
      : section.columns.flat()
    ).some(
      (block) => block.kind === "image" && block.imageRef === context.logoRef,
    ),
  );
  if (!logoShown) return design;
  let changed = false;
  const drop = (block: DesignBlock): DesignBlock => {
    if (block.kind !== "profileHeader" || block.avatarShape === "none")
      return block;
    changed = true;
    fixes.push({
      path: `/blocks/${block.id}`,
      what: "sin iniciales junto al logo",
    });
    return { ...block, avatarShape: "none" };
  };
  const sections = design.sections.map((section): AnySection => {
    if (isCanvasSection(section))
      return {
        ...section,
        items: section.items.map((item) => ({
          ...item,
          block: drop(item.block),
        })),
      };
    return {
      ...section,
      columns: section.columns.map((column) => column.map(drop)),
    };
  });
  return changed ? { ...design, sections } : design;
}

/** A contour or soft button over a photo or a dark ground keeps its label
 * readable: solid accent (or white outline for a secondary one); a brand
 * button shows its brand colors. */
function buttonsThatRead(
  section: CanvasSection,
  design: PageDesign,
  fixes: LayoutFix[],
  path: string,
): CanvasSection {
  const canvasColor = canvasGround(section.background, design);
  const solid = design.style.buttonStyle === "solid";
  const accent = design.style.palette.accent;
  const onAccent =
    contrastRatio("#ffffff", accent) >= contrastRatio("#111111", accent)
      ? "#ffffff"
      : "#111111";
  const items = section.items.map((item) => {
    const block = item.block;
    if (item.hidden) return item;
    if (block.kind !== "button" && block.kind !== "brandButton") return item;
    const ground = groundUnder(item, section.items, canvasColor, design);
    const dark =
      ground === null || (ground !== undefined && luminance(ground) < 0.2);
    if (!dark) return item;
    if (block.kind === "brandButton") {
      if (block.look === "brand") return item;
      fixes.push({
        path: `${path}/items/${block.id}`,
        what: "botón que se lee sobre la foto",
      });
      return { ...item, block: { ...block, look: "brand" as const } };
    }
    if (block.style?.background || block.style?.color) return item;
    if (block.variant === "primary") {
      if (solid) return item;
      fixes.push({
        path: `${path}/items/${block.id}`,
        what: "botón que se lee sobre la foto",
      });
      return {
        ...item,
        block: {
          ...block,
          style: {
            ...block.style,
            background: accent,
            color: onAccent,
            borderColor: accent,
          },
        },
      };
    }
    fixes.push({
      path: `${path}/items/${block.id}`,
      what: "botón que se lee sobre la foto",
    });
    return {
      ...item,
      block: {
        ...block,
        style: { ...block.style, color: "#ffffff", borderColor: "#ffffff" },
      },
    };
  });
  return { ...section, items };
}

/**
 * Applies the layout review to a design that already passed `checkDesign`
 * (and keeps it valid: it only moves, resizes, recolors or removes what the
 * contract allows). Returns the design and what changed.
 */
export function reviewLayout(
  design: PageDesign,
  context: LayoutContext,
): { design: PageDesign; fixes: LayoutFix[] } {
  const fixes: LayoutFix[] = [];
  let next = design;
  if (context.photos === "without" && context.type !== "image")
    next = withoutPhotos(next, context, fixes);
  else if (context.photos === "with") next = withPhotos(next, fixes);
  next = dropRepeatedNames(next, context, fixes);
  next = formIsTheAction(next, context, fixes);
  next = oneFace(next, context, fixes);
  const sections = next.sections.map((section, index) => {
    if (!isCanvasSection(section)) return section;
    const path = `/sections/${index}`;
    let items = keepInside(section.items, fixes, path);
    items = snapLeftEdges(items, fixes, path);
    items = centerPhotosOnShapes(items, fixes, path);
    const readable = readableCanvas({ ...section, items }, next, fixes, path);
    return buttonsThatRead(readable, next, fixes, path);
  });
  next = { ...next, sections };
  // Texts that fit (and push down what they would cover), then trim.
  const fitted = fitCanvasText(next, context);
  if (fitted !== next)
    fixes.push({ path: "/sections", what: "texto que cabe" });
  const texts = { ...context, fonts: fitted.style.fonts };
  next = {
    ...fitted,
    sections: fitted.sections.map((section, index) =>
      isCanvasSection(section)
        ? trimTail(section, texts, fixes, `/sections/${index}`)
        : section,
    ),
  };
  return { design: next, fixes };
}
