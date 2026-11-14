import fs from "node:fs";
import path from "node:path";
import { type LegalSlug, legalDocuments, legalSlugs } from "./legal-documents";
import {
  type Block,
  missingPlaceholders,
  parseLegalMarkdown,
} from "./legal-markdown";

export { type LegalSlug, legalDocuments, legalSlugs };

// The public legal pages are built from Docs/legal (the texts the panel,
// Stripe Checkout and the billing emails link to). Paths are the ones the
// panel and the notices use: /terminos, /cancelacion-y-reembolsos and
// /privacidad.

export type LegalDocument = {
  slug: LegalSlug;
  title: string;
  description: string;
  blocks: Block[];
  /** Titular data still missing: the page is a draft and is not indexed. */
  missing: string[];
};

function legalDirectory(): string {
  // `next build` and vitest run from apps/website.
  return path.resolve(process.cwd(), "..", "..", "Docs", "legal");
}

export function loadLegalDocument(slug: LegalSlug): LegalDocument {
  const meta = legalDocuments[slug];
  const markdown = fs.readFileSync(
    path.join(legalDirectory(), meta.file),
    "utf8",
  );
  const missing = missingPlaceholders(markdown);
  // The file's own H1 repeats the title; the page renders its own.
  const blocks = parseLegalMarkdown(markdown).filter(
    (block, position) =>
      !(position === 0 && block.kind === "heading" && block.level === 1),
  );
  return {
    slug,
    title: meta.title,
    description: meta.description,
    blocks,
    missing,
  };
}

/** Complete texts: the only ones indexed and listed in the sitemap. */
export function publishedLegalSlugs(): LegalSlug[] {
  return legalSlugs.filter(
    (slug) => loadLegalDocument(slug).missing.length === 0,
  );
}

/**
 * A text with blanks is never published: production leaves it out (its path
 * answers "not found" and no link points to it) instead of failing the whole
 * site build; other environments show it as a marked draft.
 */
export function isLegalPageVisible(slug: LegalSlug): boolean {
  return (
    process.env.KARDO_ENV !== "production" ||
    loadLegalDocument(slug).missing.length === 0
  );
}

export function visibleLegalSlugs(): LegalSlug[] {
  return legalSlugs.filter(isLegalPageVisible);
}
