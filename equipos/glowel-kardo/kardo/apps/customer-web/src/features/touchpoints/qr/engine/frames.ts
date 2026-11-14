import type {
  QrFrame,
  QrFrameFont,
  QrFrameIcon,
  QrFrameStyle,
} from "@kardo/contracts";
import { iconPath } from "./icons.js";
import { KARDO_MARK_ASPECT } from "./kardo-mark.js";
import {
  circlePath,
  rectPath,
  roundedRectPath,
  transformPath,
} from "./shapes.js";
import { estimateTextWidth, fitFontSize } from "./text-metrics.js";
import type { PathCommand, Rect, SceneNode } from "./types.js";

/**
 * Frame chrome: everything around the symbol (card/bezel/tail/notches, CTA
 * icon + text, and the Kardo-mark slot). Coordinates are module units,
 * relative to the frame's own `(0, 0)` — `build.ts` places the finished
 * `Scene` inside the quiet-zone-inclusive symbol block at `symbolBlockX/Y`.
 *
 * Every returned node uses role `"frame"` (chrome, painted *before* the
 * symbol's own background so that background rect shows through as the
 * "window") or `"cta"`/`"icon"` (painted *after* the symbol).
 */
export type FrameBuild = {
  width: number;
  height: number;
  symbolBlockX: number;
  symbolBlockY: number;
  nodes: SceneNode[];
  markSlot: Rect;
  /** The mark sits on the page (not on the frame's card or band). */
  markOnPage: boolean;
};

const CARD_PAD = 2.6;
const BAND_HEIGHT = 7.6;
const STRIP_HEIGHT = 5.6;
const CORNER_RADIUS = 3.2;
const MARK_HEIGHT = 3.2;
const MARK_MARGIN_X = 1.8;
const ICON_SIZE = 3;
const ICON_GAP = 0.9;
const TEXT_RANGE = { min: 1.3, max: 2.7 };
const MARK_WIDTH = MARK_HEIGHT * KARDO_MARK_ASPECT;

// `QrDesign`'s closed-choice fields (font, icon, style, module/eye shapes…)
// are typed `string` instead of their literal union — a bug in the shared,
// read-only `packages/contracts/src/qr.ts` `closedChoice` helper (reported
// upstream, not fixed here). `normalizeQrDesign` guarantees the runtime
// value is always one of the listed literals, so these casts just restore
// the type the rest of the engine already relies on.
const asFont = (value: string): QrFrameFont => value as QrFrameFont;
const asIcon = (value: string): QrFrameIcon => value as QrFrameIcon;

/**
 * A rectangular hole matching the quiet-zone-inclusive symbol block. Card
 * chrome always punches this out (evenodd) rather than relying on paint
 * order, so the quiet zone stays empty even with a transparent background.
 */
function qrUnitsHole(
  symbolBlockX: number,
  symbolBlockY: number,
  qrUnits: number,
): PathCommand[] {
  return rectPath(symbolBlockX, symbolBlockY, qrUnits, qrUnits);
}

function solidPath(
  d: readonly PathCommand[],
  color: string,
  fillRule: "nonzero" | "evenodd" = "nonzero",
): SceneNode {
  return {
    type: "path",
    role: "frame",
    d,
    fill: { kind: "solid", color },
    fillRule,
  };
}

/** Icon + text, horizontally centred at `centerX`, vertically at `centerY`. */
function ctaRow(
  frame: QrFrame,
  text: string,
  centerX: number,
  centerY: number,
  maxWidth: number,
): SceneNode[] {
  if (!text) return [];
  const hasIcon = frame.icon !== "none";
  const textMaxWidth = Math.max(
    4,
    hasIcon ? maxWidth - ICON_SIZE - ICON_GAP : maxWidth,
  );
  const fontSize = fitFontSize(
    text,
    asFont(frame.font),
    textMaxWidth,
    TEXT_RANGE,
  );
  const textWidth = Math.min(
    textMaxWidth,
    estimateTextWidth(text, asFont(frame.font), fontSize),
  );
  const totalWidth = textWidth + (hasIcon ? ICON_SIZE + ICON_GAP : 0);
  const startX = centerX - totalWidth / 2;
  const nodes: SceneNode[] = [];

  if (hasIcon) {
    const icon = iconPath(asIcon(frame.icon));
    const scale = ICON_SIZE / 24;
    nodes.push({
      type: "path",
      role: "icon",
      d: transformPath(icon.d, startX, centerY - ICON_SIZE / 2, scale),
      fill: { kind: "solid", color: frame.textColor },
      fillRule: icon.fillRule,
    });
  }

  nodes.push({
    type: "text",
    role: "cta",
    x: startX + (hasIcon ? ICON_SIZE + ICON_GAP : 0) + textWidth / 2,
    y: centerY,
    text,
    font: asFont(frame.font),
    weight: 700,
    size: fontSize,
    color: frame.textColor,
    letterSpacing: frame.uppercase ? fontSize * 0.03 : 0,
    maxWidth: textMaxWidth,
  });
  return nodes;
}

function markSlotAt(width: number, bandCenterY: number): Rect {
  return {
    x: width - MARK_WIDTH - MARK_MARGIN_X,
    y: bandCenterY - MARK_HEIGHT / 2,
    width: MARK_WIDTH,
    height: MARK_HEIGHT,
  };
}

/** Corner "viewfinder" brackets just outside `(x, y, size, size)`. */
function bracketMarks(
  color: string,
  x: number,
  y: number,
  size: number,
): SceneNode {
  const gap = 0.5;
  const arm = 2.1;
  const thickness = 0.5;
  const corners: (readonly [number, number, 1 | -1, 1 | -1])[] = [
    [x - gap, y - gap, -1, -1],
    [x + size + gap, y - gap, 1, -1],
    [x + size + gap, y + size + gap, 1, 1],
    [x - gap, y + size + gap, -1, 1],
  ];
  const commands: PathCommand[] = [];
  for (const [cx, cy, sx, sy] of corners) {
    commands.push(...rectPath(cx, cy, arm * sx, thickness * sy));
    commands.push(...rectPath(cx, cy, thickness * sx, arm * sy));
  }
  return solidPath(commands, color);
}

/** Styles with no card: text (if any) + the mark share one bottom strip. */
function bareStrip(
  style: QrFrameStyle,
  qrUnits: number,
  frame: QrFrame,
  text: string,
  pageInk: string,
): FrameBuild {
  const hasBrackets = style === "brackets";
  const pad = hasBrackets ? 3 : 0;
  const width = qrUnits + pad * 2;
  const height = pad + qrUnits + STRIP_HEIGHT;
  const symbolBlockX = pad;
  const symbolBlockY = pad;
  const nodes: SceneNode[] = [];
  if (hasBrackets)
    nodes.push(bracketMarks(frame.color, symbolBlockX, symbolBlockY, qrUnits));

  const bandCenterY = symbolBlockY + qrUnits + STRIP_HEIGHT / 2;
  const slot = markSlotAt(width, bandCenterY);
  const showText = style !== "none" && text.length > 0;
  if (showText) {
    const textRight = slot.x - 1.2;
    nodes.push(
      ...ctaRow(
        { ...frame, textColor: pageInk },
        text,
        textRight / 2,
        bandCenterY,
        Math.max(4, textRight - 1),
      ),
    );
  }
  return {
    width,
    height,
    symbolBlockX,
    symbolBlockY,
    nodes,
    markSlot: slot,
    markOnPage: true,
  };
}

/** Rounded card with a text band above or below the symbol window. */
function panel(
  position: "top" | "bottom",
  qrUnits: number,
  frame: QrFrame,
  text: string,
): FrameBuild {
  const width = qrUnits + CARD_PAD * 2;
  const height = CARD_PAD + qrUnits + BAND_HEIGHT;
  const symbolBlockX = CARD_PAD;
  const symbolBlockY = position === "bottom" ? CARD_PAD : BAND_HEIGHT;
  const card = roundedRectPath(0, 0, width, height, {
    tl: CORNER_RADIUS,
    tr: CORNER_RADIUS,
    br: CORNER_RADIUS,
    bl: CORNER_RADIUS,
  });
  const hole = qrUnitsHole(symbolBlockX, symbolBlockY, qrUnits);
  const nodes: SceneNode[] = [
    solidPath([...card, ...hole], frame.color, "evenodd"),
  ];

  const bandCenterY =
    position === "bottom"
      ? symbolBlockY + qrUnits + BAND_HEIGHT / 2
      : BAND_HEIGHT / 2;
  const slot = markSlotAt(width, bandCenterY);
  if (text) {
    const textLeft = CARD_PAD * 0.6;
    const textRight = slot.x - CARD_PAD * 0.4;
    const textCenter = (textLeft + textRight) / 2;
    nodes.push(
      ...ctaRow(
        frame,
        text,
        textCenter,
        bandCenterY,
        Math.max(4, textRight - textLeft),
      ),
    );
  }
  return {
    width,
    height,
    symbolBlockX,
    symbolBlockY,
    nodes,
    markSlot: slot,
    markOnPage: false,
  };
}

/** Thick rounded border with a CTA pill straddling the bottom edge. */
function badge(qrUnits: number, frame: QrFrame, text: string): FrameBuild {
  const borderThickness = 1.3;
  // The CTA pill (height `borderThickness + 3`) straddles the bottom border,
  // centred on it — `pad` must clear half that pill height plus half the
  // border, or its top edge pokes past `symbolBlockY + qrUnits` and into the
  // quiet zone.
  const pad = borderThickness + 1.6;
  const markStripHeight = MARK_HEIGHT + 1.4;
  const cardSide = qrUnits + pad * 2;
  const width = cardSide;
  const height = cardSide + markStripHeight;
  const symbolBlockX = pad;
  const symbolBlockY = pad;

  const outer = roundedRectPath(0, 0, cardSide, cardSide, {
    tl: CORNER_RADIUS,
    tr: CORNER_RADIUS,
    br: CORNER_RADIUS,
    bl: CORNER_RADIUS,
  });
  const inner = roundedRectPath(
    borderThickness,
    borderThickness,
    cardSide - borderThickness * 2,
    cardSide - borderThickness * 2,
    {
      tl: CORNER_RADIUS - borderThickness,
      tr: CORNER_RADIUS - borderThickness,
      br: CORNER_RADIUS - borderThickness,
      bl: CORNER_RADIUS - borderThickness,
    },
  );
  const nodes: SceneNode[] = [
    solidPath([...outer, ...inner], frame.color, "evenodd"),
  ];

  if (text) {
    const pillHeight = borderThickness + 3;
    const pillCenterY = cardSide - borderThickness / 2;
    const hasIcon = frame.icon !== "none";
    const fontSize = fitFontSize(
      text,
      asFont(frame.font),
      cardSide * 0.7,
      TEXT_RANGE,
    );
    const textWidth = estimateTextWidth(text, asFont(frame.font), fontSize);
    const contentWidth = textWidth + (hasIcon ? ICON_SIZE + ICON_GAP : 0);
    const pillWidth = Math.min(cardSide - 3, contentWidth + 3.2);
    const pillX = (cardSide - pillWidth) / 2;
    const pill = roundedRectPath(
      pillX,
      pillCenterY - pillHeight / 2,
      pillWidth,
      pillHeight,
      {
        tl: pillHeight / 2,
        tr: pillHeight / 2,
        br: pillHeight / 2,
        bl: pillHeight / 2,
      },
    );
    nodes.push(solidPath(pill, frame.color));
    nodes.push(
      ...ctaRow(frame, text, cardSide / 2, pillCenterY, pillWidth - 2.4),
    );
  }

  const bandCenterY = cardSide + markStripHeight / 2;
  const slot = markSlotAt(width, bandCenterY);
  return {
    width,
    height,
    symbolBlockX,
    symbolBlockY,
    nodes,
    markSlot: slot,
    markOnPage: true,
  };
}

/** A speech-bubble card with a small tail, CTA text inside the lower band. */
function bubble(qrUnits: number, frame: QrFrame, text: string): FrameBuild {
  const tailHeight = 1.8;
  const tailWidth = 3;
  const width = qrUnits + CARD_PAD * 2;
  const bodyHeight = CARD_PAD + qrUnits + BAND_HEIGHT;
  const height = bodyHeight + tailHeight;
  const symbolBlockX = CARD_PAD;
  const symbolBlockY = CARD_PAD;
  const radius = CORNER_RADIUS + 0.8;
  const body = roundedRectPath(0, 0, width, bodyHeight, {
    tl: radius,
    tr: radius,
    br: radius,
    bl: radius,
  });
  const tailX = width * 0.28;
  const tail: PathCommand[] = [
    ["M", tailX, bodyHeight],
    ["L", tailX + tailWidth, bodyHeight],
    ["L", tailX + tailWidth * 0.3, bodyHeight + tailHeight],
    ["Z"],
  ];
  const hole = qrUnitsHole(symbolBlockX, symbolBlockY, qrUnits);
  // The tail is a separate, non-overlapping subpath, so adding the evenodd
  // hole here does not affect it.
  const nodes: SceneNode[] = [
    solidPath([...body, ...hole, ...tail], frame.color, "evenodd"),
  ];

  const bandCenterY = symbolBlockY + qrUnits + BAND_HEIGHT / 2;
  const slot = markSlotAt(width, bandCenterY);
  if (text) {
    const textLeft = CARD_PAD * 0.6;
    const textRight = slot.x - CARD_PAD * 0.4;
    nodes.push(
      ...ctaRow(
        frame,
        text,
        (textLeft + textRight) / 2,
        bandCenterY,
        Math.max(4, textRight - textLeft),
      ),
    );
  }
  return {
    width,
    height,
    symbolBlockX,
    symbolBlockY,
    nodes,
    markSlot: slot,
    markOnPage: false,
  };
}

/** Card with side notches and a dashed divider before the CTA band, ticket-style. */
function ticket(qrUnits: number, frame: QrFrame, text: string): FrameBuild {
  const width = qrUnits + CARD_PAD * 2;
  const height = CARD_PAD + qrUnits + BAND_HEIGHT;
  const symbolBlockX = CARD_PAD;
  const symbolBlockY = CARD_PAD;
  const dividerY = symbolBlockY + qrUnits + 1.1;
  const notchRadius = 1.4;

  const card = roundedRectPath(0, 0, width, height, {
    tl: CORNER_RADIUS,
    tr: CORNER_RADIUS,
    br: CORNER_RADIUS,
    bl: CORNER_RADIUS,
  });
  const leftNotch = circlePath(0, dividerY, notchRadius);
  const rightNotch = circlePath(width, dividerY, notchRadius);
  const hole = qrUnitsHole(symbolBlockX, symbolBlockY, qrUnits);
  const nodes: SceneNode[] = [
    solidPath(
      [...card, ...leftNotch, ...rightNotch, ...hole],
      frame.color,
      "evenodd",
    ),
  ];

  const dashWidth = 1.2;
  const dashGap = 1;
  const dashThickness = 0.28;
  const dashes: PathCommand[] = [];
  for (
    let x = CARD_PAD * 1.4;
    x < width - CARD_PAD * 1.4;
    x += dashWidth + dashGap
  ) {
    dashes.push(
      ...rectPath(
        x,
        dividerY - dashThickness / 2,
        Math.min(dashWidth, width - CARD_PAD * 1.4 - x),
        dashThickness,
      ),
    );
  }
  nodes.push(solidPath(dashes, frame.textColor));

  const bandCenterY = dividerY + (height - dividerY) / 2;
  const slot = markSlotAt(width, bandCenterY);
  if (text) {
    const textLeft = CARD_PAD * 0.6;
    const textRight = slot.x - CARD_PAD * 0.4;
    nodes.push(
      ...ctaRow(
        frame,
        text,
        (textLeft + textRight) / 2,
        bandCenterY,
        Math.max(4, textRight - textLeft),
      ),
    );
  }
  return {
    width,
    height,
    symbolBlockX,
    symbolBlockY,
    nodes,
    markSlot: slot,
    markOnPage: false,
  };
}

/** A phone silhouette around the code, CTA text in a strip below it. */
function phone(
  qrUnits: number,
  frame: QrFrame,
  text: string,
  pageInk: string,
): FrameBuild {
  const bezelTop = 3.6;
  const bezelSide = 2.2;
  const bezelBottom = 2.6;
  const bodyWidth = qrUnits + bezelSide * 2;
  const bodyHeight = bezelTop + qrUnits + bezelBottom;
  const width = bodyWidth;
  const height = bodyHeight + STRIP_HEIGHT;
  const symbolBlockX = bezelSide;
  const symbolBlockY = bezelTop;

  const body = roundedRectPath(0, 0, bodyWidth, bodyHeight, {
    tl: CORNER_RADIUS + 1,
    tr: CORNER_RADIUS + 1,
    br: CORNER_RADIUS + 1,
    bl: CORNER_RADIUS + 1,
  });
  const speaker = roundedRectPath(bodyWidth / 2 - 3, bezelTop * 0.35, 6, 0.7, {
    tl: 0.35,
    tr: 0.35,
    br: 0.35,
    bl: 0.35,
  });
  const homeButton = circlePath(
    bodyWidth / 2,
    bodyHeight - bezelBottom * 0.45,
    0.8,
  );
  const hole = qrUnitsHole(symbolBlockX, symbolBlockY, qrUnits);
  const nodes: SceneNode[] = [
    solidPath(
      [...body, ...speaker, ...homeButton, ...hole],
      frame.color,
      "evenodd",
    ),
  ];

  const bandCenterY = bodyHeight + STRIP_HEIGHT / 2;
  const slot = markSlotAt(width, bandCenterY);
  if (text) {
    const textRight = slot.x - 1.2;
    nodes.push(
      ...ctaRow(
        { ...frame, textColor: pageInk },
        text,
        textRight / 2,
        bandCenterY,
        Math.max(4, textRight - 1),
      ),
    );
  }
  return {
    width,
    height,
    symbolBlockX,
    symbolBlockY,
    nodes,
    markSlot: slot,
    markOnPage: true,
  };
}

/** Builds the frame chrome for `style` around a `qrUnits`-wide symbol block. */
/**
 * `pageInk` colours what sits on the page itself (caption text, the phone's
 * strip): the frame's text colour is chosen for its card, not for the paper.
 */
export function buildFrame(
  style: QrFrameStyle,
  frame: QrFrame,
  qrUnits: number,
  resolvedText: string,
  pageInk: string,
): FrameBuild {
  switch (style) {
    case "panel-bottom":
      return panel("bottom", qrUnits, frame, resolvedText);
    case "panel-top":
      return panel("top", qrUnits, frame, resolvedText);
    case "badge":
      return badge(qrUnits, frame, resolvedText);
    case "bubble":
      return bubble(qrUnits, frame, resolvedText);
    case "ticket":
      return ticket(qrUnits, frame, resolvedText);
    case "phone":
      return phone(qrUnits, frame, resolvedText, pageInk);
    case "brackets":
      return bareStrip("brackets", qrUnits, frame, resolvedText, pageInk);
    case "caption":
      return bareStrip("caption", qrUnits, frame, resolvedText, pageInk);
    default:
      return bareStrip("none", qrUnits, frame, resolvedText, pageInk);
  }
}
