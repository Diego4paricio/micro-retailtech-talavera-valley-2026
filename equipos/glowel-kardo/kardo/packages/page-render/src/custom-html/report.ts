/** Why a piece of CSS was removed. `stylesheet`: the whole `css` source was
 * refused by the final safety gate (nothing of it is used). */
export type CssRemoval =
  | "import"
  | "font-face"
  | "namespace"
  | "host-context"
  | "position"
  | "external-url"
  | "expression"
  | "binding"
  | "stylesheet";

/**
 * What `prepareCustomHtml` removed, for the panel to show the customer (and
 * for logging). Every count is a plain tally — never the removed content
 * itself, so the report can never smuggle back anything the sanitizer just
 * stripped out.
 */
export type SanitizeReport = {
  /** Tag name → times a disallowed/unknown element was dropped or unwrapped. */
  removedTags: Record<string, number>;
  /** Attribute name → times a disallowed/invalid attribute was dropped. */
  removedAttributes: Record<string, number>;
  /** CSS at-rules/rules/declarations removed (or, when the whole stylesheet
   * had to be rejected, every rule it had). */
  removedCssRules: number;
  /** The same removals by reason, including declarations taken out of
   * `style=""` attributes. */
  removedCss: Partial<Record<CssRemoval, number>>;
  /** `<a href>` values that were not https/mailto/tel/#fragment/kardo-link:. */
  blockedLinks: number;
  /** `src`/`url()` image references that were not a `kardo-asset:` token. */
  blockedImages: number;
};

export function emptyReport(): SanitizeReport {
  return {
    removedTags: {},
    removedAttributes: {},
    removedCssRules: 0,
    removedCss: {},
    blockedLinks: 0,
    blockedImages: 0,
  };
}

export function bump(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}
