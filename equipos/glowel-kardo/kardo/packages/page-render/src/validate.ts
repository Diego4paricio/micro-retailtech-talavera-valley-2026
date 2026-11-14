import {
  checkDesign,
  type DesignableExperienceType,
  type DesignCheckContext,
  designHtmlAssetRefs,
  designImageRefs,
  type PageDesign,
  PageDesignSchema,
} from "@kardo/contracts";
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

// `Value.Check` does not ship any built-in `format` validators — an
// unregistered format (like the `"uri"` format `HttpsUrl` in
// `@kardo/contracts`'s design schema uses) makes every value fail with
// `Unknown format '...'`. Registering it is a required, one-time,
// import-time side effect — mirrors
// `services/customer-api/src/validation/formats.ts`. This is a permissive
// shape check only: it does not by itself reject `javascript:`/`data:`, but
// `HttpsUrl`'s `pattern: "^https://"` already does, and this module never
// trusts a URL beyond that pattern either way (see the module doc below).
if (!FormatRegistry.Has("uri")) {
  FormatRegistry.Set("uri", (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  });
}

const sha256Pattern = /^[a-f0-9]{64}$/;

/**
 * Strict validation of a design as it comes out of a published snapshot (or
 * any other untrusted source, e.g. a draft round-tripped through Postgres):
 *
 *  1. Structural shape against `PageDesignSchema` (TypeBox `Value.Check`).
 *  2. The cross-field rules `Value.Check` cannot express (`checkDesign`):
 *     bound blocks allowed/required for `type`, layout/column-count match,
 *     id uniqueness against `contentItemIds`, and the size/count limits.
 *     `context` carries whatever else `checkDesign` needs to cross-check
 *     (today only `menuSectionIds`, for a `menu` block's `sectionIds`).
 *  3. Every `imageRef` the design uses (`designImageRefs`) is a 64-hex sha256
 *     that is actually present in `imageHashes` — the same rule
 *     `services/resolver/src/snapshot.ts`'s `isTheme`/`isMenuItem` apply to a
 *     theme/menu image, so a design can never reference an asset that was
 *     not itself published alongside this experience.
 *  4. Every `kardo-asset:<ref>` an `html` block's source carries
 *     (`designHtmlAssetRefs`, a best-effort text scan — the block's actual
 *     safety comes from re-sanitizing its source at render time, mirroring
 *     `customHtml`) is also a 64-hex sha256 present in `imageHashes`.
 *
 * Returns the validated `PageDesign`, or `null` on any failure — the caller
 * (the Resolver) treats a snapshot that fails this as unavailable, exactly
 * like every other re-validation it already performs on its own.
 */
export function parsePublishedDesign(
  value: unknown,
  type: DesignableExperienceType,
  imageHashes: ReadonlySet<string>,
  contentItemIds: readonly string[],
  context: DesignCheckContext = {},
): PageDesign | null {
  if (!Value.Check(PageDesignSchema, value)) return null;
  const design = value as PageDesign;
  if (checkDesign(type, design, contentItemIds, context).length > 0)
    return null;
  for (const ref of designImageRefs(design)) {
    if (!sha256Pattern.test(ref) || !imageHashes.has(ref)) return null;
  }
  for (const ref of designHtmlAssetRefs(design)) {
    if (!sha256Pattern.test(ref) || !imageHashes.has(ref)) return null;
  }
  return design;
}
