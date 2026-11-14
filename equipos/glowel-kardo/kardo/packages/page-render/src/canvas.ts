import {
  CANVAS_MAX_SCALE,
  CANVAS_WIDTH,
  type CanvasItem,
  type CanvasSection,
  canvasReadingOrder,
  DESIGN_LIMITS,
} from "@kardo/contracts";
import { type FontUsage, renderBlock } from "./blocks.js";
import { backgroundDecl, clampInt } from "./css.js";
import { escapeHtml } from "./escape.js";
import type { DesignableContent, RenderContext } from "./types.js";

// ---------------------------------------------------------------------------
// Canvas sections ("lienzo libre", design schema 2). Blocks sit at x/y/w/h in
// design px of a CANVAS_WIDTH phone. No script runs on the public page, so
// the scaling is pure CSS: the frame is a size container and `--u` is one
// design px written in container units (`100cqw / CANVAS_WIDTH`). Every
// length inside a canvas (positions, font sizes, paddings, radii) is a
// multiple of `--u`, so the whole canvas scales as one piece on any screen
// and wraps its text exactly as it was designed.
// ---------------------------------------------------------------------------

/** A length in design px, as a multiple of the canvas unit. */
export function canvasPx(value: number): string {
  return value === 0 ? "0" : `calc(${value} * var(--u))`;
}

const maxFrameWidth = Math.round(CANVAS_WIDTH * CANVAS_MAX_SCALE);

/** Fixed structural CSS for canvases; only added when a page has one. */
export const canvasBaseCss = `
.kd-canvas{position:relative;display:flex;justify-content:center;width:100%}
.kd-canvas-frame{--u:calc(100cqw / ${CANVAS_WIDTH});container-type:inline-size;position:relative;width:min(100%, ${maxFrameWidth}px);overflow:hidden}
.kd-ci{position:absolute;display:flex;flex-direction:column;min-width:0;font-size:${canvasPx(16)}}
.kd-ci > *{width:100%}
.kd-ci--fill > *{height:100%}
.kd-ci--fill .kd-image-link{height:100%}
.kd-ci--fill .kd-image{height:100% !important;aspect-ratio:auto !important}
.kd-ci--fill .kd-image-main-img,.kd-ci--fill .kd-image-main-empty{height:100% !important;aspect-ratio:auto !important}
.kd-shape{width:100%;height:100%}
.kd-ci .kd-btn{padding:${canvasPx(14)} ${canvasPx(18)}}
.kd-ci .kd-content-title{gap:${canvasPx(8)}}
.kd-ci .kd-profile{gap:${canvasPx(16)}}
.kd-ci .kd-profile-text{gap:${canvasPx(4)}}
.kd-ci .kd-avatar{width:${canvasPx(96)};height:${canvasPx(96)}}
.kd-ci .kd-avatar--rounded{border-radius:${canvasPx(20)}}
.kd-ci .kd-avatar-initials{font-size:1.7em}
.kd-ci .kd-socials{gap:${canvasPx(10)}}
.kd-ci .kd-social{width:${canvasPx(40)};height:${canvasPx(40)}}
.kd-ci .kd-social svg{width:${canvasPx(18)};height:${canvasPx(18)}}
.kd-ci .kd-socials--small .kd-social{width:${canvasPx(32)};height:${canvasPx(32)}}
.kd-ci .kd-socials--small .kd-social svg{width:${canvasPx(14)};height:${canvasPx(14)}}
.kd-ci .kd-socials--large .kd-social{width:${canvasPx(48)};height:${canvasPx(48)}}
.kd-ci .kd-socials--large .kd-social svg{width:${canvasPx(22)};height:${canvasPx(22)}}
@media (max-width: 640px){
.kd-page .kd-canvas{margin-left:calc(var(--kd-pad, 16px) * -1);margin-right:calc(var(--kd-pad, 16px) * -1);width:auto}
}
`;

/** Radii that the page style writes in px, redone in canvas units. */
export function canvasStyleCss(radius: number, buttonRadius: number): string {
  return `
.kd-ci .kd-btn,.kd-ci .kd-link{border-radius:${buttonRadius >= 999 ? "999px" : canvasPx(buttonRadius)}}
.kd-ci .kd-figure img,.kd-ci .kd-image,.kd-ci .kd-image-empty{border-radius:${canvasPx(radius)}}
`;
}

/** Images, shapes and the bound `imageMain` block (Imagen's own picture, also
 * placeable on a canvas) take the item's height; everything else grows with
 * its content and treats `h` as a minimum. */
function fills(item: CanvasItem): boolean {
  return (
    item.block.kind === "image" ||
    item.block.kind === "shape" ||
    item.block.kind === "imageMain"
  );
}

function itemClass(sectionIndex: number, itemIndex: number): string {
  return `kd-cv-${sectionIndex}-${itemIndex}`;
}

/** Items actually drawn on the page, in reading order — `hidden` ones are
 * kept in the design but never rendered (addendum 3); `locked` only affects
 * the Estudio's own editing, never the public render. Both the CSS and the
 * markup (`renderCanvasSection`) filter with this exact function, so the two
 * stay index-aligned. */
function visibleItems(section: CanvasSection): CanvasItem[] {
  return canvasReadingOrder(section.items).filter((item) => !item.hidden);
}

export function canvasSectionCss(
  section: CanvasSection,
  index: number,
  ctx: RenderContext,
): string {
  const height = clampInt(section.height, 80, DESIGN_LIMITS.canvasHeight, 640);
  const background = backgroundDecl(
    section.background,
    ctx.resolveImage,
    "transparent",
  );
  const items = visibleItems(section)
    .map((item, itemIndex) => {
      const x = clampInt(item.x, -CANVAS_WIDTH, CANVAS_WIDTH, 0);
      const y = clampInt(item.y, -400, DESIGN_LIMITS.canvasHeight, 0);
      const w = clampInt(item.w, 8, CANVAS_WIDTH * 2, CANVAS_WIDTH);
      const decls = [
        `left:${canvasPx(x)}`,
        `top:${canvasPx(y)}`,
        `width:${canvasPx(w)}`,
      ];
      if (item.h !== undefined) {
        const h = clampInt(item.h, 8, DESIGN_LIMITS.canvasHeight, 8);
        decls.push(`${fills(item) ? "height" : "min-height"}:${canvasPx(h)}`);
      }
      if (item.z !== undefined)
        decls.push(`z-index:${clampInt(item.z, 0, 99, 0)}`);
      if (item.r !== undefined)
        decls.push(`transform:rotate(${clampInt(item.r, -180, 180, 0)}deg)`);
      return `.${itemClass(index, itemIndex)}{${decls.join(";")}}`;
    })
    .join("\n");
  return `
.kd-canvas-${index}{${background}}
.kd-canvas-${index} .kd-canvas-frame{aspect-ratio:${CANVAS_WIDTH} / ${height}}
${items}
`;
}

/** A canvas section. The DOM keeps the reading order (top to bottom, then
 * left to right) whatever is drawn on top; `data-item-id` marks each placed
 * box for the Estudio. */
export function renderCanvasSection(
  section: CanvasSection,
  index: number,
  content: DesignableContent,
  ctx: RenderContext,
  fonts: FontUsage,
): string {
  const canvasCtx: RenderContext = { ...ctx, px: canvasPx };
  const items = visibleItems(section)
    .map((item, itemIndex) => {
      const inner = renderBlock(item.block, content, canvasCtx, fonts);
      if (!inner) return "";
      const classes = `kd-ci ${itemClass(index, itemIndex)}${fills(item) ? " kd-ci--fill" : ""}`;
      return `<div class="${classes}" data-item-id="${escapeHtml(item.block.id)}">${inner}</div>`;
    })
    .join("");
  return `<section class="kd-sec kd-canvas kd-canvas-${index}" data-section-id="${escapeHtml(section.id)}"><div class="kd-canvas-frame">${items}</div></section>`;
}
