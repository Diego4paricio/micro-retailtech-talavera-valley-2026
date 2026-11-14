import {
  CANVAS_WIDTH,
  type CanvasItem,
  DESIGN_LIMITS,
  type DesignBlock,
  type DesignFont,
  isCanvasSection,
  type PageDesign,
} from "@kardo/contracts";

// ---------------------------------------------------------------------------
// Text that fits on a canvas (2026-10-03). On a canvas the AI places every
// block at a fixed `y`, and it tends to assume one line per title: a long
// title in a big display font wraps to two lines and lands on the sentence
// below it, and a long button label breaks in two inside a narrow button
// (the test bench saw both). This estimates each text's real height with
// conservative metrics and, deterministically, without another turn:
// widens a button whose label fits on one line within the canvas, and
// moves down whatever text starts inside the text above it (with the rest
// of the canvas below it), growing the canvas when needed.
// ---------------------------------------------------------------------------

/** Average glyph width in em, on the wide side so a fit is never too
 * tight (most text faces sit between 0.48 and 0.56). */
const CHAR_EM = 0.56;

/** Average glyph width per font, in em, for Spanish text at weight 400
 * (relevo 29: one average for every face let a wide Lora or Poppins title
 * land on the sentence below it). Bold adds 6% and everything carries a 4%
 * margin, so a fit stays on the safe side. */
const fontEm: Partial<Record<DesignFont, number>> = {
  system: 0.52,
  serif: 0.5,
  rounded: 0.55,
  mono: 0.6,
  geist: 0.52,
  "dm-sans": 0.52,
  poppins: 0.58,
  playfair: 0.51,
  lora: 0.53,
  "space-grotesk": 0.55,
  cormorant: 0.44,
  "dm-serif": 0.5,
  outfit: 0.5,
  manrope: 0.54,
  montserrat: 0.58,
  bricolage: 0.53,
  bebas: 0.38,
  oswald: 0.43,
  caveat: 0.41,
};
const BODY_SIZE = 16;
const HEADING_SIZE: Record<1 | 2 | 3, number> = { 1: 32, 2: 24, 3: 19 };
/** `.kd-btn`: 14 px top and bottom, 18 px sides, 2 px border. */
const BUTTON_PAD_Y = 32;
const BUTTON_PAD_X = 40;
/** Room for a brand button's logo. */
const BRAND_ICON = 30;
/** Space kept between a text and what follows it. */
const GAP = 8;
/** Canvas margin a widened button keeps from the right edge. */
const EDGE = 16;

type TextLike = Extract<
  DesignBlock,
  { kind: "heading" | "text" | "button" | "brandButton" | "contentTitle" }
>;

/** What the bound blocks on a canvas draw from the content (relevo 29):
 * `contentTitle` shows the page's real title, and its description under
 * it, which the design itself does not carry. */
export type CanvasTexts = {
  title?: string | undefined;
  titleDescription?: string | undefined;
  /** The page's fonts (`style.fonts`): a block's own `style.font` wins. */
  fonts?: { heading: DesignFont; body: DesignFont } | undefined;
};

/** Smallest size a title is shrunk to so its longest word fits. */
const MIN_TITLE_SIZE = 24;

function isTextLike(
  block: DesignBlock,
  texts: CanvasTexts = {},
): block is TextLike {
  return (
    block.kind === "heading" ||
    block.kind === "text" ||
    block.kind === "button" ||
    block.kind === "brandButton" ||
    (block.kind === "contentTitle" && Boolean(texts.title))
  );
}

function isTitle(block: TextLike): boolean {
  return block.kind === "heading" || block.kind === "contentTitle";
}

function fontSizeOf(block: TextLike): number {
  if (block.style?.fontSize) return block.style.fontSize;
  if (block.kind === "contentTitle") return HEADING_SIZE[1];
  return block.kind === "heading" ? HEADING_SIZE[block.level] : BODY_SIZE;
}

function lineHeightOf(block: TextLike): number {
  if (block.style?.lineHeight) return block.style.lineHeight / 10;
  if (isTitle(block)) return 1.15;
  if (block.kind === "text") return 1.5;
  return 1.2;
}

/** The block's glyph width in em: its font (its own, or the page's
 * heading or body font), its weight and a safety margin. */
function charEm(block: TextLike, texts: CanvasTexts = {}): number {
  const font =
    block.style?.font ??
    (isTitle(block) ? texts.fonts?.heading : texts.fonts?.body);
  const base = (font ? fontEm[font] : undefined) ?? CHAR_EM;
  // Titles draw at 700 and buttons at 600 unless their style says otherwise.
  const weight =
    block.style?.fontWeight ??
    (isTitle(block)
      ? 700
      : block.kind === "button" || block.kind === "brandButton"
        ? 600
        : 400);
  return base * (weight >= 600 ? 1.06 : 1) * 1.04;
}

function charWidth(
  block: TextLike,
  size: number,
  texts: CanvasTexts = {},
): number {
  const spacing = (block.style?.letterSpacing ?? 0) / 100;
  return size * (charEm(block, texts) + spacing);
}

/** Lines a text takes in `width` px, wrapping at spaces (and at its own
 * line breaks: text blocks keep them). */
export function estimateLines(
  text: string,
  width: number,
  perChar: number,
): number {
  const room = Math.max(perChar, width);
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    let line = 0;
    let count = 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const size = word.length * perChar;
      const next = line === 0 ? size : line + perChar + size;
      if (next > room && line > 0) {
        count += 1 + Math.floor(size / room);
        line = size % room;
      } else line = next;
    }
    lines += count;
  }
  return Math.max(1, lines);
}

function textOf(block: TextLike, texts: CanvasTexts = {}): string {
  if (block.kind === "heading") return block.text;
  if (block.kind === "contentTitle") return texts.title ?? "";
  if (block.kind === "text") return block.runs.map((run) => run.text).join("");
  return block.label;
}

/** Inner width of a button for its label (one line), in px. */
function buttonLabelRoom(block: TextLike, w: number): number {
  return w - BUTTON_PAD_X - (block.kind === "brandButton" ? BRAND_ICON : 0);
}

/** The block's estimated height when placed `w` px wide. */
export function estimateHeight(
  block: TextLike,
  w: number,
  texts: CanvasTexts = {},
): number {
  const size = fontSizeOf(block);
  const perChar = charWidth(block, size, texts);
  const paddingX = (block.style?.paddingX ?? 0) * 2;
  const paddingY = (block.style?.paddingY ?? 0) * 2;
  const isButton = block.kind === "button" || block.kind === "brandButton";
  const room = isButton ? buttonLabelRoom(block, w) : w - paddingX;
  const lines = estimateLines(textOf(block, texts), room, perChar);
  const text = lines * size * lineHeightOf(block);
  // `contentTitle` also draws the page's description under the title, at
  // body size, 8 px below it.
  const description =
    block.kind === "contentTitle" && texts.titleDescription
      ? GAP +
        estimateLines(texts.titleDescription, room, BODY_SIZE * CHAR_EM) *
          BODY_SIZE *
          1.5
      : 0;
  return Math.ceil(text + description + (isButton ? BUTTON_PAD_Y : paddingY));
}

/**
 * A title whose longest word does not fit its box at its size runs off the
 * canvas (a word never wraps): the title shrinks until that word fits,
 * down to `MIN_TITLE_SIZE` (2026-10-03, the bench's "Veterinaria" at 88 px
 * on a phone).
 */
function shrinkLongWord(item: CanvasItem, texts: CanvasTexts): CanvasItem {
  const block = item.block;
  if (!isTextLike(block, texts) || !isTitle(block)) return item;
  const size = fontSizeOf(block);
  const room = item.w - (block.style?.paddingX ?? 0) * 2;
  const longest = Math.max(
    0,
    ...textOf(block, texts)
      .split(/\s+/)
      .map((word) => word.length),
  );
  if (longest === 0) return item;
  const spacing = (block.style?.letterSpacing ?? 0) / 100;
  const fits = Math.floor(room / (longest * (charEm(block, texts) + spacing)));
  if (fits >= size) return item;
  const fontSize = Math.max(MIN_TITLE_SIZE, Math.min(size, fits));
  if (fontSize === size) return item;
  return {
    ...item,
    block: { ...block, style: { ...block.style, fontSize } } as DesignBlock,
  };
}

/** A button wide enough for its label on one line, within the canvas. */
function widenButton(item: CanvasItem, texts: CanvasTexts): CanvasItem {
  const block = item.block;
  if (block.kind !== "button" && block.kind !== "brandButton") return item;
  const needed = Math.ceil(
    textOf(block).length * charWidth(block, fontSizeOf(block), texts) +
      BUTTON_PAD_X +
      (block.kind === "brandButton" ? BRAND_ICON : 0),
  );
  const max = CANVAS_WIDTH - EDGE - Math.max(0, item.x);
  if (needed <= item.w || item.w >= max) return item;
  return { ...item, w: Math.min(needed, max) };
}

const overlapsX = (a: CanvasItem, b: CanvasItem) =>
  b.x < a.x + a.w && b.x + b.w > a.x;

/** Every canvas of the design with its texts fitted (a new object only
 * when something moved). `texts` are what the bound blocks draw. */
export function fitCanvasText(
  design: PageDesign,
  textsIn: CanvasTexts = {},
): PageDesign {
  const texts: CanvasTexts = { fonts: design.style.fonts, ...textsIn };
  let changed = false;
  const sections = design.sections.map((section) => {
    if (!isCanvasSection(section)) return section;
    let items = section.items.map((item) => {
      const next = shrinkLongWord(widenButton(item, texts), texts);
      if (next !== item) changed = true;
      return next;
    });
    let height = section.height;
    // Top to bottom: each text pushes down the texts that start inside it.
    const order = [...items.keys()].sort(
      (a, b) => (items[a]?.y ?? 0) - (items[b]?.y ?? 0),
    );
    for (const index of order) {
      const above = items[index];
      if (!above || above.hidden || !isTextLike(above.block, texts)) continue;
      const bottom =
        above.y + estimateHeight(above.block, above.w, texts) + GAP;
      const intruder = items.find(
        (item) =>
          item !== above &&
          !item.hidden &&
          isTextLike(item.block, texts) &&
          item.y > above.y &&
          item.y < bottom &&
          overlapsX(above, item),
      );
      if (!intruder) continue;
      const shift = bottom - intruder.y;
      const from = intruder.y;
      items = items.map((item) =>
        item.y >= from && item !== above
          ? { ...item, y: item.y + shift }
          : item,
      );
      changed = true;
    }
    // Only texts grow the canvas: an image or a shape may bleed past the
    // edge on purpose.
    const lowest = Math.max(
      0,
      ...items.map((item) =>
        isTextLike(item.block, texts) && !item.hidden
          ? item.y + estimateHeight(item.block, item.w, texts)
          : 0,
      ),
    );
    if (lowest + EDGE > height) {
      height = Math.min(DESIGN_LIMITS.canvasHeight, lowest + EDGE * 2);
      changed = true;
    }
    return { ...section, items, height };
  });
  return changed ? { ...design, sections } : design;
}
