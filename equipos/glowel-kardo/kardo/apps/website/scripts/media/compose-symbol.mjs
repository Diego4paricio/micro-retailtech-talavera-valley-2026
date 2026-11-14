// Local tool, not part of the build: puts the real Kardo symbol
// (Docs/Marca/kardo-icono.svg with the colors of kardo-logo-oscuro.svg) on
// a photo. Image models draw wrong logos, so generate the piece plain and
// compose the symbol here. It can also paint something out first (a logo a
// model drew anyway, a fake QR) with a fit of the surface around it.
//
// It can also compose an arbitrary business mark (a name plus the generic
// Nfc icon) instead of the Kardo symbol, e.g. to turn a piece that used to
// read as "Kardo hardware" into that business's own NFC piece (ADR 012:
// Kardo sells no hardware). Same erase, same perspective axes, same soften
// and grain, so it looks printed or engraved rather than pasted.
//
//   node scripts/media/compose-symbol.mjs scripts/media/example-job.json
//
// Job file (pixel coordinates of the source image):
// {
//   "source": "path/to/photo.png",          // relative to the job file
//   "output": "../../public/media/x.webp",  // relative to the job file
//   "outputWidth": 900,                     // optional resize at the end
//   "patches": [{
//     "erase": {                            // optional
//       "mask": [{ "cx", "cy", "rx", "ry", "rot" } | { "rect": [x0, y0, x1, y1] }],
//       "feather": 12,
//       "degree": 2,                        // 1: plane, 2: quadratic surface
//       "sample": { "ellipse": {...} | "rect": [...], "polygon": [[x, y]...],
//                   "exclude": [[x0, y0, x1, y1]], "minLum": 0-255 }
//     },
//     "symbol": {                           // optional: the real Kardo symbol
//       "cx", "cy",                         // where the symbol's center goes
//       "scale",                            // px per unit of the symbol viewBox (Docs/Marca/kardo-icono-oscuro.svg)
//       "rotate": 0, "squash": 1,           // squash < 1 for a surface seen at an angle
//       "ex": [x, y], "ey": [x, y],         // or explicit axes (perspective by eye)
//       "glow": { "sigma": 14, "strength": 0.8 }, "soften": 0.6
//     },
//     "brand": {                            // optional: a business name + icon
//       "cx", "cy",                         // where the local box's anchor goes
//       "scale",                            // px per local unit of "box"
//       "rotate": 0, "squash": 1,           // same axes as "symbol"
//       "ex": [x, y], "ey": [x, y],         // or explicit axes (perspective by eye)
//       "box": [w, h],                      // local design box, in local units
//       "anchor": [x, y],                   // optional, default box center
//       "items": [                          // laid out in the local box
//         { "type": "icon", "x", "y", "size", "color": "#F7F5F0" },
//         { "type": "text", "x", "y", "text", "fontFamily", "fontSize",
//           "fontWeight": 400, "fontStyle": "normal", "anchor": "middle",
//           "color": "#F7F5F0", "letterSpacing": 0 }
//       ],
//       "soften": 0.6
//     }
//   }]
// }
// It prints where it left a before/after crop for review.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
// sharp comes with Next.js; resolve it from there instead of adding it.
const sharp = createRequire(require.resolve("next/package.json"))("sharp");

// The official symbol (2026-10-01 masters), dark-background colors, read
// from Docs/Marca so this tool never keeps its own copy of the drawing.
const SYMBOL_FILE = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../../../Docs/Marca/kardo-icono-oscuro.svg",
);
const SYMBOL_SOURCE = readFileSync(SYMBOL_FILE, "utf8");
const [, SYMBOL_WIDTH, SYMBOL_HEIGHT] = SYMBOL_SOURCE.match(
  /viewBox="0 0 ([\d.]+) ([\d.]+)"/,
).map(Number);
const CENTER = [SYMBOL_WIDTH / 2, SYMBOL_HEIGHT / 2];
const SYMBOL_PATHS = [...SYMBOL_SOURCE.matchAll(/<path[^>]*\/>/g)].map(
  ([tag]) => tag,
);
/** The symbol's paths; `override` paints every outline one color. */
const shapes = (override) =>
  SYMBOL_PATHS.map((tag) =>
    override ? tag.replace(/fill="[^"]*"/, `fill="${override}"`) : tag,
  ).join("\n");

const radians = (degrees) => (degrees * Math.PI) / 180;

function axes(symbol) {
  if (symbol.ex && symbol.ey) return { ex: symbol.ex, ey: symbol.ey };
  const angle = radians(symbol.rotate ?? 0);
  const squash = symbol.squash ?? 1;
  return {
    ex: [symbol.scale * Math.cos(angle), symbol.scale * Math.sin(angle)],
    ey: [
      -symbol.scale * squash * Math.sin(angle),
      symbol.scale * squash * Math.cos(angle),
    ],
  };
}

/** `center` is the local point (in the patch's own local coordinates) that
 *  lands on (patch.cx, patch.cy): CENTER for the fixed symbol box, or a
 *  brand's own box center (or explicit anchor). */
function matrix(patch, center) {
  const { ex, ey } = axes(patch);
  const e = patch.cx - (ex[0] * center[0] + ey[0] * center[1]);
  const f = patch.cy - (ex[1] * center[0] + ey[1] * center[1]);
  return `matrix(${ex[0]} ${ex[1]} ${ey[0]} ${ey[1]} ${e} ${f})`;
}

const NFC_ICON = [
  "M6 8.32a7.43 7.43 0 0 1 0 7.36",
  "M9.46 6.21a11.76 11.76 0 0 1 0 11.58",
  "M12.91 4.1a15.91 15.91 0 0 1 .01 15.8",
  "M16.37 2a20.16 20.16 0 0 1 0 20",
];

function escapeXml(text) {
  return text.replace(
    /[&<>]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char],
  );
}

/** One item of a "brand" patch: a generic Nfc mark (lucide's "Nfc", ISC
 *  license) or a line of text, both in local box coordinates. */
function brandItem(item) {
  const color = item.color ?? "#EEEFEA";
  if (item.type === "icon") {
    const scale = item.size / 24;
    return `<g transform="translate(${item.x} ${item.y}) scale(${scale}) translate(-12 -12)" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${NFC_ICON.map((d) => `<path d="${d}"/>`).join("")}</g>`;
  }
  if (item.type === "text") {
    const spacing = item.letterSpacing
      ? ` letter-spacing="${item.letterSpacing}"`
      : "";
    return `<text x="${item.x}" y="${item.y}" text-anchor="${item.anchor ?? "middle"}" font-family="${item.fontFamily}" font-weight="${item.fontWeight ?? 400}" font-style="${item.fontStyle ?? "normal"}" font-size="${item.fontSize}" fill="${color}"${spacing}>${escapeXml(item.text)}</text>`;
  }
  throw new Error(`Unknown brand item type: ${item.type}`);
}

function ellipseDistance(shape, x, y) {
  const angle = radians(shape.rot ?? 0);
  const dx = x - shape.cx;
  const dy = y - shape.cy;
  const u = dx * Math.cos(angle) + dy * Math.sin(angle);
  const v = -dx * Math.sin(angle) + dy * Math.cos(angle);
  return Math.hypot(u / shape.rx, v / shape.ry);
}

function inPolygon(polygon, x, y) {
  let inside = false;
  let previous = polygon[polygon.length - 1];
  for (const point of polygon) {
    const [xi, yi] = point;
    const [xj, yj] = previous;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
    previous = point;
  }
  return inside;
}

/** Gauss-Jordan with partial pivoting, for the small normal equations. */
function solve(matrixA, vector) {
  const n = vector.length;
  const rows = matrixA.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++)
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column]))
        pivot = row;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = rows[row][column] / rows[column][column];
      for (let k = column; k <= n; k++)
        rows[row][k] -= factor * rows[column][k];
    }
  }
  return rows.map((row, index) => row[n] / row[index]);
}

/** Deterministic noise, so a rerun gives the same grain. */
function createNoise() {
  let seed = 7;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return () =>
    Math.sqrt(-2 * Math.log(next() + 1e-12)) * Math.cos(2 * Math.PI * next());
}

function sampleBox(sample) {
  if (sample.rect) {
    const [x0, y0, x1, y1] = sample.rect;
    return {
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      rx: (x1 - x0) / 2,
      ry: (y1 - y0) / 2,
    };
  }
  return sample.ellipse;
}

/** Paints the mask with a robust fit of the surface around it, plus grain. */
function erase(image, width, height, spec, noise) {
  const box = sampleBox(spec.sample);
  const x0 = Math.max(0, Math.floor(box.cx - box.rx - 2));
  const x1 = Math.min(width - 1, Math.ceil(box.cx + box.rx + 2));
  const y0 = Math.max(0, Math.floor(box.cy - box.ry - 2));
  const y1 = Math.min(height - 1, Math.ceil(box.cy + box.ry + 2));
  const luminance = (x, y) => {
    const i = (y * width + x) * 3;
    return (image[i] + image[i + 1] + image[i + 2]) / 3;
  };
  const maskAt = (x, y) => {
    let mask = 0;
    for (const shape of spec.mask) {
      const distance = shape.rect
        ? Math.hypot(
            Math.max(shape.rect[0] - x, 0, x - shape.rect[2]),
            Math.max(shape.rect[1] - y, 0, y - shape.rect[3]),
          )
        : (ellipseDistance(shape, x, y) - 1) * Math.min(shape.rx, shape.ry);
      mask = Math.max(
        mask,
        distance <= 0 ? 1 : Math.max(0, 1 - distance / spec.feather),
      );
    }
    return mask;
  };
  const inRegion = (x, y) =>
    spec.sample.rect
      ? x >= spec.sample.rect[0] &&
        x <= spec.sample.rect[2] &&
        y >= spec.sample.rect[1] &&
        y <= spec.sample.rect[3]
      : ellipseDistance(box, x, y) <= 1;
  const usable = (x, y) =>
    inRegion(x, y) &&
    (!spec.sample.polygon || inPolygon(spec.sample.polygon, x, y)) &&
    !(spec.sample.exclude ?? []).some(
      ([ex0, ey0, ex1, ey1]) => x >= ex0 && x <= ex1 && y >= ey0 && y <= ey1,
    ) &&
    (spec.sample.minLum === undefined || luminance(x, y) >= spec.sample.minLum);
  const plane = spec.degree === 1;
  const basis = (x, y) => {
    const u = (x - box.cx) / box.rx;
    const v = (y - box.cy) / box.ry;
    return plane ? [1, u, v] : [1, u, v, u * u, u * v, v * v];
  };
  const terms = plane ? 3 : 6;

  let points = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (maskAt(x, y) === 0 && usable(x, y)) points.push([x, y]);

  let coefficients = [];
  for (let pass = 0; pass < 3; pass++) {
    const normal = Array.from({ length: terms }, () =>
      new Array(terms).fill(0),
    );
    const rhs = [0, 1, 2].map(() => new Array(terms).fill(0));
    for (const [x, y] of points) {
      const p = basis(x, y);
      const i = (y * width + x) * 3;
      for (let r = 0; r < terms; r++) {
        for (let c = 0; c < terms; c++) normal[r][c] += p[r] * p[c];
        for (let channel = 0; channel < 3; channel++)
          rhs[channel][r] += p[r] * image[i + channel];
      }
    }
    coefficients = rhs.map((vector) => solve(normal, vector));
    const residuals = points.map(([x, y]) => {
      const p = basis(x, y);
      const i = (y * width + x) * 3;
      let total = 0;
      for (let channel = 0; channel < 3; channel++)
        total +=
          image[i + channel] -
          p.reduce(
            (sum, value, k) => sum + value * coefficients[channel][k],
            0,
          );
      return total / 3;
    });
    const sigma = Math.sqrt(
      residuals.reduce((sum, value) => sum + value * value, 0) /
        residuals.length,
    );
    points = points.filter((_, k) => Math.abs(residuals[k]) < 2.5 * sigma + 1);
  }
  const fit = (x, y, channel) =>
    basis(x, y).reduce(
      (sum, value, k) => sum + value * coefficients[channel][k],
      0,
    );

  let grain = 0;
  let count = 0;
  for (const [x, y] of points) {
    if (x + 1 > x1) continue;
    grain += (luminance(x, y) - luminance(x + 1, y)) ** 2;
    count++;
  }
  grain = Math.min(Math.sqrt(grain / Math.max(count, 1) / 2), 5);

  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const mask = maskAt(x, y);
      if (mask === 0) continue;
      const i = (y * width + x) * 3;
      const n = noise() * grain;
      for (let channel = 0; channel < 3; channel++)
        image[i + channel] =
          image[i + channel] * (1 - mask) + (fit(x, y, channel) + n) * mask;
    }
  return box;
}

/** Rasterizes an SVG buffer (straight alpha), softens it to the photo's
 *  focus, and blends it onto `image` with grain, honoring per-pixel alpha.
 *  Shared by the fixed Kardo symbol and arbitrary brand content. */
async function paintLayer(image, width, height, svg, soften, noise) {
  const rendered = await sharp(svg).ensureAlpha().raw().toBuffer();
  const premultiplied = Buffer.alloc(rendered.length);
  for (let p = 0; p < width * height; p++) {
    const alpha = rendered[p * 4 + 3] / 255;
    for (let channel = 0; channel < 3; channel++)
      premultiplied[p * 4 + channel] = Math.round(
        rendered[p * 4 + channel] * alpha,
      );
    premultiplied[p * 4 + 3] = rendered[p * 4 + 3];
  }
  const layer = await sharp(premultiplied, {
    raw: { width, height, channels: 4 },
  })
    .blur(soften ?? 0.6)
    .raw()
    .toBuffer();
  for (let p = 0; p < width * height; p++) {
    const alpha = layer[p * 4 + 3] / 255;
    if (alpha === 0) continue;
    const grain = 1 + noise() * 0.012;
    for (let channel = 0; channel < 3; channel++)
      image[p * 3 + channel] =
        image[p * 3 + channel] * (1 - alpha) + layer[p * 4 + channel] * grain;
  }
}

/** The symbol, softened to the photo's focus and optionally glowing. */
async function compose(image, width, height, symbol, noise) {
  const svg = (content) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="${matrix(symbol, CENTER)}">${content}</g></svg>`,
    );
  if (symbol.glow) {
    const glow = await sharp(svg(shapes("#fff")))
      .flatten({ background: "#000" })
      .greyscale()
      .blur(symbol.glow.sigma)
      .raw()
      .toBuffer();
    const aqua = [78, 195, 206];
    for (let p = 0; p < width * height; p++) {
      const g = (glow[p] / 255) * symbol.glow.strength;
      if (g < 0.002) continue;
      for (let channel = 0; channel < 3; channel++)
        image[p * 3 + channel] =
          255 -
          (255 - image[p * 3 + channel]) * (1 - (g * aqua[channel]) / 255);
    }
  }
  await paintLayer(image, width, height, svg(shapes()), symbol.soften, noise);
}

/** A business name plus a generic icon (e.g. Nfc), laid out in a small
 *  local box and mapped onto the photo with the same perspective axes as
 *  the symbol, so it follows the piece's tilt like a printed mark. */
async function composeBrand(image, width, height, brand, noise) {
  const [boxWidth, boxHeight] = brand.box;
  const center = brand.anchor ?? [boxWidth / 2, boxHeight / 2];
  const content = brand.items.map(brandItem).join("");
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="${matrix(brand, center)}">${content}</g></svg>`,
  );
  await paintLayer(image, width, height, svg, brand.soften, noise);
}

const jobPath = process.argv[2];
if (!jobPath) {
  console.error("Uso: node scripts/media/compose-symbol.mjs <trabajo.json>");
  process.exit(1);
}
const job = JSON.parse(readFileSync(jobPath, "utf8"));
const base = path.dirname(path.resolve(jobPath));
const source = path.resolve(base, job.source);
const output = path.resolve(base, job.output);
const noise = createNoise();

const { data, info } = await sharp(source)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const image = Float32Array.from(data);
const boxes = [];
for (const patch of job.patches) {
  if (patch.erase)
    boxes.push(erase(image, info.width, info.height, patch.erase, noise));
  if (patch.symbol) {
    await compose(image, info.width, info.height, patch.symbol, noise);
    const reach = patch.symbol.scale * 40;
    boxes.push({
      cx: patch.symbol.cx,
      cy: patch.symbol.cy,
      rx: reach,
      ry: reach,
    });
  }
  if (patch.brand) {
    await composeBrand(image, info.width, info.height, patch.brand, noise);
    const { ex, ey } = axes(patch.brand);
    const [boxWidth, boxHeight] = patch.brand.box;
    const reach =
      0.5 *
      (boxWidth * Math.hypot(ex[0], ex[1]) +
        boxHeight * Math.hypot(ey[0], ey[1]));
    boxes.push({
      cx: patch.brand.cx,
      cy: patch.brand.cy,
      rx: reach,
      ry: reach,
    });
  }
}

const pixels = Buffer.from(
  image.map((value) => Math.max(0, Math.min(255, Math.round(value)))),
);
const raw = { raw: { width: info.width, height: info.height, channels: 3 } };
let result = sharp(pixels, raw);
if (job.outputWidth)
  result = sharp(await result.png().toBuffer()).resize({
    width: job.outputWidth,
  });
await result.webp({ quality: 80, effort: 6 }).toFile(output);

const left = Math.max(
  0,
  Math.floor(Math.min(...boxes.map((b) => b.cx - b.rx))) - 20,
);
const top = Math.max(
  0,
  Math.floor(Math.min(...boxes.map((b) => b.cy - b.ry))) - 20,
);
const region = {
  left,
  top,
  width: Math.min(
    info.width - left,
    Math.ceil(Math.max(...boxes.map((b) => b.cx + b.rx))) - left + 20,
  ),
  height: Math.min(
    info.height - top,
    Math.ceil(Math.max(...boxes.map((b) => b.cy + b.ry))) - top + 20,
  ),
};
const before = await sharp(source)
  .extract(region)
  .resize({ width: 600 })
  .png()
  .toBuffer();
const after = await sharp(pixels, raw)
  .extract(region)
  .resize({ width: 600 })
  .png()
  .toBuffer();
const review = path.join(
  tmpdir(),
  `kardo-${path.basename(output, path.extname(output))}-antes-despues.png`,
);
await sharp({
  create: {
    width: 1210,
    height: Math.round((600 * region.height) / region.width),
    channels: 3,
    background: "#fff",
  },
})
  .composite([
    { input: before, left: 0, top: 0 },
    { input: after, left: 610, top: 0 },
  ])
  .png()
  .toFile(review);
console.log(
  `Listo: ${path.relative(process.cwd(), output)}. Revisión: ${review}`,
);
