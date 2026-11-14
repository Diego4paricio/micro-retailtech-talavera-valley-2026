import type { DesignBlock, ImageMask, PageDesign } from "@kardo/contracts";
import { blockStyleAttr } from "../block-style.js";
import { pick } from "../css.js";
import { escapeHtml } from "../escape.js";
import type { DesignableContent, RenderContext } from "../types.js";
import { dataId, pageRadius, pageShadow } from "./shared.js";

// ---------------------------------------------------------------------------
// Imagen bound block (`imageMain`, ADR 018 addendum 3): the Experience's own
// main image. It is the only bound block an `image` Experience may place
// (no `contentTitle`: the whole Experience is the image).
// ---------------------------------------------------------------------------

type ImageMainBlock = Extract<DesignBlock, { kind: "imageMain" }>;

const fits = { contain: "contain", cover: "cover" } as const;
const frames = { none: "none", card: "card", shadow: "shadow" } as const;
const aspects = {
  auto: "auto",
  "1:1": "1 / 1",
  "4:3": "4 / 3",
  "3:4": "3 / 4",
  "16:9": "16 / 9",
  "9:16": "9 / 16",
} as const;

/** The mask CSS class (`kd-mask--{mask}`; the mask's own CSS is defined
 * elsewhere in this package) through a closed lookup — never a raw template
 * on `block.mask`, since the panel's live preview renders an unvalidated
 * draft design (see url-safety.ts's header on this package's own paranoia). */
const maskSuffixes: Record<Exclude<ImageMask, "none">, string> = {
  circle: "circle",
  rounded: "rounded",
  arch: "arch",
  blob: "blob",
  diamond: "diamond",
  hexagon: "hexagon",
  star: "star",
};

function maskClass(mask: ImageMask | undefined): string {
  if (!mask || mask === "none") return "";
  return Object.hasOwn(maskSuffixes, mask)
    ? ` kd-mask--${maskSuffixes[mask as Exclude<ImageMask, "none">]}`
    : "";
}

export function renderImageMainBlock(
  block: ImageMainBlock,
  content: DesignableContent,
  ctx: RenderContext,
): string {
  if (content.type !== "image") return "";
  const frame = pick(block.frame, frames, frames.none);
  const fit = pick(block.fit, fits, fits.cover);
  const aspect = pick(block.aspect, aspects, aspects.auto);
  const mask = maskClass(block.mask);
  const src = ctx.resolveImage(content.imageRef);
  const mediaStyle = ` style="aspect-ratio:${aspect};object-fit:${fit}"`;
  const media = src
    ? `<img class="kd-image-main-img${mask}" src="${escapeHtml(src)}" alt="${escapeHtml(content.alt)}" loading="lazy"${mediaStyle}>`
    : `<div class="kd-image-main-empty${mask}" aria-hidden="true"${mediaStyle}></div>`;
  return `<figure${dataId(block.id)} class="kd-image-main kd-image-main--frame-${frame}"${blockStyleAttr(block.style, ctx.px)}>${media}</figure>`;
}

export function imageMainCss(design: PageDesign): string {
  const radius = pageRadius(design);
  const shadow = pageShadow(design);
  return `
.kd-image-main{margin:0;width:100%;display:block}
.kd-image-main-img,.kd-image-main-empty{width:100%;display:block;background:var(--kd-surface);border-radius:${radius}px}
.kd-image-main--frame-card{background:var(--kd-surface);padding:12px;border-radius:${radius}px}
.kd-image-main--frame-card .kd-image-main-img,.kd-image-main--frame-card .kd-image-main-empty{border-radius:${Math.max(radius - 6, 0)}px}
.kd-image-main--frame-shadow .kd-image-main-img,.kd-image-main--frame-shadow .kd-image-main-empty{box-shadow:${shadow}}
`;
}
