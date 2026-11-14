import {
  type QrDesign,
  type QrErrorCorrectionLevel,
  qrEyeBallShapes,
  qrEyeFrameShapes,
  qrLogoPlates,
  qrModuleShapes,
} from "@kardo/contracts";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import {
  computeBudget,
  isModuleCleared,
} from "../src/features/touchpoints/qr/engine/budget.js";
import { buildQr } from "../src/features/touchpoints/qr/engine/build.js";
import {
  functionalMap,
  symbolSize,
} from "../src/features/touchpoints/qr/engine/matrix.js";
import type {
  LegibilityReport,
  PathCommand,
  Rect,
  Scene,
  SceneNode,
} from "../src/features/touchpoints/qr/engine/types.js";
import { verifyScene } from "../src/features/touchpoints/qr/engine/verify.js";
import {
  defaultQrDesign,
  normalizeQrDesign,
  qrGallery,
} from "../src/features/touchpoints/qr/qr-design.js";

/**
 * The legibility harness: positive controls that MUST pass every critical
 * check, and negative controls that MUST fail at least one — run against the
 * real engine (`buildQr` + `verifyScene`), not a simplified stand-in.
 *
 * Kept under ~60s total by sampling combinations that would otherwise be
 * combinatorially huge (e.g. sampling logo sizes rather than every value in
 * range) while still touching every module/eye shape at least once.
 */

const LONG_URL =
  "https://kardo-poa-test-resolver.glowel-dev.workers.dev/t/c2fc661f2bdf4d5092c3112db0bcc3ef?src=qr";
const SHORT_URL = "https://kdo.mx/t/c2fc661f2bdf4d5092?src=qr";
const OTHER_URL = "https://kdo.mx/t/some-completely-different-code?src=qr";

function expectAllCritical(report: LegibilityReport, label: string): void {
  const failed = report.checks.filter((c) => c.critical && !c.passed);
  expect(
    failed,
    `${label}: expected every critical check to pass, failed [${failed.map((c) => c.label).join(", ")}]`,
  ).toEqual([]);
  expect(report.ok, label).toBe(true);
}

function expectSomeCriticalFailure(
  report: LegibilityReport,
  label: string,
): void {
  const failed = report.checks.filter((c) => c.critical && !c.passed);
  expect(
    failed.length,
    `${label}: expected at least one critical check to fail`,
  ).toBeGreaterThan(0);
  expect(report.ok, label).toBe(false);
}

// ---------------------------------------------------------------------------
// Positive controls (3.b) — every one of these must pass ALL critical checks.
// ---------------------------------------------------------------------------

describe("legibility harness — positive controls", () => {
  it("the default design passes every critical check", () => {
    const { scene } = buildQr({
      url: LONG_URL,
      design: defaultQrDesign,
      logo: null,
    });
    expectAllCritical(verifyScene(scene, LONG_URL), "defaultQrDesign");
  });

  it("every gallery preset passes every critical check", () => {
    for (const preset of qrGallery) {
      const { scene } = buildQr({
        url: LONG_URL,
        design: preset.design,
        logo: null,
      });
      expectAllCritical(verifyScene(scene, LONG_URL), `gallery:${preset.id}`);
    }
  }, 240000);

  it("every module shape passes on both the long and short URL", () => {
    for (const url of [LONG_URL, SHORT_URL]) {
      for (const shape of qrModuleShapes) {
        const design: QrDesign = {
          ...defaultQrDesign,
          modules: { ...defaultQrDesign.modules, shape },
        };
        const { scene } = buildQr({ url, design, logo: null });
        expectAllCritical(
          verifyScene(scene, url),
          `module:${shape} url:${url === LONG_URL ? "long" : "short"}`,
        );
      }
    }
  }, 240000);

  // Opposite silhouettes (a square centre in a round ring, or a rounded
  // centre in a square ring) are harmonized by `eyeBallPath`, so every
  // offered combination must pass on its own — no exceptions list.
  it("every eye frame × eye ball combination passes, for square and rounded modules", () => {
    for (const moduleShape of ["square", "rounded"] as const) {
      for (const frameShape of qrEyeFrameShapes) {
        for (const ballShape of qrEyeBallShapes) {
          const design: QrDesign = {
            ...defaultQrDesign,
            modules: { ...defaultQrDesign.modules, shape: moduleShape },
            eyes: { ...defaultQrDesign.eyes, frameShape, ballShape },
          };
          const { scene } = buildQr({ url: LONG_URL, design, logo: null });
          expectAllCritical(
            verifyScene(scene, LONG_URL),
            `frame:${frameShape} ball:${ballShape} modules:${moduleShape}`,
          );
        }
      }
    }
  }, 240000);

  it("dark linear/radial gradients from the gallery pass every critical check", () => {
    const gradientPresets = qrGallery.filter(
      (preset) => preset.design.modules.fill.kind !== "solid",
    );
    expect(gradientPresets.length).toBeGreaterThan(0);
    for (const preset of gradientPresets) {
      const { scene } = buildQr({
        url: LONG_URL,
        design: preset.design,
        logo: null,
      });
      expectAllCritical(verifyScene(scene, LONG_URL), `gradient:${preset.id}`);
    }
  });

  it("a logo at its maximum allowed size passes every critical check, for every plate — with and without a loaded image, transparent background included", () => {
    for (const plate of qrLogoPlates) {
      for (const transparent of [false, true]) {
        const seedDesign = normalizeQrDesign({
          ...defaultQrDesign,
          background: { ...defaultQrDesign.background, transparent },
          logo: {
            source: "brand",
            size: 0.15,
            padding: 1,
            plate,
            plateColor: null,
          },
        });
        const { analysis } = buildQr({
          url: LONG_URL,
          design: seedDesign,
          logo: { href: "data:image/png;base64,", width: 1, height: 1 },
        });
        expect(analysis.maxLogoSize, `plate:${plate}`).not.toBeNull();
        const maxSize = analysis.maxLogoSize ?? 0;
        expect(
          maxSize,
          `plate:${plate} has no feasible logo size`,
        ).toBeGreaterThan(0);

        const finalDesign: QrDesign = {
          ...seedDesign,
          logo: seedDesign.logo && { ...seedDesign.logo, size: maxSize },
        };
        // "Sin imagen todavía" (logo: null) renders the reserved box as
        // adversarial noise — the harder case; the loaded-image case is
        // covered by `verifySceneWithImages` in the worker, not here.
        const { scene } = buildQr({
          url: LONG_URL,
          design: finalDesign,
          logo: null,
        });
        expectAllCritical(
          verifyScene(scene, LONG_URL),
          `plate:${plate} transparent:${transparent} maxLogoSize:${maxSize.toFixed(3)}`,
        );
      }
    }
  }, 240000);
});

// ---------------------------------------------------------------------------
// Structural invariants (section 4): cleared modules are never functional,
// the budget never exceeds 1, and the logo's image/plate box is contained in
// clearedArea. Exercised on the same maximal-logo scenarios as above.
// ---------------------------------------------------------------------------

describe("legibility harness — structural invariants", () => {
  it("never clears a functional module, never exceeds budget, and keeps the logo/plate boxes inside clearedArea", () => {
    for (const plate of qrLogoPlates) {
      const seedDesign = normalizeQrDesign({
        ...defaultQrDesign,
        logo: {
          source: "brand",
          size: 0.15,
          padding: 1,
          plate,
          plateColor: null,
        },
      });
      const { analysis: seedAnalysis } = buildQr({
        url: LONG_URL,
        design: seedDesign,
        logo: { href: "data:image/png;base64,", width: 1, height: 1 },
      });
      const maxSize = seedAnalysis.maxLogoSize ?? 0;
      if (maxSize <= 0) continue; // "none" plate at this size can legitimately have no feasible logo.

      const finalDesign: QrDesign = {
        ...seedDesign,
        logo: seedDesign.logo && { ...seedDesign.logo, size: maxSize },
      };
      const { scene, analysis } = buildQr({
        url: LONG_URL,
        design: finalDesign,
        logo: { href: "data:image/png;base64,", width: 1, height: 1 },
      });

      expect(analysis.budget, `plate:${plate}`).not.toBeNull();
      if (analysis.budget) {
        expect(
          analysis.budget.ratio,
          `plate:${plate} budget ratio`,
        ).toBeLessThanOrEqual(1);
      }

      expect(analysis.clearedArea, `plate:${plate}`).not.toBeNull();
      if (!analysis.clearedArea) continue;

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
            expect(
              map.isFunctional(row, col),
              `plate:${plate} (${row},${col})`,
            ).toBe(false);
          }
        }
      }

      // The logo image and its plate must both sit inside the analysis'
      // clearedArea rectangle, in the same (scene) coordinate space.
      for (const node of scene.nodes) {
        if (node.type === "image" && node.role === "logo") {
          expect(node.x, `plate:${plate} logo.x`).toBeGreaterThanOrEqual(
            analysis.clearedArea.x - 1e-6,
          );
          expect(node.y, `plate:${plate} logo.y`).toBeGreaterThanOrEqual(
            analysis.clearedArea.y - 1e-6,
          );
          expect(
            node.x + node.width,
            `plate:${plate} logo.right`,
          ).toBeLessThanOrEqual(
            analysis.clearedArea.x + analysis.clearedArea.width + 1e-6,
          );
          expect(
            node.y + node.height,
            `plate:${plate} logo.bottom`,
          ).toBeLessThanOrEqual(
            analysis.clearedArea.y + analysis.clearedArea.height + 1e-6,
          );
        }
        if (node.type === "path" && node.role === "logo-plate") {
          const bbox = boundingBoxOf(node.d);
          expect(bbox.x, `plate:${plate} plate.x`).toBeGreaterThanOrEqual(
            analysis.clearedArea.x - 1e-6,
          );
          expect(bbox.y, `plate:${plate} plate.y`).toBeGreaterThanOrEqual(
            analysis.clearedArea.y - 1e-6,
          );
          expect(
            bbox.x + bbox.width,
            `plate:${plate} plate.right`,
          ).toBeLessThanOrEqual(
            analysis.clearedArea.x + analysis.clearedArea.width + 1e-6,
          );
          expect(
            bbox.y + bbox.height,
            `plate:${plate} plate.bottom`,
          ).toBeLessThanOrEqual(
            analysis.clearedArea.y + analysis.clearedArea.height + 1e-6,
          );
        }
      }
    }
  }, 240000);
});

function boundingBoxOf(d: readonly PathCommand[]): Rect {
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
    if (command[0] === "M" || command[0] === "L")
      consider(command[1], command[2]);
    else {
      consider(command[1], command[2]);
      consider(command[3], command[4]);
      consider(command[5], command[6]);
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ---------------------------------------------------------------------------
// Negative controls (3.a) — every one of these must fail at least one
// critical check. Several need per-module control that `buildQr`'s single
// merged module path doesn't offer, so they use a small hand-rolled scene
// builder (same shape of scene the engine itself produces: one background
// rect + one path per dark module + 4-module quiet zone) instead.
// ---------------------------------------------------------------------------

const QUIET_ZONE = 4;

function squarePath(x: number, y: number, size: number): PathCommand[] {
  return [
    ["M", x, y],
    ["L", x + size, y],
    ["L", x + size, y + size],
    ["L", x, y + size],
    ["Z"],
  ];
}

function manualScene(
  url: string,
  options: {
    level?: QrErrorCorrectionLevel;
    moduleColor?: string;
    backgroundColor?: string;
    /** Module predicate overriding the code's own dark bit (for erasure). */
    paint?: (row: number, col: number, dark: boolean) => boolean;
  } = {},
): { scene: Scene; size: number; level: QrErrorCorrectionLevel } {
  const level = options.level ?? "H";
  const code = QRCode.create(url, { errorCorrectionLevel: level });
  const size = code.modules.size;
  const total = size + QUIET_ZONE * 2;
  const moduleColor = options.moduleColor ?? "#000000";
  const backgroundColor = options.backgroundColor ?? "#ffffff";

  const nodes: SceneNode[] = [
    {
      type: "path",
      role: "background",
      fillRule: "nonzero",
      fill: { kind: "solid", color: backgroundColor },
      d: squarePath(0, 0, total),
    },
  ];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const dark = code.modules.data[row * size + col] === 1;
      const paint = options.paint ? options.paint(row, col, dark) : dark;
      if (!paint) continue;
      nodes.push({
        type: "path",
        role: "module",
        fillRule: "nonzero",
        fill: { kind: "solid", color: moduleColor },
        d: squarePath(QUIET_ZONE + col, QUIET_ZONE + row, 1),
      });
    }
  }
  return {
    scene: {
      width: total,
      height: total,
      nodes,
      symbol: { x: QUIET_ZONE, y: QUIET_ZONE, size, quietZone: QUIET_ZONE },
    },
    size,
    level,
  };
}

describe("legibility harness — negative controls (must fail)", () => {
  it("fails on #d9d9d9-on-white modules (too little contrast)", () => {
    const { scene } = manualScene(LONG_URL, { moduleColor: "#d9d9d9" });
    expectSomeCriticalFailure(verifyScene(scene, LONG_URL), "#d9d9d9 on white");
  });

  it("fails on #9aa5ab-on-#ffffff modules (too little contrast)", () => {
    const { scene } = manualScene(LONG_URL, { moduleColor: "#9aa5ab" });
    expectSomeCriticalFailure(
      verifyScene(scene, LONG_URL),
      "#9aa5ab on #ffffff",
    );
  });

  it("fails when the code is printed inverted (light ink on a dark surface)", () => {
    // Swap the roles: the surface (background) becomes the ink colour and
    // every originally-dark module becomes a light hole in it — jsQR is run
    // with `dontInvert` throughout (a printed code is never shown inverted).
    const { scene } = manualScene(LONG_URL, {
      backgroundColor: "#000000",
      moduleColor: "#ffffff",
      paint: (_row, _col, dark) => !dark,
    });
    expectSomeCriticalFailure(verifyScene(scene, LONG_URL), "inverted");
  });

  it("fails once 40% of the symbol's central area is erased", () => {
    const built = manualScene(LONG_URL);
    const { size } = built;
    const sideFraction = Math.sqrt(0.4);
    const margin = (size * (1 - sideFraction)) / 2;
    const { scene } = manualScene(LONG_URL, {
      paint: (row, col, dark) =>
        dark &&
        !(
          row >= margin &&
          row < size - margin &&
          col >= margin &&
          col < size - margin
        ),
    });
    expectSomeCriticalFailure(
      verifyScene(scene, LONG_URL),
      "40% central erasure",
    );
  });

  it("fails when a central square exceeding the H-level correction budget is erased", () => {
    // Grow a centred square until `computeBudget` itself says it is no
    // longer correctable (ratio > 1) — a precise, budget-driven erasure,
    // distinct from the coarser "40% of the area" control above.
    const level: QrErrorCorrectionLevel = "H";
    const code = QRCode.create(LONG_URL, { errorCorrectionLevel: level });
    const size = code.modules.size;
    // `buildQr` always resolves to the smallest version fitting `errorCorrectionLevel`;
    // reuse it via `symbolSize`'s inverse — the version implied by `size`.
    let version = 1;
    while (symbolSize(version) < size) version += 1;

    // `computeBudget`'s `ratio` is relative to the app's own conservative
    // "allowed" cap (60 % of the true Reed–Solomon capacity, `QR_BUDGET_MARGIN`
    // in budget.ts) — exceeding *that* only means the app would refuse to
    // place a logo there, not that a real decoder cannot recover it. This
    // negative control needs a square that exceeds the *true* correction
    // capacity (`damagedCodewords > correctableCodewords`), so decoding is
    // actually, unambiguously impossible.
    let overBudgetArea: {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null = null;
    for (let half = 3; half < size / 2; half += 1) {
      const x = Math.floor(size / 2) - half;
      const y = Math.floor(size / 2) - half;
      const width = half * 2 + 1;
      const area = { x, y, width, height: width, shape: "rect" as const };
      const budget = computeBudget(version, level, area);
      if (budget.damagedCodewords > budget.correctableCodewords) {
        overBudgetArea = area;
        break;
      }
    }
    expect(
      overBudgetArea,
      "no over-budget square found within the symbol",
    ).not.toBeNull();
    if (!overBudgetArea) return;

    const { scene } = manualScene(LONG_URL, {
      level,
      paint: (row, col, dark) =>
        dark &&
        !(
          row >= overBudgetArea.y &&
          row < overBudgetArea.y + overBudgetArea.height &&
          col >= overBudgetArea.x &&
          col < overBudgetArea.x + overBudgetArea.width
        ),
    });
    expectSomeCriticalFailure(
      verifyScene(scene, LONG_URL),
      "over-budget erasure",
    );
  });

  it("fails when one finder eye is fully covered", () => {
    const built = manualScene(LONG_URL);
    const scene = built.scene;
    // A solid block over the top-left 7×7 finder (plus its separator) —
    // opaque, same ink colour, so it reads as "no finder pattern here" to a
    // decoder rather than as ink bleed.
    const covered: Scene = {
      ...scene,
      nodes: [
        ...scene.nodes,
        {
          type: "path",
          role: "module",
          fillRule: "nonzero",
          fill: { kind: "solid", color: "#000000" },
          d: squarePath(QUIET_ZONE - 1, QUIET_ZONE - 1, 9),
        },
      ],
    };
    expectSomeCriticalFailure(verifyScene(covered, LONG_URL), "eye covered");
  });

  it("fails when decoding against a different URL than the one encoded", () => {
    const { scene } = manualScene(LONG_URL);
    const report = verifyScene(scene, OTHER_URL);
    expectSomeCriticalFailure(report, "different URL");
    // Only the colour-contrast check (independent of the payload) may pass.
    expect(
      report.checks.filter((check) => check.passed).map((check) => check.id),
    ).toEqual(["contrast"]);
  });
});
