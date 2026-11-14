import { FormatRegistry } from "@sinclair/typebox";

/**
 * `@sinclair/typebox/value`'s `Value.Check` does not ship any built-in
 * `format` validators — an unregistered format (like the `"uri"` and
 * `"uuid"` formats `@kardo/contracts` schemas use throughout) makes every
 * value fail with `Unknown format '...'`, which would make
 * `validateExperienceContent` reject *all* content, safe or not. Registering
 * the small set of formats this contract package actually uses is a
 * required, one-time step — this module's only job is that registration,
 * as an import-time side effect. Every module that calls `Value.Check`
 * against a `@kardo/contracts` schema must import this module first.
 *
 * These checks are intentionally permissive shape checks, not the full
 * safety rule: `redirect`/`links`/`profile`/`catalog` URLs are re-validated
 * and normalized afterwards through `@kardo/domain`'s
 * `normalizePublicHttpsUrl`, which is what actually rejects `javascript:`,
 * `data:`, plain `http:` and embedded credentials.
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

if (!FormatRegistry.Has("email")) {
  // A permissive shape check only: `@`, then at least one `.` in the
  // domain part, no whitespace. Real email delivery is Supabase's concern.
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  FormatRegistry.Set("email", (value) => emailPattern.test(value));
}

if (!FormatRegistry.Has("date-time")) {
  FormatRegistry.Set("date-time", (value) => !Number.isNaN(Date.parse(value)));
}

if (!FormatRegistry.Has("date")) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  FormatRegistry.Set(
    "date",
    (value) => datePattern.test(value) && !Number.isNaN(Date.parse(value)),
  );
}
