import { DESIGN_LIMITS } from "@kardo/contracts";

/**
 * "Usar como bloque" (modo HTML → bloques, ADR 018 addendum 3): whether the
 * current modo HTML source fits as one new `html` design block. Pure, so it
 * is easy to test; `HtmlStudio` calls `DesignStudio`'s `onUseAsBlock`, which
 * runs this check (it is the one that knows the design's current `html`
 * block count) before inserting the block.
 */

function formatCount(value: number): string {
  return new Intl.NumberFormat("es-MX").format(value);
}

/** Why the current html/css cannot become a block (`null` when it can). */
export function htmlBlockBlocker(
  html: string,
  css: string,
  existingHtmlBlocks: number,
): string | null {
  if (!html.trim() && !css.trim()) return "Escribe algo de HTML o CSS primero.";
  if (existingHtmlBlocks >= DESIGN_LIMITS.htmlBlocks)
    return `Ya tienes ${DESIGN_LIMITS.htmlBlocks} bloques HTML, el máximo por diseño. Elimina uno para agregar otro.`;
  if (html.length > DESIGN_LIMITS.htmlBlockHtml)
    return `Tu HTML tiene ${formatCount(html.length)} caracteres; un bloque admite hasta ${formatCount(DESIGN_LIMITS.htmlBlockHtml)}. Acórtalo primero.`;
  if (css.length > DESIGN_LIMITS.htmlBlockCss)
    return `Tu CSS tiene ${formatCount(css.length)} caracteres; un bloque admite hasta ${formatCount(DESIGN_LIMITS.htmlBlockCss)}. Acórtalo primero.`;
  return null;
}

/** The result `DesignStudio`'s `onUseAsBlock` hands back to `HtmlStudio`,
 * which only shows it (success or error) — it never decides on its own. */
export type UseAsBlockResult =
  | { ok: true; message: string }
  | { ok: false; reason: string };
