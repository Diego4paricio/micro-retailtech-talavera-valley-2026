import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import {
  addGaussianNoise,
  rasterizeScene,
} from "../src/features/touchpoints/qr/engine/raster.js";
import type {
  PathCommand,
  Scene,
  ScenePaint,
  ScenePathNode,
} from "../src/features/touchpoints/qr/engine/types.js";

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

// Same circle-approximation constant as engine/shapes.ts.
const KAPPA = 0.5522847498307936;

function squarePath(x: number, y: number, size: number): PathCommand[] {
  return [
    ["M", x, y],
    ["L", x + size, y],
    ["L", x + size, y + size],
    ["L", x, y + size],
    ["Z"],
  ];
}

function circlePath(cx: number, cy: number, r: number): PathCommand[] {
  const k = r * KAPPA;
  return [
    ["M", cx, cy - r],
    ["C", cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    ["C", cx + r, cy + k, cx + k, cy + r, cx, cy + r],
    ["C", cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    ["C", cx - r, cy - k, cx - k, cy - r, cx, cy - r],
    ["Z"],
  ];
}

function pathNode(
  d: PathCommand[],
  fill: ScenePaint,
  fillRule: "nonzero" | "evenodd" = "nonzero",
): ScenePathNode {
  return { type: "path", role: "module", d, fill, fillRule };
}

function pixelAt(
  raster: { width: number; data: Uint8ClampedArray },
  x: number,
  y: number,
) {
  const idx = (y * raster.width + x) * 4;
  return {
    r: raster.data[idx] ?? 0,
    g: raster.data[idx + 1] ?? 0,
    b: raster.data[idx + 2] ?? 0,
    a: raster.data[idx + 3] ?? 0,
  };
}

describe("rasterizeScene — coverage & antialiasing", () => {
  it("fills a circle solidly at the centre and leaves the corners untouched, with soft edges in between", () => {
    const size = 20;
    const pxPerModule = 10; // 200×200 canvas
    const scene: Scene = {
      width: size,
      height: size,
      nodes: [
        {
          type: "path",
          role: "background",
          fillRule: "nonzero",
          fill: { kind: "solid", color: "#ffffff" },
          d: squarePath(0, 0, size),
        },
        pathNode(circlePath(size / 2, size / 2, size / 2 - 1), {
          kind: "solid",
          color: "#000000",
        }),
      ],
      symbol: { x: 0, y: 0, size, quietZone: 0 },
    };
    const raster = rasterizeScene(scene, { pxPerModule });

    const centre = pixelAt(raster, 100, 100);
    expect(centre).toEqual({ r: 0, g: 0, b: 0, a: 255 });

    const corner = pixelAt(raster, 2, 2);
    expect(corner).toEqual({ r: 255, g: 255, b: 255, a: 255 });

    // Somewhere along the circle's right edge the coverage must be partial
    // (neither pure black nor pure white) — that is the antialiasing.
    const edgeX = Math.round(
      (size / 2) * pxPerModule + (size / 2 - 1) * pxPerModule - 1,
    );
    let sawPartialCoverage = false;
    for (let x = edgeX - 3; x <= edgeX + 3; x += 1) {
      const { r } = pixelAt(raster, x, 100);
      if (r > 0 && r < 255) sawPartialCoverage = true;
    }
    expect(sawPartialCoverage).toBe(true);
  });
});

describe("rasterizeScene — fill rules", () => {
  it("evenodd punches a hole where nonzero keeps the shape solid (same-winding nested squares)", () => {
    const size = 20;
    const pxPerModule = 10;
    const d = [...squarePath(2, 2, 16), ...squarePath(7, 7, 6)];
    const makeScene = (fillRule: "nonzero" | "evenodd"): Scene => ({
      width: size,
      height: size,
      nodes: [
        {
          type: "path",
          role: "background",
          fillRule: "nonzero",
          fill: { kind: "solid", color: "#ffffff" },
          d: squarePath(0, 0, size),
        },
        pathNode(d, { kind: "solid", color: "#000000" }, fillRule),
      ],
      symbol: { x: 0, y: 0, size, quietZone: 0 },
    });

    const evenodd = rasterizeScene(makeScene("evenodd"), { pxPerModule });
    const nonzero = rasterizeScene(makeScene("nonzero"), { pxPerModule });

    // Centre of the inner square: a hole under evenodd, solid under nonzero.
    expect(pixelAt(evenodd, 100, 100)).toEqual({
      r: 255,
      g: 255,
      b: 255,
      a: 255,
    });
    expect(pixelAt(nonzero, 100, 100)).toEqual({ r: 0, g: 0, b: 0, a: 255 });

    // Both still fill the ring between the two squares the same way.
    expect(pixelAt(evenodd, 40, 100).r).toBeLessThan(10);
    expect(pixelAt(nonzero, 40, 100).r).toBeLessThan(10);
  });
});

describe("rasterizeScene — gradients", () => {
  it("evaluates a linear gradient per pixel along its axis", () => {
    const size = 10;
    const pxPerModule = 20; // 200×200 canvas
    const scene: Scene = {
      width: size,
      height: size,
      nodes: [
        pathNode(squarePath(0, 0, size), {
          kind: "linear",
          from: "#000000",
          to: "#ffffff",
          x1: 0,
          y1: 0,
          x2: size,
          y2: 0,
        }),
      ],
      symbol: { x: 0, y: 0, size, quietZone: 0 },
    };
    const raster = rasterizeScene(scene, { pxPerModule, surface: "#ffffff" });

    const left = pixelAt(raster, 5, 100).r;
    const middle = pixelAt(raster, 100, 100).r;
    const right = pixelAt(raster, 195, 100).r;
    expect(left).toBeLessThan(20);
    expect(right).toBeGreaterThan(235);
    expect(middle).toBeGreaterThan(left);
    expect(middle).toBeLessThan(right);
    expect(middle).toBeGreaterThan(100);
    expect(middle).toBeLessThan(155);
  });

  it("evaluates a radial gradient growing outward from its centre", () => {
    const size = 10;
    const pxPerModule = 20;
    const scene: Scene = {
      width: size,
      height: size,
      nodes: [
        pathNode(squarePath(0, 0, size), {
          kind: "radial",
          from: "#000000",
          to: "#ffffff",
          cx: size / 2,
          cy: size / 2,
          r: size / 2,
        }),
      ],
      symbol: { x: 0, y: 0, size, quietZone: 0 },
    };
    const raster = rasterizeScene(scene, { pxPerModule, surface: "#ffffff" });

    const centre = pixelAt(raster, 100, 100).r;
    const near = pixelAt(raster, 130, 100).r;
    const far = pixelAt(raster, 190, 100).r;
    expect(centre).toBeLessThan(near);
    expect(near).toBeLessThan(far);
  });
});

describe("rasterizeScene — logo images", () => {
  const size = 20;
  const pxPerModule = 10;

  function sceneWithLogo(): Scene {
    return {
      width: size,
      height: size,
      nodes: [
        {
          type: "path",
          role: "background",
          fillRule: "nonzero",
          fill: { kind: "solid", color: "#ffffff" },
          d: squarePath(0, 0, size),
        },
        {
          type: "image",
          role: "logo",
          x: 6,
          y: 6,
          width: 8,
          height: 8,
          href: "data:image/png;base64,fake-logo",
        },
      ],
      symbol: { x: 0, y: 0, size, quietZone: 0 },
    };
  }

  it("paints deterministic dark/light noise when no pixels were supplied for the logo (adversarial case)", () => {
    const first = rasterizeScene(sceneWithLogo(), { pxPerModule });
    const second = rasterizeScene(sceneWithLogo(), { pxPerModule });
    expect(first.data).toEqual(second.data); // Deterministic, not Math.random().

    let sawDark = false;
    let sawLight = false;
    for (let y = 65; y < 135; y += 1) {
      for (let x = 65; x < 135; x += 1) {
        const { r } = pixelAt(first, x, y);
        if (r < 40) sawDark = true;
        if (r > 200) sawLight = true;
      }
    }
    expect(sawDark).toBe(true);
    expect(sawLight).toBe(true);
  });

  it("renders supplied logo pixels with bilinear sampling instead of noise", () => {
    const images = new Map([
      [
        "data:image/png;base64,fake-logo",
        {
          width: 2,
          height: 2,
          data: Uint8ClampedArray.from([
            255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
          ]),
        },
      ],
    ]);
    const raster = rasterizeScene(sceneWithLogo(), { pxPerModule, images });
    const centre = pixelAt(raster, 100, 100);
    expect(centre).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });
});

describe("rasterizeScene — performance", () => {
  it("rasterizes a v14 symbol (73 modules + quiet zone + frame) at 4 px/module in under 60ms", () => {
    const quietZone = 4;
    const frameStroke = 2;
    const code = QRCode.create(
      "https://kdo.mx/t/perf0000000000000000000000000000",
      {
        errorCorrectionLevel: "H",
        version: 14,
      },
    );
    const moduleCount = code.modules.size;
    expect(moduleCount).toBe(73);
    const symbolSize = moduleCount + quietZone * 2;
    const totalSize = symbolSize + frameStroke * 2;

    const nodes: ScenePathNode[] = [
      {
        type: "path",
        role: "frame",
        fillRule: "nonzero",
        fill: { kind: "solid", color: "#16232e" },
        d: squarePath(0, 0, totalSize),
      },
      {
        type: "path",
        role: "background",
        fillRule: "nonzero",
        fill: { kind: "solid", color: "#ffffff" },
        d: squarePath(frameStroke, frameStroke, symbolSize),
      },
    ];
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) {
        if (code.modules.data[row * moduleCount + col] !== 1) continue;
        nodes.push(
          pathNode(
            squarePath(
              frameStroke + quietZone + col,
              frameStroke + quietZone + row,
              1,
            ),
            { kind: "solid", color: "#000000" },
          ),
        );
      }
    }

    const scene: Scene = {
      width: totalSize,
      height: totalSize,
      nodes,
      symbol: {
        x: frameStroke + quietZone,
        y: frameStroke + quietZone,
        size: moduleCount,
        quietZone,
      },
    };

    // Best of several runs after a warm-up: a busy test runner (all files in
    // parallel) must not turn scheduling noise into a failure.
    let raster = rasterizeScene(scene, { pxPerModule: 4 });
    let elapsedMs = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      elapsedMs = Math.min(
        elapsedMs,
        cpuMs(() => {
          raster = rasterizeScene(scene, { pxPerModule: 4 });
        }),
      );
    }
    console.log(`rasterizeScene v14 @4px/module: ${elapsedMs.toFixed(2)}ms`);

    expect(raster.width).toBe(Math.round(totalSize * 4));
    expect(raster.height).toBe(Math.round(totalSize * 4));
    expect(elapsedMs).toBeLessThan(60);
  });
});

describe("addGaussianNoise", () => {
  function flatGreyRaster(size: number, value: number) {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
    return { width: size, height: size, data };
  }

  it("is deterministic for a given seed", () => {
    const raster = flatGreyRaster(16, 128);
    const a = addGaussianNoise(raster, 0.1, 42);
    const b = addGaussianNoise(raster, 0.1, 42);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it("moves most pixels only a little and a few pixels more (bell-shaped, not uniform)", () => {
    // A large flat field makes the empirical distribution of per-pixel
    // deltas easy to check: with sigma=0.1 (25.5 levels), a uniform ±20%
    // model would put ~40% of deltas beyond 1 sigma; a Gaussian puts ~32%.
    const raster = flatGreyRaster(200, 128);
    const noisy = addGaussianNoise(raster, 0.1, 7);
    const sigmaLevels = 0.1 * 255;
    let withinOneSigma = 0;
    let total = 0;
    for (let i = 0; i < raster.data.length; i += 4) {
      const delta = Math.abs((noisy.data[i] ?? 0) - (raster.data[i] ?? 0));
      if (delta <= sigmaLevels) withinOneSigma += 1;
      total += 1;
    }
    const fraction = withinOneSigma / total;
    // Gaussian ⇒ ~68% within 1σ; a uniform ±20% model would give ~50% (half
    // the deltas, uniformly spread over [0, 2σ], fall under σ).
    expect(fraction).toBeGreaterThan(0.55);
    expect(fraction).toBeLessThan(0.8);
  });

  it("keeps alpha untouched and only perturbs luminance channels", () => {
    const raster = flatGreyRaster(4, 128);
    const noisy = addGaussianNoise(raster, 0.2, 1);
    for (let i = 0; i < noisy.data.length; i += 4) {
      expect(noisy.data[i + 3]).toBe(255);
    }
  });
});
