import {
  type QrErrorCorrectionLevel,
  type QrLogoPlate,
  qrLogoSizeRange,
} from "@kardo/contracts";
import { functionalMap, symbolSize, zigzagModuleOrder } from "./matrix.js";
import type { QrBudget, Rect } from "./types.js";

/**
 * Reed–Solomon error-correction budget (ISO/IEC 18004 Annex A).
 *
 * `test/qr-budget.test.ts` checks the block/codeword tables against
 * `qrcode`'s own `error-correction-code` module and that the module→codeword
 * mapping below covers every data module exactly once.
 */

// EC_BLOCKS_TABLE[version][level]: number of Reed–Solomon blocks.
// prettier-ignore
const EC_BLOCKS_TABLE: readonly (readonly [number, number, number, number])[] =
  [
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 2, 2],
    [1, 2, 2, 4],
    [1, 2, 4, 4],
    [2, 4, 4, 4],
    [2, 4, 6, 5],
    [2, 4, 6, 6],
    [2, 5, 8, 8],
    [4, 5, 8, 8],
    [4, 5, 8, 11],
    [4, 8, 10, 11],
    [4, 9, 12, 16],
    [4, 9, 16, 16],
    [6, 10, 12, 18],
    [6, 10, 17, 16],
    [6, 11, 16, 19],
    [6, 13, 18, 21],
    [7, 14, 21, 25],
    [8, 16, 20, 25],
    [8, 17, 23, 25],
    [9, 17, 23, 34],
    [9, 18, 25, 30],
    [10, 20, 27, 32],
    [12, 21, 29, 35],
    [12, 23, 34, 37],
    [12, 25, 34, 40],
    [13, 26, 35, 42],
    [14, 28, 38, 45],
    [15, 29, 40, 48],
    [16, 31, 43, 51],
    [17, 33, 45, 54],
    [18, 35, 48, 57],
    [19, 37, 51, 60],
    [19, 38, 53, 63],
    [20, 40, 56, 66],
    [21, 43, 59, 70],
    [22, 45, 62, 74],
    [24, 47, 65, 77],
    [25, 49, 68, 81],
  ];

// EC_CODEWORDS_TABLE[version][level]: TOTAL error-correction codewords
// (across all blocks) for that version/level.
// prettier-ignore
const EC_CODEWORDS_TABLE: readonly (readonly [
  number,
  number,
  number,
  number,
])[] = [
  [7, 10, 13, 17],
  [10, 16, 22, 28],
  [15, 26, 36, 44],
  [20, 36, 52, 64],
  [26, 48, 72, 88],
  [36, 64, 96, 112],
  [40, 72, 108, 130],
  [48, 88, 132, 156],
  [60, 110, 160, 192],
  [72, 130, 192, 224],
  [80, 150, 224, 264],
  [96, 176, 260, 308],
  [104, 198, 288, 352],
  [120, 216, 320, 384],
  [132, 240, 360, 432],
  [144, 280, 408, 480],
  [168, 308, 448, 532],
  [180, 338, 504, 588],
  [196, 364, 546, 650],
  [224, 416, 600, 700],
  [224, 442, 644, 750],
  [252, 476, 690, 816],
  [270, 504, 750, 900],
  [300, 560, 810, 960],
  [312, 588, 870, 1050],
  [336, 644, 952, 1110],
  [360, 700, 1020, 1200],
  [390, 728, 1050, 1260],
  [420, 784, 1140, 1350],
  [450, 812, 1200, 1440],
  [480, 868, 1290, 1530],
  [510, 924, 1350, 1620],
  [540, 980, 1440, 1710],
  [570, 1036, 1530, 1800],
  [570, 1064, 1590, 1890],
  [600, 1120, 1680, 1980],
  [630, 1204, 1770, 2100],
  [660, 1260, 1860, 2220],
  [720, 1316, 1950, 2310],
  [750, 1372, 2040, 2430],
];

// Total codewords (data + EC) per version, independent of level.
// prettier-ignore
const TOTAL_CODEWORDS = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655,
  733, 815, 901, 991, 1085, 1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921,
  2051, 2185, 2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706,
];

const levelIndex: Record<QrErrorCorrectionLevel, 0 | 1 | 2 | 3> = {
  L: 0,
  M: 1,
  Q: 2,
  H: 3,
};

/** Safety margin on the correctable capacity: at most 60 % is ever spent. */
export const QR_BUDGET_MARGIN = 0.4;

export function totalCodewords(version: number): number {
  return TOTAL_CODEWORDS[version] ?? 0;
}

export function ecBlocksCount(
  version: number,
  level: QrErrorCorrectionLevel,
): number {
  const row = EC_BLOCKS_TABLE[version - 1];
  return row ? row[levelIndex[level]] : 1;
}

export function ecCodewordsTotal(
  version: number,
  level: QrErrorCorrectionLevel,
): number {
  const row = EC_CODEWORDS_TABLE[version - 1];
  return row ? row[levelIndex[level]] : 0;
}

export type BlockStructure = {
  /** Same for every block of a given version/level. */
  ecCountPerBlock: number;
  /** Data codewords held by each block, in interleave order. */
  dataCounts: readonly number[];
};

/** Reproduces `qrcode`'s block split (`createCodewords`) without encoding. */
export function blockStructure(
  version: number,
  level: QrErrorCorrectionLevel,
): BlockStructure {
  const total = totalCodewords(version);
  const blocks = ecBlocksCount(version, level);
  const ecTotal = ecCodewordsTotal(version, level);
  const dataTotal = total - ecTotal;
  const blocksInGroup2 = total % blocks;
  const blocksInGroup1 = blocks - blocksInGroup2;
  const totalCwInGroup1 = Math.floor(total / blocks);
  const dataCwInGroup1 = Math.floor(dataTotal / blocks);
  const dataCwInGroup2 = dataCwInGroup1 + 1;
  const ecCountPerBlock = totalCwInGroup1 - dataCwInGroup1;
  const dataCounts: number[] = [];
  for (let b = 0; b < blocks; b += 1)
    dataCounts.push(b < blocksInGroup1 ? dataCwInGroup1 : dataCwInGroup2);
  return { ecCountPerBlock, dataCounts };
}

const codewordBlocksCache = new Map<string, Int32Array>();

/** Block index for every position `0..totalCodewords-1` of the interleaved stream. */
export function codewordBlocks(
  version: number,
  level: QrErrorCorrectionLevel,
): Int32Array {
  const key = `${version}:${level}`;
  const cached = codewordBlocksCache.get(key);
  if (cached) return cached;

  const { ecCountPerBlock, dataCounts } = blockStructure(version, level);
  const blocks = dataCounts.length;
  const total = totalCodewords(version);
  const map = new Int32Array(total).fill(-1);
  const maxData = dataCounts.reduce((max, value) => Math.max(max, value), 0);
  let index = 0;
  for (let i = 0; i < maxData; i += 1) {
    for (let b = 0; b < blocks; b += 1) {
      if (i < (dataCounts[b] ?? 0) && index < total) {
        map[index] = b;
        index += 1;
      }
    }
  }
  for (let i = 0; i < ecCountPerBlock; i += 1) {
    for (let b = 0; b < blocks; b += 1) {
      if (index < total) {
        map[index] = b;
        index += 1;
      }
    }
  }
  codewordBlocksCache.set(key, map);
  return map;
}

const moduleCodewordCache = new Map<number, Int32Array>();

/** `size × size` grid: codeword index for every data module, `-1` when functional. */
export function moduleCodewordGrid(version: number): Int32Array {
  const cached = moduleCodewordCache.get(version);
  if (cached) return cached;

  const { size } = functionalMap(version);
  const grid = new Int32Array(size * size).fill(-1);
  const order = zigzagModuleOrder(version);
  for (let i = 0; i < order.length; i += 1) {
    const entry = order[i];
    if (!entry) continue;
    const [row, col] = entry;
    grid[row * size + col] = Math.floor(i / 8);
  }
  moduleCodewordCache.set(version, grid);
  return grid;
}

export type ClearShape = "rect" | "circle";
export type ClearArea = Rect & { shape: ClearShape };

/** Rounds up to the next odd integer (the symbol side is always odd: `4v + 17`). */
function ceilToOdd(value: number): number {
  const rounded = Math.ceil(value);
  return rounded % 2 === 0 ? rounded + 1 : rounded;
}

/**
 * The aspect-correct, unpadded image box (module units) for a logo of
 * `logoSize` (fraction of the symbol's side) at `version`. Shared by
 * `logoClearArea` (which pads and snaps it to a plate) and `build.ts` (which
 * centres the actual `<image>` node inside the resolved clear area).
 */
export function logoImageBox(
  version: number,
  logoSize: number,
  aspect: { width: number; height: number },
): { width: number; height: number } {
  const size = symbolSize(version);
  const longSide = logoSize * size;
  const ratio =
    aspect.width > 0 && aspect.height > 0 ? aspect.width / aspect.height : 1;
  if (ratio >= 1) return { width: longSide, height: longSide / ratio };
  return { width: longSide * ratio, height: longSide };
}

/**
 * The logo's clear-space box in module coordinates: sized from its aspect
 * ratio (square while the raster has not loaded yet), padded, snapped to the
 * grid and centred on the symbol.
 *
 * The symbol side is always odd (`4v + 17`), so `clearWidth`/`clearHeight`
 * are rounded up to the next odd number too — same parity as the symbol is
 * required for `(size - clearWidth) / 2` to land on a whole module and keep
 * the box exactly centred (an even box would sit half a module off-centre).
 *
 * `plate: "circle"` sizes the box so the *unpadded* image rectangle is
 * inscribed in the circle (its diagonal, plus the padding on both sides,
 * never exceeds the diameter) — the image can never poke outside the plate,
 * whatever its aspect ratio. Every other plate clears a rectangle sized to
 * the image plus padding on every side.
 */
export function logoClearArea(
  version: number,
  logo: { size: number; padding: number; plate: QrLogoPlate },
  aspect: { width: number; height: number },
): ClearArea {
  const size = symbolSize(version);
  const { width: imageWidth, height: imageHeight } = logoImageBox(
    version,
    logo.size,
    aspect,
  );

  const shape: ClearShape = logo.plate === "circle" ? "circle" : "rect";
  let clearWidth: number;
  let clearHeight: number;
  if (shape === "circle") {
    const diagonal = Math.hypot(imageWidth, imageHeight);
    clearWidth = ceilToOdd(diagonal + logo.padding * 2);
    clearHeight = clearWidth;
  } else {
    clearWidth = ceilToOdd(imageWidth + logo.padding * 2);
    clearHeight = ceilToOdd(imageHeight + logo.padding * 2);
  }
  const x = Math.floor((size - clearWidth) / 2);
  const y = Math.floor((size - clearHeight) / 2);
  return { x, y, width: clearWidth, height: clearHeight, shape };
}

/** Whether module `(row, col)` falls inside the logo's clear area. */
export function isModuleCleared(
  area: ClearArea,
  row: number,
  col: number,
): boolean {
  if (area.shape === "rect") {
    return (
      row >= area.y &&
      row < area.y + area.height &&
      col >= area.x &&
      col < area.x + area.width
    );
  }
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2;
  const radius = area.width / 2;
  const closestX = Math.min(Math.max(cx, col), col + 1);
  const closestY = Math.min(Math.max(cy, row), row + 1);
  return Math.hypot(cx - closestX, cy - closestY) <= radius;
}

/** True when the area lands outside the symbol or touches a functional module. */
export function intersectsFunctionalPattern(
  version: number,
  area: ClearArea,
): boolean {
  const size = symbolSize(version);
  if (
    area.x < 0 ||
    area.y < 0 ||
    area.x + area.width > size ||
    area.y + area.height > size
  )
    return true;

  const map = functionalMap(version);
  const rowStart = Math.max(0, Math.floor(area.y));
  const rowEnd = Math.min(size, Math.ceil(area.y + area.height));
  const colStart = Math.max(0, Math.floor(area.x));
  const colEnd = Math.min(size, Math.ceil(area.x + area.width));
  for (let row = rowStart; row < rowEnd; row += 1) {
    for (let col = colStart; col < colEnd; col += 1) {
      if (isModuleCleared(area, row, col) && map.isFunctional(row, col))
        return true;
    }
  }
  return false;
}

/**
 * Error-correction budget for clearing `area` (or none) at `version`/`level`.
 * Conservative: clearing even a single bit of a codeword counts as damaging
 * that whole codeword (never a fraction of one). Cleared remainder-bit
 * modules — the version's unused padding beyond the last real codeword — are
 * counted separately in `clearedModules` but never charged against a block,
 * since they carry no codeword to damage. Reports the worst Reed–Solomon
 * block, using at most `1 − QR_BUDGET_MARGIN` of its correctable capacity.
 */
export function computeBudget(
  version: number,
  level: QrErrorCorrectionLevel,
  area: ClearArea | null,
): QrBudget {
  const map = functionalMap(version);
  const { size } = map;
  const grid = moduleCodewordGrid(version);
  const total = totalCodewords(version);
  const blocks = codewordBlocks(version, level);
  const { ecCountPerBlock } = blockStructure(version, level);
  const correctable = Math.floor(ecCountPerBlock / 2);
  const allowed = Math.floor(correctable * (1 - QR_BUDGET_MARGIN));

  let dataModules = 0;
  for (let i = 0; i < map.grid.length; i += 1)
    if (map.grid[i] === 0) dataModules += 1;

  const damagedByBlock = new Map<number, Set<number>>();
  let clearedModules = 0;

  if (area) {
    const rowStart = Math.max(0, Math.floor(area.y));
    const rowEnd = Math.min(size, Math.ceil(area.y + area.height));
    const colStart = Math.max(0, Math.floor(area.x));
    const colEnd = Math.min(size, Math.ceil(area.x + area.width));
    for (let row = rowStart; row < rowEnd; row += 1) {
      for (let col = colStart; col < colEnd; col += 1) {
        if (!isModuleCleared(area, row, col)) continue;
        if (map.isFunctional(row, col)) continue;
        clearedModules += 1;
        const byteIndex = grid[row * size + col] ?? -1;
        if (byteIndex < 0 || byteIndex >= total) continue; // remainder bit
        const block = blocks[byteIndex] ?? -1;
        if (block < 0) continue;
        let set = damagedByBlock.get(block);
        if (!set) {
          set = new Set<number>();
          damagedByBlock.set(block, set);
        }
        set.add(byteIndex);
      }
    }
  }

  let worst: QrBudget = {
    damagedCodewords: 0,
    correctableCodewords: correctable,
    allowedCodewords: allowed,
    ratio: 0,
    clearedModules,
    dataModules,
  };
  for (const set of damagedByBlock.values()) {
    const damaged = set.size;
    const ratio =
      allowed > 0
        ? damaged / allowed
        : damaged > 0
          ? Number.POSITIVE_INFINITY
          : 0;
    if (ratio > worst.ratio) {
      worst = {
        damagedCodewords: damaged,
        correctableCodewords: correctable,
        allowedCodewords: allowed,
        ratio,
        clearedModules,
        dataModules,
      };
    }
  }
  return worst;
}

/**
 * Largest `logo.size` (0..`qrLogoSizeRange.max`) that, at `version`/`level`,
 * neither touches a functional module nor exceeds the correction budget.
 * Stepped bisection: the feasibility of a size is monotonic (a larger logo
 * only ever clears more modules).
 */
export function maxLogoSize(
  version: number,
  logo: { padding: number; plate: QrLogoPlate },
  aspect: { width: number; height: number },
  level: QrErrorCorrectionLevel,
): number {
  const feasible = (candidate: number): boolean => {
    if (candidate <= 0) return true;
    const area = logoClearArea(
      version,
      { size: candidate, padding: logo.padding, plate: logo.plate },
      aspect,
    );
    if (intersectsFunctionalPattern(version, area)) return false;
    return computeBudget(version, level, area).ratio <= 1;
  };

  if (feasible(qrLogoSizeRange.max)) return qrLogoSizeRange.max;
  if (!feasible(0)) return 0; // pathological: not even an empty area fits

  let lo = 0;
  // `qrLogoSizeRange.max` is a non-fresh literal (property of a `const`
  // object), so it does not widen to `number` on its own here.
  let hi: number = qrLogoSizeRange.max;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (feasible(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}
