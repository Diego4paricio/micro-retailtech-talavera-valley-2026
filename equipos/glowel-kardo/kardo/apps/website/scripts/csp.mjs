import { createHash } from "node:crypto";

// Inline <script> elements without a src attribute. Next escapes "</script>"
// inside its payload (as </script>), so the lazy match is safe.
const inlineScript = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

/**
 * SHA-256 source expressions for every non-empty inline script, in order.
 * @param {string} html
 */
export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const match of html.matchAll(inlineScript)) {
    const body = match[1] ?? "";
    if (body.length === 0) continue;
    hashes.add(
      `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`,
    );
  }
  return [...hashes];
}

/**
 * The page may load only its own scripts, styles, fonts and images. Inline
 * styles stay allowed because server-rendered `style` attributes carry the
 * initial state of a few illustrations; no inline script runs without a hash.
 * @param {string[]} scriptHashes
 */
export function contentSecurityPolicy(scriptHashes) {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Inserts the policy right after <meta charset>, before any script.
 * @param {string} html
 * @param {string} policy
 */
export function injectPolicy(html, policy) {
  if (html.includes('http-equiv="Content-Security-Policy"')) {
    throw new Error("La página ya tiene una CSP: ¿se ejecutó dos veces?");
  }
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}"/>`;
  const charset = /<meta charSet="utf-8"\/?>|<meta charset="utf-8"\/?>/i;
  if (charset.test(html))
    return html.replace(charset, (tag) => `${tag}${meta}`);
  if (!html.includes("<head>")) throw new Error("Página sin <head>.");
  return html.replace("<head>", `<head>${meta}`);
}

/**
 * Markup a strict CSP would block anyway, reported so it never ships.
 * @param {string} html
 */
export function findUnsafeMarkup(html) {
  const issues = [];
  if (/\son[a-z]+\s*=\s*["']/i.test(html))
    issues.push("manejador de eventos inline");
  if (/href\s*=\s*["']\s*javascript:/i.test(html))
    issues.push("URL javascript:");
  return issues;
}

/** Response headers for every path, plus caching for hashed build assets. */
export function headersFile() {
  const shared = [
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "X-Frame-Options: DENY",
    "Content-Security-Policy: frame-ancestors 'none'",
    "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy: same-origin",
    "Strict-Transport-Security: max-age=31536000; includeSubDomains",
  ];
  return [
    "/*",
    ...shared.map((line) => `  ${line}`),
    "/_next/static/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    // Next exports the Open Graph image without an extension.
    "/opengraph-image",
    "  Content-Type: image/png",
    "",
  ].join("\n");
}
