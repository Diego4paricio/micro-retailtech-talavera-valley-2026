// ---------------------------------------------------------------------------
// Defensive href/URL checks applied at render time, independent of whatever
// validation ran upstream (`parsePublishedDesign` on the Resolver, or the
// customer-api's `validateExperienceContent`). The panel's preview renders
// the *draft* design directly — content that has never been through either
// of those — so this package cannot assume every string it is handed is
// already a safe URL. Every href this package writes goes through
// `safeHref`; every `url(...)` it writes into generated CSS goes through
// `safeCssUrl`. Both fail closed: on anything suspicious they return `null`
// and the caller renders without a link/background rather than ever falling
// back to a placeholder like `"#"` (which would still be a clickable,
// same-page no-op — silently dropping the link is the safer failure mode).
// ---------------------------------------------------------------------------

/**
 * A same-origin relative path: exactly one leading `/`, whose second
 * character is neither `/` nor `\` (browsers normalize a leading `/\` or
 * `//` into a scheme-relative `//host/...` URL, which can navigate
 * off-origin) and which contains no backslash or whitespace/control
 * character anywhere else (a backslash or an embedded tab/newline is also
 * normalized away by browsers before navigation, which could otherwise turn
 * what looks like a safe path into `//evil.example`).
 */
const relativePathPattern = /^\/(?![/\\])[^\s\\]*$/;

/**
 * `href` is safe to write into an `<a href="...">`/`<img src="...">` when:
 *  - it is a same-origin relative path (see `relativePathPattern` — never a
 *    `//`/`/\`-prefixed, scheme-relative URL, which can still navigate
 *    off-origin); or
 *  - it parses as an absolute URL with no embedded `username`/`password`
 *    and a protocol of `https:` (always allowed), or — only when
 *    `allow === "social"` — `mailto:`/`tel:` (the two non-https schemes the
 *    Resolver's own social-network redirect already produces for the
 *    `email`/`phone` networks).
 *
 * Anything else (`javascript:`, `data:`, `vbscript:`, malformed input,
 * credentials embedded in the URL, …) returns `null`.
 */
export function safeHref(
  url: string,
  allow: "https" | "social",
): string | null {
  if (relativePathPattern.test(url)) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password) return null;
  if (parsed.protocol === "https:") return url;
  if (
    allow === "social" &&
    (parsed.protocol === "mailto:" || parsed.protocol === "tel:")
  )
    return url;
  return null;
}

/**
 * A resolved image URL is safe to embed in a CSS `url("...")` only when it
 * cannot break out of the quoted string or the surrounding declaration: no
 * quote, parenthesis, backslash or line break. Unlike `safeHref` this does
 * not restrict scheme — `RenderContext.resolveImage` may legitimately return
 * a `blob:`/`data:` URL while the panel previews a not-yet-uploaded image —
 * it only guards the CSS syntax itself. Returns `null` (caller falls back to
 * a solid color) rather than trying to escape a suspicious value.
 */
export function safeCssUrl(url: string): string | null {
  if (/["'()\\\r\n]/.test(url)) return null;
  return `url("${url}")`;
}
