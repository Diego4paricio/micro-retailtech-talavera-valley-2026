// Owned by the export/QA agent.
import type {
  PathCommand,
  Scene,
  SceneImageNode,
  ScenePaint,
  ScenePathNode,
} from "./types.js";

/**
 * Pure JavaScript rasterizer for a `Scene`. It is deliberately independent of
 * `<canvas>` so it can run in a Web Worker (`OffscreenCanvas`-free) and in
 * Node (Vitest, no DOM): the same code path that feeds `verifyScene` also
 * backs any future headless raster export.
 *
 * Geometry: Bézier curves are flattened to polylines (tolerance in pixels,
 * not module units, so quality stays constant across scales), then filled
 * with a scanline algorithm supersampled 4× vertically. Horizontal coverage
 * is exact (fractional pixel overlap of each span), which gives smooth edges
 * without a horizontal supersampling pass.
 */

/** Already-decoded image pixels, keyed by the `image` node's `href`. */
export type RasterImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type RasterizeOptions = {
  /** Pixels per QR module — the only scale knob; everything else follows. */
  pxPerModule: number;
  /** Decoded logo pixels. Missing entries render as adversarial noise. */
  images?: ReadonlyMap<string, RasterImage>;
  /** Opaque backdrop color the whole scene composites onto. Defaults to white. */
  surface?: string;
};

export type Raster = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

const SUBSCANLINES = 4;
const SUBSCANLINE_WEIGHT = 1 / SUBSCANLINES;
/** Bézier-to-polyline tolerance, in *pixels* (not module units). */
const FLATTEN_TOLERANCE = 0.2;

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

export type RgbColor = readonly [number, number, number];

/** Parses a `#rrggbb` string. Malformed input falls back to black. */
export function parseHexColor(hex: string): RgbColor {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return [0, 0, 0];
  const value = match[1] ?? "000000";
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return [r, g, b];
}

function lerpColor(from: RgbColor, to: RgbColor, t: number): RgbColor {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// ---------------------------------------------------------------------------
// Deterministic hash (adversarial noise for a logo that failed to decode)
// ---------------------------------------------------------------------------

function hash2(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) ^ (a * 3266489917);
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

// ---------------------------------------------------------------------------
// Path flattening
// ---------------------------------------------------------------------------

type Point = { x: number; y: number };

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Flatness test from Maxim Shemanarev's adaptive subdivision (deviation of the control points from the chord). */
function isFlatEnough(p0: Point, p1: Point, p2: Point, p3: Point): boolean {
  const ux = 3 * p1.x - 2 * p0.x - p3.x;
  const uy = 3 * p1.y - 2 * p0.y - p3.y;
  const vx = 3 * p2.x - 2 * p3.x - p0.x;
  const vy = 3 * p2.y - 2 * p3.y - p0.y;
  const errX = Math.max(ux * ux, vx * vx);
  const errY = Math.max(uy * uy, vy * vy);
  return errX + errY <= 16 * FLATTEN_TOLERANCE * FLATTEN_TOLERANCE;
}

function subdivideCubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  depth: number,
  out: Point[],
): void {
  if (depth >= 24 || isFlatEnough(p0, p1, p2, p3)) {
    out.push(p3);
    return;
  }
  const p01 = midpoint(p0, p1);
  const p12 = midpoint(p1, p2);
  const p23 = midpoint(p2, p3);
  const p012 = midpoint(p01, p12);
  const p123 = midpoint(p12, p23);
  const p0123 = midpoint(p012, p123);
  subdivideCubic(p0, p01, p012, p0123, depth + 1, out);
  subdivideCubic(p0123, p123, p23, p3, depth + 1, out);
}

/** Converts scene-space `d` (module units) into pixel-space closed polylines. */
function flattenPath(
  commands: readonly PathCommand[],
  scale: number,
): Point[][] {
  const subpaths: Point[][] = [];
  let current: Point[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  const toPixel = (x: number, y: number): Point => ({
    x: x * scale,
    y: y * scale,
  });

  for (const command of commands) {
    switch (command[0]) {
      case "M": {
        if (current.length > 1) subpaths.push(current);
        cx = command[1];
        cy = command[2];
        startX = cx;
        startY = cy;
        current = [toPixel(cx, cy)];
        break;
      }
      case "L": {
        cx = command[1];
        cy = command[2];
        current.push(toPixel(cx, cy));
        break;
      }
      case "C": {
        const p0 = toPixel(cx, cy);
        const p1 = toPixel(command[1], command[2]);
        const p2 = toPixel(command[3], command[4]);
        const p3 = toPixel(command[5], command[6]);
        subdivideCubic(p0, p1, p2, p3, 0, current);
        cx = command[5];
        cy = command[6];
        break;
      }
      case "Z": {
        cx = startX;
        cy = startY;
        break;
      }
    }
  }
  if (current.length > 1) subpaths.push(current);
  return subpaths;
}

// ---------------------------------------------------------------------------
// Scanline fill (nonzero / evenodd), 4× vertical supersampling
// ---------------------------------------------------------------------------

type Edge = { x0: number; y0: number; x1: number; y1: number; dir: 1 | -1 };

/** Every subpath is implicitly closed, exactly like SVG/canvas fill. */
function buildEdges(subpaths: readonly Point[][]): Edge[] {
  const edges: Edge[] = [];
  for (const subpath of subpaths) {
    if (subpath.length < 2) continue;
    for (let i = 0; i < subpath.length; i += 1) {
      const a = subpath[i];
      const b = subpath[(i + 1) % subpath.length];
      if (!a || !b || a.y === b.y) continue;
      edges.push(
        b.y > a.y
          ? { x0: a.x, y0: a.y, x1: b.x, y1: b.y, dir: 1 }
          : { x0: b.x, y0: b.y, x1: a.x, y1: a.y, dir: -1 },
      );
    }
  }
  return edges;
}

type Span = readonly [number, number];

function spansAt(
  edges: readonly Edge[],
  sampleY: number,
  fillRule: "nonzero" | "evenodd",
): Span[] {
  const crossings: { x: number; dir: 1 | -1 }[] = [];
  for (const edge of edges) {
    if (sampleY < edge.y0 || sampleY >= edge.y1) continue;
    const t = (sampleY - edge.y0) / (edge.y1 - edge.y0);
    const x = edge.x0 + t * (edge.x1 - edge.x0);
    crossings.push({ x, dir: edge.dir });
  }
  if (crossings.length === 0) return [];
  crossings.sort((a, b) => a.x - b.x);

  const spans: Span[] = [];
  if (fillRule === "evenodd") {
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const start = crossings[i];
      const end = crossings[i + 1];
      if (start && end) spans.push([start.x, end.x]);
    }
    return spans;
  }

  let winding = 0;
  let spanStart: number | null = null;
  for (const crossing of crossings) {
    const before = winding;
    winding += crossing.dir;
    if (before === 0 && winding !== 0) spanStart = crossing.x;
    else if (before !== 0 && winding === 0 && spanStart !== null) {
      spans.push([spanStart, crossing.x]);
      spanStart = null;
    }
  }
  return spans;
}

/** Coverage buffer (0..1), sized to the bbox, using exact horizontal overlap per span. */
function rasterizeCoverage(
  edges: readonly Edge[],
  fillRule: "nonzero" | "evenodd",
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Float32Array {
  const width = x1 - x0;
  const height = y1 - y0;
  const coverage = new Float32Array(width * height);

  for (let row = 0; row < height; row += 1) {
    const y = y0 + row;
    for (let sub = 0; sub < SUBSCANLINES; sub += 1) {
      const sampleY = y + (sub + 0.5) / SUBSCANLINES;
      const spans = spansAt(edges, sampleY, fillRule);
      for (const [spanStartAbs, spanEndAbs] of spans) {
        let xs = spanStartAbs - x0;
        let xe = spanEndAbs - x0;
        if (xe <= 0 || xs >= width) continue;
        xs = Math.max(xs, 0);
        xe = Math.min(xe, width);
        if (xe <= xs) continue;
        const firstPixel = Math.floor(xs);
        const lastPixel = Math.min(width - 1, Math.floor(xe - 1e-9));
        const rowBase = row * width;
        if (firstPixel === lastPixel) {
          coverage[rowBase + firstPixel] =
            (coverage[rowBase + firstPixel] ?? 0) +
            (xe - xs) * SUBSCANLINE_WEIGHT;
          continue;
        }
        coverage[rowBase + firstPixel] =
          (coverage[rowBase + firstPixel] ?? 0) +
          (firstPixel + 1 - xs) * SUBSCANLINE_WEIGHT;
        for (let px = firstPixel + 1; px < lastPixel; px += 1)
          coverage[rowBase + px] =
            (coverage[rowBase + px] ?? 0) + SUBSCANLINE_WEIGHT;
        coverage[rowBase + lastPixel] =
          (coverage[rowBase + lastPixel] ?? 0) +
          (xe - lastPixel) * SUBSCANLINE_WEIGHT;
      }
    }
  }
  return coverage;
}

// ---------------------------------------------------------------------------
// Paint evaluation (solid / linear / radial), in pixel space
// ---------------------------------------------------------------------------

type PixelPaint =
  | { kind: "solid"; color: RgbColor }
  | {
      kind: "linear";
      from: RgbColor;
      to: RgbColor;
      x1: number;
      y1: number;
      dx: number;
      dy: number;
      lengthSq: number;
    }
  | {
      kind: "radial";
      from: RgbColor;
      to: RgbColor;
      cx: number;
      cy: number;
      r: number;
    };

function toPixelPaint(paint: ScenePaint, scale: number): PixelPaint {
  if (paint.kind === "solid")
    return { kind: "solid", color: parseHexColor(paint.color) };
  if (paint.kind === "linear") {
    const x1 = paint.x1 * scale;
    const y1 = paint.y1 * scale;
    const x2 = paint.x2 * scale;
    const y2 = paint.y2 * scale;
    const dx = x2 - x1;
    const dy = y2 - y1;
    return {
      kind: "linear",
      from: parseHexColor(paint.from),
      to: parseHexColor(paint.to),
      x1,
      y1,
      dx,
      dy,
      lengthSq: dx * dx + dy * dy || 1,
    };
  }
  return {
    kind: "radial",
    from: parseHexColor(paint.from),
    to: parseHexColor(paint.to),
    cx: paint.cx * scale,
    cy: paint.cy * scale,
    r: paint.r * scale || 1,
  };
}

function evaluatePaint(paint: PixelPaint, x: number, y: number): RgbColor {
  if (paint.kind === "solid") return paint.color;
  if (paint.kind === "linear") {
    const t = clamp01(
      ((x - paint.x1) * paint.dx + (y - paint.y1) * paint.dy) / paint.lengthSq,
    );
    return lerpColor(paint.from, paint.to, t);
  }
  const dist = Math.hypot(x - paint.cx, y - paint.cy);
  return lerpColor(paint.from, paint.to, clamp01(dist / paint.r));
}

// ---------------------------------------------------------------------------
// Compositing
// ---------------------------------------------------------------------------

function compositePixel(
  data: Uint8ClampedArray,
  idx: number,
  color: RgbColor,
  alpha: number,
): void {
  if (alpha <= 0) return;
  if (alpha >= 1) {
    data[idx] = color[0];
    data[idx + 1] = color[1];
    data[idx + 2] = color[2];
    data[idx + 3] = 255;
    return;
  }
  const inverse = 1 - alpha;
  data[idx] = (data[idx] ?? 0) * inverse + color[0] * alpha;
  data[idx + 1] = (data[idx + 1] ?? 0) * inverse + color[1] * alpha;
  data[idx + 2] = (data[idx + 2] ?? 0) * inverse + color[2] * alpha;
  data[idx + 3] = 255;
}

// ---------------------------------------------------------------------------
// Node rasterizers
// ---------------------------------------------------------------------------

function fillPath(raster: Raster, node: ScenePathNode, scale: number): void {
  const subpaths = flattenPath(node.d, scale);
  const edges = buildEdges(subpaths);
  if (edges.length === 0) return;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const subpath of subpaths)
    for (const point of subpath) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }

  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(raster.width, Math.ceil(maxX));
  const y1 = Math.min(raster.height, Math.ceil(maxY));
  if (x1 <= x0 || y1 <= y0) return;

  const coverage = rasterizeCoverage(edges, node.fillRule, x0, y0, x1, y1);
  const bboxWidth = x1 - x0;
  const paint = toPixelPaint(node.fill, scale);
  const opacity = node.opacity ?? 1;

  for (let row = 0; row < y1 - y0; row += 1) {
    const y = y0 + row;
    const rowBase = row * bboxWidth;
    for (let col = 0; col < bboxWidth; col += 1) {
      const cov = coverage[rowBase + col] ?? 0;
      if (cov <= 0) continue;
      const alpha = Math.min(1, cov) * opacity;
      const x = x0 + col;
      const color = evaluatePaint(paint, x + 0.5, y + 0.5);
      compositePixel(raster.data, (y * raster.width + x) * 4, color, alpha);
    }
  }
}

/** Bilinear sample of a decoded source image, clamped to its edges. */
function sampleBilinear(
  source: RasterImage,
  u: number,
  v: number,
): readonly [number, number, number, number] {
  const x = clamp01(u / Math.max(1, source.width - 1)) * (source.width - 1);
  const y = clamp01(v / Math.max(1, source.height - 1)) * (source.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(source.width - 1, x0 + 1);
  const y1 = Math.min(source.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const { data, width } = source;
  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  const result: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c += 1) {
    const top = (data[i00 + c] ?? 0) * (1 - fx) + (data[i10 + c] ?? 0) * fx;
    const bottom = (data[i01 + c] ?? 0) * (1 - fx) + (data[i11 + c] ?? 0) * fx;
    result[c] = top * (1 - fy) + bottom * fy;
  }
  return result;
}

/** Half-module dark/light noise: the adversarial case for a logo we could not decode. */
function paintAdversarialNoise(
  raster: Raster,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  originX: number,
  originY: number,
  scale: number,
): void {
  const block = Math.max(1, Math.round(scale / 2));
  for (let y = y0; y < y1; y += 1) {
    const blockY = Math.floor((y - originY) / block);
    for (let x = x0; x < x1; x += 1) {
      const blockX = Math.floor((x - originX) / block);
      const dark = hash2(blockX, blockY) < 0.5;
      const value = dark ? 18 : 238;
      compositePixel(
        raster.data,
        (y * raster.width + x) * 4,
        [value, value, value],
        1,
      );
    }
  }
}

function drawImage(
  raster: Raster,
  node: SceneImageNode,
  scale: number,
  images: ReadonlyMap<string, RasterImage> | undefined,
): void {
  const originX = node.x * scale;
  const originY = node.y * scale;
  const boxWidth = node.width * scale;
  const boxHeight = node.height * scale;
  const x0 = Math.max(0, Math.round(originX));
  const y0 = Math.max(0, Math.round(originY));
  const x1 = Math.min(raster.width, Math.round(originX + boxWidth));
  const y1 = Math.min(raster.height, Math.round(originY + boxHeight));
  if (x1 <= x0 || y1 <= y0) return;

  const source = images?.get(node.href);
  if (source && source.width > 0 && source.height > 0) {
    for (let y = y0; y < y1; y += 1) {
      const v = ((y - originY + 0.5) / boxHeight) * source.height - 0.5;
      for (let x = x0; x < x1; x += 1) {
        const u = ((x - originX + 0.5) / boxWidth) * source.width - 0.5;
        const [r, g, b, a] = sampleBilinear(source, u, v);
        compositePixel(
          raster.data,
          (y * raster.width + x) * 4,
          [r, g, b],
          a / 255,
        );
      }
    }
    return;
  }

  paintAdversarialNoise(raster, x0, y0, x1, y1, originX, originY, scale);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function rasterizeScene(
  scene: Scene,
  options: RasterizeOptions,
): Raster {
  const scale = options.pxPerModule;
  const width = Math.max(1, Math.round(scene.width * scale));
  const height = Math.max(1, Math.round(scene.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  const [sr, sg, sb] = parseHexColor(options.surface ?? "#ffffff");
  for (let i = 0; i < data.length; i += 4) {
    data[i] = sr;
    data[i + 1] = sg;
    data[i + 2] = sb;
    data[i + 3] = 255;
  }
  const raster: Raster = { width, height, data };

  for (const node of scene.nodes) {
    if (node.type === "path") fillPath(raster, node, scale);
    else if (node.type === "image")
      drawImage(raster, node, scale, options.images);
    // Text is never verified — jsQR only reads the printed symbol.
  }
  return raster;
}

// ---------------------------------------------------------------------------
// Image utilities reused by `verify.ts` (and handy for its own tests)
// ---------------------------------------------------------------------------

function gaussianKernel(sigma: number): Float64Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float64Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = weight;
    sum += weight;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] = (kernel[i] ?? 0) / sum;
  return kernel;
}

/** Separable Gaussian blur (edge-clamped), σ in pixels. */
export function blurImage(image: Raster, sigma: number): Raster {
  if (sigma <= 0) return image;
  const kernel = gaussianKernel(sigma);
  const radius = (kernel.length - 1) / 2;
  const { width, height, data } = image;
  const horizontal = new Float64Array(width * height * 4);
  const out = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sx = Math.min(width - 1, Math.max(0, x + k));
        const weight = kernel[k + radius] ?? 0;
        const idx = (y * width + sx) * 4;
        r += (data[idx] ?? 0) * weight;
        g += (data[idx + 1] ?? 0) * weight;
        b += (data[idx + 2] ?? 0) * weight;
        a += (data[idx + 3] ?? 0) * weight;
      }
      const idx = (y * width + x) * 4;
      horizontal[idx] = r;
      horizontal[idx + 1] = g;
      horizontal[idx + 2] = b;
      horizontal[idx + 3] = a;
    }
  }

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sy = Math.min(height - 1, Math.max(0, y + k));
        const weight = kernel[k + radius] ?? 0;
        const idx = (sy * width + x) * 4;
        r += (horizontal[idx] ?? 0) * weight;
        g += (horizontal[idx + 1] ?? 0) * weight;
        b += (horizontal[idx + 2] ?? 0) * weight;
        a += (horizontal[idx + 3] ?? 0) * weight;
      }
      const idx = (y * width + x) * 4;
      out[idx] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      out[idx + 3] = a;
    }
  }
  return { width, height, data: out };
}

/** Small, dependency-free PRNG (mulberry32) so noise is reproducible from a seed. */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform ±`amount` (fraction of 255) luminance noise, same delta per channel. */
export function addNoise(image: Raster, amount: number, seed: number): Raster {
  const random = mulberry32(seed);
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const delta = (random() * 2 - 1) * amount * 255;
    out[i] = (data[i] ?? 0) + delta;
    out[i + 1] = (data[i + 1] ?? 0) + delta;
    out[i + 2] = (data[i + 2] ?? 0) + delta;
    out[i + 3] = data[i + 3] ?? 255;
  }
  return { width, height, data: out };
}

/**
 * Gaussian (Box–Muller) luminance noise, same delta per channel: a real
 * camera sensor's read/shot noise is approximately normal, not uniform, so
 * `verify.ts`'s "Ruido del sensor" check models it with this instead of
 * `addNoise`. `sigma` is the standard deviation as a fraction of 255 (e.g.
 * `0.11` ≈ 28 levels), so most pixels move only a little and a few move a
 * lot — unlike a uniform ±20 % delta, which moves *every* pixel by a
 * consistently large amount regardless of how likely that is for a real
 * sensor.
 */
export function addGaussianNoise(
  image: Raster,
  sigma: number,
  seed: number,
): Raster {
  const random = mulberry32(seed);
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);
  // Box–Muller produces two independent samples per pair of uniform draws;
  // stash the second one instead of discarding it.
  let spare: number | null = null;
  const nextGaussian = (): number => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u1 = random();
    if (u1 <= 0) u1 = Number.EPSILON;
    const u2 = random();
    const radius = Math.sqrt(-2 * Math.log(u1));
    const angle = 2 * Math.PI * u2;
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
  for (let i = 0; i < data.length; i += 4) {
    const delta = nextGaussian() * sigma * 255;
    out[i] = (data[i] ?? 0) + delta;
    out[i + 1] = (data[i + 1] ?? 0) + delta;
    out[i + 2] = (data[i + 2] ?? 0) + delta;
    out[i + 3] = data[i + 3] ?? 255;
  }
  return { width, height, data: out };
}

/** Grows dark ink into its neighbours (radius in pixels) — simulates ink bleed. */
export function dilateDark(
  image: Raster,
  radius: number,
  threshold = 128,
): Raster {
  if (radius <= 0) return image;
  const { width, height, data } = image;
  const dark = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const luminance =
      0.299 * (data[i] ?? 0) +
      0.587 * (data[i + 1] ?? 0) +
      0.114 * (data[i + 2] ?? 0);
    dark[p] = luminance <= threshold ? 1 : 0;
  }

  const r = Math.ceil(radius);
  const r2 = radius * radius;
  const grown = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = false;
      for (let dy = -r; dy <= r && !hit; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -r; dx <= r; dx += 1) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          if (dark[ny * width + nx]) {
            hit = true;
            break;
          }
        }
      }
      grown[y * width + x] = hit ? 1 : 0;
    }
  }

  const out = new Uint8ClampedArray(data);
  for (let p = 0; p < grown.length; p += 1) {
    if (grown[p] && !dark[p]) {
      const idx = p * 4;
      out[idx] = 10;
      out[idx + 1] = 10;
      out[idx + 2] = 10;
      out[idx + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/** Compresses the luminance range toward a midpoint (0 < factor < 1 = darker/flatter). */
export function compressLuminance(
  image: Raster,
  factor: number,
  midpoint = 128,
): Raster {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = midpoint + ((data[i] ?? 0) - midpoint) * factor;
    out[i + 1] = midpoint + ((data[i + 1] ?? 0) - midpoint) * factor;
    out[i + 2] = midpoint + ((data[i + 2] ?? 0) - midpoint) * factor;
    out[i + 3] = data[i + 3] ?? 255;
  }
  return { width, height, data: out };
}

/** Rotates around the image centre with bilinear resampling; exposed corners use `fill`. */
export function rotateImage(
  image: Raster,
  degrees: number,
  fill: RgbColor,
): Raster {
  const { width, height, data } = image;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = width / 2;
  const cy = height / 2;
  const out = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = cx + dx * cos + dy * sin;
      const sy = cy - dx * sin + dy * cos;
      const idx = (y * width + x) * 4;
      if (sx < 0 || sx >= width - 1 || sy < 0 || sy >= height - 1) {
        out[idx] = fill[0];
        out[idx + 1] = fill[1];
        out[idx + 2] = fill[2];
        out[idx + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * width + x0) * 4;
      const i10 = (y0 * width + x0 + 1) * 4;
      const i01 = ((y0 + 1) * width + x0) * 4;
      const i11 = ((y0 + 1) * width + x0 + 1) * 4;
      for (let c = 0; c < 4; c += 1) {
        const top = (data[i00 + c] ?? 0) * (1 - fx) + (data[i10 + c] ?? 0) * fx;
        const bottom =
          (data[i01 + c] ?? 0) * (1 - fx) + (data[i11 + c] ?? 0) * fx;
        out[idx + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return { width, height, data: out };
}
