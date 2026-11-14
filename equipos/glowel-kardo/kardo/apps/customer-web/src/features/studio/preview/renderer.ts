import type { PageDesign } from "@kardo/contracts";
import { renderDesignedDocument } from "@kardo/page-render";
import type { DesignableContent } from "../model/content.js";
import { fontBaseMarker, resolveFontUrls } from "./fonts.js";

/** Renders an `html` block (sanitized, in its own shadow root), or `null`
 * while the sanitizer is still loading (the block draws a placeholder). */
export type HtmlBlockRender = (html: string, css: string) => string | null;

/**
 * The page exactly as visitors will see it: the same document the Resolver
 * serves (`renderDesignedDocument` of `@kardo/page-render`: same footer,
 * same blurred field, same margins), shown in a sandboxed iframe without
 * scripts. Library images come in as local `blob:` URLs; links keep their
 * real URL (clicks never navigate inside the Estudio). The Estudio adds only
 * its editor styles, from outside (see stage/PreviewFrame.tsx).
 */
export function renderPreviewDocument(
  content: DesignableContent,
  design: PageDesign,
  resolveImage: (ref: string) => string | null,
  title: string,
  options: {
    renderHtmlBlock?: HtmlBlockRender | undefined;
    /** `false` draws the page exactly as customers see it, without the
     * "espacio para foto" placeholders (Primeros pasos, relevo 33). */
    imagePlaceholders?: boolean | undefined;
  } = {},
): string {
  const html = renderDesignedDocument(
    content,
    design,
    {
      resolveImage,
      linkHref: (_itemId, url) => url,
      fontBaseUrl: fontBaseMarker,
      // "Sin banco de fotos" (2026-10-03): the Estudio's own preview is the
      // only place a missing photo draws an "espacio para foto" placeholder
      // instead of nothing — never the public page.
      imagePlaceholders: options.imagePlaceholders ?? true,
      ...(options.renderHtmlBlock
        ? { renderHtmlBlock: options.renderHtmlBlock }
        : {}),
    },
    { title },
  );
  return resolveFontUrls(html);
}
