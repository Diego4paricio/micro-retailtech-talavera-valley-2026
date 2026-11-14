import {
  type DesignableExperienceType,
  type DesignBlockKind,
  designBlocks,
  type ExperienceContent,
  type PageDesign,
} from "@kardo/contracts";
import { type RenderContext, renderDesignedBody } from "@kardo/page-render";
import { toDesignableContent } from "../model/content.js";
import { updateBlock } from "../model/operations.js";
import {
  absolutePositionForSelector,
  formatCss,
  removeAtRules,
} from "./css-blocks.js";
import { liteHtmlParser, prettyPrintHtml } from "./dom-lite.js";

/**
 * Bloques → HTML (sync between the two editors of the Estudio, 2026-10): a
 * full-page custom HTML source equivalent to the current blocks design, for
 * the three types with a full-page modo HTML (links, profile, linkpage).
 * Pure — same input, same output, no DOM.
 */

export type GeneratedCode = { html: string; css: string };

/** Bound blocks whose content must stay live keep working through Kardo's
 * own widgets instead of being frozen as markup (same tags the modo HTML
 * "Insertar" menu already offers). Every other block renders exactly as it
 * would on the public page. */
const widgetTagByKind: Partial<Record<DesignBlockKind, string>> = {
  contentLinks: "kardo-links",
  contentSocials: "kardo-socials",
  profileHeader: "kardo-profile",
};

/** A throwaway copy of the design (never saved) where every bound block with
 * a platform widget becomes an `html` block that places that widget, keeping
 * its id so `data-block-id` still marks its spot in the generated code. */
function widgetizeBoundBlocks(design: PageDesign): PageDesign {
  let next = design;
  for (const block of designBlocks(design)) {
    const tag = widgetTagByKind[block.kind];
    if (!tag) continue;
    next = updateBlock(next, block.id, () => ({
      id: block.id,
      kind: "html",
      html: `<${tag}></${tag}>`,
      css: "",
      ...(block.style ? { style: block.style } : {}),
    }));
  }
  return next;
}

/** `.kd-page` already sets `min-height:100dvh` for the designed page, but
 * modo HTML needs `position:relative` too (the ambient layer becomes
 * `position:absolute`, see below) and `overflow:hidden` so its blurred glows
 * never add a scrollbar on a short page. Appended once, after the generated
 * stylesheet, so it only adds to `.kd-page`'s own rule instead of fighting it. */
const AMBIENT_PAGE_CSS =
  ".kd-page{position:relative;overflow:hidden;min-height:100dvh}";

export function designToCustomCode(
  type: DesignableExperienceType,
  content: ExperienceContent,
  design: PageDesign,
): GeneratedCode {
  const designable = toDesignableContent(type, content);
  const widgetized = widgetizeBoundBlocks(design);

  // `html` blocks that already exist in the design (not the synthetic
  // widget ones above) carry their own CSS, which has no selector-scoping
  // shadow root here — it is simply appended to the page stylesheet.
  const ownBlockCss: string[] = [];
  const ctx: RenderContext = {
    resolveImage: (ref) => `kardo-asset:${ref}`,
    linkHref: (_itemId, url) => url,
    // Unused: `@font-face` is stripped from the output below (the modo HTML
    // document adds its own, scanning the final CSS for the font names it
    // actually uses — see `usedCustomFonts`).
    fontBaseUrl: "/_fonts/",
    renderHtmlBlock: (html, css) => {
      if (css.trim()) ownBlockCss.push(css);
      return html;
    },
  };

  const rendered = renderDesignedBody(designable, widgetized, ctx, {
    footer: false,
  });

  // The blurred backdrop survives into modo HTML (the owner's complaint:
  // "no se trae el fondo de el de bloques"). Its marker div is kept as is;
  // its CSS keeps every declaration except `position:fixed`, which becomes
  // `position:absolute` (the modo HTML cleaner always strips `fixed`/
  // `sticky` outright — see `sanitize-css.ts` — so emitting it already
  // rewritten is the only way it reaches the published page).
  const html = rendered.html;
  const withoutFontFace = removeAtRules(rendered.css, new Set(["font-face"]));
  const ambientAbsolute = absolutePositionForSelector(
    withoutFontFace,
    ".kd-ambient",
  );
  const css = [ambientAbsolute, AMBIENT_PAGE_CSS, ...ownBlockCss]
    .filter((part) => part.trim())
    .join("\n");

  return {
    html: prettyPrintHtml(liteHtmlParser()(html)),
    css: formatCss(css),
  };
}
