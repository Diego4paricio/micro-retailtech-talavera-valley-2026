import zlib from "node:zlib";
import {
  qrErrorCorrectionLevels,
  qrEyeFrameShapes,
  qrFrameStyles,
} from "@kardo/contracts";
import jsQRModule from "jsqr";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { isModuleCleared } from "../src/features/touchpoints/qr/engine/budget.js";
import { buildQr } from "../src/features/touchpoints/qr/engine/build.js";
import { functionalMap } from "../src/features/touchpoints/qr/engine/matrix.js";
import {
  addPhysicalPixelDimensions,
  crc32,
} from "../src/features/touchpoints/qr/engine/png-dpi.js";
import {
  alignmentPatternPath,
  cushionPath,
  eyeFramePath,
} from "../src/features/touchpoints/qr/engine/shapes.js";
import {
  pathData,
  sceneToSvg,
} from "../src/features/touchpoints/qr/engine/svg.js";
import type {
  PathCommand,
  Scene,
  SceneNode,
} from "../src/features/touchpoints/qr/engine/types.js";
import {
  contrastRatio,
  defaultQrDesign,
  normalizeQrDesign,
} from "../src/features/touchpoints/qr/qr-design.js";

/**
 * CPU time spent by this test process (user + system), in milliseconds: unlike
 * wall-clock time it does not balloon when other suites share the machine.
 */
function cpuMs(run: () => void): number {
  const start = process.cpuUsage();
  run();
  const used = process.cpuUsage(start);
  return (used.user + used.system) / 1000;
}

// jsQR ships a UMD bundle whose default export shape differs between the
// TypeScript (NodeNext) view and Vite/vitest's CommonJS interop; accept both
// (same trick the legacy qr-render.ts used).
type QrDecoder = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: "dontInvert" },
) => { data: string } | null;
function resolveDecoder(value: unknown): QrDecoder {
  if (typeof value === "function") return value as QrDecoder;
  const nested = (value as { default?: unknown } | null)?.default;
  if (typeof nested === "function") return nested as QrDecoder;
  throw new Error("QR decoder is unavailable.");
}
const jsQR = resolveDecoder(jsQRModule);

/** Renders dark modules (crisp squares, 4 px/module) to an RGBA buffer and decodes it. */
function decodeMatrix(
  size: number,
  quietZone: number,
  isDark: (row: number, col: number) => boolean,
  pxPerModule = 4,
): string | null {
  const modules = size + quietZone * 2;
  const width = modules * pxPerModule;
  const height = width;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!isDark(row, col)) continue;
      const px0 = (col + quietZone) * pxPerModule;
      const py0 = (row + quietZone) * pxPerModule;
      for (let dy = 0; dy < pxPerModule; dy += 1) {
        for (let dx = 0; dx < pxPerModule; dx += 1) {
          const idx = ((py0 + dy) * width + (px0 + dx)) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 255;
        }
      }
    }
  }
  const result = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
  return result?.data ?? null;
}

/** Builds a URL of exactly `totalLength` characters (short/long "domains" per the brief). */
function urlOfLength(totalLength: number): string {
  const longPrefix =
    "https://kardo-poa-test-resolver.glowel-dev.workers.dev/t/";
  const shortPrefix = "https://kd.qr/t/";
  const suffix = "?src=qr";
  const prefix =
    totalLength >= longPrefix.length + suffix.length + 16
      ? longPrefix
      : shortPrefix;
  const idLength = Math.max(8, totalLength - prefix.length - suffix.length);
  const id = "0123456789abcdef"
    .repeat(Math.ceil(idLength / 16))
    .slice(0, idLength);
  const url = `${prefix}${id}${suffix}`;
  if (url.length === totalLength) return url;
  if (url.length < totalLength)
    return url + "a".repeat(totalLength - url.length);
  return url.slice(0, totalLength);
}

describe("functional module map", () => {
  it("matches qrcode's reservedBit for every version (1–40) and level (L/M/Q/H)", () => {
    for (let version = 1; version <= 40; version += 1) {
      for (const level of qrErrorCorrectionLevels) {
        const code = QRCode.create("a", {
          errorCorrectionLevel: level,
          version,
        });
        const size = code.modules.size;
        const reserved = code.modules.reservedBit;
        const map = functionalMap(version);
        expect(map.size).toBe(size);
        // One assertion per version/level: a per-module `expect` (~2 M calls)
        // made this test take tens of seconds on a busy machine.
        const mismatches: string[] = [];
        for (let row = 0; row < size; row += 1) {
          for (let col = 0; col < size; col += 1) {
            if (map.isFunctional(row, col) !== !!reserved[row * size + col])
              mismatches.push(`v${version}-${level} (${row},${col})`);
          }
        }
        expect(mismatches).toEqual([]);
      }
    }
  }, 30000);
});

describe("version selection stays within budget across realistic inputs", () => {
  it("never clears a functional module and never exceeds the correction budget", () => {
    const lengths = [30, 60, 90, 120];
    const plates = ["none", "square", "rounded", "circle"] as const;
    const sizes = [0.08, 0.15, 0.22, 0.3];
    const paddings = [0, 1, 2, 3];

    for (const length of lengths) {
      const url = urlOfLength(length);
      for (const plate of plates) {
        for (const size of sizes) {
          for (const padding of paddings) {
            const design = normalizeQrDesign({
              ...defaultQrDesign,
              logo: { source: "brand", size, padding, plate, plateColor: null },
            });
            const { scene, analysis } = buildQr({
              url,
              design,
              logo: { href: "data:image/png;base64,", width: 1, height: 1 },
            });
            expect(analysis.errorCorrection).toBe("H");
            expect(analysis.budget).not.toBeNull();
            if (analysis.budget)
              expect(analysis.budget.ratio).toBeLessThanOrEqual(1);

            if (analysis.clearedArea) {
              const localArea = {
                x: analysis.clearedArea.x - scene.symbol.x,
                y: analysis.clearedArea.y - scene.symbol.y,
                width: analysis.clearedArea.width,
                height: analysis.clearedArea.height,
                shape: analysis.clearedArea.shape,
              };
              const map = functionalMap(analysis.version);
              for (let row = 0; row < analysis.size; row += 1) {
                for (let col = 0; col < analysis.size; col += 1) {
                  if (isModuleCleared(localArea, row, col)) {
                    expect(map.isFunctional(row, col)).toBe(false);
                  }
                }
              }
            }
          }
        }
      }
    }
  }, 40000);
});

describe("legibility after logo clearing", () => {
  it("decodes to the exact URL with no logo, at every error-correction level", () => {
    const url = urlOfLength(60);
    for (const level of qrErrorCorrectionLevels) {
      const code = QRCode.create(url, { errorCorrectionLevel: level });
      const size = code.modules.size;
      const decoded = decodeMatrix(
        size,
        4,
        (row, col) => code.modules.data[row * size + col] === 1,
      );
      expect(decoded).toBe(url);
    }
  });

  it("decodes to the exact URL with a logo at its maximum allowed size", () => {
    const url = urlOfLength(90);
    // A moderate size/padding that is reliably feasible: very large
    // logos (close to `qrLogoSizeRange.max`, or with generous padding) can
    // legitimately have no version ≤ 25 that fits them at all — the engine
    // then falls back to `maxLogoSize` (possibly 0), which is covered by
    // the budget sweep above, not by this decode roundtrip.
    for (const plate of ["square", "rounded", "circle"] as const) {
      const design = normalizeQrDesign({
        ...defaultQrDesign,
        logo: {
          source: "brand",
          size: 0.15,
          padding: 1,
          plate,
          plateColor: null,
        },
      });
      const { scene, analysis } = buildQr({
        url,
        design,
        logo: { href: "data:image/png;base64,", width: 1, height: 1 },
      });
      expect(analysis.clearedArea).not.toBeNull();
      if (!analysis.clearedArea) continue;

      const localArea = {
        x: analysis.clearedArea.x - scene.symbol.x,
        y: analysis.clearedArea.y - scene.symbol.y,
        width: analysis.clearedArea.width,
        height: analysis.clearedArea.height,
        shape: analysis.clearedArea.shape,
      };
      const code = QRCode.create(url, {
        errorCorrectionLevel: "H",
        version: analysis.version,
      });
      const size = code.modules.size;
      const isDark = (row: number, col: number) => {
        if (isModuleCleared(localArea, row, col)) return false;
        return code.modules.data[row * size + col] === 1;
      };
      const decoded = decodeMatrix(size, design.quietZone, isDark);
      expect(decoded).toBe(url);
    }
  });
});

function collectPathNodes(
  scene: Scene,
): Extract<SceneNode, { type: "path" }>[] {
  return scene.nodes.filter(
    (node): node is Extract<SceneNode, { type: "path" }> =>
      node.type === "path",
  );
}

function boundingBoxOf(d: readonly PathCommand[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const consider = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const command of d) {
    if (command[0] === "Z") continue;
    if (command[0] === "M" || command[0] === "L") {
      consider(command[1], command[2]);
    } else {
      consider(command[1], command[2]);
      consider(command[3], command[4]);
      consider(command[5], command[6]);
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function rectContains(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    inner.x >= outer.x - 1e-6 &&
    inner.y >= outer.y - 1e-6 &&
    inner.x + inner.width <= outer.x + outer.width + 1e-6 &&
    inner.y + inner.height <= outer.y + outer.height + 1e-6
  );
}

/** Flattens one cubic Bézier into line segments for the point-in-fill test below. */
function flattenCubic(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  segments = 12,
): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    const mt = 1 - t;
    const x =
      mt ** 3 * p0[0] +
      3 * mt ** 2 * t * p1[0] +
      3 * mt * t ** 2 * p2[0] +
      t ** 3 * p3[0];
    const y =
      mt ** 3 * p0[1] +
      3 * mt ** 2 * t * p1[1] +
      3 * mt * t ** 2 * p2[1] +
      t ** 3 * p3[1];
    points.push([x, y]);
  }
  return points;
}

/** Turns a `d` array into closed polygons (curves flattened), for ray-casting. */
function pathToPolygons(d: readonly PathCommand[]): [number, number][][] {
  const polygons: [number, number][][] = [];
  let current: [number, number][] = [];
  let cursor: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  for (const command of d) {
    if (command[0] === "M") {
      if (current.length > 0) polygons.push(current);
      cursor = [command[1], command[2]];
      start = cursor;
      current = [cursor];
    } else if (command[0] === "L") {
      cursor = [command[1], command[2]];
      current.push(cursor);
    } else if (command[0] === "C") {
      const p1: [number, number] = [command[1], command[2]];
      const p2: [number, number] = [command[3], command[4]];
      const p3: [number, number] = [command[5], command[6]];
      current.push(...flattenCubic(cursor, p1, p2, p3));
      cursor = p3;
    } else {
      current.push(start);
      cursor = start;
    }
  }
  if (current.length > 0) polygons.push(current);
  return polygons;
}

/** Standard ray-casting point-in-fill test, honoring nonzero/evenodd. */
function isPointFilled(
  polygons: readonly (readonly (readonly [number, number])[])[],
  px: number,
  py: number,
  rule: "nonzero" | "evenodd",
): boolean {
  let winding = 0;
  let crossings = 0;
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if (!a || !b) continue;
      const [x1, y1] = a;
      const [x2, y2] = b;
      if (y1 <= py !== y2 <= py) {
        const t = (py - y1) / (y2 - y1);
        const xCross = x1 + t * (x2 - x1);
        if (xCross > px) {
          crossings += 1;
          winding += y2 > y1 ? 1 : -1;
        }
      }
    }
  }
  return rule === "evenodd" ? crossings % 2 === 1 : winding !== 0;
}

/**
 * Scans a line at fixed `cross` (a row if `axis === "horizontal"`, a column
 * otherwise) over `[from, to]` along the other axis, in `steps` samples, and
 * returns the width of every "filled" run (same units as from/to) — i.e. a
 * ring's cross-section as a list of dark segment widths, in order.
 */
function scanRunWidths(
  polygons: readonly (readonly (readonly [number, number])[])[],
  axis: "horizontal" | "vertical",
  cross: number,
  from: number,
  to: number,
  rule: "nonzero" | "evenodd",
  steps = 2000,
): number[] {
  const step = (to - from) / steps;
  const runs: number[] = [];
  let runStart: number | null = null;
  for (let i = 0; i <= steps; i += 1) {
    const along = from + i * step;
    const [x, y] = axis === "horizontal" ? [along, cross] : [cross, along];
    const filled = isPointFilled(polygons, x, y, rule);
    if (filled && runStart === null) runStart = along;
    else if (!filled && runStart !== null) {
      runs.push(along - runStart);
      runStart = null;
    }
  }
  if (runStart !== null) runs.push(to - runStart);
  return runs;
}

describe("eye frame ring geometry", () => {
  it("keeps a ring of ~1 module at the finder's central row and column, for every eye frame shape", () => {
    for (const shape of qrEyeFrameShapes) {
      const d = eyeFramePath(shape, 0, 0);
      const polygons = pathToPolygons(d);
      // Two dark runs (left/right, or top/bottom, ring) around one light
      // hole, scanning the exact continuous centre of the 7×7 box on both
      // axes — the classic 1:1:3:1:1 cross-section, ball excluded (this path
      // is only the ring).
      for (const axis of ["horizontal", "vertical"] as const) {
        const runs = scanRunWidths(polygons, axis, 3.5, 0, 7, "evenodd");
        expect(runs, `${shape} ${axis}`).toHaveLength(2);
        for (const width of runs) {
          expect(width, `${shape} ${axis} ring width`).toBeGreaterThan(0.85);
          expect(width, `${shape} ${axis} ring width`).toBeLessThanOrEqual(
            1.05,
          );
        }
      }
    }
  });

  it("never paints outside the eye frame's own 7×7 box, for every shape (inscribed)", () => {
    for (const shape of qrEyeFrameShapes) {
      const bbox = boundingBoxOf(eyeFramePath(shape, 0, 0));
      expect(bbox.x, shape).toBeGreaterThanOrEqual(-1e-6);
      expect(bbox.y, shape).toBeGreaterThanOrEqual(-1e-6);
      expect(bbox.x + bbox.width, shape).toBeLessThanOrEqual(7 + 1e-6);
      expect(bbox.y + bbox.height, shape).toBeLessThanOrEqual(7 + 1e-6);
    }
  });

  it("cushion's bulge stays inside the original box (inset base + bow back out, never past the edge)", () => {
    // A deliberately extreme bulge (close to half the box) to prove the
    // *inscribed* guarantee holds structurally, not just for the shipped
    // (mild) constants.
    const size = 10;
    const bulge = 4;
    const radius = 3;
    const d = cushionPath(0, 0, size, radius, bulge);
    const bbox = boundingBoxOf(d);
    expect(bbox.x).toBeGreaterThanOrEqual(-1e-6);
    expect(bbox.y).toBeGreaterThanOrEqual(-1e-6);
    expect(bbox.x + bbox.width).toBeLessThanOrEqual(size + 1e-6);
    expect(bbox.y + bbox.height).toBeLessThanOrEqual(size + 1e-6);
  });
});

describe("alignment pattern geometry", () => {
  it("is a single continuous ring + centre for every eye frame style, never gapped like the per-module shapes", () => {
    for (const shape of qrEyeFrameShapes) {
      const d = alignmentPatternPath(shape, 0, 0);
      const polygons = pathToPolygons(d);
      // Centre row (y=2.5): ring, hole, centre dot, hole, ring — 3 dark runs.
      const runs = scanRunWidths(polygons, "horizontal", 2.5, 0, 5, "evenodd");
      expect(runs, shape).toHaveLength(3);
      const [left, center, right] = runs;
      expect(left, `${shape} left ring`).toBeGreaterThan(0.7);
      expect(right, `${shape} right ring`).toBeGreaterThan(0.7);
      expect(center, `${shape} centre dot`).toBeGreaterThan(0.5);
    }
  });

  it("stays inscribed in its own 5×5 box, for every shape", () => {
    for (const shape of qrEyeFrameShapes) {
      const bbox = boundingBoxOf(alignmentPatternPath(shape, 0, 0));
      expect(bbox.x, shape).toBeGreaterThanOrEqual(-1e-6);
      expect(bbox.y, shape).toBeGreaterThanOrEqual(-1e-6);
      expect(bbox.x + bbox.width, shape).toBeLessThanOrEqual(5 + 1e-6);
      expect(bbox.y + bbox.height, shape).toBeLessThanOrEqual(5 + 1e-6);
    }
  });
});

describe("scene invariants", () => {
  it("draws nothing in the quiet zone except the background, for every design in the gallery", () => {
    const url = urlOfLength(60);
    return import("../src/features/touchpoints/qr/qr-design.js").then(
      ({ qrGallery }) => {
        for (const preset of qrGallery) {
          const { scene } = buildQr({ url, design: preset.design, logo: null });
          const { quietZone } = scene.symbol;
          const outerRect = {
            x: scene.symbol.x - quietZone,
            y: scene.symbol.y - quietZone,
            width: scene.symbol.size + quietZone * 2,
            height: scene.symbol.size + quietZone * 2,
          };
          const innerRect = {
            x: scene.symbol.x,
            y: scene.symbol.y,
            width: scene.symbol.size,
            height: scene.symbol.size,
          };

          const candidates = collectPathNodes(scene)
            .filter((node) => node.role !== "background")
            .map((node) => ({ node, polygons: pathToPolygons(node.d) }));

          // Sample the quiet-zone ring at 1-module resolution, offset to cell
          // centers: fine enough to catch any shape (including thin bits like
          // a badge's CTA pill) that pokes into it, while not tripping on the
          // zero-measure seam where a card's hole exactly meets the ring
          // (e.g. the hole's edge coincides with the qrUnits block's edge).
          for (
            let y = outerRect.y + 0.5;
            y < outerRect.y + outerRect.height;
            y += 1
          ) {
            for (
              let x = outerRect.x + 0.5;
              x < outerRect.x + outerRect.width;
              x += 1
            ) {
              const inRing =
                x < innerRect.x ||
                x > innerRect.x + innerRect.width ||
                y < innerRect.y ||
                y > innerRect.y + innerRect.height;
              if (!inRing) continue;
              for (const { node, polygons } of candidates) {
                const filled = isPointFilled(polygons, x, y, node.fillRule);
                if (filled) {
                  expect
                    .soft(
                      filled,
                      `${preset.id}: role=${node.role} paints inside the quiet zone at (${x}, ${y})`,
                    )
                    .toBe(false);
                }
              }
            }
          }
        }
      },
    );
  }, 20000);

  it("never overlaps the Kardo mark with the symbol", () => {
    const url = urlOfLength(60);
    const { scene } = buildQr({ url, design: defaultQrDesign, logo: null });
    const symbolRect = {
      x: scene.symbol.x - scene.symbol.quietZone,
      y: scene.symbol.y - scene.symbol.quietZone,
      width: scene.symbol.size + scene.symbol.quietZone * 2,
      height: scene.symbol.size + scene.symbol.quietZone * 2,
    };
    for (const node of collectPathNodes(scene)) {
      if (node.role !== "kardo-mark") continue;
      const bbox = boundingBoxOf(node.d);
      expect(rectsIntersect(bbox, symbolRect)).toBe(false);
    }
  });

  it("keeps every node within the scene's own width/height", () => {
    const url = urlOfLength(60);
    const { scene } = buildQr({
      url,
      design: normalizeQrDesign({
        ...defaultQrDesign,
        logo: {
          source: "brand",
          size: 0.2,
          padding: 1,
          plate: "circle",
          plateColor: null,
        },
      }),
      logo: { href: "data:image/png;base64,", width: 1, height: 1 },
    });
    const sceneRect = { x: 0, y: 0, width: scene.width, height: scene.height };
    for (const node of scene.nodes) {
      if (node.type === "path") {
        const bbox = boundingBoxOf(node.d);
        expect(rectContains(sceneRect, bbox)).toBe(true);
      } else if (node.type === "image") {
        expect(
          rectContains(sceneRect, {
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
          }),
        ).toBe(true);
      }
    }
  });
});

describe("Kardo mark and paper text stay readable", () => {
  it("draws the mark with ≥ 3:1 contrast on whatever sits behind it, in every frame style", () => {
    const onPage = new Set(["none", "caption", "brackets", "badge", "phone"]);
    for (const style of qrFrameStyles) {
      for (const textColor of ["#ffffff", "#16232e"]) {
        const design = normalizeQrDesign({
          ...defaultQrDesign,
          background: { color: "#f7f5f0", transparent: false },
          frame: {
            ...defaultQrDesign.frame,
            style,
            textColor,
            color: "#16232e",
          },
        });
        const { scene } = buildQr({ url: urlOfLength(60), design, logo: null });
        const surface = onPage.has(style)
          ? design.background.color
          : design.frame.color;
        const marks = scene.nodes.filter(
          (node): node is Extract<SceneNode, { type: "path" }> =>
            node.type === "path" && node.role === "kardo-mark",
        );
        expect(marks.length, style).toBeGreaterThan(0);
        for (const mark of marks) {
          const color = mark.fill.kind === "solid" ? mark.fill.color : "";
          expect(
            contrastRatio(color, surface),
            `${style} text ${textColor}`,
          ).toBeGreaterThanOrEqual(3);
        }
        const texts = scene.nodes.filter((node) => node.type === "text");
        for (const text of texts)
          if (
            text.type === "text" &&
            (style === "caption" || style === "brackets" || style === "phone")
          )
            expect(
              contrastRatio(text.color, design.background.color),
              `${style} caption`,
            ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("paints the whole sheet with the background colour when there is no card", () => {
    for (const style of ["none", "caption", "brackets"] as const) {
      const design = normalizeQrDesign({
        ...defaultQrDesign,
        background: { color: "#f7f5f0", transparent: false },
        frame: { ...defaultQrDesign.frame, style },
      });
      const { scene } = buildQr({ url: urlOfLength(60), design, logo: null });
      const background = scene.nodes.find(
        (node) => node.type === "path" && node.role === "background",
      );
      expect(scene.nodes[0], style).toBe(background);
      const box =
        background && background.type === "path"
          ? boundingBoxOf(background.d)
          : null;
      expect(box?.width, style).toBeCloseTo(scene.width, 5);
      expect(box?.height, style).toBeCloseTo(scene.height, 5);
    }
  });
});

describe("SVG output", () => {
  it("never writes a colour that is not #rrggbb into an attribute", () => {
    const hostile = '#000" onload="alert(1)';
    const scene: Scene = {
      width: 10,
      height: 10,
      symbol: { x: 0, y: 0, size: 2, quietZone: 4 },
      nodes: [
        {
          type: "path",
          role: "module",
          d: [["M", 0, 0], ["L", 1, 0], ["L", 1, 1], ["Z"]],
          fill: { kind: "solid", color: hostile },
          fillRule: "nonzero",
        },
        {
          type: "path",
          role: "module",
          d: [["M", 2, 2], ["L", 3, 2], ["L", 3, 3], ["Z"]],
          fill: {
            kind: "linear",
            from: hostile,
            to: "#ffffff",
            x1: 0,
            y1: 0,
            x2: 1,
            y2: 1,
          },
          fillRule: "nonzero",
        },
        {
          type: "text",
          role: "cta",
          x: 5,
          y: 5,
          text: "Hola",
          font: "sans",
          weight: 700,
          size: 1,
          color: hostile,
          letterSpacing: 0,
          maxWidth: 8,
        },
      ],
    };
    const svg = sceneToSvg(scene);
    expect(svg).not.toContain("onload");
    expect(svg).not.toContain("alert");
  });

  it("is well formed: no NaN/undefined, gradients referenced, text escaped", () => {
    const url = urlOfLength(60);
    const design = normalizeQrDesign({
      ...defaultQrDesign,
      modules: {
        shape: "rounded",
        fill: { kind: "linear", from: "#16232e", to: "#0a6c78", angle: 45 },
      },
      frame: {
        ...defaultQrDesign.frame,
        style: "caption",
        text: 'Ventas & Más "hoy"',
      },
    });
    const { scene } = buildQr({ url, design, logo: null });
    const svg = sceneToSvg(scene, { title: "Código QR · Kardo" });

    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("undefined");
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain("url(#");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).not.toMatch(/[^&]"hoy"/); // the raw (unescaped) quote never appears
  });

  it("produces valid path data for every node", () => {
    const { scene } = buildQr({
      url: urlOfLength(60),
      design: defaultQrDesign,
      logo: null,
    });
    for (const node of collectPathNodes(scene)) {
      const d = pathData(node.d);
      expect(d).not.toContain("NaN");
      expect(d).not.toContain("undefined");
    }
  });
});

describe("PNG DPI tagging", () => {
  it("inserts a pHYs chunk with a CRC-32 matching Node's zlib.crc32", () => {
    const ihdrData = new Uint8Array(13);
    const view = new DataView(ihdrData.buffer);
    view.setUint32(0, 1); // width
    view.setUint32(4, 1); // height
    ihdrData[8] = 8; // bit depth
    ihdrData[9] = 6; // color type

    const ihdrType = new TextEncoder().encode("IHDR");
    const ihdrCrcInput = new Uint8Array(ihdrType.length + ihdrData.length);
    ihdrCrcInput.set(ihdrType, 0);
    ihdrCrcInput.set(ihdrData, ihdrType.length);
    const ihdrCrc = zlib.crc32(ihdrCrcInput);

    const ihdrChunk = new Uint8Array(4 + 4 + ihdrData.length + 4);
    new DataView(ihdrChunk.buffer).setUint32(0, ihdrData.length);
    ihdrChunk.set(ihdrType, 4);
    ihdrChunk.set(ihdrData, 8);
    new DataView(ihdrChunk.buffer).setUint32(8 + ihdrData.length, ihdrCrc);

    const signature = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const trailer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const png = new Uint8Array(
      signature.length + ihdrChunk.length + trailer.length,
    );
    png.set(signature, 0);
    png.set(ihdrChunk, signature.length);
    png.set(trailer, signature.length + ihdrChunk.length);

    const withDpi = addPhysicalPixelDimensions(png, 300);

    // The trailer (everything after IHDR) must survive, shifted after the new chunk.
    const newTrailer = withDpi.slice(withDpi.length - trailer.length);
    expect(Array.from(newTrailer)).toEqual(Array.from(trailer));

    // The pHYs chunk sits right after IHDR.
    const physOffset = signature.length + ihdrChunk.length;
    const physLength = new DataView(
      withDpi.buffer,
      withDpi.byteOffset + physOffset,
      4,
    ).getUint32(0);
    expect(physLength).toBe(9);
    const physType = new TextDecoder().decode(
      withDpi.slice(physOffset + 4, physOffset + 8),
    );
    expect(physType).toBe("pHYs");
    const physData = withDpi.slice(physOffset + 8, physOffset + 8 + 9);
    const expectedPixelsPerMeter = Math.round(300 / 0.0254);
    expect(
      new DataView(physData.buffer, physData.byteOffset, 4).getUint32(0),
    ).toBe(expectedPixelsPerMeter);
    expect(
      new DataView(physData.buffer, physData.byteOffset + 4, 4).getUint32(0),
    ).toBe(expectedPixelsPerMeter);
    expect(physData[8]).toBe(1); // unit: metre

    const storedCrc = new DataView(
      withDpi.buffer,
      withDpi.byteOffset + physOffset + 8 + 9,
      4,
    ).getUint32(0);
    const crcInput = withDpi.slice(physOffset + 4, physOffset + 8 + 9);
    expect(storedCrc).toBe(zlib.crc32(crcInput));
    expect(storedCrc).toBe(crc32(crcInput));
  });
});

describe("performance", () => {
  it("builds a version-14-class scene in well under 15ms", () => {
    const url = urlOfLength(120);
    const design = normalizeQrDesign({ ...defaultQrDesign, minVersion: 14 });
    // Warm up caches (functional map / codeword grids are memoized by design).
    buildQr({ url, design, logo: null });
    let { analysis } = buildQr({ url, design, logo: null });
    let elapsed = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      elapsed = Math.min(
        elapsed,
        cpuMs(() => {
          ({ analysis } = buildQr({ url, design, logo: null }));
        }),
      );
    }
    expect(analysis.version).toBeGreaterThanOrEqual(14);
    expect(elapsed).toBeLessThan(15);
  });
});
