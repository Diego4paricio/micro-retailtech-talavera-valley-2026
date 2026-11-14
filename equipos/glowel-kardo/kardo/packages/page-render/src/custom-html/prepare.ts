import { CUSTOM_HTML_LIMITS } from "@kardo/contracts";
import { emptyReport, type SanitizeReport } from "./report.js";
import { sanitizeStylesheet } from "./sanitize-css.js";
import { sanitizeAndTokenizeHtml } from "./sanitize-html.js";

export type { SanitizeReport } from "./report.js";

export type PreparedCustomHtml = {
  html: string;
  css: string;
  links: { id: string; url: string }[];
  imageRefs: string[];
  report: SanitizeReport;
};

function mergeCounts<K extends string>(
  ...records: Partial<Record<K, number>>[]
): Partial<Record<K, number>> {
  const merged: Partial<Record<K, number>> = {};
  for (const record of records)
    for (const [key, count] of Object.entries(record) as [K, number][])
      merged[key] = (merged[key] ?? 0) + count;
  return merged;
}

/**
 * Sanitizes and tokenizes "modo HTML" source (ADR 018, extended 2026-09-29):
 * the customer's raw `html`/`css` in, safe-to-serve `html`/`css` out, with
 * every `<a href="https://…">` rewritten to `href="kardo-link:<id>"` (ids
 * `h1`, `h2`, … — the same URL always gets the same id) and every
 * `kardo-asset:<ref>` collected into `imageRefs` for the caller to resolve.
 *
 * Deliberately pure and side-effect free — safe to call from the Publisher
 * (on the raw, author-time source), from the Resolver's
 * `parsePublishedCustomHtml` (re-run on the already-published, already-
 * tokenized source, to confirm nothing changes — see that module), and from
 * the panel's live preview while the customer types.
 *
 * Oversized input (beyond `CUSTOM_HTML_LIMITS`) is rejected outright — empty
 * output, not a best-effort truncation — since a customer's editor already
 * enforces the same limits and anything arriving over them here is either a
 * stale draft or a direct API call this package has no business guessing
 * about.
 */
export function prepareCustomHtml(source: {
  html: string;
  css: string;
}): PreparedCustomHtml {
  if (
    source.html.length > CUSTOM_HTML_LIMITS.html ||
    source.css.length > CUSTOM_HTML_LIMITS.css
  ) {
    return {
      html: "",
      css: "",
      links: [],
      imageRefs: [],
      report: emptyReport(),
    };
  }

  const htmlResult = sanitizeAndTokenizeHtml(source.html);
  const cssResult = sanitizeStylesheet(source.css);

  const report: SanitizeReport = {
    removedTags: htmlResult.report.removedTags,
    removedAttributes: htmlResult.report.removedAttributes,
    removedCssRules: cssResult.removedRules,
    removedCss: mergeCounts(htmlResult.report.removedCss, cssResult.removedCss),
    blockedLinks: htmlResult.report.blockedLinks,
    blockedImages: htmlResult.report.blockedImages,
  };

  return {
    html: htmlResult.html,
    css: cssResult.css,
    links: htmlResult.links,
    imageRefs: htmlResult.imageRefs,
    report,
  };
}
