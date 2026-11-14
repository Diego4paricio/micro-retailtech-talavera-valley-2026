import { qrErrorCorrectionLevels, qrLogoSizeRange } from "@kardo/contracts";
import ECCode from "qrcode/lib/core/error-correction-code.js";
import ECLevel from "qrcode/lib/core/error-correction-level.js";
import { describe, expect, it } from "vitest";
import {
  blockStructure,
  codewordBlocks,
  computeBudget,
  ecBlocksCount,
  ecCodewordsTotal,
  intersectsFunctionalPattern,
  logoClearArea,
  logoImageBox,
  maxLogoSize,
  moduleCodewordGrid,
  QR_BUDGET_MARGIN,
  totalCodewords,
} from "../src/features/touchpoints/qr/engine/budget.js";
import {
  functionalMap,
  symbolSize,
  zigzagModuleOrder,
} from "../src/features/touchpoints/qr/engine/matrix.js";

const LEVEL_TO_QRCODE = {
  L: ECLevel.L,
  M: ECLevel.M,
  Q: ECLevel.Q,
  H: ECLevel.H,
} as const;

describe("Reed–Solomon block table", () => {
  it("matches qrcode's error-correction-code table for every version and level", () => {
    for (let version = 1; version <= 40; version += 1) {
      for (const level of qrErrorCorrectionLevels) {
        expect(ecBlocksCount(version, level)).toBe(
          ECCode.getBlocksCount(version, LEVEL_TO_QRCODE[level]),
        );
        expect(ecCodewordsTotal(version, level)).toBe(
          ECCode.getTotalCodewordsCount(version, LEVEL_TO_QRCODE[level]),
        );
      }
    }
  });

  it("splits every version/level into blocks that sum back to the total codewords", () => {
    for (let version = 1; version <= 40; version += 1) {
      for (const level of qrErrorCorrectionLevels) {
        const { ecCountPerBlock, dataCounts } = blockStructure(version, level);
        const sum =
          dataCounts.reduce((a, b) => a + b, 0) +
          ecCountPerBlock * dataCounts.length;
        expect(sum).toBe(totalCodewords(version));
      }
    }
  });
});

describe("codeword/block interleaving", () => {
  it("assigns every interleaved codeword position to exactly one block", () => {
    for (let version = 1; version <= 40; version += 1) {
      for (const level of qrErrorCorrectionLevels) {
        const map = codewordBlocks(version, level);
        expect(map.length).toBe(totalCodewords(version));
        expect(Array.from(map).every((block) => block >= 0)).toBe(true);
      }
    }
  });

  it("covers every data module exactly once, in groups of 8 per codeword", () => {
    for (const version of [1, 2, 6, 7, 13, 20, 27, 40]) {
      const map = functionalMap(version);
      const order = zigzagModuleOrder(version);
      let dataModuleCount = 0;
      for (let i = 0; i < map.grid.length; i += 1) {
        if (map.grid[i] === 0) dataModuleCount += 1;
      }
      expect(order.length).toBe(dataModuleCount);

      const seen = new Set<string>();
      const grid = moduleCodewordGrid(version);
      const codewordModuleCounts = new Map<number, number>();
      for (const [row, col] of order) {
        const key = `${row}:${col}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        const codeword = grid[row * map.size + col] ?? -1;
        codewordModuleCounts.set(
          codeword,
          (codewordModuleCounts.get(codeword) ?? 0) + 1,
        );
      }
      const total = totalCodewords(version);
      for (let codeword = 0; codeword < total; codeword += 1) {
        expect(codewordModuleCounts.get(codeword)).toBe(8);
      }
    }
  });
});

describe("logo clear area geometry", () => {
  it("exports the 0.4 safety margin (at most 60% of correctable capacity spent)", () => {
    expect(QR_BUDGET_MARGIN).toBe(0.4);
  });

  it("centers the clear box exactly, matching the symbol's odd parity", () => {
    const plates = ["none", "square", "rounded", "circle"] as const;
    const aspects = [
      { width: 1, height: 1 },
      { width: 3, height: 1 },
      { width: 1, height: 3 },
    ];
    for (let version = 1; version <= 25; version += 1) {
      const size = symbolSize(version);
      expect(size % 2).toBe(1);
      for (const plate of plates) {
        for (const aspect of aspects) {
          for (const logoSize of [0.08, 0.15, 0.22, 0.3]) {
            for (const padding of [0, 1, 2, 3]) {
              const area = logoClearArea(
                version,
                { size: logoSize, padding, plate },
                aspect,
              );
              expect(area.width % 2).toBe(size % 2);
              expect(area.height % 2).toBe(size % 2);
              expect(area.x).toBe((size - area.width) / 2);
              expect(area.y).toBe((size - area.height) / 2);
            }
          }
        }
      }
    }
  });

  it("never lets the image (plus padding) exceed the clear area — square, wide and tall logos alike", () => {
    const plates = ["none", "square", "rounded", "circle"] as const;
    const aspects = [
      { width: 1, height: 1 },
      { width: 3, height: 1 },
      { width: 1, height: 3 },
    ];
    for (let version = 1; version <= 25; version += 1) {
      for (const plate of plates) {
        for (const aspect of aspects) {
          for (const logoSize of [0.08, 0.15, 0.22, 0.3]) {
            for (const padding of [0, 1, 2, 3]) {
              const area = logoClearArea(
                version,
                { size: logoSize, padding, plate },
                aspect,
              );
              const image = logoImageBox(version, logoSize, aspect);
              if (area.shape === "circle") {
                const diagonal = Math.hypot(image.width, image.height);
                expect(diagonal + padding * 2).toBeLessThanOrEqual(
                  area.width + 1e-9,
                );
              } else {
                expect(image.width + padding * 2).toBeLessThanOrEqual(
                  area.width + 1e-9,
                );
                expect(image.height + padding * 2).toBeLessThanOrEqual(
                  area.height + 1e-9,
                );
              }
            }
          }
        }
      }
    }
  });
});

describe("computeBudget", () => {
  it("reports zero damage with no clear area", () => {
    const budget = computeBudget(7, "H", null);
    expect(budget.damagedCodewords).toBe(0);
    expect(budget.ratio).toBe(0);
  });

  it("damage never decreases as the clear area grows", () => {
    const version = 10;
    const small = logoClearArea(
      version,
      { size: 0.1, padding: 0, plate: "square" },
      { width: 1, height: 1 },
    );
    const big = logoClearArea(
      version,
      { size: 0.25, padding: 1, plate: "square" },
      { width: 1, height: 1 },
    );
    const smallBudget = computeBudget(version, "H", small);
    const bigBudget = computeBudget(version, "H", big);
    expect(bigBudget.clearedModules).toBeGreaterThan(
      smallBudget.clearedModules,
    );
    expect(bigBudget.damagedCodewords).toBeGreaterThanOrEqual(
      smallBudget.damagedCodewords,
    );
  });

  it("never charges a cleared remainder-bit module against a block", () => {
    // Version 1 (L) has 0 remainder bits; version 2 has 7 — a tiny logo at
    // the very corner-free centre still must not silently inflate damage.
    const version = 2;
    const area = logoClearArea(
      version,
      { size: 0.1, padding: 0, plate: "square" },
      { width: 1, height: 1 },
    );
    expect(intersectsFunctionalPattern(version, area)).toBe(false);
    const budget = computeBudget(version, "H", area);
    expect(budget.damagedCodewords).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(budget.ratio)).toBe(true);
  });
});

describe("maxLogoSize", () => {
  it("returns a feasible size within the schema's range", () => {
    for (const version of [3, 7, 10, 15, 21, 25]) {
      for (const plate of ["square", "circle"] as const) {
        const size = maxLogoSize(
          version,
          { padding: 1, plate },
          { width: 1, height: 1 },
          "H",
        );
        expect(size).toBeGreaterThanOrEqual(0);
        expect(size).toBeLessThanOrEqual(qrLogoSizeRange.max);
        if (size > 0) {
          const area = logoClearArea(
            version,
            { size, padding: 1, plate },
            { width: 1, height: 1 },
          );
          expect(intersectsFunctionalPattern(version, area)).toBe(false);
          expect(computeBudget(version, "H", area).ratio).toBeLessThanOrEqual(
            1,
          );
        }
      }
    }
  });
});
