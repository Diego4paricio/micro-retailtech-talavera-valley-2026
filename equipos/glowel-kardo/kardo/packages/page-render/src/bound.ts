import {
  type DesignBlock,
  designBlocks,
  type PageDesign,
} from "@kardo/contracts";
import { catalogCss, renderCatalogBlock } from "./bound/catalog.js";
import { documentCss, renderDocumentPagesBlock } from "./bound/document.js";
import {
  featuredItemsCss,
  renderFeaturedItemsBlock,
} from "./bound/featured.js";
import { formCss, renderLeadFormBlock } from "./bound/form.js";
import { imageMainCss, renderImageMainBlock } from "./bound/image.js";
import { menuCss, renderMenuBlock } from "./bound/menu.js";
import { sharedItemCss } from "./bound/shared.js";
import type { DesignableContent, RenderContext } from "./types.js";

// ---------------------------------------------------------------------------
// Bound blocks of Menú, Catálogo, Formulario, PDF and Imagen (ADR 018,
// addendum 3). Each one draws the Experience's own content (already
// validated, hashes resolved, live availability applied by the Resolver);
// the block only chooses the look. Returns "" when the content does not
// match the block (a design is always checked against its type first).
//
// The rendering itself lives one per kind in `bound/` — this module is only
// the dispatcher and the CSS combiner.
// ---------------------------------------------------------------------------

export type BoundBlock = Extract<
  DesignBlock,
  {
    kind:
      | "menu"
      | "catalog"
      | "featuredItems"
      | "leadForm"
      | "documentPages"
      | "imageMain";
  }
>;

/** CSS for the bound blocks this design actually uses ("" when it uses
 * none); the page CSS appends it once (render.ts). Static and built only
 * from `design.style` (radius, shadow) and the page's own `--kd-*`
 * variables — never from a client's request data. */
export function boundCssFor(design: PageDesign): string {
  const kinds = new Set(designBlocks(design).map((block) => block.kind));
  let css = "";
  if (kinds.has("menu") || kinds.has("catalog") || kinds.has("featuredItems"))
    css += sharedItemCss();
  if (kinds.has("menu")) css += menuCss(design);
  if (kinds.has("catalog")) css += catalogCss(design);
  if (kinds.has("featuredItems")) css += featuredItemsCss(design);
  if (kinds.has("leadForm")) css += formCss(design);
  if (kinds.has("documentPages")) css += documentCss(design);
  if (kinds.has("imageMain")) css += imageMainCss(design);
  return css;
}

export function renderBoundBlock(
  block: BoundBlock,
  content: DesignableContent,
  ctx: RenderContext,
): string {
  switch (block.kind) {
    case "menu":
      return renderMenuBlock(block, content, ctx);
    case "catalog":
      return renderCatalogBlock(block, content, ctx);
    case "featuredItems":
      return renderFeaturedItemsBlock(block, content, ctx);
    case "leadForm":
      return renderLeadFormBlock(block, content, ctx);
    case "documentPages":
      return renderDocumentPagesBlock(block, content, ctx);
    case "imageMain":
      return renderImageMainBlock(block, content, ctx);
    default:
      return "";
  }
}
