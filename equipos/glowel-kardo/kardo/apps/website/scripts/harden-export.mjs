// Post-build step for the static export (`out/`), mirroring the panels'
// hardening (scripts/deploy/pages.mjs and the customer-web CSP plugin):
//
// 1. Every HTML page gets a <meta> Content-Security-Policy. A static host has
//    no nonces, so each inline script Next emits (the RSC payload) is allowed
//    by its SHA-256 hash; nothing else inline may run.
// 2. `out/_headers` adds what <meta> cannot express (frame-ancestors, HSTS)
//    plus long-lived caching for hashed assets. Netlify and Cloudflare Pages
//    both read this file.
// 3. The build fails if a production export still points at localhost or
//    contains inline event handlers / javascript: URLs.
// 4. `out/_redirects` answers the site's short addresses (/registro,
//    /activar…) with a 302 that keeps the query (config/redirects.mjs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redirectsFile } from "../config/redirects.mjs";
import { readSiteEnv } from "../config/site-env.mjs";
import {
  contentSecurityPolicy,
  findUnsafeMarkup,
  headersFile,
  injectPolicy,
  inlineScriptHashes,
} from "./csp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "out");
const production = process.env.KARDO_ENV === "production";

if (!fs.existsSync(outDir)) {
  console.error("No existe out/: ejecuta `next build` primero.");
  process.exit(1);
}

const pages = listFiles(outDir).filter((file) => file.endsWith(".html"));
const problems = [];
let hashCount = 0;

for (const file of pages) {
  const relative = path.relative(outDir, file);
  const html = fs.readFileSync(file, "utf8");
  problems.push(
    ...findUnsafeMarkup(html).map((issue) => `${relative}: ${issue}`),
  );
  if (production && /localhost|127\.0\.0\.1/.test(html)) {
    problems.push(
      `${relative}: contiene una URL local en un build de producción`,
    );
  }
  const hashes = inlineScriptHashes(html);
  hashCount += hashes.length;
  fs.writeFileSync(file, injectPolicy(html, contentSecurityPolicy(hashes)));
}

if (problems.length > 0) {
  console.error(
    `harden-export: ${problems.length} problema(s)\n  ${problems.join("\n  ")}`,
  );
  process.exit(1);
}

fs.writeFileSync(path.join(outDir, "_headers"), headersFile());
fs.writeFileSync(
  path.join(outDir, "_redirects"),
  redirectsFile(readSiteEnv(process.env).customerAppUrl),
);
console.log(
  `harden-export: CSP en ${pages.length} páginas (${hashCount} scripts inline con hash), _headers y _redirects escritos.`,
);

/** @param {string} dir @returns {string[]} */
function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}
