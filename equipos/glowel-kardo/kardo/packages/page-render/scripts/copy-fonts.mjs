#!/usr/bin/env node
/**
 * Copies the woff2 webfonts @kardo/page-render serves (ADR 018) from their
 * npm devDependencies into `fonts/`, alongside each family's OFL license
 * text. Run once after `pnpm install` adds/updates one of these packages —
 * the copied files are committed, this script is not part of the build.
 *
 * Every font here is SIL Open Font License (OFL-1.1): `geist` (Vercel, in
 * collaboration with basement.studio) and the Google Fonts families served
 * through Fontsource (DM Sans, Poppins, Playfair Display, Lora, Space
 * Grotesk). Only the latin subset, weights 400/600/700, woff2 — kept small
 * on purpose.
 *
 * `fonts/` also has 9 other Fontsource families (Cormorant Garamond, DM
 * Serif Display, Outfit, Manrope, Montserrat, Bricolage Grotesque, Bebas
 * Neue, Oswald, Caveat): not devDependencies of this package and not copied
 * by this script — `scripts/download-fonts.mjs` fetches those straight from
 * the jsDelivr CDN instead, so this package does not need 9 more
 * `@fontsource/*` packages just to run a copy once. Together, all 15
 * families' woff2 + license files total just under 1 MB (~1.0 MB).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const nodeModules = join(root, "node_modules");
const fontsDir = join(root, "fonts");

/** @type {{ dir: string; license: string; files: { from: string; to: string }[] }[]} */
const jobs = [
  {
    dir: "geist",
    license: join(nodeModules, "geist", "LICENSE.txt"),
    files: [
      { from: "geist-sans/Geist-Regular.woff2", to: "Geist-400.woff2" },
      { from: "geist-sans/Geist-SemiBold.woff2", to: "Geist-600.woff2" },
      { from: "geist-sans/Geist-Bold.woff2", to: "Geist-700.woff2" },
    ].map(({ from, to }) => ({
      from: join(nodeModules, "geist", "dist", "fonts", from),
      to,
    })),
  },
  fontsourceJob("dm-sans", "DMSans"),
  fontsourceJob("poppins", "Poppins"),
  fontsourceJob("playfair-display", "PlayfairDisplay"),
  fontsourceJob("lora", "Lora"),
  fontsourceJob("space-grotesk", "SpaceGrotesk"),
];

function fontsourceJob(pkgSlug, outName) {
  const pkgDir = join(nodeModules, "@fontsource", pkgSlug);
  return {
    dir: pkgSlug,
    license: join(pkgDir, "LICENSE"),
    files: [400, 600, 700].map((weight) => ({
      from: join(pkgDir, "files", `${pkgSlug}-latin-${weight}-normal.woff2`),
      to: `${outName}-${weight}.woff2`,
    })),
  };
}

for (const job of jobs) {
  const outDir = join(fontsDir, job.dir);
  mkdirSync(outDir, { recursive: true });
  for (const file of job.files) {
    if (!existsSync(file.from)) {
      throw new Error(`Missing font source file: ${file.from}`);
    }
    copyFileSync(file.from, join(outDir, file.to));
  }
  if (!existsSync(job.license)) {
    throw new Error(`Missing license file: ${job.license}`);
  }
  writeFileSync(join(outDir, "LICENSE.txt"), readFileSync(job.license));
  console.log(`Copied ${job.files.length} file(s) to fonts/${job.dir}/`);
}
