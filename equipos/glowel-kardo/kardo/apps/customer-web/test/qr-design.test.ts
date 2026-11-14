import { describe, expect, it } from "vitest";
import { buildQr } from "../src/features/touchpoints/qr/engine/build.js";
import {
  assessDesign,
  contrastRatio,
  defaultQrDesign,
  designFingerprint,
  migrateLegacyQrDesign,
  moduleSizeMm,
  normalizeQrDesign,
  pixelsForPhysicalSize,
  qrBrandSwatches,
  qrDpiOptions,
  qrFrameTextPresets,
  qrGallery,
  qrPrintSizes,
  relativeLuminance,
} from "../src/features/touchpoints/qr/qr-design.js";

const url = "https://kd.qr/t/abcdef0123456789?src=qr";

describe("defaultQrDesign", () => {
  it("normalizes to itself unchanged", () => {
    expect(normalizeQrDesign(defaultQrDesign)).toEqual(defaultQrDesign);
  });

  it("has no error-level warnings and builds a scene", () => {
    const warnings = assessDesign(defaultQrDesign);
    expect(warnings.filter((w) => w.level === "error")).toHaveLength(0);
    const { scene } = buildQr({ url, design: defaultQrDesign, logo: null });
    expect(scene.nodes.length).toBeGreaterThan(0);
  });
});

describe("qrGallery", () => {
  it("has at least 14 presets with unique ids across the documented categories", () => {
    expect(qrGallery.length).toBeGreaterThanOrEqual(14);
    const ids = new Set(qrGallery.map((preset) => preset.id));
    expect(ids.size).toBe(qrGallery.length);
    const allowedCategories = new Set([
      "Esenciales",
      "Marca Kardo",
      "Restaurantes y cafés",
      "Elegantes",
      "Vibrantes",
    ]);
    for (const preset of qrGallery) {
      expect(allowedCategories.has(preset.category)).toBe(true);
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });

  it("every preset normalizes to itself, has no error warnings, and builds a scene", () => {
    for (const preset of qrGallery) {
      expect(normalizeQrDesign(preset.design)).toEqual(preset.design);
      const warnings = assessDesign(preset.design);
      const errors = warnings.filter((w) => w.level === "error");
      expect(
        errors,
        `${preset.id} warnings: ${JSON.stringify(warnings)}`,
      ).toHaveLength(0);
      const { scene, analysis } = buildQr({
        url,
        design: preset.design,
        logo: null,
      });
      expect(scene.nodes.length).toBeGreaterThan(0);
      expect(analysis.warnings.filter((w) => w.level === "error")).toHaveLength(
        0,
      );
    }
  });

  it("includes at least one gradient preset ('some legible dark gradients')", () => {
    const gradientPresets = qrGallery.filter(
      (preset) => preset.design.modules.fill.kind !== "solid",
    );
    expect(gradientPresets.length).toBeGreaterThan(0);
  });
});

describe("qrFrameTextPresets", () => {
  it("are all non-empty, ≤ 40 characters, and free of control characters or <>", () => {
    expect(qrFrameTextPresets.length).toBeGreaterThan(0);
    for (const text of qrFrameTextPresets) {
      expect(text.length).toBeGreaterThan(0);
      expect(text.length).toBeLessThanOrEqual(40);
      // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the absence of control characters.
      expect(/[\u0000-\u001f\u007f<>]/.test(text)).toBe(false);
    }
    expect(new Set(qrFrameTextPresets).size).toBe(qrFrameTextPresets.length);
  });
});

describe("qrBrandSwatches", () => {
  it("keeps ink and background swatches separated by actual contrast against white/near-black", () => {
    for (const swatch of qrBrandSwatches) {
      expect(/^#[0-9a-f]{6}$/i.test(swatch.color)).toBe(true);
      if (swatch.kind === "ink") {
        expect(contrastRatio(swatch.color, "#ffffff")).toBeGreaterThanOrEqual(
          4.5,
        );
      } else {
        expect(contrastRatio(swatch.color, "#16232e")).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });
});

describe("print sizes and DPI", () => {
  it("offers the documented sizes with no duplicates, ascending", () => {
    const expectedCm = [2, 3, 4, 5, 7, 10, 15, 20];
    expect(qrPrintSizes.map((size) => size.cm)).toEqual(expectedCm);
    const ids = new Set(qrPrintSizes.map((size) => size.id));
    expect(ids.size).toBe(qrPrintSizes.length);
  });

  it("exposes exactly the documented DPI options", () => {
    expect(qrDpiOptions).toEqual([150, 300, 600]);
  });

  it("converts centimeters and DPI to pixels", () => {
    expect(pixelsForPhysicalSize(1, 300)).toBe(Math.round((1 / 2.54) * 300));
    expect(pixelsForPhysicalSize(5, 300)).toBe(591);
    expect(pixelsForPhysicalSize(10, 300)).toBe(1181);
  });

  it("computes the physical size of one module", () => {
    const { scene } = buildQr({ url, design: defaultQrDesign, logo: null });
    const mm = moduleSizeMm(scene, 10);
    expect(mm).toBeCloseTo((10 * 10) / scene.width, 6);
  });
});

describe("contrast helpers", () => {
  it("computes maximum contrast for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("relativeLuminance is monotonic (white brighter than black)", () => {
    expect(relativeLuminance("#ffffff")).toBeGreaterThan(
      relativeLuminance("#000000"),
    );
  });
});

describe("normalizeQrDesign sanitizes untrusted input", () => {
  it("falls back to defaults for a completely invalid value", () => {
    expect(normalizeQrDesign(null)).toEqual(defaultQrDesign);
    expect(normalizeQrDesign(undefined)).toEqual(defaultQrDesign);
    expect(normalizeQrDesign("garbage")).toEqual(defaultQrDesign);
    expect(normalizeQrDesign(42)).toEqual(defaultQrDesign);
  });

  it("rejects invalid colors, clamps numbers, strips unsafe frame text", () => {
    const design = normalizeQrDesign({
      schema: 2,
      errorCorrection: "not-a-level",
      minVersion: 999,
      quietZone: 1,
      modules: {
        shape: "not-a-shape",
        fill: { kind: "solid", color: "red;background:url(x)" },
      },
      eyes: {
        frameShape: "hexagon",
        ballShape: "hexagon",
        topLeft: { frame: "#zzzzzz", ball: 42 },
        topRight: {},
        bottomLeft: null,
      },
      background: { color: "#FFFFFF", transparent: "yes" },
      logo: {
        source: "brand",
        size: 5,
        padding: -3,
        plate: "hologram",
        plateColor: "nope",
      },
      frame: {
        style: "spiral",
        color: "#000000",
        textColor: "#ffffff",
        text: `${"x".repeat(80)}<script>&`,
        font: "comic-sans",
        uppercase: "yes",
        icon: "rocket",
      },
    });

    expect(design.errorCorrection).toBe(defaultQrDesign.errorCorrection);
    expect(design.minVersion).toBe(25); // clamped to qrVersionRange.max
    expect(design.quietZone).toBe(4); // clamped to qrQuietZoneRange.min
    expect(design.modules.shape).toBe(defaultQrDesign.modules.shape);
    if (design.modules.fill.kind === "solid") {
      expect(design.modules.fill.color).toBe("#16232e");
    } else {
      throw new Error("expected a solid fallback fill");
    }
    expect(design.eyes.frameShape).toBe(defaultQrDesign.eyes.frameShape);
    expect(design.eyes.topLeft).toEqual({ frame: null, ball: null });
    expect(design.eyes.topRight).toEqual({ frame: null, ball: null });
    expect(design.eyes.bottomLeft).toEqual({ frame: null, ball: null });
    expect(design.background.color).toBe("#ffffff");
    expect(design.background.transparent).toBe(false);
    // A valid `source` keeps the logo; out-of-range numbers clamp and the
    // invalid plate/color fall back rather than voiding the whole logo.
    expect(design.logo).toEqual({
      source: "brand",
      size: 0.3,
      padding: 0,
      plate: "rounded",
      plateColor: null,
    });
    expect(design.frame.style).toBe(defaultQrDesign.frame.style);
    expect(design.frame.text.length).toBeLessThanOrEqual(40);
    expect(design.frame.text).not.toMatch(/[<>]/);
    expect(design.frame.font).toBe(defaultQrDesign.frame.font);
    expect(design.frame.uppercase).toBe(defaultQrDesign.frame.uppercase);
    expect(design.frame.icon).toBe(defaultQrDesign.frame.icon);
  });

  it("keeps a valid logo (brand or asset) and clamps its numbers", () => {
    const brand = normalizeQrDesign({
      logo: {
        source: "brand",
        size: 0.5,
        padding: 10,
        plate: "circle",
        plateColor: "#ABCDEF",
      },
    });
    expect(brand.logo).toEqual({
      source: "brand",
      size: 0.3,
      padding: 3,
      plate: "circle",
      plateColor: "#abcdef",
    });

    const asset = normalizeQrDesign({
      logo: {
        source: "asset",
        assetId: "11111111-1111-1111-1111-111111111111",
        size: 0.1,
        padding: 0,
        plate: "none",
        plateColor: null,
      },
    });
    expect(asset.logo).toEqual({
      source: "asset",
      assetId: "11111111-1111-1111-1111-111111111111",
      size: 0.1,
      padding: 0,
      plate: "none",
      plateColor: null,
    });

    const missingAssetId = normalizeQrDesign({
      logo: { source: "asset", size: 0.1, padding: 0, plate: "none" },
    });
    expect(missingAssetId.logo).toBeNull();
  });

  it("treats minVersion: null as automatic", () => {
    expect(normalizeQrDesign({ minVersion: null }).minVersion).toBeNull();
    expect(normalizeQrDesign({ minVersion: "auto" }).minVersion).toBeNull();
  });
});

describe("migrateLegacyQrDesign", () => {
  it("converts the v1 localStorage shape into a valid schema-2 design", () => {
    const result = migrateLegacyQrDesign({
      foreground: "#123456",
      background: "#fedcba",
      frame: "simple",
      label: "Escanea aquí",
      logo: "data:image/png;base64,AAAA",
      logoScale: 0.2,
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.design.schema).toBe(2);
    expect(result.design.frame.style).toBe("panel-bottom");
    expect(result.design.frame.text).toBe("Escanea aquí");
    expect(result.design.background.color).toBe("#fedcba");
    if (result.design.modules.fill.kind === "solid") {
      expect(result.design.modules.fill.color).toBe("#123456");
    }
    expect(result.design.logo).toBeNull();
    expect(result.legacyLogo).toBe("data:image/png;base64,AAAA");
    expect(normalizeQrDesign(result.design)).toEqual(result.design);
  });

  it("maps frame: 'none' to style 'none' and drops non-PNG-data-URL logos", () => {
    const result = migrateLegacyQrDesign({
      foreground: "#000000",
      background: "#ffffff",
      frame: "none",
      label: "",
      logo: "data:image/svg+xml;base64,PHN2Zz4=",
      logoScale: 0.18,
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.design.frame.style).toBe("none");
    expect(result.legacyLogo).toBeNull();
  });

  it("returns null for schema-2 values and for unrecognizable input", () => {
    expect(migrateLegacyQrDesign(defaultQrDesign)).toBeNull();
    expect(migrateLegacyQrDesign({ schema: 2 })).toBeNull();
    expect(migrateLegacyQrDesign(null)).toBeNull();
    expect(migrateLegacyQrDesign(42)).toBeNull();
    expect(migrateLegacyQrDesign({ unrelated: true })).toBeNull();
  });
});

describe("assessDesign", () => {
  it("flags inverted contrast as an error", () => {
    const design = normalizeQrDesign({
      ...defaultQrDesign,
      modules: { shape: "square", fill: { kind: "solid", color: "#ffffff" } },
      background: { color: "#16232e", transparent: false },
    });
    const warnings = assessDesign(design);
    expect(
      warnings.some(
        (w) => w.code === "contrast-inverted" && w.level === "error",
      ),
    ).toBe(true);
  });

  it("flags low (but not inverted) contrast as an error", () => {
    const design = normalizeQrDesign({
      ...defaultQrDesign,
      modules: { shape: "square", fill: { kind: "solid", color: "#d9d9d9" } },
      background: { color: "#ffffff", transparent: false },
    });
    const warnings = assessDesign(design);
    expect(
      warnings.some((w) => w.code === "contrast-low" && w.level === "error"),
    ).toBe(true);
  });

  it("flags fair contrast as a warning, not an error", () => {
    const design = normalizeQrDesign({
      ...defaultQrDesign,
      modules: { shape: "square", fill: { kind: "solid", color: "#8a8a8a" } },
      background: { color: "#ffffff", transparent: false },
    });
    const warnings = assessDesign(design);
    const relevant = warnings.filter(
      (w) =>
        w.code === "contrast-fair" ||
        w.code === "contrast-low" ||
        w.code === "contrast-inverted",
    );
    expect(
      relevant.some((w) => w.code === "contrast-fair" && w.level === "warning"),
    ).toBe(true);
  });

  it("flags a low-contrast eye color against the background", () => {
    const design = normalizeQrDesign({
      ...defaultQrDesign,
      eyes: {
        ...defaultQrDesign.eyes,
        topLeft: { frame: "#fafafa", ball: null },
      },
    });
    const warnings = assessDesign(design);
    expect(warnings.some((w) => w.code === "eye-contrast")).toBe(true);
  });

  it("flags low frame text/color contrast", () => {
    const design = normalizeQrDesign({
      ...defaultQrDesign,
      frame: {
        ...defaultQrDesign.frame,
        color: "#16232e",
        textColor: "#1a2730",
      },
    });
    const warnings = assessDesign(design);
    expect(
      warnings.some(
        (w) => w.code === "frame-text-contrast" && w.level === "warning",
      ),
    ).toBe(true);
  });

  it("flags a transparent background as info", () => {
    const design = normalizeQrDesign({
      ...defaultQrDesign,
      background: { color: "#ffffff", transparent: true },
    });
    const warnings = assessDesign(design);
    expect(
      warnings.some(
        (w) => w.code === "transparent-background" && w.level === "info",
      ),
    ).toBe(true);
  });
});

describe("designFingerprint", () => {
  it("is stable across key order and changes with the design", async () => {
    const reordered = JSON.parse(
      JSON.stringify(defaultQrDesign, Object.keys(defaultQrDesign).reverse()),
    );
    const a = await designFingerprint(defaultQrDesign);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(await designFingerprint({ ...defaultQrDesign })).toBe(a);
    expect(await designFingerprint(normalizeQrDesign(reordered))).toBe(a);
    expect(
      await designFingerprint({ ...defaultQrDesign, quietZone: 6 }),
    ).not.toBe(a);
  });
});
