import type { PageDesign } from "@kardo/contracts";
import { clampInt, pick, shadowCss } from "../css.js";
import { escapeHtml } from "../escape.js";
import type { DesignableAvailability } from "../types.js";

// ---------------------------------------------------------------------------
// Shared by the Menú and Catálogo bound blocks (ADR 018, addendum 3): price
// formatting, the live-availability badge (ADR 017) and the generic
// name/description/price/badge CSS both blocks reuse, so a sold-out item
// dims exactly the same way everywhere.
// ---------------------------------------------------------------------------

export function dataId(id: string): string {
  return ` data-block-id="${escapeHtml(id)}"`;
}

/** Mirrors `services/resolver/src/render.ts`'s `formatPrice`. */
export function formatPrice(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Mirrors `services/resolver/src/render.ts`'s `availabilityBadgeHtml`
 * (ADR 017): "Agotado" when sold out, "Queda 1"/"Quedan N" otherwise. */
export function availabilityBadgeHtml(
  availability: DesignableAvailability | undefined,
): string {
  if (!availability) return "";
  if (availability.soldOut)
    return '<span class="kd-badge kd-badge--sold-out">Agotado</span>';
  if (availability.remaining !== null) {
    const label =
      availability.remaining === 1
        ? "Queda 1"
        : `Quedan ${availability.remaining}`;
    return `<span class="kd-badge kd-badge--low">${escapeHtml(label)}</span>`;
  }
  return "";
}

export const noItemsAvailableHtml =
  '<p class="kd-empty-note">Por ahora no hay artículos disponibles.</p>';

const priceStyles = { plain: "plain", accent: "accent", pill: "pill" } as const;

export function priceClass(
  style: "plain" | "accent" | "pill" | undefined,
): string {
  return `kd-price kd-price--${pick(style, priceStyles, priceStyles.plain)}`;
}

/** The page's base corner radius (ADR 018), clamped the same way `pageCss`
 * in render.ts does. Bound blocks bake it into their own CSS the same way
 * `sectionCss` bakes it into a card section: it is not exposed as a
 * `--kd-*` custom property, so `boundCssFor` reads `design.style` directly
 * (it is the only part of this package with access to it). */
export function pageRadius(design: PageDesign): number {
  return clampInt(design.style.radius, 0, 32, 16);
}

export function pageShadow(design: PageDesign): string {
  return shadowCss(design.style.shadow);
}

/** CSS shared by the menu and catalog blocks: the muted empty-state note,
 * name/description/price text and the sold-out/low-stock badge. Colors only
 * ever reference the page's own `--kd-*` variables. */
export function sharedItemCss(): string {
  return `
.kd-empty-note{color:var(--kd-muted);margin:0;font-size:.95rem}
.kd-item-name{font-weight:600;color:var(--kd-text)}
.kd-item-desc{color:var(--kd-muted);font-size:.85rem;margin:0}
.kd-price{font-weight:700;white-space:nowrap}
.kd-price--accent{color:var(--kd-price, var(--kd-accent))}
.kd-price--pill{display:inline-block;background:var(--kd-accent);color:var(--kd-on-accent);padding:2px 10px;border-radius:999px;font-size:.85em}
.kd-badge{display:inline-block;font-size:.72rem;font-weight:600;line-height:1.4;padding:2px 8px;border-radius:999px;white-space:nowrap}
.kd-badge--sold-out{background:color-mix(in srgb, var(--kd-text) 10%, transparent);color:var(--kd-muted)}
.kd-badge--low{background:color-mix(in srgb, var(--kd-accent) 16%, transparent);color:var(--kd-accent)}
.kd-sold-out .kd-item-name,.kd-sold-out .kd-item-desc,.kd-sold-out .kd-price{opacity:.55}
.kd-sold-out img{filter:grayscale(1);opacity:.6}
`;
}
