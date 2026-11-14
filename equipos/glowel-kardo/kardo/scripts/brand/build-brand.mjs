// Builds every Kardo brand file from the two official masters the owner
// delivered on 2026-10-01: Docs/Marca/Kardo.svg (light backgrounds) and
// Docs/Marca/KardoBN.svg (dark backgrounds). Their exact outlines are kept
// (nothing is redrawn): the C2PA metadata is dropped, coordinates are moved
// to a tight box and scaled to 68 units of height, and the 8 outlines are
// split into the wordmark (K, A, R, D) and the symbol (ring, dot and the two
// signal waves), which is the icon.
//
// Writes:
//   Docs/Marca/kardo-logo.svg, kardo-logo-oscuro.svg, kardo-logo-mono.svg
//   Docs/Marca/kardo-icono.svg, kardo-icono-oscuro.svg, kardo-icono-mono.svg
//   Docs/Marca/kardo-favicon.svg
//   packages/page-render/src/brand-paths.ts (public pages: footer, notices)
//   apps/customer-web/src/features/touchpoints/qr/engine/kardo-mark-data.ts
//     (the Kardo mark printed on QR exports)
//   apps/website/src/components/brand-paths.ts (the website's <Logo>)
//
// Usage: node scripts/brand/build-brand.mjs  (then node scripts/stripe/brand-png.mjs
// for the PNGs). Re-run it whenever the masters change.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const marca = path.join(root, "Docs/Marca");

// Union of both masters' outline boxes (measured with getBBox in Chrome),
// rounded outward. Everything is placed relative to it.
const BOX = { x: 224, y: 365, w: 2386, h: 801 };
const ICON_X = 1927; // left edge of the ring, the symbol's own box
const HEIGHT = 68;
const scale = HEIGHT / BOX.h;
const round = (value) => Math.round(value * 100) / 100;

function readMaster(file) {
  const svg = fs
    .readFileSync(path.join(marca, file), "utf8")
    .replace(/<metadata>[\s\S]*?<\/metadata>/, "");
  return [...svg.matchAll(/<path fill="(#[0-9A-Fa-f]{6})" d="([^"]+)"/g)].map(
    ([, fill, d]) => ({ fill: fill.toUpperCase(), d }),
  );
}

/** Absolute M/L/C/Z commands (the only ones the masters use). */
function parse(d) {
  const commands = [];
  for (const [, letter, args] of d.matchAll(/([MLCZ])([^MLCZ]*)/g)) {
    const numbers = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    const size = { M: 2, L: 2, C: 6, Z: 0 }[letter];
    if (size === 0) {
      commands.push(["Z"]);
      continue;
    }
    for (let i = 0; i < numbers.length; i += size)
      commands.push([letter, ...numbers.slice(i, i + size)]);
  }
  return commands;
}

function place(commands, originX) {
  return commands.map(([letter, ...values]) => [
    letter,
    ...values.map((value, i) =>
      round(((i % 2 === 0 ? value - originX : value - BOX.y) * scale)),
    ),
  ]);
}

const toD = (commands) =>
  commands.map(([letter, ...values]) => letter + values.join(" ")).join("");

function minX(commands) {
  return Math.min(...commands.filter((c) => c[0] !== "Z").map((c) => c[1]));
}

/** Splits a master's 8 outlines by their role (by geometry, not order). */
function roles(paths) {
  const parsed = paths.map((p) => ({ ...p, commands: parse(p.d) }));
  const ink = parsed.filter((p) => p.fill === parsed[0].fill);
  const accents = parsed.filter((p) => p.fill !== parsed[0].fill);
  // The ring and the dot share the ink color and sit right of every letter.
  const symbolInk = ink.filter((p) => minX(p.commands) > 1900);
  const letters = ink
    .filter((p) => minX(p.commands) <= 1900)
    .sort((a, b) => minX(a.commands) - minX(b.commands));
  const [ring, dot] = symbolInk.sort((a, b) => b.d.length - a.d.length);
  // The outer wave reaches further right than the inner one.
  const [inner, outer] = accents.sort(
    (a, b) => minX(a.commands) - minX(b.commands),
  );
  if (letters.length !== 4 || !ring || !dot || !inner || !outer)
    throw new Error("Unexpected master structure");
  return { letters, ring, dot, inner, outer };
}

const light = roles(readMaster("Kardo.svg"));
const dark = roles(readMaster("KardoBN.svg"));

const logoWidth = round(BOX.w * scale);
const iconWidth = round((BOX.x + BOX.w - ICON_X) * scale);

function logoParts(set, originX) {
  return {
    letters: set.letters.map((p) => toD(place(p.commands, originX))),
    ring: toD(place(set.ring.commands, originX)),
    dot: toD(place(set.dot.commands, originX)),
    inner: toD(place(set.inner.commands, originX)),
    outer: toD(place(set.outer.commands, originX)),
  };
}

const lightLogo = logoParts(light, BOX.x);
const darkLogo = logoParts(dark, BOX.x);
const lightIcon = logoParts(light, ICON_X);
const darkIcon = logoParts(dark, ICON_X);

const colors = {
  light: { ink: light.ring.fill, inner: light.inner.fill, outer: light.outer.fill },
  dark: { ink: dark.ring.fill, inner: dark.inner.fill, outer: dark.outer.fill },
};

function svgFile(width, body, comment) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="Kardo">
  <!-- ${comment}
       Generado por scripts/brand/build-brand.mjs desde Kardo.svg y KardoBN.svg. -->
${body}
</svg>
`;
}

function paths(parts, palette, withLetters) {
  const rows = [];
  if (withLetters)
    for (const d of parts.letters) rows.push(`  <path fill="${palette.ink}" d="${d}"/>`);
  rows.push(`  <path fill="${palette.ink}" d="${parts.ring}"/>`);
  rows.push(`  <path fill="${palette.ink}" d="${parts.dot}"/>`);
  rows.push(`  <path fill="${palette.outer}" d="${parts.outer}"/>`);
  rows.push(`  <path fill="${palette.inner}" d="${parts.inner}"/>`);
  return rows.join("\n");
}

const mono = { ink: "currentColor", inner: "currentColor", outer: "currentColor" };
const write = (file, content) => fs.writeFileSync(path.join(marca, file), content);

write(
  "kardo-logo.svg",
  svgFile(logoWidth, paths(lightLogo, colors.light, true), "Kardo, logotipo para fondos claros."),
);
write(
  "kardo-logo-oscuro.svg",
  svgFile(logoWidth, paths(darkLogo, colors.dark, true), "Kardo, logotipo para fondos oscuros."),
);
write(
  "kardo-logo-mono.svg",
  svgFile(
    logoWidth,
    paths(lightLogo, mono, true),
    "Kardo, logotipo a una tinta: toma el color del texto (pies de página, impresión, grabado).",
  ),
);
write(
  "kardo-icono.svg",
  svgFile(iconWidth, paths(lightIcon, colors.light, false), "Kardo, símbolo para fondos claros (anillo, punto y señal)."),
);
write(
  "kardo-icono-oscuro.svg",
  svgFile(iconWidth, paths(darkIcon, colors.dark, false), "Kardo, símbolo para fondos oscuros."),
);
write(
  "kardo-icono-mono.svg",
  svgFile(iconWidth, paths(lightIcon, mono, false), "Kardo, símbolo a una tinta (toma el color del texto)."),
);

// Favicon: the symbol centered in a square, with its dark variant for dark
// browser tabs (SVG favicons honor prefers-color-scheme).
const faviconScale = 56 / HEIGHT;
const faviconX = round((64 - iconWidth * faviconScale) / 2);
write(
  "kardo-favicon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Kardo">
  <!-- Kardo, favicon: el símbolo centrado; en pestañas oscuras usa sus colores para fondo oscuro.
       Generado por scripts/brand/build-brand.mjs. -->
  <style>.i{fill:${colors.light.ink}}.o{fill:${colors.light.outer}}.n{fill:${colors.light.inner}}@media (prefers-color-scheme:dark){.i{fill:${colors.dark.ink}}.o{fill:${colors.dark.outer}}.n{fill:${colors.dark.inner}}}</style>
  <g transform="translate(${faviconX} 4) scale(${round(faviconScale * 1000) / 1000})">
    <path class="i" d="${lightIcon.ring}"/>
    <path class="i" d="${lightIcon.dot}"/>
    <path class="o" d="${lightIcon.outer}"/>
    <path class="n" d="${lightIcon.inner}"/>
  </g>
</svg>
`,
);

// Public pages (footer, notices): one source for @kardo/page-render.
fs.writeFileSync(
  path.join(root, "packages/page-render/src/brand-paths.ts"),
  `// Generated by scripts/brand/build-brand.mjs from the official masters in
// Docs/Marca (Kardo.svg, KardoBN.svg). Do not edit by hand: re-run the script.

/** Height of every Kardo outline below, in viewBox units. */
export const KARDO_LOGO_HEIGHT = ${HEIGHT};
/** Width of the full logo (wordmark and symbol). */
export const KARDO_LOGO_WIDTH = ${logoWidth};
/** Width of the symbol alone, placed at x = 0. */
export const KARDO_ICON_WIDTH = ${iconWidth};

export type KardoOutlines = {
  /** K, A, R and D, left to right. */
  letters: readonly string[];
  ring: string;
  dot: string;
  inner: string;
  outer: string;
};

/** The logo's outlines in the logo's box (light master). */
export const kardoLogoOutlines: KardoOutlines = ${JSON.stringify(lightLogo, null, 2)};

/** The symbol's outlines in its own box (light master). */
export const kardoIconOutlines: KardoOutlines = ${JSON.stringify(lightIcon, null, 2)};

/** Official colors of each master. */
export const kardoBrandColors = ${JSON.stringify(colors, null, 2)} as const;
`,
);

// Public website: same outlines (the website does not depend on page-render).
fs.writeFileSync(
  path.join(root, "apps/website/src/components/brand-paths.ts"),
  fs
    .readFileSync(path.join(root, "packages/page-render/src/brand-paths.ts"), "utf8")
    .replace("// Generated by", "// Copy of packages/page-render/src/brand-paths.ts, generated by"),
);

// QR exports: the symbol as path commands for the QR engine.
const markCommands = (set) =>
  ["ring", "dot", "outer", "inner"].map((key) => place(set[key].commands, ICON_X));
const [ring, dot, outer, inner] = markCommands(light);
fs.writeFileSync(
  path.join(root, "apps/customer-web/src/features/touchpoints/qr/engine/kardo-mark-data.ts"),
  `// Generated by scripts/brand/build-brand.mjs from Docs/Marca/Kardo.svg (the
// official symbol: ring, dot and the two signal waves). Do not edit by hand.
import type { PathCommand } from "./types.js";

export const KARDO_MARK_VIEW_WIDTH = ${iconWidth};
export const KARDO_MARK_VIEW_HEIGHT = ${HEIGHT};

export const kardoMarkRing: readonly PathCommand[] = ${JSON.stringify(ring)};
export const kardoMarkDot: readonly PathCommand[] = ${JSON.stringify(dot)};
export const kardoMarkOuterWave: readonly PathCommand[] = ${JSON.stringify(outer)};
export const kardoMarkInnerWave: readonly PathCommand[] = ${JSON.stringify(inner)};
`,
);

// Keep the generated TypeScript in the repo's format (biome).
execFileSync(
  "pnpm",
  [
    "exec",
    "biome",
    "format",
    "--write",
    "packages/page-render/src/brand-paths.ts",
    "apps/customer-web/src/features/touchpoints/qr/engine/kardo-mark-data.ts",
    "apps/website/src/components/brand-paths.ts",
  ],
  { cwd: root, stdio: "ignore" },
);

console.log(`logo ${logoWidth}x${HEIGHT}, icon ${iconWidth}x${HEIGHT}`);
