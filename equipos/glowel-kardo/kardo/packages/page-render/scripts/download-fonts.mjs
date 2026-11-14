#!/usr/bin/env node
/**
 * Downloads the 9 extra webfont families @kardo/page-render serves (see
 * `src/fonts.ts`) straight from the jsDelivr CDN, instead of the
 * node_modules copy `copy-fonts.mjs` uses for the first six: adding 9 more
 * `@fontsource/*` devDependencies just to run that script once was not
 * worth the weight, and these families change rarely. Saves each family's
 * latin-subset woff2 files and OFL license text into `fonts/`, using the
 * same `<NombreSinEspacios>-<peso>.woff2` naming pattern.
 *
 * Run manually, once, when a family here needs to be added, re-downloaded
 * or refreshed to a newer Fontsource release — the downloaded files are
 * committed, this script is not part of the build:
 *
 *   node scripts/download-fonts.mjs
 *
 * Every family here is SIL Open Font License (OFL-1.1), served through
 * Fontsource (the Google Fonts families Fontsource packages). Only the
 * latin subset, woff2, kept small on purpose (see the budget note in
 * `copy-fonts.mjs`'s header).
 *
 * Two families (DM Serif Display, Bebas Neue) publish only a 400 weight on
 * Fontsource: their job lists `sourceWeights: [400]` with `weights`
 * including 600 and 700, so those extra weights reuse the one published
 * file instead of inventing a fake bold (the browser would otherwise
 * synthesize one at 600/700, which this avoids).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fontsDir = join(root, "fonts");
const CDN = "https://cdn.jsdelivr.net/npm/@fontsource";

/**
 * @param {string} pkg Fontsource package slug (npm name after `@fontsource/`).
 * @param {string} outName File-name prefix, matching copy-fonts.mjs's style
 *   (e.g. "CormorantGaramond" -> "CormorantGaramond-400.woff2").
 * @param {number[]} sourceWeights Weights actually published for this
 *   family on Fontsource.
 * @param {number[]} [weights] Weights to write to `fonts/`; defaults to
 *   `sourceWeights`. A weight not in `sourceWeights` reuses that family's
 *   only published weight (always the case here: both families this
 *   applies to publish exactly one weight).
 */
function fontsourceJob(pkg, outName, sourceWeights, weights) {
  return {
    pkg,
    dir: pkg,
    outName,
    weights: (weights ?? sourceWeights).map((weight) => ({
      weight,
      sourceWeight: sourceWeights.includes(weight) ? weight : sourceWeights[0],
    })),
  };
}

const jobs = [
  fontsourceJob("cormorant-garamond", "CormorantGaramond", [400, 600, 700]),
  fontsourceJob("dm-serif-display", "DMSerifDisplay", [400], [400, 600, 700]),
  fontsourceJob("outfit", "Outfit", [400, 600, 700]),
  fontsourceJob("manrope", "Manrope", [400, 600, 700]),
  fontsourceJob("montserrat", "Montserrat", [400, 600, 700]),
  fontsourceJob("bricolage-grotesque", "BricolageGrotesque", [400, 600, 700]),
  fontsourceJob("bebas-neue", "BebasNeue", [400], [400, 600, 700]),
  fontsourceJob("oswald", "Oswald", [400, 600, 700]),
  fontsourceJob("caveat", "Caveat", [400, 600, 700]),
];

async function fetchWoff2(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const signature = bytes.subarray(0, 4).toString("ascii");
  if (signature !== "wOF2")
    throw new Error(`Not a woff2 file (got "${signature}"): ${url}`);
  return bytes;
}

async function fetchLicense(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);
  const text = await res.text();
  if (!text.toLowerCase().includes("open font license"))
    throw new Error(`Does not look like an OFL license text: ${url}`);
  return text;
}

for (const job of jobs) {
  const outDir = join(fontsDir, job.dir);
  mkdirSync(outDir, { recursive: true });
  const cache = new Map();
  for (const { weight, sourceWeight } of job.weights) {
    let bytes = cache.get(sourceWeight);
    if (!bytes) {
      const url = `${CDN}/${job.pkg}/files/${job.pkg}-latin-${sourceWeight}-normal.woff2`;
      bytes = await fetchWoff2(url);
      cache.set(sourceWeight, bytes);
    }
    writeFileSync(join(outDir, `${job.outName}-${weight}.woff2`), bytes);
  }
  const license = await fetchLicense(`${CDN}/${job.pkg}/LICENSE`);
  writeFileSync(join(outDir, "LICENSE.txt"), license);
  console.log(`Downloaded ${job.weights.length} file(s) to fonts/${job.dir}/`);
}
