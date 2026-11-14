import {
  type DesignBlock,
  designBlocks,
  type PageDesign,
} from "@kardo/contracts";
import { blockStyleAttr } from "./block-style.js";
import { pageRadius, pageShadow } from "./bound/shared.js";
import { clampInt, pick } from "./css.js";
import { escapeHtml } from "./escape.js";
import { featureIconSvg } from "./feature-icons.js";
import { placeholderClass, placeholderInnerHtml } from "./placeholder.js";
import type { RenderContext } from "./types.js";

// ---------------------------------------------------------------------------
// `features` ("Datos clave") and `gallery` ("Galería"): the two new free
// blocks of the "motor de 3 bloques" (2026-10-03). Both render with no
// script, only the page's own `--kd-*` theme variables, mirroring the look
// of the bound Menú/Catálogo blocks (`bound/menu.ts`, `bound/catalog.ts`) so
// a designed page feels like one system. The third new block, `featuredItems`
// (bound to a Menú/Catálogo's real items), lives in `bound/featured.ts`.
// ---------------------------------------------------------------------------

function dataId(id: string): string {
  return ` data-block-id="${escapeHtml(id)}"`;
}

// ---------------------------------------------------------------------------
// features
// ---------------------------------------------------------------------------

type FeaturesBlock = Extract<DesignBlock, { kind: "features" }>;

const featuresLayouts = {
  grid: "grid",
  list: "list",
  row: "row",
  chips: "chips",
} as const;
const featureIconStyles = {
  plain: "plain",
  circle: "circle",
  square: "square",
} as const;

/** `row` and `chips` are compact strips: icon plus title only, never the
 * note (see design.ts's doc comment on `features.layout`). */
function showsFeatureText(layout: FeaturesBlock["layout"]): boolean {
  return layout === "grid" || layout === "list";
}

export function renderFeaturesBlock(
  block: FeaturesBlock,
  ctx: RenderContext,
): string {
  const layout = pick(block.layout, featuresLayouts, featuresLayouts.list);
  const iconStyle = pick(
    block.iconStyle,
    featureIconStyles,
    featureIconStyles.circle,
  );
  const withText = showsFeatureText(layout);
  const itemsHtml = block.items
    .map((item) => {
      const icon = `<span class="kd-feature-icon kd-feature-icon--${iconStyle}">${featureIconSvg(item.icon)}</span>`;
      const title = `<span class="kd-feature-title">${escapeHtml(item.title)}</span>`;
      const note =
        withText && item.text
          ? `<span class="kd-feature-note">${escapeHtml(item.text)}</span>`
          : "";
      const text = withText
        ? `<span class="kd-feature-text">${title}${note}</span>`
        : title;
      return `<li class="kd-feature-item">${icon}${text}</li>`;
    })
    .join("");
  const gridVars =
    layout === "grid"
      ? ` style="--kd-features-cols:${clampInt(block.columns, 2, 3, 2)}"`
      : "";
  return `<div${dataId(block.id)} class="kd-features kd-features--${layout}"${blockStyleAttr(block.style, ctx.px)}><ul class="kd-features-items"${gridVars}>${itemsHtml}</ul></div>`;
}

/** CSS for every `features` look, parameterized by the page's own radius and
 * shadow (ADR 018), exactly like the Menú/Catálogo bound blocks. */
export function featuresCss(design: PageDesign): string {
  const radius = pageRadius(design);
  const shadow = pageShadow(design);
  return `
.kd-features{width:100%}
.kd-features-items{display:flex;flex-direction:column;width:100%}
.kd-feature-item{display:flex;align-items:center;gap:12px}
.kd-feature-icon{flex:none;display:flex;align-items:center;justify-content:center;color:var(--kd-accent)}
.kd-feature-icon svg{width:24px;height:24px;display:block}
.kd-feature-icon--circle,.kd-feature-icon--square{width:40px;height:40px;background:color-mix(in srgb, var(--kd-accent) 12%, transparent)}
.kd-feature-icon--circle{border-radius:50%}
.kd-feature-icon--square{border-radius:12px}
.kd-feature-icon--circle svg,.kd-feature-icon--square svg{width:20px;height:20px}
.kd-feature-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.kd-feature-title{font-weight:600;color:var(--kd-text);font-size:.95rem}
.kd-feature-note{color:var(--kd-muted);font-size:.85rem}
.kd-features--list .kd-features-items{gap:14px}
.kd-features--list .kd-feature-item{padding-bottom:12px;border-bottom:1px solid color-mix(in srgb, var(--kd-text) 10%, transparent)}
.kd-features--list .kd-feature-item:last-child{border-bottom:none;padding-bottom:0}
.kd-features--grid .kd-features-items{display:grid;grid-template-columns:repeat(var(--kd-features-cols,2),1fr);gap:12px}
.kd-features--grid .kd-feature-item{flex-direction:column;align-items:flex-start;gap:10px;background:var(--kd-surface);border-radius:${radius}px;box-shadow:${shadow};padding:16px}
.kd-features--grid .kd-feature-title{font-size:.94rem}
.kd-features--grid .kd-feature-note{font-size:.82rem}
.kd-features--row .kd-features-items{flex-direction:row;flex-wrap:wrap;justify-content:center;gap:10px 22px}
.kd-features--row .kd-feature-item{gap:7px}
.kd-features--row .kd-feature-icon,.kd-features--chips .kd-feature-icon{width:auto;height:auto;background:none;border-radius:0}
.kd-features--row .kd-feature-icon svg{width:18px;height:18px}
.kd-features--row .kd-feature-title{font-size:.85rem}
.kd-features--chips .kd-features-items{flex-direction:row;flex-wrap:wrap;gap:8px}
.kd-features--chips .kd-feature-item{gap:6px;padding:7px 14px;border-radius:999px;border:1px solid color-mix(in srgb, var(--kd-accent) 30%, transparent);background:var(--kd-surface)}
.kd-features--chips .kd-feature-icon svg{width:16px;height:16px}
.kd-features--chips .kd-feature-title{font-size:.82rem}
`;
}

// ---------------------------------------------------------------------------
// gallery
// ---------------------------------------------------------------------------

type GalleryBlock = Extract<DesignBlock, { kind: "gallery" }>;

const galleryLayouts = {
  grid: "grid",
  carousel: "carousel",
  mosaic: "mosaic",
} as const;
const galleryAspects = {
  "1:1": "1 / 1",
  "4:3": "4 / 3",
  "3:4": "3 / 4",
  "16:9": "16 / 9",
} as const;

type GalleryTile =
  | { kind: "photo"; src: string; alt: string }
  | { kind: "placeholder"; alt: string };

export function renderGalleryBlock(
  block: GalleryBlock,
  ctx: RenderContext,
): string {
  const layout = pick(block.layout, galleryLayouts, galleryLayouts.grid);
  const aspect = pick(block.aspect, galleryAspects, galleryAspects["1:1"]);
  // "Sin banco de fotos" (2026-10-03): a slot with no imageRef is a
  // placeholder in the panel's preview, omitted everywhere else — exactly
  // like a slot whose imageRef fails to resolve (a deleted/broken asset).
  const tiles = block.images
    .map((image): GalleryTile | null => {
      if (!image.imageRef)
        return ctx.imagePlaceholders
          ? { kind: "placeholder", alt: image.alt }
          : null;
      const src = ctx.resolveImage(image.imageRef);
      return src ? { kind: "photo", src, alt: image.alt } : null;
    })
    .filter((tile): tile is GalleryTile => tile !== null);
  const itemsHtml = tiles
    .map((tile, index) => {
      const feature =
        layout === "mosaic" && index === 0 ? " kd-gallery-item--feature" : "";
      if (tile.kind === "placeholder")
        return `<li class="kd-gallery-item${placeholderClass(false)}${feature}" data-placeholder="">${placeholderInnerHtml(tile.alt, false)}</li>`;
      return `<li class="kd-gallery-item${feature}"><img class="kd-gallery-img" src="${escapeHtml(tile.src)}" alt="${escapeHtml(tile.alt)}" loading="lazy"></li>`;
    })
    .join("");
  const cols = clampInt(block.columns, 2, 3, 2);
  const gridVars =
    layout === "grid" || layout === "mosaic"
      ? ` style="--kd-gallery-cols:${cols};--kd-gallery-aspect:${aspect}"`
      : ` style="--kd-gallery-aspect:${aspect}"`;
  return `<div${dataId(block.id)} class="kd-gallery kd-gallery--${layout}"${blockStyleAttr(block.style, ctx.px)}><ul class="kd-gallery-items"${gridVars}>${itemsHtml}</ul></div>`;
}

export function galleryCss(design: PageDesign): string {
  const radius = pageRadius(design);
  return `
.kd-gallery{width:100%}
.kd-gallery-items{width:100%}
.kd-gallery-item{display:block;overflow:hidden;border-radius:${radius}px;background:var(--kd-surface);aspect-ratio:var(--kd-gallery-aspect,1 / 1)}
.kd-gallery-img{width:100%;height:100%;display:block;object-fit:cover}
.kd-gallery--grid .kd-gallery-items{display:grid;grid-template-columns:repeat(var(--kd-gallery-cols,2),1fr);gap:8px}
.kd-gallery--mosaic .kd-gallery-items{display:grid;grid-template-columns:repeat(var(--kd-gallery-cols,2),1fr);gap:8px}
.kd-gallery-item--feature{grid-column:span 2;aspect-ratio:16 / 9}
.kd-gallery--carousel .kd-gallery-items{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:2px}
.kd-gallery--carousel .kd-gallery-items::-webkit-scrollbar{display:none}
.kd-gallery--carousel .kd-gallery-item{flex:0 0 82%;scroll-snap-align:start}
`;
}

/** CSS for both new free blocks this design actually uses ("" when it uses
 * neither). Appended by `render.ts` the same way `boundCssFor` appends the
 * bound blocks' CSS. */
export function featureGalleryCssFor(design: PageDesign): string {
  const kinds = new Set(designBlocks(design).map((block) => block.kind));
  let css = "";
  if (kinds.has("features")) css += featuresCss(design);
  if (kinds.has("gallery")) css += galleryCss(design);
  return css;
}
