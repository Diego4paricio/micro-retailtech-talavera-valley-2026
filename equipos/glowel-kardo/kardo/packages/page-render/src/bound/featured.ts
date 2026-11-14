import type { DesignBlock, PageDesign } from "@kardo/contracts";
import { blockStyleAttr } from "../block-style.js";
import { pick } from "../css.js";
import { escapeHtml } from "../escape.js";
import { placeholderClass, placeholderInnerHtml } from "../placeholder.js";
import type {
  DesignableCatalogItem,
  DesignableContent,
  DesignableMenuItem,
  RenderContext,
} from "../types.js";
import {
  availabilityBadgeHtml,
  dataId,
  formatPrice,
  pageRadius,
  pageShadow,
  priceClass,
} from "./shared.js";

// ---------------------------------------------------------------------------
// `featuredItems` bound block ("Destacados", motor de 3 bloques, 2026-10-03):
// a short, chosen subset of a Menú's dishes or a Catálogo's products, drawn
// with the exact same live availability (ADR 017) `menu`/`catalog` already
// apply (the Resolver annotates the content before this ever runs). Items
// hidden by availability, or simply deleted, are already gone from the
// content by the time this runs; an id the block still names just finds
// nothing and is skipped (never an error at render time).
// ---------------------------------------------------------------------------

type FeaturedBlock = Extract<DesignBlock, { kind: "featuredItems" }>;
type FeaturedItem = DesignableMenuItem | DesignableCatalogItem;

const featuredLayouts = {
  hero: "hero",
  cards: "cards",
  carousel: "carousel",
} as const;

/** The content's own items, by id, in `itemIds` order — never the content's
 * order. Menú items are flattened across every section (a dish's section is
 * not relevant to a highlight). */
function selectItems(
  content: DesignableContent,
  itemIds: readonly string[],
): FeaturedItem[] {
  let byId: Map<string, FeaturedItem>;
  if (content.type === "menu") {
    byId = new Map(
      content.sections.flatMap((section) =>
        section.items.map((item) => [item.id, item] as const),
      ),
    );
  } else if (content.type === "catalog") {
    byId = new Map(content.items.map((item) => [item.id, item] as const));
  } else {
    return [];
  }
  const items: FeaturedItem[] = [];
  for (const id of itemIds) {
    const item = byId.get(id);
    if (item) items.push(item);
  }
  return items;
}

function itemPhotoHtml(
  item: FeaturedItem,
  ctx: RenderContext,
  aspectClass: string,
): string {
  const src = item.imageRef ? ctx.resolveImage(item.imageRef) : null;
  if (src)
    return `<img class="kd-featured-photo ${aspectClass}" src="${escapeHtml(src)}" alt="" loading="lazy">`;
  // "Sin banco de fotos" (2026-10-03): the panel's own preview draws an
  // "espacio para foto" for an item with none yet; the public page keeps
  // drawing a text-only card, same as before.
  if (!item.imageRef && ctx.imagePlaceholders === true)
    return `<div class="kd-featured-photo ${aspectClass}${placeholderClass(true)}" data-item-photo="${escapeHtml(item.id)}">${placeholderInnerHtml(undefined, true)}</div>`;
  return "";
}

function itemBodyHtml(
  item: FeaturedItem,
  currency: string,
  showDescription: boolean,
  nameClass: string,
): string {
  const description =
    showDescription && item.description
      ? `<p class="kd-item-desc">${escapeHtml(item.description)}</p>`
      : "";
  const price =
    item.price !== undefined
      ? `<div class="${priceClass("accent")}">${escapeHtml(formatPrice(item.price, currency))}</div>`
      : "";
  const badge = availabilityBadgeHtml(item.availability);
  return `<div class="kd-featured-body"><div class="${nameClass}">${escapeHtml(item.name)}</div>${badge}${description}${price}</div>`;
}

function renderCard(
  item: FeaturedItem,
  currency: string,
  showDescription: boolean,
  ctx: RenderContext,
): string {
  const soldOut = item.availability?.soldOut === true;
  const photo = itemPhotoHtml(item, ctx, "kd-featured-photo--square");
  const classes = `kd-featured-card${soldOut ? " kd-sold-out" : ""}${photo ? "" : " kd-featured-card--no-photo"}`;
  return `<li class="${classes}">${photo}${itemBodyHtml(item, currency, showDescription, "kd-item-name")}</li>`;
}

function renderHero(
  item: FeaturedItem,
  currency: string,
  showDescription: boolean,
  ctx: RenderContext,
): string {
  const soldOut = item.availability?.soldOut === true;
  const photo = itemPhotoHtml(item, ctx, "kd-featured-photo--wide");
  const classes = `kd-featured-hero${soldOut ? " kd-sold-out" : ""}${photo ? "" : " kd-featured-hero--no-photo"}`;
  return `<div class="${classes}">${photo}${itemBodyHtml(item, currency, showDescription, "kd-featured-hero-name")}</div>`;
}

export function renderFeaturedItemsBlock(
  block: FeaturedBlock,
  content: DesignableContent,
  ctx: RenderContext,
): string {
  if (content.type !== "menu" && content.type !== "catalog") return "";
  const items = selectItems(content, block.itemIds);
  if (items.length === 0) return "";
  const layout = pick(block.layout, featuredLayouts, featuredLayouts.cards);
  const showDescription = block.descriptions !== false;
  const currency = content.currency;
  const label = block.label
    ? `<p class="kd-featured-label">${escapeHtml(block.label)}</p>`
    : "";

  let inner: string;
  if (layout === "hero") {
    const [first, ...rest] = items;
    const heroHtml = first
      ? renderHero(first, currency, showDescription, ctx)
      : "";
    const restHtml = rest.length
      ? `<ul class="kd-featured-items kd-featured-items--cards">${rest
          .map((item) => renderCard(item, currency, showDescription, ctx))
          .join("")}</ul>`
      : "";
    inner = `${heroHtml}${restHtml}`;
  } else {
    inner = `<ul class="kd-featured-items kd-featured-items--${layout}">${items
      .map((item) => renderCard(item, currency, showDescription, ctx))
      .join("")}</ul>`;
  }

  return `<div${dataId(block.id)} class="kd-featured kd-featured--${layout}"${blockStyleAttr(block.style, ctx.px)}>${label}${inner}</div>`;
}

export function featuredItemsCss(design: PageDesign): string {
  const radius = pageRadius(design);
  const shadow = pageShadow(design);
  return `
.kd-featured{width:100%}
.kd-featured-label{display:inline-block;align-self:flex-start;margin:0 0 12px;background:var(--kd-accent);color:var(--kd-on-accent);padding:4px 14px;border-radius:999px;font-size:.78rem;font-weight:700;letter-spacing:.02em}
.kd-featured-photo{width:100%;display:block;object-fit:cover;background:var(--kd-background)}
.kd-featured-photo--square{aspect-ratio:1 / 1}
.kd-featured-photo--wide{aspect-ratio:4 / 3}
.kd-featured-body{display:flex;flex-direction:column;gap:4px;padding:12px 14px 14px}
.kd-featured-body .kd-price{margin-top:auto}
.kd-featured-body .kd-badge{align-self:flex-start}
.kd-featured-hero{display:flex;flex-direction:column;background:var(--kd-surface);border-radius:${radius}px;overflow:hidden;box-shadow:${shadow};margin-bottom:14px}
.kd-featured-hero-name{font-weight:600;font-size:1.3rem;color:var(--kd-text)}
.kd-featured-hero--no-photo .kd-featured-body{padding-top:16px}
.kd-featured-items{width:100%}
.kd-featured-items--cards{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.kd-featured-card{display:flex;flex-direction:column;background:var(--kd-surface);border-radius:${radius}px;overflow:hidden;box-shadow:${shadow}}
.kd-featured-card--no-photo .kd-featured-body{padding-top:14px}
.kd-featured-items--cards>.kd-featured-card:last-child:nth-child(odd){grid-column:1 / -1}
.kd-featured-items--cards>.kd-featured-card:last-child:nth-child(odd) .kd-featured-photo--square{aspect-ratio:16 / 9}
.kd-featured-items--carousel{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:2px}
.kd-featured-items--carousel::-webkit-scrollbar{display:none}
.kd-featured-items--carousel .kd-featured-card{flex:0 0 72%;scroll-snap-align:start}
@media (max-width:359px){
.kd-featured-items--cards{grid-template-columns:1fr}
}
`;
}
