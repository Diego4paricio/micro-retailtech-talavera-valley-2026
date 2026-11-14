import { CUSTOM_HTML_LIMITS } from "@kardo/contracts";
import { prepareCustomHtml } from "./prepare.js";
import { isLinkId, isSha256 } from "./tokens.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048)
    return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && !parsed.username && !parsed.password;
}

function isLinkEntry(value: unknown): value is { id: string; url: string } {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isLinkId(value.id) &&
    isHttpsUrl(value.url)
  );
}

function findReferencedLinkIds(html: string): Set<string> {
  const ids = new Set<string>();
  const pattern = /kardo-link:(h[1-9][0-9]*)/g;
  let match: RegExpExecArray | null = pattern.exec(html);
  while (match) {
    const id = match[1];
    if (id) ids.add(id);
    match = pattern.exec(html);
  }
  return ids;
}

function findAssetRefs(text: string): string[] {
  const refs: string[] = [];
  const pattern = /kardo-asset:([a-f0-9]{64})/g;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    const ref = match[1];
    if (ref) refs.push(ref);
    match = pattern.exec(text);
  }
  return refs;
}

/**
 * Resolver snapshot check for a published `customHtml` value (ADR 018,
 * extended 2026-09-29). `value` must already be `prepareCustomHtml`'s own
 * output shape: `{ html, css, links }`. Validates, in order:
 *
 *  1. Shape: `html`/`css` within the contract's size limits, `links` a
 *     bounded array of `{id, url}` with a valid tracked-link id and a real
 *     https URL (no credentials), ids unique.
 *  2. Idempotency: re-running `prepareCustomHtml` on `{html, css}` must
 *     produce byte-identical `html`/`css` — if sanitizing again changes
 *     anything, the stored value was never clean sanitizer output (tampered,
 *     corrupted, or published by a build that skipped `prepareCustomHtml`)
 *     and the whole thing is rejected. `prepareCustomHtml` cannot itself
 *     reconstruct `links` from already-tokenized `kardo-link:<id>` hrefs (it
 *     has no way to recover the URL behind an id it did not just mint), so
 *     `links` is cross-checked directly against `html` here instead: every
 *     `kardo-link:<id>` referenced in `html` must have exactly one matching
 *     entry in `links`, and vice versa.
 *  3. Every `kardo-asset:<ref>` in `html`/`css` is a 64-hex sha256 present in
 *     `imageHashes` (the snapshot's own published image assets — mirrors
 *     `parsePublishedDesign`'s same rule for a design's `imageRef`s).
 *
 * Returns `null` on any failure — the caller (the Resolver) then treats
 * `customHtml` as absent, exactly like an invalid `design`.
 */
export function parsePublishedCustomHtml(
  value: unknown,
  imageHashes: ReadonlySet<string>,
): { html: string; css: string; links: { id: string; url: string }[] } | null {
  if (!isRecord(value)) return null;
  const { html, css, links } = value;
  if (typeof html !== "string" || html.length > CUSTOM_HTML_LIMITS.html)
    return null;
  if (typeof css !== "string" || css.length > CUSTOM_HTML_LIMITS.css)
    return null;
  if (!Array.isArray(links) || links.length > 500 || !links.every(isLinkEntry))
    return null;
  const linkList = links as { id: string; url: string }[];
  const linkIds = new Set<string>();
  for (const link of linkList) {
    if (linkIds.has(link.id)) return null;
    linkIds.add(link.id);
  }

  const prepared = prepareCustomHtml({ html, css });
  if (prepared.html !== html || prepared.css !== css) return null;

  const referencedIds = findReferencedLinkIds(html);
  if (referencedIds.size !== linkIds.size) return null;
  for (const id of referencedIds) if (!linkIds.has(id)) return null;

  for (const ref of [...findAssetRefs(html), ...findAssetRefs(css)]) {
    if (!isSha256(ref) || !imageHashes.has(ref)) return null;
  }

  return { html, css, links: linkList };
}
