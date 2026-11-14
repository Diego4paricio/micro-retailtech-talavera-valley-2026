import type { DesignBlock, PageDesign } from "@kardo/contracts";
import { blockStyleAttr } from "../block-style.js";
import { clampInt, pick } from "../css.js";
import { escapeHtml } from "../escape.js";
import { placeholderClass, placeholderInnerHtml } from "../placeholder.js";
import type {
  DesignableCatalogItem,
  DesignableContent,
  RenderContext,
} from "../types.js";
import { safeHref } from "../url-safety.js";
import {
  availabilityBadgeHtml,
  dataId,
  formatPrice,
  noItemsAvailableHtml,
  pageRadius,
  pageShadow,
  priceClass,
} from "./shared.js";

// ---------------------------------------------------------------------------
// Catálogo bound block (ADR 018, addendum 3): the Catalog Experience's own
// products (already validated; live availability from ADR 017 already
// applied by the Resolver), rendered with the look this block chooses.
// ---------------------------------------------------------------------------

type CatalogBlock = Extract<DesignBlock, { kind: "catalog" }>;

const catalogLayouts = { grid: "grid", list: "list", cards: "cards" } as const;
const imageAspects = {
  "1:1": "1 / 1",
  "4:3": "4 / 3",
  "3:4": "3 / 4",
} as const;

/** The product's "Ver más" link, only when it has a `url`. `safeHref` fails
 * closed: a rejected (or unresolved) href renders inert text, never a link
 * to nowhere. */
function renderButton(
  item: DesignableCatalogItem,
  block: CatalogBlock,
  ctx: RenderContext,
  compact: boolean,
): string {
  if (!item.url) return "";
  const label = block.buttonLabel?.trim() || "Ver más";
  const classes = `kd-btn kd-btn--secondary kd-catalog-button${compact ? " kd-catalog-button--auto" : ""}`;
  const href = safeHref(ctx.linkHref(item.id, item.url), "https");
  if (!href)
    return `<span class="${classes} kd-catalog-button--inert">${escapeHtml(label)}</span>`;
  return `<a class="${classes}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

/** Used by `grid` and `cards`: a tile with the image on top. */
function renderTile(
  item: DesignableCatalogItem,
  block: CatalogBlock,
  currency: string,
  ctx: RenderContext,
): string {
  const soldOut = item.availability?.soldOut === true;
  const aspect = pick(block.imageAspect, imageAspects, imageAspects["1:1"]);
  const src = item.imageRef ? ctx.resolveImage(item.imageRef) : null;
  // "Sin banco de fotos" (2026-10-03): the panel's own preview draws an
  // "espacio para foto" for a product with none yet; the public page keeps
  // showing it with no photo, same as before.
  const showPlaceholder = !item.imageRef && ctx.imagePlaceholders === true;
  const image = src
    ? `<img class="kd-catalog-image" src="${escapeHtml(src)}" alt="" loading="lazy" style="aspect-ratio:${aspect}">`
    : showPlaceholder
      ? `<div class="kd-catalog-image${placeholderClass(true)}" style="aspect-ratio:${aspect}" data-item-photo="${escapeHtml(item.id)}">${placeholderInnerHtml(undefined, true)}</div>`
      : "";
  const showDescriptions = block.descriptions !== false;
  const description =
    showDescriptions && item.description
      ? `<p class="kd-item-desc">${escapeHtml(item.description)}</p>`
      : "";
  const price =
    item.price !== undefined
      ? `<div class="${priceClass(block.priceStyle)}">${escapeHtml(formatPrice(item.price, currency))}</div>`
      : "";
  const badge = availabilityBadgeHtml(item.availability);
  const button = renderButton(item, block, ctx, false);
  const classes = `kd-catalog-item${soldOut ? " kd-sold-out" : ""}`;
  return `<div class="${classes}">${image}<div class="kd-catalog-body"><div class="kd-item-name">${escapeHtml(item.name)}</div>${badge}${description}${price}${button}</div></div>`;
}

/** Used by `list`: a compact horizontal row, like the Menú's own list. */
function renderRow(
  item: DesignableCatalogItem,
  block: CatalogBlock,
  currency: string,
  ctx: RenderContext,
): string {
  const soldOut = item.availability?.soldOut === true;
  const src = item.imageRef ? ctx.resolveImage(item.imageRef) : null;
  const showPlaceholder = !item.imageRef && ctx.imagePlaceholders === true;
  const image = src
    ? `<img class="kd-catalog-row-image" src="${escapeHtml(src)}" alt="" loading="lazy" width="64" height="64">`
    : showPlaceholder
      ? `<div class="kd-catalog-row-image${placeholderClass(true)}" data-item-photo="${escapeHtml(item.id)}">${placeholderInnerHtml(undefined, true)}</div>`
      : "";
  const showDescriptions = block.descriptions !== false;
  const description =
    showDescriptions && item.description
      ? `<span class="kd-item-desc">${escapeHtml(item.description)}</span>`
      : "";
  const price =
    item.price !== undefined
      ? `<span class="${priceClass(block.priceStyle)}">${escapeHtml(formatPrice(item.price, currency))}</span>`
      : "";
  const badge = availabilityBadgeHtml(item.availability);
  const button = renderButton(item, block, ctx, true);
  const classes = `kd-catalog-item kd-catalog-item--row${soldOut ? " kd-sold-out" : ""}`;
  return `<div class="${classes}">${image}<div class="kd-catalog-row-body"><div class="kd-catalog-row-text"><span class="kd-item-name">${escapeHtml(item.name)}</span>${description}</div><div class="kd-catalog-row-meta">${price}${badge}</div></div>${button}</div>`;
}

export function renderCatalogBlock(
  block: CatalogBlock,
  content: DesignableContent,
  ctx: RenderContext,
): string {
  if (content.type !== "catalog") return "";
  const layout = pick(block.layout, catalogLayouts, catalogLayouts.grid);
  const outerStyle = blockStyleAttr(block.style, ctx.px);
  if (content.items.length === 0)
    return `<div${dataId(block.id)} class="kd-catalog kd-catalog--${layout}"${outerStyle}>${noItemsAvailableHtml}</div>`;

  const itemsHtml = content.items
    .map((item) =>
      layout === "list"
        ? renderRow(item, block, content.currency, ctx)
        : renderTile(item, block, content.currency, ctx),
    )
    .join("");
  // `columns` is the grid's phone column count (contracts' own doc comment);
  // list/cards ignore it, each staying a single column of rows/cards.
  let gridVars = "";
  if (layout === "grid") {
    const cols = clampInt(block.columns, 1, 3, 2);
    const colsLg = Math.min(cols + 1, 4);
    gridVars = ` style="--kd-catalog-cols:${cols};--kd-catalog-cols-lg:${colsLg}"`;
  }
  return `<div${dataId(block.id)} class="kd-catalog kd-catalog--${layout}"${outerStyle}><div class="kd-catalog-items"${gridVars}>${itemsHtml}</div></div>`;
}

export function catalogCss(design: PageDesign): string {
  const radius = pageRadius(design);
  const shadow = pageShadow(design);
  return `
.kd-catalog{width:100%}
.kd-catalog-items{width:100%}
.kd-catalog--grid .kd-catalog-items{display:grid;grid-template-columns:repeat(var(--kd-catalog-cols,2),1fr);gap:14px}
@media (min-width:640px){
.kd-catalog--grid .kd-catalog-items{grid-template-columns:repeat(var(--kd-catalog-cols-lg,3),1fr)}
}
.kd-catalog--cards .kd-catalog-items{display:flex;flex-direction:column;gap:16px}
.kd-catalog--list .kd-catalog-items{display:flex;flex-direction:column}
.kd-catalog-item{display:flex;flex-direction:column;background:var(--kd-surface);border-radius:${radius}px;overflow:hidden;box-shadow:${shadow}}
.kd-catalog-image{width:100%;display:block;object-fit:cover;background:var(--kd-background)}
.kd-catalog-body{display:flex;flex-direction:column;gap:4px;padding:12px 14px 14px;flex:1}
.kd-catalog-body .kd-price{margin-top:auto}
.kd-catalog-button{margin-top:8px}
.kd-catalog-button--inert{opacity:.6;cursor:default}
.kd-catalog-item--row{flex-direction:row;align-items:center;gap:12px;background:transparent;border-radius:0;box-shadow:none;padding:10px 0;border-bottom:1px solid color-mix(in srgb, var(--kd-text) 10%, transparent)}
.kd-catalog--list .kd-catalog-item--row:last-child{border-bottom:none}
.kd-catalog-row-image{width:64px;height:64px;flex:none;object-fit:cover;border-radius:${Math.min(radius, 14)}px;background:var(--kd-background)}
.kd-catalog-row-body{flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:12px}
.kd-catalog-row-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.kd-catalog-row-meta{display:flex;flex-direction:column;align-items:flex-end;gap:4px;white-space:nowrap;flex:none}
.kd-catalog-button--auto{width:auto;padding:9px 16px;flex:none}
`;
}
