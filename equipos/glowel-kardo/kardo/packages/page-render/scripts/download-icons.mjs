#!/usr/bin/env node
/**
 * Downloads the inline icon set the `features` design block uses ("Datos
 * clave", motor de 3 bloques), plus the one extra "espacio para foto" icon
 * ("sin banco de fotos", 2026-10-03), straight from the lucide-static CDN
 * release pinned below, and writes `src/feature-icons.ts` (one `<svg>` body
 * per `FeatureIcon` id, see `@kardo/contracts`'s `featureIcons`, plus the
 * placeholder icon) and `src/feature-icons.LICENSE.txt` (the exact ISC
 * license text of that release). Run manually, once, when the icon list
 * changes or needs a refresh to a newer lucide-static release:
 *
 *   node scripts/download-icons.mjs
 *
 * The generated files are committed; this script is not part of the build.
 * Only each icon's inner markup (paths/circles/etc, not lucide's own
 * `<svg>` wrapper, class or stroke-width) is kept — Kardo's own wrapper
 * (`featureIconSvg`, in the generated file) sets viewBox, fill, stroke and
 * stroke-width once for every icon, exactly like this package's other
 * inline icon sets (`icons.ts`).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, "src");

// Pinned exact version (reproducible download); bump deliberately.
const LUCIDE_VERSION = "1.51.0";
const CDN = `https://cdn.jsdelivr.net/npm/lucide-static@${LUCIDE_VERSION}`;

/**
 * `FeatureIcon` id (`@kardo/contracts`'s `featureIcons`) -> lucide-static
 * icon file name. Every id below must stay in sync with that export by
 * hand (this script does not import from `@kardo/contracts` so it can run
 * standalone, like `download-fonts.mjs`).
 */
const iconMap = {
  clock: "clock",
  "map-pin": "map-pin",
  phone: "phone",
  calendar: "calendar",
  truck: "truck",
  bag: "shopping-bag",
  card: "credit-card",
  cash: "banknote",
  wifi: "wifi",
  car: "car",
  paw: "paw-print",
  leaf: "leaf",
  flame: "flame",
  star: "star",
  heart: "heart",
  gift: "gift",
  coffee: "coffee",
  utensils: "utensils",
  wine: "wine",
  beer: "beer",
  cake: "cake-slice",
  "ice-cream": "ice-cream-cone",
  bed: "bed-double",
  pool: "waves",
  scissors: "scissors",
  flower: "flower-2",
  book: "book-open",
  graduation: "graduation-cap",
  stethoscope: "stethoscope",
  shield: "shield-check",
  check: "circle-check",
  award: "award",
  users: "users",
  home: "house",
  key: "key-round",
  music: "music",
  baby: "baby",
  accessible: "accessibility",
  globe: "globe",
  chat: "message-circle",
  mail: "mail",
  camera: "camera",
  tag: "tag",
  percent: "badge-percent",
  package: "package",
  sun: "sun",
  snowflake: "snowflake",
  dumbbell: "dumbbell",
};

/** One extra icon, outside the `FeatureIcon` closed set: the "espacio para
 * foto" placeholder (image/gallery blocks and Menú/Catálogo/featuredItems
 * item photos with no picture yet, "sin banco de fotos", 2026-10-03). */
const PLACEHOLDER_ICON = "image-plus";

async function fetchSvgInner(name) {
  const url = `${CDN}/icons/${name}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);
  const text = await res.text();
  const match = text.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/);
  if (!match) throw new Error(`Could not parse svg body: ${url}`);
  // Collapse the pretty-printed source to one line, trimming indentation.
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("");
}

async function fetchLicense() {
  const url = `${CDN}/LICENSE`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);
  const text = await res.text();
  if (!text.includes("ISC License"))
    throw new Error(`Does not look like the ISC license text: ${url}`);
  return text;
}

const entries = Object.entries(iconMap);
const bodies = {};
for (const [id, lucideName] of entries) {
  bodies[id] = await fetchSvgInner(lucideName);
  console.log(`Fetched ${id} (lucide: ${lucideName})`);
}
const placeholderBody = await fetchSvgInner(PLACEHOLDER_ICON);
console.log(`Fetched placeholder icon (lucide: ${PLACEHOLDER_ICON})`);
const license = await fetchLicense();

mkdirSync(srcDir, { recursive: true });
writeFileSync(join(srcDir, "feature-icons.LICENSE.txt"), license);

const header = `// ---------------------------------------------------------------------------
// GENERATED FILE. Do not edit by hand — run \`node scripts/download-icons.mjs\`.
//
// Inline icon set for the \`features\` design block ("Datos clave", motor de
// 3 bloques). Every icon here comes from lucide-static v${LUCIDE_VERSION}
// (https://lucide.dev), ISC license (full text alongside this file, in
// \`feature-icons.LICENSE.txt\`). Only the inner markup of each lucide icon is
// kept; \`featureIconSvg\` wraps it in Kardo's own fixed attributes so every
// icon shares one stroke width and inherits the page's accent color via
// \`currentColor\`, exactly like this package's other inline icon sets
// (see \`icons.ts\`).
// ---------------------------------------------------------------------------

import type { FeatureIcon } from "@kardo/contracts";

const iconBodies: Record<FeatureIcon, string> = {
`;

const body = entries
  .map(([id]) => `  "${id}": ${JSON.stringify(bodies[id])},`)
  .join("\n");

const footer = `
};

/** One \`<svg>\` per \`FeatureIcon\`, 24x24, stroke-based, \`currentColor\`
 * throughout (inherits the page's accent) — the same shape as this
 * package's other inline icons (see \`icons.ts\`'s \`iconOpen\`). Decorative
 * only: callers mark it \`aria-hidden\` at the usage site is unnecessary,
 * it is already baked in here. */
export function featureIconSvg(icon: FeatureIcon): string {
  return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">\${iconBodies[icon]}</svg>\`;
}

const placeholderIconBody = ${JSON.stringify(placeholderBody)};

/** "espacio para foto" icon ("sin banco de fotos", 2026-10-03): lucide's
 * \`image-plus\`, same wrapper/stroke as \`featureIconSvg\`. Used by
 * \`placeholder.ts\` wherever a block or item has no photo yet. */
export function placeholderIconSvg(): string {
  return \`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">\${placeholderIconBody}</svg>\`;
}
`;

writeFileSync(join(srcDir, "feature-icons.ts"), header + body + footer);
console.log(
  `Wrote feature-icons.ts (${entries.length} icons) and feature-icons.LICENSE.txt`,
);
