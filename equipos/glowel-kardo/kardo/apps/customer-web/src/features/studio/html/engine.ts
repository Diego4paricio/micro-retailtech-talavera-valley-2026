import {
  type DesignableContent,
  prepareCustomHtml,
  renderCustomHtmlDocument,
} from "@kardo/page-render";
import { fontBaseMarker, resolveFontUrls } from "../preview/fonts.js";
import { normalizeReport, type StudioReport } from "./report.js";

/**
 * The modo HTML preview pipeline: sanitize the source, then render the page
 * exactly as the Resolver will (inside its shadow root, Kardo footer
 * outside). Same sanitizer and renderer as the Publisher and the Resolver
 * (@kardo/page-render), so the preview is what gets published.
 */

export type PreparedSource = {
  prepared: ReturnType<typeof prepareCustomHtml>;
  report: StudioReport;
  imageRefs: string[];
};

/** Sanitizes the source (runs on every change of the code). */
export function prepareSource(source: {
  html: string;
  css: string;
}): PreparedSource {
  const prepared = prepareCustomHtml(source);
  return {
    prepared,
    report: normalizeReport(prepared.report),
    imageRefs: [...prepared.imageRefs],
  };
}

/** The whole preview document, ready for a sandboxed `srcdoc` iframe. */
export function renderSourceDocument(
  content: DesignableContent,
  source: PreparedSource,
  resolveImage: (ref: string) => string | null,
  title: string,
): string {
  const html = renderCustomHtmlDocument(
    content,
    source.prepared,
    {
      resolveImage,
      // Links keep their real URL; clicks never navigate inside the Estudio.
      linkHref: (_itemId, url) => url,
      fontBaseUrl: fontBaseMarker,
    },
    { title },
  );
  return resolveFontUrls(html);
}
