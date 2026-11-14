import type { DesignBlock, PageDesign } from "@kardo/contracts";
import { blockStyleAttr } from "../block-style.js";
import { pick } from "../css.js";
import { escapeHtml } from "../escape.js";
import { placeholderClass, placeholderInnerHtml } from "../placeholder.js";
import type {
  DesignableContent,
  DesignableMenuItem,
  DesignableMenuSection,
  RenderContext,
} from "../types.js";
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
// Menú bound block (ADR 018, addendum 3): the Menu Experience's own sections
// and dishes (already validated; live availability from ADR 017 already
// applied by the Resolver), rendered with the look this block chooses.
// Several menu blocks may split one menu across a page
// (`repeatableBoundBlocks`), each with its own `sectionIds` filter.
// ---------------------------------------------------------------------------

type MenuBlock = Extract<DesignBlock, { kind: "menu" }>;
type MenuLayout = MenuBlock["layout"];

const menuLayouts = {
  list: "list",
  cards: "cards",
  grid: "grid",
  compact: "compact",
} as const;
const photoShapes = {
  rounded: "rounded",
  circle: "circle",
  square: "square",
} as const;
const sectionStyles = {
  line: "line",
  plain: "plain",
  pill: "pill",
  card: "card",
} as const;

/** Sections this block shows, in the menu's own order — never the order of
 * `sectionIds` (see design.ts's doc comment on that field). A section left
 * with no dishes (absent, or emptied by live availability) is dropped. */
function selectSections(
  content: Extract<DesignableContent, { type: "menu" }>,
  block: MenuBlock,
): DesignableMenuSection[] {
  const allowed =
    block.sectionIds && block.sectionIds.length > 0
      ? new Set(block.sectionIds)
      : null;
  return content.sections
    .filter((section) => !allowed || allowed.has(section.id))
    .filter((section) => section.items.length > 0);
}

/** Where a dish's photo goes: nowhere (`compact` always hides photos, or
 * `photos: "none"`), a wide image above the name (`photos: "large"`, and
 * `grid` always shows whatever photo it has that way — a tile is too narrow
 * for a side thumbnail), or a small thumbnail beside the name. */
function photoPosition(
  layout: MenuLayout,
  photos: MenuBlock["photos"],
): "none" | "top" | "side" {
  if (layout === "compact" || photos === "none") return "none";
  if (layout === "grid" || photos === "large") return "top";
  return "side";
}

/** «Elige tu guisado: Mole · Chicharrón (agotado)»: a comida corrida's
 * choices, each sold out on its own (relevo 37, D1). */
function choicesHtml(item: DesignableMenuItem): string {
  if (!item.choices || item.choices.length === 0) return "";
  const label = item.choicesLabel?.trim() || "A elegir";
  const choices = item.choices
    .map((choice) =>
      choice.soldOut
        ? `<li class="kd-choice kd-choice--sold-out">${escapeHtml(choice.name)} <span class="kd-choice-state">agotado</span></li>`
        : `<li class="kd-choice">${escapeHtml(choice.name)}</li>`,
    )
    .join("");
  return `<div class="kd-choices"><span class="kd-choices-label">${escapeHtml(label)}</span><ul class="kd-choices-list">${choices}</ul></div>`;
}

function renderItem(
  item: DesignableMenuItem,
  block: MenuBlock,
  layout: MenuLayout,
  currency: string,
  ctx: RenderContext,
): string {
  const shape = pick(block.photoShape, photoShapes, photoShapes.rounded);
  const position = photoPosition(layout, block.photos);
  const photoClasses = `kd-menu-photo kd-menu-photo--${position} kd-menu-photo--${shape}`;
  const src =
    position !== "none" && item.imageRef
      ? ctx.resolveImage(item.imageRef)
      : null;
  // "Sin banco de fotos" (2026-10-03): a dish that would show a photo but
  // has none yet gets an "espacio para foto" in its exact spot, in the
  // panel's own preview only — the public page keeps showing it with no
  // photo at all, same as before.
  const showPlaceholder =
    position !== "none" && !item.imageRef && ctx.imagePlaceholders === true;
  const photoHtml = src
    ? `<img class="${photoClasses}" src="${escapeHtml(src)}" alt="" loading="lazy"${position === "side" ? ' width="64" height="64"' : ""}>`
    : showPlaceholder
      ? `<div class="${photoClasses}${placeholderClass(true)}" data-item-photo="${escapeHtml(item.id)}">${placeholderInnerHtml(undefined, true)}</div>`
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
  const meta =
    price || badge
      ? `<div class="kd-menu-item-meta">${price}${badge}</div>`
      : "";
  const main = `<div class="kd-menu-item-main">${position === "side" ? photoHtml : ""}<div class="kd-menu-item-text"><span class="kd-item-name">${escapeHtml(item.name)}</span>${description}${choicesHtml(item)}</div></div>`;
  const soldOut = item.availability?.soldOut === true;
  const classes = `kd-menu-item kd-menu-item--${layout}${soldOut ? " kd-sold-out" : ""}`;
  return `<li class="${classes}">${position === "top" ? photoHtml : ""}<div class="kd-menu-item-body">${main}${meta}</div></li>`;
}

function renderSection(
  section: DesignableMenuSection,
  block: MenuBlock,
  layout: MenuLayout,
  currency: string,
  ctx: RenderContext,
): string {
  const sectionStyle = pick(
    block.sectionStyle,
    sectionStyles,
    sectionStyles.line,
  );
  const itemsHtml = section.items
    .map((item) => renderItem(item, block, layout, currency, ctx))
    .join("");
  const itemsClasses = [
    "kd-menu-items",
    `kd-menu-items--${layout}`,
    block.columns === 2 && layout !== "grid" ? "kd-menu-items--cols2" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<div class="kd-menu-section"><h2 class="kd-menu-section-name kd-menu-section-name--${sectionStyle}">${escapeHtml(section.name)}</h2><ul class="${itemsClasses}">${itemsHtml}</ul></div>`;
}

export function renderMenuBlock(
  block: MenuBlock,
  content: DesignableContent,
  ctx: RenderContext,
): string {
  if (content.type !== "menu") return "";
  const layout = pick(block.layout, menuLayouts, menuLayouts.list);
  const sections = selectSections(content, block);
  const inner = sections.length
    ? sections
        .map((section) =>
          renderSection(section, block, layout, content.currency, ctx),
        )
        .join("")
    : noItemsAvailableHtml;
  return `<div${dataId(block.id)} class="kd-menu"${blockStyleAttr(block.style, ctx.px)}>${inner}</div>`;
}

/** CSS for every menu look this block supports, parameterized by the page's
 * own radius/shadow (ADR 018) — colors only ever reference `--kd-*`. */
export function menuCss(design: PageDesign): string {
  const radius = pageRadius(design);
  const photoRadius = Math.min(radius, 14);
  const shadow = pageShadow(design);
  return `
.kd-menu{display:flex;flex-direction:column;gap:28px;width:100%}
.kd-menu-section{display:flex;flex-direction:column;gap:12px;width:100%}
.kd-menu-section-name{margin:0;font-size:1.05rem;font-weight:700;color:var(--kd-text)}
.kd-menu-section-name--line{padding-bottom:8px;border-bottom:1px solid color-mix(in srgb, var(--kd-text) 15%, transparent)}
.kd-menu-section-name--pill{display:inline-block;align-self:flex-start;background:color-mix(in srgb, var(--kd-accent) 22%, transparent);color:var(--kd-text);padding:4px 14px;border-radius:999px;font-size:.9rem}
.kd-menu-section-name--card{background:var(--kd-surface);border-radius:${radius}px;padding:10px 16px;box-shadow:${shadow}}
.kd-menu-items{display:flex;flex-direction:column;width:100%}
.kd-menu-item{display:flex;flex-direction:column;padding:12px 0;border-bottom:1px solid color-mix(in srgb, var(--kd-text) 10%, transparent)}
.kd-menu-item:last-child{border-bottom:none}
.kd-menu-item--compact{padding:7px 0}
.kd-menu-item-body{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;width:100%}
.kd-menu-item-main{display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0}
.kd-menu-item-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.kd-menu-item-meta{display:flex;flex-direction:column;align-items:flex-end;gap:4px;white-space:nowrap;flex:none}
.kd-choices{display:flex;flex-direction:column;gap:3px;margin-top:6px;font-size:.88em}
.kd-choices-label{color:color-mix(in srgb, var(--kd-text) 65%, transparent)}
.kd-choices-list{display:flex;flex-wrap:wrap;gap:4px 8px;margin:0;padding:0;list-style:none}
.kd-choice{padding:2px 10px;border-radius:999px;background:color-mix(in srgb, var(--kd-text) 7%, transparent);color:var(--kd-text)}
.kd-choice--sold-out{text-decoration:line-through;opacity:.55}
.kd-choice-state{font-size:.85em}
.kd-menu-photo{flex:none;display:block;object-fit:cover;background:var(--kd-background)}
.kd-menu-photo--side{width:64px;height:64px;border-radius:${photoRadius}px}
.kd-menu-photo--top{width:100%;height:auto;aspect-ratio:16 / 9;margin-bottom:10px;border-radius:${radius}px}
.kd-menu-photo--circle{border-radius:50%}
.kd-menu-photo--square{border-radius:0}
.kd-menu-item--cards,.kd-menu-item--grid{background:var(--kd-surface);border-radius:${radius}px;border-bottom:none;overflow:hidden;box-shadow:${shadow};padding:0}
.kd-menu-item--cards{margin-bottom:12px}
.kd-menu-item--cards:last-child{margin-bottom:0}
.kd-menu-item--cards .kd-menu-item-body,.kd-menu-item--grid .kd-menu-item-body{padding:14px 16px}
.kd-menu-item--grid .kd-menu-item-body{flex-direction:column;align-items:flex-start;gap:6px}
.kd-menu-item--cards .kd-menu-photo--top,.kd-menu-item--grid .kd-menu-photo--top{margin-bottom:0;border-radius:0}
.kd-menu-items--grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
@media (max-width:359px){
.kd-menu-items--grid{grid-template-columns:1fr}
}
@media (min-width:640px){
.kd-menu-items--cols2{display:grid;grid-template-columns:repeat(2,1fr);column-gap:24px}
}
@media (max-width:360px){
.kd-menu-photo--side{width:56px;height:56px}
}
`;
}
