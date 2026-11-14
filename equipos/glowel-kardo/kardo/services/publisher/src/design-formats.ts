import { FormatRegistry } from "@sinclair/typebox";

/**
 * `@sinclair/typebox/value`'s `Value.Check` does not ship any built-in
 * `format` validators — an unregistered format (like the `"uri"` format
 * `@kardo/contracts`'s `PageDesignSchema` uses for a `button`/`image`/text
 * run's `href`, or the `"uuid"` format `CustomHtmlSchema`'s optional
 * `brief.imageRefs` uses) makes every value fail with `Unknown format
 * '...'`, which would make every designed/"modo HTML" publication fail
 * closed. Registering both is a required, one-time, import-time side effect
 * — mirrors `services/customer-api/src/validation/formats.ts`. Must be
 * imported before the first `Value.Check(PageDesignSchema, ...)` /
 * `Value.Check(CustomHtmlSchema, ...)` call (see `index.ts`'s
 * `buildExperience`/`buildCustomHtml`).
 *
 * This is a permissive shape check only, matching customer-api's: it does
 * not by itself reject `javascript:`/`data:`, but `HttpsUrl`'s
 * `pattern: "^https://"` already does that at the schema level, and
 * `requireSafeUrl`'s `normalizePublicHttpsUrl` re-checks every design/
 * custom-HTML link URL this module resolves regardless (see `buildDesign`/
 * `buildCustomHtml` in `index.ts`).
 */
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

if (!FormatRegistry.Has("uuid")) {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  FormatRegistry.Set("uuid", (value) => uuidPattern.test(value));
}
