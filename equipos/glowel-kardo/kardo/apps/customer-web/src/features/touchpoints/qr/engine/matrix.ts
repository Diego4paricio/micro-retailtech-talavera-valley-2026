import type { Rect } from "./types.js";

/**
 * QR module matrix geometry (ISO/IEC 18004).
 *
 * This module rebuilds the *functional* module map — finder patterns and
 * their separators, timing patterns, alignment patterns, format information
 * (both copies plus the fixed dark module) and, for version ≥ 7, the version
 * information blocks — independently of the `qrcode` package. `test/qr-engine.test.ts`
 * checks that the result matches `QRCode.create(...).modules.reservedBit`
 * exactly for every version (1–40) and every error-correction level, so the
 * budget and version-selection logic below can trust it completely.
 */

export type FunctionalMap = {
  size: number;
  /** `1` = finder/separator/timing/alignment/format/version module. */
  grid: Uint8Array;
  isFunctional: (row: number, col: number) => boolean;
};

/** Modules per side (ISO/IEC 18004 §5.3.2). */
export function symbolSize(version: number): number {
  return version * 4 + 17;
}

/** Row/column centres shared by every alignment pattern (half of the grid, symmetric). */
export function alignmentPatternCenters(version: number): readonly number[] {
  if (version === 1) return [];
  const posCount = Math.floor(version / 7) + 2;
  const size = symbolSize(version);
  const step =
    size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
  const positions: number[] = [size - 7];
  for (let i = 1; i < posCount - 1; i += 1) {
    const previous = positions[i - 1];
    if (previous === undefined) break;
    positions.push(previous - step);
  }
  positions.push(6);
  return positions.reverse();
}

/** Centre (row, col) of every alignment pattern, finder corners excluded. */
export function alignmentPatternPositions(
  version: number,
): readonly (readonly [number, number])[] {
  const centers = alignmentPatternCenters(version);
  const n = centers.length;
  const coords: (readonly [number, number])[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const isFinderCorner =
        (i === 0 && j === 0) ||
        (i === 0 && j === n - 1) ||
        (i === n - 1 && j === 0);
      if (isFinderCorner) continue;
      const row = centers[i];
      const col = centers[j];
      if (row === undefined || col === undefined) continue;
      coords.push([row, col]);
    }
  }
  return coords;
}

/** Top-left module (row, col) of each of the three finder patterns. */
export function finderPatternOrigins(version: number): {
  topLeft: readonly [number, number];
  topRight: readonly [number, number];
  bottomLeft: readonly [number, number];
} {
  const size = symbolSize(version);
  return {
    topLeft: [0, 0],
    topRight: [0, size - 7],
    bottomLeft: [size - 7, 0],
  };
}

const functionalMapCache = new Map<number, FunctionalMap>();

/** The full functional module map for a version, memoized (position-only, EC-level independent). */
export function functionalMap(version: number): FunctionalMap {
  const cached = functionalMapCache.get(version);
  if (cached) return cached;

  const size = symbolSize(version);
  const grid = new Uint8Array(size * size);
  const mark = (row: number, col: number) => {
    if (row < 0 || row >= size || col < 0 || col >= size) return;
    grid[row * size + col] = 1;
  };

  // Finder patterns + one-module separator ring around each.
  const origins = finderPatternOrigins(version);
  for (const [originRow, originCol] of [
    origins.topLeft,
    origins.topRight,
    origins.bottomLeft,
  ]) {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) mark(originRow + r, originCol + c);
    }
  }

  // Timing patterns (row/col 6), between the finder separators.
  for (let i = 8; i < size - 8; i += 1) {
    mark(i, 6);
    mark(6, i);
  }

  // Alignment patterns (5×5 each).
  for (const [row, col] of alignmentPatternPositions(version)) {
    for (let r = -2; r <= 2; r += 1) {
      for (let c = -2; c <= 2; c += 1) mark(row + r, col + c);
    }
  }

  // Format information: two redundant 15-bit copies (one split around the
  // top-left finder, the other split between the top-right row and the
  // bottom-left column) plus the fixed dark module.
  for (let i = 0; i < 15; i += 1) {
    if (i < 6) mark(i, 8);
    else if (i < 8) mark(i + 1, 8);
    else mark(size - 15 + i, 8);

    if (i < 8) mark(8, size - i - 1);
    else if (i < 9) mark(8, 15 - i - 1 + 1);
    else mark(8, 15 - i - 1);
  }
  mark(size - 8, 8);

  // Version information (two 6×3 blocks), version ≥ 7 only.
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const row = Math.floor(i / 3);
      const col = (i % 3) + size - 11;
      mark(row, col);
      mark(col, row);
    }
  }

  const map: FunctionalMap = {
    size,
    grid,
    isFunctional: (row, col) => {
      if (row < 0 || row >= size || col < 0 || col >= size) return false;
      return grid[row * size + col] === 1;
    },
  };
  functionalMapCache.set(version, map);
  return map;
}

const zigzagCache = new Map<number, readonly (readonly [number, number])[]>();

/**
 * Data-module placement order (ISO/IEC 18004 §8.4.9): upward/downward
 * two-column zigzag from the bottom-right, skipping the vertical timing
 * column and every functional module. Every 8 consecutive entries form one
 * codeword once interleaved (see `budget.ts`); trailing entries beyond
 * `totalCodewords * 8` are the version's unused remainder bits.
 */
export function zigzagModuleOrder(
  version: number,
): readonly (readonly [number, number])[] {
  const cached = zigzagCache.get(version);
  if (cached) return cached;

  const map = functionalMap(version);
  const { size, isFunctional } = map;
  const order: (readonly [number, number])[] = [];
  let inc = -1;
  let row = size - 1;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (;;) {
      for (let c = 0; c < 2; c += 1) {
        const cc = col - c;
        if (!isFunctional(row, cc)) order.push([row, cc]);
      }
      row += inc;
      if (row < 0 || row >= size) {
        row -= inc;
        inc = -inc;
        break;
      }
    }
  }
  zigzagCache.set(version, order);
  return order;
}

/**
 * Merges the functional grid into a compact, non-overlapping rectangle list
 * (module coordinates) for the design overlay. Derived straight from the
 * same grid checked against `reservedBit`, so it is correct by construction.
 */
export function functionalProtectedAreas(version: number): Rect[] {
  const map = functionalMap(version);
  const { size, isFunctional } = map;
  const consumed = new Uint8Array(size * size);
  const rects: Rect[] = [];

  for (let row = 0; row < size; row += 1) {
    let col = 0;
    while (col < size) {
      const idx = row * size + col;
      if (!isFunctional(row, col) || consumed[idx]) {
        col += 1;
        continue;
      }
      let end = col + 1;
      while (
        end < size &&
        isFunctional(row, end) &&
        !consumed[row * size + end]
      )
        end += 1;

      let height = 1;
      while (row + height < size) {
        let rowMatches = true;
        for (let c = col; c < end; c += 1) {
          const belowIndex = (row + height) * size + c;
          if (!isFunctional(row + height, c) || consumed[belowIndex]) {
            rowMatches = false;
            break;
          }
        }
        if (!rowMatches) break;
        height += 1;
      }

      for (let r = 0; r < height; r += 1) {
        for (let c = col; c < end; c += 1) consumed[(row + r) * size + c] = 1;
      }
      rects.push({ x: col, y: row, width: end - col, height });
      col = end;
    }
  }
  return rects;
}
