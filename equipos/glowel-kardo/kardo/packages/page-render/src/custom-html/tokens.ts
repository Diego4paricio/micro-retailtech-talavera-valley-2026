// ---------------------------------------------------------------------------
// Shared token shapes for "modo HTML" (ADR 018, extended 2026-09-29):
// `kardo-link:<id>` (a tracked `<a href>`, assigned during `prepareCustomHtml`)
// and `kardo-asset:<ref>` (a library image, `<uuid>` while authoring,
// `<sha256>` once published — mirrors `@kardo/contracts`'s design `ImageRef`).
// Used by both the sanitizer (packages/page-render/src/custom-html/sanitize-*)
// and the renderer (render.ts) so both sides agree on the exact token shape.
// ---------------------------------------------------------------------------

export const KARDO_LINK_PREFIX = "kardo-link:";
export const KARDO_ASSET_PREFIX = "kardo-asset:";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
/** Ids `prepareCustomHtml` assigns to tracked links: `h1`, `h2`, … */
const linkIdPattern = /^h[1-9][0-9]*$/;

/** An asset reference is valid whether it is an authoring-time asset uuid or
 * an already-published content hash — the same two forms `ImageRef` in
 * `@kardo/contracts`'s design schema accepts. */
export function isAssetRef(value: string): boolean {
  return uuidPattern.test(value) || sha256Pattern.test(value);
}

export function isSha256(value: string): boolean {
  return sha256Pattern.test(value);
}

export function isLinkId(value: string): boolean {
  return linkIdPattern.test(value);
}

/** Extracts the id from a `kardo-link:<id>` token, or `null` if `value` is
 * not that exact shape. */
export function parseKardoLinkToken(value: string): string | null {
  if (!value.startsWith(KARDO_LINK_PREFIX)) return null;
  const id = value.slice(KARDO_LINK_PREFIX.length);
  return isLinkId(id) ? id : null;
}

export function kardoLinkToken(id: string): string {
  return `${KARDO_LINK_PREFIX}${id}`;
}

/** Extracts the ref from a `kardo-asset:<ref>` token, or `null` if `value` is
 * not that exact shape (only ever a bare token — never quoted, never with
 * extra path segments). */
export function parseKardoAssetToken(value: string): string | null {
  if (!value.startsWith(KARDO_ASSET_PREFIX)) return null;
  const ref = value.slice(KARDO_ASSET_PREFIX.length);
  return isAssetRef(ref) ? ref : null;
}

export function kardoAssetToken(ref: string): string {
  return `${KARDO_ASSET_PREFIX}${ref}`;
}

/** Finds every distinct `kardo-asset:<ref>` token in `text` (html or css
 * source), regardless of surrounding quoting — used defensively by the
 * Publisher to resolve every referenced asset before it trusts anything
 * about the source's structure (mirrors `designImageRefs`/
 * `collectDesignAssetIds` in `@kardo/contracts`/`services/publisher`). */
export function findKardoAssetTokens(text: string): string[] {
  const found = new Set<string>();
  const pattern = /kardo-asset:([0-9a-f-]{32,64})/gi;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match) {
    const ref = match[1];
    if (ref && isAssetRef(ref.toLowerCase())) found.add(ref.toLowerCase());
    match = pattern.exec(text);
  }
  return [...found];
}
