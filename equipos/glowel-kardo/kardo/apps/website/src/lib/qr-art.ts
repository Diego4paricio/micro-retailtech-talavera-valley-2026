import QRCode from "qrcode";

// A styled, scannable QR for the Website, built the way the Estudio QR does it
// (apps/customer-web/src/features/touchpoints/qr/engine): function patterns
// stay solid, only data modules take the dot style, the logo plate clears
// data modules and never a function pattern, and the level is H. The scene is
// plain geometry so the page can render it as SVG and the tests can
// rasterize it and decode it with jsQR.

export type Tone = "dark" | "accent" | "light";

export type Shape =
  | {
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      r: number;
      tone: Tone;
    }
  | { kind: "circle"; cx: number; cy: number; r: number; tone: Tone };

export interface QrScene {
  /** Side in modules, quiet zone included. */
  size: number;
  version: number;
  shapes: Shape[];
  /** Centered plate reserved for the logo, in modules. */
  plate: { x: number; y: number; size: number };
}

const quiet = 4;
const dotRadius = 0.42;

export function qrScene(text: string): QrScene {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const isDark = (x: number, y: number) => qr.modules.data[y * n + x] === 1;
  const isReserved = (x: number, y: number) =>
    qr.modules.reservedBit[y * n + x] === 1;

  // Finder patterns and their separators: the three 8×8 corners.
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);

  const plate = centeredPlate(n, isReserved);
  const inPlate = (x: number, y: number) =>
    x >= plate.x &&
    x < plate.x + plate.size &&
    y >= plate.y &&
    y < plate.y + plate.size;

  const shapes: Shape[] = [];
  for (const [fx, fy] of [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ] as const) {
    const x = fx + quiet;
    const y = fy + quiet;
    shapes.push(
      { kind: "rect", x, y, w: 7, h: 7, r: 2.1, tone: "accent" },
      { kind: "rect", x: x + 1, y: y + 1, w: 5, h: 5, r: 1.45, tone: "light" },
      { kind: "rect", x: x + 2, y: y + 2, w: 3, h: 3, r: 0.9, tone: "dark" },
    );
  }

  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!isDark(x, y) || inFinder(x, y) || inPlate(x, y)) continue;
      if (isReserved(x, y)) {
        // Timing, alignment, format and version modules: solid squares.
        shapes.push({
          kind: "rect",
          x: x + quiet,
          y: y + quiet,
          w: 1,
          h: 1,
          r: 0.12,
          tone: "dark",
        });
      } else {
        shapes.push({
          kind: "circle",
          cx: x + quiet + 0.5,
          cy: y + quiet + 0.5,
          r: dotRadius,
          tone: "dark",
        });
      }
    }
  }

  return {
    size: n + quiet * 2,
    version: qr.version,
    shapes,
    plate: { x: plate.x + quiet, y: plate.y + quiet, size: plate.size },
  };
}

/**
 * The largest odd centered square (≤ 22 % of the side) that contains no
 * function module, so the logo only ever costs error-correction budget.
 */
function centeredPlate(
  n: number,
  isReserved: (x: number, y: number) => boolean,
) {
  let size = Math.max(5, Math.round(n * 0.22) | 1);
  while (size >= 3) {
    const start = Math.floor((n - size) / 2);
    let clear = true;
    for (let y = start; y < start + size && clear; y += 1) {
      for (let x = start; x < start + size; x += 1) {
        if (isReserved(x, y)) {
          clear = false;
          break;
        }
      }
    }
    if (clear) return { x: start, y: start, size };
    size -= 2;
  }
  return { x: Math.floor(n / 2), y: Math.floor(n / 2), size: 0 };
}
