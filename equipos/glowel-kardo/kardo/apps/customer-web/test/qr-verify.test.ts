import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { buildQr } from "../src/features/touchpoints/qr/engine/build.js";
import type {
  PathCommand,
  Scene,
  SceneNode,
  ScenePaint,
} from "../src/features/touchpoints/qr/engine/types.js";
import { verifyScene } from "../src/features/touchpoints/qr/engine/verify.js";
import { defaultQrDesign } from "../src/features/touchpoints/qr/qr-design.js";

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

const QUIET_ZONE = 4;

// A resolver-style long URL and the `kdo.mx` short-link form, per the brief.
const LONG_URL =
  "https://kardo-poa-test-resolver.glowel-dev.workers.dev/t/abcdefghij1234567890abcd?src=qr";
const SHORT_URL = "https://kdo.mx/t/abcdefghijklmnop?src=qr";

function squarePath(x: number, y: number, size: number): PathCommand[] {
  return [
    ["M", x, y],
    ["L", x + size, y],
    ["L", x + size, y + size],
    ["L", x, y + size],
    ["Z"],
  ];
}

type QrSceneOptions = {
  version?: number;
  moduleShape?: "square" | "circle";
  moduleColor?: string;
  gradientModules?: boolean;
  backgroundColor?: string;
  logo?: boolean;
};

/** Builds a minimal, realistic Scene: white background, one path per dark module, 4-module quiet zone. */
function buildQrScene(url: string, options: QrSceneOptions = {}): Scene {
  const code = QRCode.create(url, {
    errorCorrectionLevel: "H",
    ...(options.version ? { version: options.version } : {}),
  });
  const size = code.modules.size;
  const total = size + QUIET_ZONE * 2;
  const moduleColor = options.moduleColor ?? "#000000";
  const moduleFill: ScenePaint = options.gradientModules
    ? {
        kind: "linear",
        from: "#000000",
        to: "#1a2a3a",
        x1: QUIET_ZONE,
        y1: QUIET_ZONE,
        x2: QUIET_ZONE + size,
        y2: QUIET_ZONE + size,
      }
    : { kind: "solid", color: moduleColor };

  let hole: { start: number; end: number } | null = null;
  if (options.logo) {
    let span = Math.ceil(size * 0.18) + 2;
    if (span % 2 === 0) span += 1;
    const start = Math.floor((size - span) / 2);
    hole = { start, end: start + span };
  }

  const nodes: SceneNode[] = [
    {
      type: "path",
      role: "background",
      fillRule: "nonzero",
      fill: { kind: "solid", color: options.backgroundColor ?? "#ffffff" },
      d: squarePath(0, 0, total),
    },
  ];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (code.modules.data[row * size + col] !== 1) continue;
      if (
        hole &&
        row >= hole.start &&
        row < hole.end &&
        col >= hole.start &&
        col < hole.end
      )
        continue;
      const x = QUIET_ZONE + col;
      const y = QUIET_ZONE + row;
      const d =
        options.moduleShape === "circle"
          ? circlePath(x + 0.5, y + 0.5, 0.5)
          : squarePath(x, y, 1);
      nodes.push({
        type: "path",
        role: "module",
        fillRule: "nonzero",
        fill: moduleFill,
        d,
      });
    }
  }

  if (hole) {
    const inset = 1;
    const boxSize = hole.end - hole.start - inset * 2;
    nodes.push({
      type: "image",
      role: "logo",
      x: QUIET_ZONE + hole.start + inset,
      y: QUIET_ZONE + hole.start + inset,
      width: boxSize,
      height: boxSize,
      href: "data:image/png;base64,test-logo",
    });
  }

  return {
    width: total,
    height: total,
    nodes,
    symbol: { x: QUIET_ZONE, y: QUIET_ZONE, size, quietZone: QUIET_ZONE },
  };
}

const CIRCLE_KAPPA = 0.5522847498307936;
function circlePath(cx: number, cy: number, r: number): PathCommand[] {
  const k = r * CIRCLE_KAPPA;
  return [
    ["M", cx, cy - r],
    ["C", cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    ["C", cx + r, cy + k, cx + k, cy + r, cx, cy + r],
    ["C", cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    ["C", cx - r, cy - k, cx - k, cy - r, cx, cy - r],
    ["Z"],
  ];
}

/** Clears every module path whose start point falls in the central square that covers `areaFraction` of the symbol's area (simulated damage/erasure). */
function eraseCentral(scene: Scene, areaFraction: number): Scene {
  const { x: sx, y: sy, size } = scene.symbol;
  const sideFraction = Math.sqrt(areaFraction);
  const margin = (size * (1 - sideFraction)) / 2;
  const minX = sx + margin;
  const maxX = sx + size - margin;
  const minY = sy + margin;
  const maxY = sy + size - margin;
  const nodes = scene.nodes.filter((node) => {
    if (node.type !== "path" || node.role !== "module") return true;
    const first = node.d[0];
    if (first?.[0] !== "M") return true;
    const [, x, y] = first;
    return !(x >= minX && x < maxX && y >= minY && y < maxY);
  });
  return { ...scene, nodes };
}

describe.each([
  ["long resolver URL", LONG_URL],
  ["short kdo.mx URL", SHORT_URL],
])("verifyScene — clean design (%s)", (_label, url) => {
  it("passes every critical check with a high score", () => {
    const scene = buildQrScene(url);
    const report = verifyScene(scene, url);
    expect(
      report.checks.filter((check) => check.critical && !check.passed),
    ).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.score).toBeGreaterThanOrEqual(80);
  });
});

describe("verifyScene — realistic design variants", () => {
  it("still passes with a dark linear gradient fill on the modules", () => {
    const scene = buildQrScene(SHORT_URL, { gradientModules: true });
    const report = verifyScene(scene, SHORT_URL);
    expect(report.ok).toBe(true);
  });

  it("still passes with circular (Bézier) modules", () => {
    const scene = buildQrScene(SHORT_URL, { moduleShape: "circle" });
    const report = verifyScene(scene, SHORT_URL);
    expect(report.ok).toBe(true);
  });

  it("still passes with a centred logo hole left as adversarial noise (no decoded pixels supplied)", () => {
    const scene = buildQrScene(SHORT_URL, { logo: true });
    const report = verifyScene(scene, SHORT_URL);
    expect(report.ok).toBe(true);
  });
});

describe("verifyScene — must catch real damage", () => {
  it("fails critical checks once the central 40% of the symbol is erased", () => {
    const scene = buildQrScene(LONG_URL);
    const damaged = eraseCentral(scene, 0.4);
    const report = verifyScene(damaged, LONG_URL);
    expect(report.ok).toBe(false);
    expect(
      report.checks.filter((check) => check.critical && !check.passed).length,
    ).toBeGreaterThan(0);
  });

  it("fails on #d9d9d9-on-white modules (too little contrast to decode reliably)", () => {
    const scene = buildQrScene(LONG_URL, { moduleColor: "#d9d9d9" });
    const report = verifyScene(scene, LONG_URL);
    expect(report.ok).toBe(false);
  });

  it("fails every decode check when the decoded text can never match the expected URL", () => {
    const scene = buildQrScene(LONG_URL);
    const report = verifyScene(scene, SHORT_URL);
    expect(report.ok).toBe(false);
    // Only the colour-contrast check (independent of the payload) may pass.
    expect(
      report.checks.filter((check) => check.passed).map((check) => check.id),
    ).toEqual(["contrast"]);
  });
});

describe("verifyScene — performance", () => {
  it("verifies a v14 symbol (73×73 modules) in under 500ms", () => {
    const scene = buildQrScene(SHORT_URL, { version: 14 });
    expect(scene.symbol.size).toBe(73);

    let report = verifyScene(scene, SHORT_URL);
    let elapsedMs = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      elapsedMs = Math.min(
        elapsedMs,
        cpuMs(() => {
          report = verifyScene(scene, SHORT_URL);
        }),
      );
    }
    console.log(
      `verifyScene v14: ${elapsedMs.toFixed(2)}ms (score ${report.score})`,
    );

    expect(report.ok).toBe(true);
    expect(elapsedMs).toBeLessThan(500);
  });
});

// `buildQr` (owned by the engine agent) is real now, not the "not implemented"
// stub — smoke-test that the actual engine output (default design, no logo)
// is itself legible end to end.
describe("verifyScene — buildQr smoke test", () => {
  it("the default design (no logo) passes every critical check", () => {
    const url = SHORT_URL;
    const { scene } = buildQr({ url, design: defaultQrDesign, logo: null });
    const report = verifyScene(scene, url);
    expect(
      report.checks.filter((check) => check.critical && !check.passed),
    ).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
