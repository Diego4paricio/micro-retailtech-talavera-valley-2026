import { escapeHtml } from "./escape.js";
import { placeholderIconSvg } from "./feature-icons.js";

// ---------------------------------------------------------------------------
// "Sin banco de fotos" (2026-10-03): when a design has no photo yet for an
// `image`/`gallery` block, or a Menú dish/Catálogo product/`featuredItems`
// item has none, the panel's own preview draws a dashed "espacio para foto"
// in its exact spot, so the owner can tell where to upload one, instead of a
// blank hole or nothing at all. The public page (Resolver) never draws one —
// `RenderContext.imagePlaceholders` is only ever `true` in the panel.
//
// Every caller reuses the exact sizing/radius classes the real `<img>` would
// have gotten (`.kd-image`, `.kd-menu-photo--side`, `.kd-catalog-image`, …)
// and only adds `kd-placeholder` (plus `kd-placeholder--icon-only` for a
// small, item-level slot with no text of its own) on top — see each
// caller's own render function. CSS lives in `placeholderCss` (static, no
// design data), included once in `render.ts`'s `baseCss`.
// ---------------------------------------------------------------------------

/**
 * The inner markup of a placeholder slot: the icon, plus (unless `iconOnly`)
 * the block's own `alt` text, up to two lines. `iconOnly` is used for every
 * item-level photo slot (Menú/Catálogo/featuredItems have no per-item `alt`
 * to show) and for a naturally small block-level slot (e.g. a 64 px thumbnail
 * would never fit a line of text).
 */
export function placeholderInnerHtml(
  alt: string | undefined,
  iconOnly: boolean,
): string {
  const icon = placeholderIconSvg();
  if (iconOnly || !alt) return icon;
  return `${icon}<span class="kd-placeholder-alt">${escapeHtml(alt)}</span>`;
}

/** `class="… kd-placeholder[ kd-placeholder--icon-only]"`, to append to
 * whatever sizing classes the real photo would have carried. */
export function placeholderClass(iconOnly: boolean): string {
  return iconOnly
    ? " kd-placeholder kd-placeholder--icon-only"
    : " kd-placeholder";
}

/** Static CSS for every placeholder slot (no design data: colors are the
 * page's own `--kd-*` variables). Included once in `render.ts`'s `baseCss`,
 * like every other block-kind base rule. */
export const placeholderCss = `
.kd-placeholder.kd-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:color-mix(in srgb, var(--kd-text) 6%, var(--kd-surface))!important;border:1.5px dashed color-mix(in srgb, var(--kd-text) 28%, transparent);box-sizing:border-box;padding:8px;text-align:center}
.kd-placeholder svg{width:28px;height:28px;flex:none;color:color-mix(in srgb, var(--kd-text) 45%, transparent)}
.kd-placeholder-alt{margin:0;font-size:13px;line-height:1.3;color:var(--kd-muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.kd-placeholder--icon-only svg{width:20px;height:20px}
`;
