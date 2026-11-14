import { hex, relativeLuminance } from "./css.js";
import { kardoLogoDarkSvg, kardoLogoSvg } from "./icons.js";

// ---------------------------------------------------------------------------
// The Kardo mark shown at the very end of every public page (ADR 018
// addendum 3, "el logo de Kardo, siempre abajo"): the real logo in strokes
// (never a system-font `<text>`), discreet, centered, with the page's own
// footer pushed to the bottom of a short screen by `margin-top:auto`.
// ---------------------------------------------------------------------------

export type FooterTone = "light" | "dark" | "chip";

/** Whether a page background is dark enough that the footer needs the
 * light-on-dark logo variant, from the palette's own `background` color. */
export function footerToneForBackground(
  backgroundHex: string,
): "light" | "dark" {
  const safe = hex(backgroundHex, "#f7f5f0");
  return relativeLuminance(safe) < 0.5 ? "dark" : "light";
}

export const footerCss = `
.kd-footer{display:flex;justify-content:center;align-items:center;width:100%;flex:none;box-sizing:border-box;margin-top:auto;padding-top:28px;padding-bottom:calc(16px + env(safe-area-inset-bottom, 0px))}
.kd-footer svg{height:17px;width:auto;display:block}
.kd-footer--light,.kd-footer--dark{opacity:.72}
.kd-footer-chip{display:inline-flex;align-items:center;padding:7px 14px;border-radius:999px;background:rgba(255,253,248,.86);box-shadow:0 1px 2px rgba(22,35,46,.1);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.kd-footer-chip svg{height:15px;width:auto;display:block;opacity:1}
`;

/**
 * Kardo's own mark, always at the end of a public page: `"light"`/`"dark"`
 * for a designed or themed page whose own background is known (the real
 * logo, tinted for that background), or `"chip"` — a translucent light pill
 * that reads over any background — for modo HTML and a page whose background
 * cannot be known ahead of time (an image of unknown luminance).
 */
export function renderKardoFooter(tone: FooterTone): string {
  if (tone === "chip") {
    return `<footer class="kd-footer kd-footer--chip" aria-label="Kardo"><span class="kd-footer-chip">${kardoLogoSvg}</span></footer>`;
  }
  const logo = tone === "dark" ? kardoLogoDarkSvg : kardoLogoSvg;
  return `<footer class="kd-footer kd-footer--${tone}">${logo}</footer>`;
}
